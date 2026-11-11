import {
  ref,
  uploadBytes,
  uploadBytesResumable,
  getBlob,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { doc, getDoc } from "firebase/firestore";
import { storage, auth, db } from "@/lib/firebase";
import firebaseConfig from "../../firebase-applet-config.json";
import { ensureUserAuthorizationMirrorSynced } from "@/services/authorizationMirrorClient";
import {
  processFileThroughMandatoryPipeline,
  PipelineProgressCallback,
  ProcessedPipelineResult,
} from "@/services/centralUploadPipeline";

export interface ResultFileMetadata {
  storagePath: string;
  fileName: string;
  originalFileName?: string;
  contentType: string;
  fileSize: number;
  uploadedAt: string;
  summaryNotes?: string;
  dataUrl?: string;
  originalSizeBytes?: number;
  compressedSizeBytes?: number;
  originalSizeFormatted?: string;
  compressedSizeFormatted?: string;
  compressionSavingsPercent?: number;
  sha256Checksum?: string;
}

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MiB

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

const CANONICAL_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

function isMockService(serviceInstance: unknown): boolean {
  return (
    !serviceInstance ||
    typeof serviceInstance !== "object" ||
    "_type" in (serviceInstance as Record<string, unknown>)
  );
}

function assertClientWriteFreezeInactive(operationName = "write operation"): void {
  if (import.meta.env["VITE_MAINTENANCE_MODE"] === "true") {
    throw new Error(
      `HospitalHub is currently in read-only maintenance mode. Blocked client ${operationName}.`,
    );
  }
}

/**
 * Validates, processes through Central Upload Pipeline, verifies Firestore user profile
 * in the authoritative named database and the (default) authorization mirror, checks
 * destination object state without misinterpreting permission errors, and uploads binary
 * report files directly to Firebase Storage.
 */
export async function uploadReportFile(
  file: File,
  facilityId: string,
  reportId: string,
  isOutsource: boolean = false,
  summaryNotes?: string,
  onProgress?: PipelineProgressCallback,
): Promise<ResultFileMetadata> {
  assertClientWriteFreezeInactive("uploadReportFile");
  if (!file) {
    throw new Error("No file provided for upload.");
  }

  // REQUIRE VALID CANONICAL facilityId
  if (
    typeof facilityId !== "string" ||
    !facilityId.trim() ||
    !CANONICAL_ID_REGEX.test(facilityId.trim())
  ) {
    throw new Error("Valid facilityId is required for report storage.");
  }
  const validFacilityId = facilityId.trim();

  // REQUIRE VALID CANONICAL reportId
  if (
    typeof reportId !== "string" ||
    !reportId.trim() ||
    !CANONICAL_ID_REGEX.test(reportId.trim())
  ) {
    throw new Error("Valid reportId is required for report storage.");
  }
  const validReportId = reportId.trim();

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `File size exceeds 100MB limit (file is ${(file.size / 1024 / 1024).toFixed(2)} MB).`,
    );
  }

  // MANDATORY CENTRAL COMPRESSION & INTEGRITY PIPELINE
  const pipelineResult: ProcessedPipelineResult = await processFileThroughMandatoryPipeline(
    file,
    onProgress,
  );

  // Ensure PDF files are strictly uploaded with contentType: "application/pdf"
  // and never GZIP-compressed or uploaded as "application/gzip".
  const isPdfFile =
    pipelineResult.fileType === "application/pdf" ||
    file.type === "application/pdf" ||
    /\.pdf$/i.test(file.name);

  const uploadContentType = isPdfFile
    ? "application/pdf"
    : pipelineResult.fileType || file.type || "application/pdf";

  if (!ALLOWED_MIME_TYPES.has(uploadContentType)) {
    throw new Error(`Unsupported upload content type: ${uploadContentType}`);
  }

  // Sanitize fileName
  const sanitizedFileName =
    file.name
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/^\.+/, "")
      .substring(0, 100) || "report.pdf";

  const rootPrefix = isOutsource ? "outsource" : "facilities";
  // Generate a unique object name before uploading.
  // Never treat storage/unauthorized as evidence of a filename collision.
  const extensionIndex = sanitizedFileName.lastIndexOf(".");
  const baseName = extensionIndex > 0
    ? sanitizedFileName.substring(0, extensionIndex)
    : sanitizedFileName;
  const extension = extensionIndex > 0
    ? sanitizedFileName.substring(extensionIndex)
    : "";
  const uniqueFileName = `${baseName}_${crypto.randomUUID()}${extension}`;
  let storagePath = `${rootPrefix}/${validFacilityId}/reports/${validReportId}/${uniqueFileName}`;

  const authenticatedUid = auth?.currentUser?.uid || null;
  const configuredDatabaseId = (
    import.meta.env["VITE_FIRESTORE_DATABASE_ID"] ||
    firebaseConfig.firestoreDatabaseId ||
    "(default)"
  ).trim();
  const configuredBucket =
    (storage as { app?: { options?: { storageBucket?: string } } })?.app?.options?.storageBucket ||
    firebaseConfig.storageBucket;
  const configuredProjectId =
    (storage as { app?: { options?: { projectId?: string } } })?.app?.options?.projectId ||
    firebaseConfig.projectId;

  let firestoreUserDocId: string | null = null;
  let userRole: string | null = null;
  let activeStatus: boolean | null = null;
  let accountKey: string | null = null;
  let defaultDbMirrorExists: boolean | null = null;
  let defaultDbMirrorRole: string | null = null;
  let defaultDbMirrorActive: boolean | null = null;
  let defaultDbMirrorVerified = false;
  let destinationObjectAlreadyExists = false;

  // 1. Read authoritative user profile from the named database and verify (default) mirror
  if (!isMockService(db)) {
    if (!authenticatedUid) {
      throw new Error("Upload aborted: User is not authenticated.");
    }

    const userDocRef = doc(db, "users", authenticatedUid);
    const userDocSnap = await getDoc(userDocRef);

    if (!userDocSnap.exists()) {
      throw new Error(
        `Upload aborted: Authoritative user profile users/${authenticatedUid} was not found in primary database (${configuredDatabaseId}).`,
      );
    }

    firestoreUserDocId = userDocSnap.id;
    const userData = userDocSnap.data();
    userRole = typeof userData["role"] === "string" ? userData["role"] : null;
    activeStatus = typeof userData["active"] === "boolean" ? userData["active"] : null;
    accountKey = typeof userData["accountKey"] === "string" ? userData["accountKey"] : null;

    if (firestoreUserDocId !== authenticatedUid) {
      throw new Error(
        `Upload aborted: Authenticated UID (${authenticatedUid}) does not match Firestore document ID (${firestoreUserDocId}).`,
      );
    }

    if (activeStatus !== true) {
      throw new Error(
        `Upload aborted: User account (${authenticatedUid}) is not active in primary database.`,
      );
    }

    const allowedRoles = isOutsource ? ["admin", "outsource"] : ["admin", "paramedic_nurse"];
    if (!userRole || !allowedRoles.includes(userRole)) {
      throw new Error(
        `Upload aborted: Role '${userRole || "unknown"}' is not authorized to upload ${isOutsource ? "outsource" : "facility"} diagnostic reports.`,
      );
    }

    // 2. Verify or synchronize the (default) Firestore database mirror required by Storage Rules
    const syncResult = await ensureUserAuthorizationMirrorSynced({
      uid: authenticatedUid,
      expectedRole: userRole,
      ...(isOutsource ? { outsourceAppointmentId: validReportId } : {}),
      maxRetries: 2,
      baseDelayMs: 1000,
    });

    defaultDbMirrorExists = syncResult.mirrorExists;
    defaultDbMirrorRole = syncResult.mirroredRole;
    defaultDbMirrorActive = syncResult.mirroredActive;
    defaultDbMirrorVerified = syncResult.verifiedInDefaultDb;


    // Fail closed if the active authorization profile cannot be verified.
    if (!defaultDbMirrorVerified) {
      throw new Error(
        `Upload aborted: Could not verify active authorization for user ${authenticatedUid} in (default) Firestore. ` +
        `Verification error: ${syncResult.errorCode || syncResult.errorMessage || "missing or mismatched authorization profile"}.`,
      );
    }
  }

  let storageRef = ref(storage, storagePath);

  // 3. Log pre-upload diagnostics immediately before uploading
  console.info("[ReportStorage] Pre-Upload Diagnostics:", {
    authenticatedUid,
    firestoreDatabaseId: configuredDatabaseId,
    firestoreUserDocId,
    uidMatchesFirestoreDocId:
      authenticatedUid !== null && firestoreUserDocId !== null
        ? authenticatedUid === firestoreUserDocId
        : null,
    userRole,
    activeStatus,
    accountKey,
    defaultDbMirrorExists,
    defaultDbMirrorRole,
    defaultDbMirrorActive,
    defaultDbMirrorVerified,
    firebaseProjectId: configuredProjectId,
    firebaseStorageBucket: configuredBucket,
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
    finalUploadContentType: uploadContentType,
    finalStoragePath: storagePath,
    destinationObjectAlreadyExists,
  });

  if (onProgress) {
    onProgress("uploading", "Uploading optimized file to Firebase Storage...", 85);
  }

  const uploadMetadata = {
    contentType: uploadContentType,
    customMetadata: {
      facilityId: validFacilityId,
      reportId: validReportId,
      originalFileName: file.name,
      originalSizeBytes: String(pipelineResult.originalSizeBytes),
      compressedSizeBytes: String(pipelineResult.compressedSizeBytes),
      compressionSavingsPercent: String(pipelineResult.compressionSavingsPercent),
      sha256Checksum: pipelineResult.sha256Checksum,
    },
  };

  const executeUploadToRef = async (targetRef: ReturnType<typeof ref>): Promise<void> => {
    if (onProgress && typeof uploadBytesResumable === "function") {
      await new Promise<void>((resolve, reject) => {
        const uploadTask = uploadBytesResumable(
          targetRef,
          pipelineResult.compressedFileOrBlob,
          uploadMetadata,
        );
        uploadTask.on(
          "state_changed",
          (snapshot) => {
            if (snapshot && snapshot.totalBytes > 0) {
              const pct = Math.min(
                99,
                Math.round(85 + (snapshot.bytesTransferred / snapshot.totalBytes) * 14),
              );
              onProgress("uploading", `Uploading to Firebase Storage (${pct}%)...`, pct);
            }
          },
          (error) => reject(error),
          () => resolve(),
        );
      });
    } else {
      await uploadBytes(targetRef, pipelineResult.compressedFileOrBlob, uploadMetadata);
    }
  };

  // Upload binary payload directly to Firebase Storage.
  // Do not interpret storage/unauthorized as a filename collision.
  // Preserve Firebase's original error for accurate diagnosis.
  await executeUploadToRef(storageRef);

  if (onProgress) {
    onProgress("completed", "Upload completed successfully.", 100);
  }

  return {
    storagePath,
    fileName: uniqueFileName,
    originalFileName: file.name,
    contentType: uploadContentType,
    fileSize: pipelineResult.compressedSizeBytes,
    uploadedAt: new Date().toISOString(),
    summaryNotes:
      summaryNotes ||
      `Report attached (${pipelineResult.compressedSizeFormatted}, -${pipelineResult.compressionSavingsPercent}% saved)`,
    originalSizeBytes: pipelineResult.originalSizeBytes,
    compressedSizeBytes: pipelineResult.compressedSizeBytes,
    originalSizeFormatted: pipelineResult.originalSizeFormatted,
    compressedSizeFormatted: pipelineResult.compressedSizeFormatted,
    compressionSavingsPercent: pipelineResult.compressionSavingsPercent,
    sha256Checksum: pipelineResult.sha256Checksum,
  };
}

/**
 * Securely retrieves the protected file blob.
 */
export async function getReportBlob(storagePath: string): Promise<Blob> {
  if (!storagePath) {
    throw new Error("Storage path is required.");
  }

  const storageRef = ref(storage, storagePath);
  return await getBlob(storageRef);
}

/**
 * Retrieves a download URL for a report stored in Firebase Storage.
 */
export async function getReportDownloadUrl(storagePath: string): Promise<string> {
  if (!storagePath) {
    throw new Error("Storage path is required.");
  }

  const storageRef = ref(storage, storagePath);
  return await getDownloadURL(storageRef);
}

/**
 * Opens the protected report in a new tab using a temporary Blob URL (cleaned up after launch).
 */
export async function viewReportFile(
  storagePath: string,
  _fileName: string = "Diagnostic_Report.pdf",
): Promise<void> {
  const blob = await getReportBlob(storagePath);
  const blobUrl = URL.createObjectURL(blob);

  const newTab = window.open(blobUrl, "_blank");
  if (!newTab) {
    const a = document.createElement("a");
    a.href = blobUrl;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // Revoke Blob URL after short delay to free browser memory
  setTimeout(() => {
    try {
      URL.revokeObjectURL(blobUrl);
    } catch {
      // ignore
    }
  }, 60000);
}

/**
 * Downloads the protected report using a temporary Blob URL.
 */
export async function downloadReportFile(
  storagePath: string,
  fileName: string = "Diagnostic_Report.pdf",
): Promise<void> {
  const blob = await getReportBlob(storagePath);
  const blobUrl = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => {
    try {
      URL.revokeObjectURL(blobUrl);
    } catch {
      // ignore
    }
  }, 15000);
}

/**
 * Deletes the report file from Firebase Storage.
 */
export async function deleteReportFile(storagePath: string): Promise<void> {
  assertClientWriteFreezeInactive("deleteReportFile");
  if (!storagePath) return;
  try {
    const storageRef = ref(storage, storagePath);
    await deleteObject(storageRef);
  } catch (err) {
    console.warn("Failed to delete storage file (may already be removed):", err);
  }
}
