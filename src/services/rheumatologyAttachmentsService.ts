/**
 * SECURE RHEUMATOLOGY CLINICAL ATTACHMENTS SERVICE (Hardened Stage 5C)
 *
 * Dedicated service for managing clinical document attachments in Firebase Storage
 * and metadata in Firestore subcollections:
 *   Storage:   rheumatology/{facilityId}/{referralDocumentId}/{attachmentId}/{safeFileName}
 *   Firestore: rheumatology_appointments/{referralDocumentId}/attachments/{attachmentId}
 *   Control:   rheumatology_appointments/{referralDocumentId}/attachment_control/summary (BACKEND-OWNED ONLY)
 *
 * Stage 5C Architecture:
 *   - Browser has ZERO write/read authority on attachment_control.
 *   - Atomic reservation and release are handled exclusively by trusted Firebase Callable Cloud Functions
 *     (reserveRheumatologyAttachmentSlot, releaseRheumatologyAttachmentSlot) using Admin SDK on the named database.
 *   - Finalized attachment metadata remains authoritative in Firestore.
 *   - Safe Deletion: Storage deleted FIRST; failure preserves metadata; trusted storagePath from metadata.
 *   - Runtime role allowlist ("admin" | "facility" | "paramedic_nurse" | "doctor" | "outsource").
 *   - Download URL helper resolves storagePath from trusted Firestore metadata.
 *   - Subscription authorization derived from trusted authenticated profile (Paramedic/Outsource blocked).
 */

import {
  collection,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  Unsubscribe,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { db, auth, storage, functions } from "@/lib/firebase";

export const ALLOWED_RHEUMATOLOGY_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

export type AllowedRheumatologyMimeType = (typeof ALLOWED_RHEUMATOLOGY_MIME_TYPES)[number];

export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_ATTACHMENTS_PER_REFERRAL = 5;

export const RECOGNIZED_ROLES = [
  "admin",
  "facility",
  "paramedic_nurse",
  "doctor",
  "outsource",
] as const;

export type RecognizedRole = (typeof RECOGNIZED_ROLES)[number];

export interface RheumatologyAttachmentMetadata {
  attachmentId: string;
  originalFileName: string;
  storagePath: string;
  contentType: AllowedRheumatologyMimeType | string;
  size: number;
  uploadedAt: Timestamp | unknown;
  uploadedByUid: string;
}

export class RheumatologyAttachmentError extends Error {
  constructor(
    public code:
      | "NOT_AUTHENTICATED"
      | "WRONG_ROLE"
      | "PERMISSION_DENIED"
      | "INVALID_FILE_TYPE"
      | "FILE_TOO_LARGE"
      | "MAX_ATTACHMENTS_EXCEEDED"
      | "REFERRAL_NOT_FOUND"
      | "REFERRAL_LOCKED"
      | "STORAGE_ERROR"
      | "METADATA_ERROR",
    message: string,
  ) {
    super(message);
    this.name = "RheumatologyAttachmentError";
  }
}

// Trusted backend callable functions
const reserveSlotCallable = httpsCallable<
  { referralDocumentId: string; attachmentId: string },
  { success: boolean; attachmentId?: string; remainingSlots?: number; message?: string }
>(functions, "reserveRheumatologyAttachmentSlot");

const releaseSlotCallable = httpsCallable<
  { referralDocumentId: string; attachmentId: string },
  { success: boolean; released?: boolean; remainingSlots?: number; message?: string }
>(functions, "releaseRheumatologyAttachmentSlot");

/**
 * Generates a cryptographically secure attachment ID.
 */
export function generateSecureAttachmentId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Sanitizes a filename to prevent path traversal or unsafe characters.
 */
export function sanitizeAttachmentFileName(fileName: string): string {
  if (!fileName) return "attachment.bin";
  const base = fileName.split(/[/\\]/).pop() || "attachment";
  const clean = base
    .replace(/\.\.+/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .trim();
  return clean.slice(0, 100) || "attachment.bin";
}

/**
 * Formats file size in bytes to a clean human-readable string (KB/MB).
 */
export function formatAttachmentSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Internal profile validation helper with runtime role allowlist.
 */
async function getValidatedCaller() {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new RheumatologyAttachmentError(
      "NOT_AUTHENTICATED",
      "You must be signed in to perform this operation.",
    );
  }

  const profileSnap = await getDoc(doc(db, "users", currentUser.uid));
  if (!profileSnap.exists()) {
    throw new RheumatologyAttachmentError(
      "PERMISSION_DENIED",
      "Authenticated user profile not found.",
    );
  }

  const data = profileSnap.data();
  if (data["active"] !== true) {
    throw new RheumatologyAttachmentError(
      "PERMISSION_DENIED",
      "Your account is currently inactive.",
    );
  }

  const rawRole = data["role"];
  if (typeof rawRole !== "string" || !RECOGNIZED_ROLES.includes(rawRole as RecognizedRole)) {
    throw new RheumatologyAttachmentError(
      "PERMISSION_DENIED",
      "Invalid or unrecognized user role.",
    );
  }

  if (rawRole === "doctor") {
    const doctorId = typeof data["doctorId"] === "string" ? data["doctorId"].trim() : "";
    if (!doctorId) {
      throw new RheumatologyAttachmentError(
        "PERMISSION_DENIED",
        "Missing or invalid doctorId in doctor profile.",
      );
    }
  }

  let facilityId: string | undefined = undefined;
  if (rawRole === "facility") {
    facilityId = typeof data["facilityId"] === "string" ? data["facilityId"].trim() : "";
    if (!facilityId) {
      throw new RheumatologyAttachmentError(
        "PERMISSION_DENIED",
        "Missing or invalid facilityId in facility profile.",
      );
    }
  }

  return {
    uid: currentUser.uid,
    role: rawRole as RecognizedRole,
    facilityId,
    displayName: typeof data["displayName"] === "string" ? data["displayName"].trim() : undefined,
  };
}

/**
 * Uploads a clinical attachment for a Rheumatology referral.
 *
 * Workflow:
 * 1. Validates caller is active Facility user with valid facilityId.
 * 2. Validates file size (<= 10MB) and MIME type (PDF, JPEG, PNG).
 * 3. Atomically reserves attachment slot via trusted Firebase Callable Cloud Function (reserveRheumatologyAttachmentSlot).
 * 4. Uploads file to Firebase Storage under protected path.
 * 5. On Storage upload failure: calls releaseRheumatologyAttachmentSlot via backend callable.
 * 6. Creates Firestore metadata record in subcollection with serverTimestamp.
 * 7. On Firestore metadata failure: deletes uploaded Storage object and releases reservation slot via backend callable.
 */
export async function uploadRheumatologyAttachment(
  referralDocumentId: string,
  file: File,
): Promise<RheumatologyAttachmentMetadata> {
  const caller = await getValidatedCaller();

  if (caller.role !== "facility" || !caller.facilityId) {
    throw new RheumatologyAttachmentError(
      "WRONG_ROLE",
      "Only healthcare facility users may upload referral attachments.",
    );
  }

  // File size validation (10 MB maximum)
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    throw new RheumatologyAttachmentError(
      "FILE_TOO_LARGE",
      `File size (${formatAttachmentSize(file.size)}) exceeds the maximum allowed limit of 10 MB.`,
    );
  }

  if (file.size <= 0) {
    throw new RheumatologyAttachmentError("FILE_TOO_LARGE", "Cannot upload an empty file.");
  }

  // MIME type validation
  const contentType = file.type.toLowerCase();
  if (!ALLOWED_RHEUMATOLOGY_MIME_TYPES.includes(contentType as AllowedRheumatologyMimeType)) {
    throw new RheumatologyAttachmentError(
      "INVALID_FILE_TYPE",
      "Unsupported file format. Only PDF documents, JPEG images, and PNG images are permitted.",
    );
  }

  const attachmentId = generateSecureAttachmentId();
  const safeFileName = sanitizeAttachmentFileName(file.name);
  const storagePath = `rheumatology/${caller.facilityId}/${referralDocumentId}/${attachmentId}/${safeFileName}`;

  // STEP 1: Reserve attachment slot via trusted backend Callable Cloud Function
  try {
    const res = await reserveSlotCallable({
      referralDocumentId,
      attachmentId,
    });
    if (!res.data || !res.data.success) {
      throw new Error(res.data?.message || "Failed to reserve attachment slot.");
    }
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    console.error("Backend reservation failed:", err);
    if (
      e.code === "functions/resource-exhausted" ||
      (e.message && e.message.includes("Maximum limit"))
    ) {
      throw new RheumatologyAttachmentError(
        "MAX_ATTACHMENTS_EXCEEDED",
        `Maximum limit of ${MAX_ATTACHMENTS_PER_REFERRAL} attachments reached for this referral.`,
      );
    }
    if (e.code === "functions/failed-precondition") {
      throw new RheumatologyAttachmentError(
        "REFERRAL_LOCKED",
        e.message || "Attachments cannot be added for this referral.",
      );
    }
    if (e.code === "functions/permission-denied") {
      throw new RheumatologyAttachmentError(
        "PERMISSION_DENIED",
        e.message || "Permission denied to reserve attachment slot.",
      );
    }
    throw new RheumatologyAttachmentError(
      "STORAGE_ERROR",
      e.message || "Failed to reserve attachment slot with backend service.",
    );
  }

  // STEP 2: Upload file to Firebase Storage
  const storageRef = ref(storage, storagePath);
  try {
    await uploadBytes(storageRef, file, {
      contentType: file.type,
      customMetadata: {
        referralId: referralDocumentId,
        facilityId: caller.facilityId,
        attachmentId,
      },
    });
  } catch (err) {
    console.error("Storage upload failed, releasing backend reservation slot:", err);
    try {
      await releaseSlotCallable({ referralDocumentId, attachmentId });
    } catch (relErr) {
      console.warn("Backend reservation slot release error on storage failure:", relErr);
    }
    throw new RheumatologyAttachmentError(
      "STORAGE_ERROR",
      "Failed to upload document to secure storage. Reservation slot released.",
    );
  }

  // STEP 3: Write metadata record to Firestore subcollection
  const metadataDocRef = doc(
    db,
    "rheumatology_appointments",
    referralDocumentId,
    "attachments",
    attachmentId,
  );
  const metadataPayload: RheumatologyAttachmentMetadata = {
    attachmentId,
    originalFileName: safeFileName,
    storagePath,
    contentType: file.type,
    size: file.size,
    uploadedAt: serverTimestamp(),
    uploadedByUid: caller.uid,
  };

  try {
    await setDoc(metadataDocRef, metadataPayload);
  } catch (firestoreErr) {
    console.error(
      "Firestore metadata write failed, rolling back uploaded storage file and releasing slot:",
      firestoreErr,
    );
    // Cleanup orphaned storage object
    try {
      await deleteObject(storageRef);
    } catch (cleanupErr) {
      console.warn("Storage rollback cleanup warning:", cleanupErr);
    }
    // Release reservation slot via backend callable
    try {
      await releaseSlotCallable({ referralDocumentId, attachmentId });
    } catch (relErr) {
      console.warn("Backend slot release error on metadata write failure:", relErr);
    }
    throw new RheumatologyAttachmentError(
      "METADATA_ERROR",
      "Failed to save document metadata in database. Upload was rolled back and slot released.",
    );
  }

  return metadataPayload;
}

/**
 * Subscribes to real-time attachments for a referral.
 * Role authorization is resolved internally from the trusted authenticated profile.
 * Paramedics and Outsource accounts do not initiate an attachment listener.
 */
export function subscribeToRheumatologyAttachments(
  referralDocumentId: string,
  onUpdate: (attachments: RheumatologyAttachmentMetadata[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    onUpdate([]);
    return () => {};
  }

  let activeUnsubscribe: Unsubscribe = () => {};
  let isCancelled = false;

  getValidatedCaller()
    .then((caller) => {
      if (isCancelled) return;

      // Paramedics and Outsource MUST NOT initiate an attachment metadata listener
      if (caller.role === "paramedic_nurse" || caller.role === "outsource") {
        onUpdate([]);
        return;
      }

      const attachmentsCol = collection(
        db,
        "rheumatology_appointments",
        referralDocumentId,
        "attachments",
      );
      const q = query(attachmentsCol, orderBy("uploadedAt", "asc"));

      activeUnsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const items: RheumatologyAttachmentMetadata[] = [];
          snapshot.forEach((docSnap) => {
            const d = docSnap.data();
            items.push({
              attachmentId: d["attachmentId"] || docSnap.id,
              originalFileName: d["originalFileName"] || "attachment",
              storagePath: d["storagePath"] || "",
              contentType: d["contentType"] || "application/octet-stream",
              size: typeof d["size"] === "number" ? d["size"] : 0,
              uploadedAt: d["uploadedAt"],
              uploadedByUid: d["uploadedByUid"] || "",
            });
          });
          onUpdate(items);
        },
        (error) => {
          console.warn(`Attachments listener note (${referralDocumentId}):`, error.message);
          if (onError) onError(error);
          onUpdate([]);
        },
      );
    })
    .catch((err) => {
      console.warn("Attachments subscription profile resolution note:", err);
      if (onError) onError(err);
      onUpdate([]);
    });

  return () => {
    isCancelled = true;
    activeUnsubscribe();
  };
}

/**
 * Obtains a temporary download URL for viewing or downloading an attachment.
 * Resolves storagePath from trusted Firestore metadata (never trusts caller-supplied path).
 * Allowed roles: Facility (own referral only), Doctor, Admin.
 * Paramedic and Outsource roles are forbidden.
 */
export async function getRheumatologyAttachmentDownloadUrl(
  referralDocumentId: string,
  attachmentId: string,
): Promise<string> {
  const caller = await getValidatedCaller();

  if (caller.role === "paramedic_nurse") {
    throw new RheumatologyAttachmentError(
      "PERMISSION_DENIED",
      "Paramedic accounts are not authorized to access clinical document attachments.",
    );
  }

  if (caller.role === "outsource") {
    throw new RheumatologyAttachmentError(
      "PERMISSION_DENIED",
      "Outsource accounts are not authorized to access Rheumatology attachments.",
    );
  }

  if (caller.role !== "facility" && caller.role !== "doctor" && caller.role !== "admin") {
    throw new RheumatologyAttachmentError(
      "PERMISSION_DENIED",
      "Your role is not authorized to access clinical documents.",
    );
  }

  // If facility, verify parent referral ownership
  if (caller.role === "facility") {
    const referralRef = doc(db, "rheumatology_appointments", referralDocumentId);
    const referralSnap = await getDoc(referralRef);

    if (!referralSnap.exists()) {
      throw new RheumatologyAttachmentError("REFERRAL_NOT_FOUND", "Referral record not found.");
    }

    if (referralSnap.data()["facilityId"] !== caller.facilityId) {
      throw new RheumatologyAttachmentError(
        "PERMISSION_DENIED",
        "You cannot access attachments belonging to another healthcare facility.",
      );
    }
  }

  // Read trusted metadata document from Firestore
  const metadataDocRef = doc(
    db,
    "rheumatology_appointments",
    referralDocumentId,
    "attachments",
    attachmentId,
  );
  const metadataSnap = await getDoc(metadataDocRef);

  if (!metadataSnap.exists()) {
    throw new RheumatologyAttachmentError(
      "REFERRAL_NOT_FOUND",
      "Attachment metadata record not found.",
    );
  }

  const metadata = metadataSnap.data();
  const trustedStoragePath = metadata["storagePath"];

  if (typeof trustedStoragePath !== "string" || !trustedStoragePath.trim()) {
    throw new RheumatologyAttachmentError(
      "STORAGE_ERROR",
      "Invalid storage path in attachment metadata.",
    );
  }

  try {
    const fileRef = ref(storage, trustedStoragePath);
    const url = await getDownloadURL(fileRef);
    return url;
  } catch (err) {
    console.error("Failed to generate download URL:", err);
    throw new RheumatologyAttachmentError(
      "STORAGE_ERROR",
      "Failed to obtain document access link. Please verify you have authorization to view this document.",
    );
  }
}

/**
 * Deletes an attachment safely.
 *
 * Safety Order:
 * 1. Validate caller, parent referral, and read trusted metadata document.
 * 2. Obtain storagePath and uploadedByUid from trusted metadata (NEVER caller-supplied).
 * 3. Verify ownership: caller.role == "facility", facilityId matches parent referral, uploadedByUid == caller.uid.
 * 4. Verify referral status: "Pending Doctor Review" or "Returned to Facility".
 * 5. Delete Storage object FIRST. If deleteObject fails: DO NOT delete metadata, return STORAGE_ERROR.
 * 6. Delete Firestore metadata ONLY after successful Storage deletion.
 * 7. If Firestore metadata deletion fails: report METADATA_ERROR (stale metadata remains visible, file gone).
 * 8. Releases reservation slot via trusted Firebase Callable Cloud Function (releaseRheumatologyAttachmentSlot).
 */
export async function deleteRheumatologyAttachment(
  referralDocumentId: string,
  attachmentId: string,
): Promise<void> {
  const caller = await getValidatedCaller();

  if (caller.role !== "facility" || !caller.facilityId) {
    throw new RheumatologyAttachmentError(
      "WRONG_ROLE",
      "Only facility users may delete attachments.",
    );
  }

  const referralRef = doc(db, "rheumatology_appointments", referralDocumentId);
  const referralSnap = await getDoc(referralRef);

  if (!referralSnap.exists()) {
    throw new RheumatologyAttachmentError("REFERRAL_NOT_FOUND", "Referral record not found.");
  }

  const referralData = referralSnap.data();
  if (referralData["facilityId"] !== caller.facilityId) {
    throw new RheumatologyAttachmentError(
      "PERMISSION_DENIED",
      "Cannot delete attachments belonging to another facility.",
    );
  }

  const allowedStatuses = ["Pending Doctor Review", "Returned to Facility"];
  if (!allowedStatuses.includes(referralData["status"])) {
    throw new RheumatologyAttachmentError(
      "REFERRAL_LOCKED",
      `Attachments cannot be deleted while referral is in status '${referralData["status"]}'. Documents reviewed by doctors are immutable.`,
    );
  }

  // Obtain trusted storagePath and uploadedByUid from Firestore metadata document
  const metadataDocRef = doc(
    db,
    "rheumatology_appointments",
    referralDocumentId,
    "attachments",
    attachmentId,
  );
  const metadataSnap = await getDoc(metadataDocRef);

  if (!metadataSnap.exists()) {
    throw new RheumatologyAttachmentError(
      "REFERRAL_NOT_FOUND",
      "Attachment metadata record not found.",
    );
  }

  const metadata = metadataSnap.data();
  const trustedStoragePath = metadata["storagePath"];
  const uploadedByUid = metadata["uploadedByUid"];

  if (typeof trustedStoragePath !== "string" || !trustedStoragePath.trim()) {
    throw new RheumatologyAttachmentError(
      "STORAGE_ERROR",
      "Invalid storage path in attachment metadata.",
    );
  }

  // Verify delete ownership: must be the original uploader
  if (uploadedByUid !== caller.uid) {
    throw new RheumatologyAttachmentError(
      "PERMISSION_DENIED",
      "You may only delete attachments uploaded by your own user account.",
    );
  }

  // 1. Delete Storage object FIRST
  try {
    const fileRef = ref(storage, trustedStoragePath);
    await deleteObject(fileRef);
  } catch (storageErr) {
    console.error("Storage deletion failed, preserving metadata:", storageErr);
    // If Storage deletion fails: DO NOT delete metadata. Return safe error.
    throw new RheumatologyAttachmentError(
      "STORAGE_ERROR",
      "Failed to delete clinical document from storage. Metadata has been preserved. Please retry.",
    );
  }

  // 2. Delete Firestore metadata ONLY after successful Storage deletion
  try {
    await deleteDoc(metadataDocRef);
  } catch (metadataErr) {
    console.error("Storage deleted but Firestore metadata deletion failed:", metadataErr);
    throw new RheumatologyAttachmentError(
      "METADATA_ERROR",
      "Storage file was deleted, but failed to remove database metadata record.",
    );
  }

  // 3. Release slot via trusted backend Cloud Function callable
  try {
    await releaseSlotCallable({ referralDocumentId, attachmentId });
  } catch (relErr) {
    console.warn("Backend reservation slot release note on deletion:", relErr);
  }
}
