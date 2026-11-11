import { ref, getBlob, uploadBytes, deleteObject } from "firebase/storage";
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
} from "firebase/firestore";
import { db, storage, auth } from "@/lib/firebase";

export const MAX_ATTACHMENT_SIZE_BYTES = 20 * 1024 * 1024; // 20MB
export const MAX_ATTACHMENTS_PER_REFERRAL = 10;
export const ALLOWED_RHEUMATOLOGY_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
]);

export interface RheumatologyAttachmentMetadata {
  attachmentId: string;
  storagePath: string;
  originalFileName: string;
  contentType: string;
  fileSizeBytes: number;
  uploadedAt: string;
  uploadedByUid: string;
  uploadedByRole: string;
  facilityId: string;
}

export class RheumatologyAttachmentError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "RheumatologyAttachmentError";
  }
}

export function formatAttachmentSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function subscribeToRheumatologyAttachments(
  referralId: string,
  onUpdate: (items: RheumatologyAttachmentMetadata[]) => void,
  onError?: (err: Error) => void,
): () => void {
  const colRef = collection(db, "rheumatology_appointments", referralId, "attachments");
  const q = query(colRef, orderBy("uploadedAt", "asc"));
  return onSnapshot(
    q,
    (snap) => {
      const results: RheumatologyAttachmentMetadata[] = [];
      snap.forEach((docSnap) => {
        results.push(docSnap.data() as RheumatologyAttachmentMetadata);
      });
      onUpdate(results);
    },
    (err) => {
      if (onError) onError(err);
    },
  );
}

export async function uploadRheumatologyAttachment(
  referralId: string,
  file: File,
  facilityId: string,
): Promise<RheumatologyAttachmentMetadata> {
  if (!auth.currentUser) {
    throw new RheumatologyAttachmentError("Authentication required.");
  }
  const attachmentId = `att_${Date.now()}`;
  const storagePath = `rheumatology/${facilityId}/${referralId}/${attachmentId}/${file.name}`;
  const storageRef = ref(storage, storagePath);

  await uploadBytes(storageRef, file, { contentType: file.type });

  const metadata: RheumatologyAttachmentMetadata = {
    attachmentId,
    storagePath,
    originalFileName: file.name,
    contentType: file.type,
    fileSizeBytes: file.size,
    uploadedAt: new Date().toISOString(),
    uploadedByUid: auth.currentUser.uid,
    uploadedByRole: "facility",
    facilityId,
  };

  const docRef = doc(db, "rheumatology_appointments", referralId, "attachments", attachmentId);
  await setDoc(docRef, { ...metadata, createdAt: serverTimestamp() });
  return metadata;
}

export async function deleteRheumatologyAttachment(
  referralId: string,
  attachmentId: string,
  storagePath: string,
): Promise<void> {
  const storageRef = ref(storage, storagePath);
  try {
    await deleteObject(storageRef);
  } catch (err) {
    console.warn("Storage deletion warning:", err);
  }
  const docRef = doc(db, "rheumatology_appointments", referralId, "attachments", attachmentId);
  await deleteDoc(docRef);
}

export async function getRheumatologyAttachmentBlob(
  referralId: string,
  attachmentId: string,
): Promise<Blob> {
  const currentUid = auth.currentUser?.uid;
  if (!currentUid) {
    throw new RheumatologyAttachmentError("Authentication required.");
  }

  const userDocRef = doc(db, "users", currentUid);
  const userSnap = await getDoc(userDocRef);
  if (!userSnap.exists()) {
    throw new RheumatologyAttachmentError("User profile not found.");
  }
  const userData = userSnap.data();

  if (userData.active === false) {
    throw new RheumatologyAttachmentError("Your account is currently inactive.");
  }

  if (userData.role === "paramedic_nurse") {
    throw new RheumatologyAttachmentError(
      "Paramedic accounts are not authorized to access clinical document attachments.",
    );
  }

  if (userData.role === "outsource") {
    throw new RheumatologyAttachmentError(
      "Outsource accounts are not authorized to access Rheumatology attachments.",
    );
  }

  if (userData.role === "facility") {
    const parentRef = doc(db, "rheumatology_appointments", referralId);
    const parentSnap = await getDoc(parentRef);
    if (!parentSnap.exists() || parentSnap.data()?.facilityId !== userData.facilityId) {
      throw new RheumatologyAttachmentError(
        "You cannot access attachments belonging to another healthcare facility.",
      );
    }
  }

  const attDocRef = doc(db, "rheumatology_appointments", referralId, "attachments", attachmentId);
  const attSnap = await getDoc(attDocRef);
  if (!attSnap.exists()) {
    throw new RheumatologyAttachmentError("Attachment not found.");
  }

  const attData = attSnap.data();
  try {
    const storageRef = ref(storage, attData.storagePath);
    return await getBlob(storageRef);
  } catch (err: any) {
    if (err?.code === "storage/unauthorized") {
      throw new RheumatologyAttachmentError(
        "Access to this clinical document was denied. Verify you have active authorization.",
      );
    }
    throw err;
  }
}
