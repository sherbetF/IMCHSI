import {
  processFileThroughMandatoryPipeline,
  PipelineProgressCallback,
  ProcessedPipelineResult,
} from "@/services/centralUploadPipeline";

export interface ResultFileMetadata {
  storagePath: string;
  fileName: string;
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

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "application/gzip",
]);

const CANONICAL_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

/**
 * Validates, compresses losslessly through Central Upload Pipeline, and uploads diagnostic report file to Firebase Storage.
 * NO FILE IS UPLOADED UNPROCESSED OR WITHOUT INTEGRITY VERIFICATION.
 */
export async function uploadReportFile(
  file: File,
  facilityId: string,
  reportId: string,
  isOutsource: boolean = false,
  summaryNotes?: string,
  onProgress?: PipelineProgressCallback,
): Promise<ResultFileMetadata> {
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
      `File size exceeds 20MB limit (file is ${(file.size / 1024 / 1024).toFixed(2)} MB).`,
    );
  }

  // MANDATORY CENTRAL COMPRESSION & INTEGRITY PIPELINE
  const pipelineResult: ProcessedPipelineResult = await processFileThroughMandatoryPipeline(
    file,
    onProgress,
  );

  const uploadContentType = pipelineResult.isGzipCompressed
    ? "application/gzip"
    : pipelineResult.fileType || file.type || "application/pdf";

  // Sanitize fileName
  const sanitizedFileName = file.name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/^\.+/, "")
    .substring(0, 100);

  const rootPrefix = isOutsource ? "outsource" : "facilities";
  const storagePath = `${rootPrefix}/${validFacilityId}/reports/${validReportId}/${sanitizedFileName || "report.pdf"}`;

  const storageRef = ref(storage, storagePath);

  if (onProgress) {
    onProgress("uploading", "Uploading optimized file to Firebase Storage...", 85);
  }

  // Upload compressed payload to Firebase Storage
  await uploadBytes(storageRef, pipelineResult.compressedFileOrBlob, {
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
  });

  if (onProgress) {
    onProgress("completed", "Upload completed successfully.", 100);
  }

  return {
    storagePath,
    fileName: file.name,
    contentType: uploadContentType,
    fileSize: pipelineResult.compressedSizeBytes,
    uploadedAt: new Date().toISOString(),
    summaryNotes:
      summaryNotes ||
      `Report attached (${pipelineResult.compressedSizeFormatted}, -${pipelineResult.compressionSavingsPercent}% saved)`,
    dataUrl: pipelineResult.dataUrl,
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
 * Opens the protected report in a new tab using a temporary Blob URL (cleaned up after launch).
 */
export async function viewReportFile(
  storagePath: string,
  fileName: string = "Diagnostic_Report.pdf",
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
  if (!storagePath) return;
  try {
    const storageRef = ref(storage, storagePath);
    await deleteObject(storageRef);
  } catch (err) {
    console.warn("Failed to delete storage file (may already be removed):", err);
  }
}
