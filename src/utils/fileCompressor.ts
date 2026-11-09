export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export interface CompressedFileResult {
  fileName: string;
  fileType: string;
  dataUrl: string;
  originalSizeBytes: number;
  compressedSizeBytes: number;
  originalSizeFormatted: string;
  compressedSizeFormatted: string;
  compressionSavingsPercent: number;
  isGzipCompressed?: boolean;
}

/**
 * Native FileReader conversion to Base64 Data URL.
 * Direct, 100% reliable, zero compression errors, works for all PDF & image files instantly.
 */
export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Standard file reader wrapper maintaining interface compatibility without compression.
 */
export async function compressResultFile(file: File): Promise<CompressedFileResult> {
  const dataUrl = await fileToDataUrl(file);
  const sizeFormatted = formatBytes(file.size);

  return {
    fileName: file.name,
    fileType: file.type || "application/pdf",
    dataUrl,
    originalSizeBytes: file.size,
    compressedSizeBytes: file.size,
    originalSizeFormatted: sizeFormatted,
    compressedSizeFormatted: sizeFormatted,
    compressionSavingsPercent: 0,
    isGzipCompressed: false,
  };
}

export async function decompressDataUrl(
  dataUrl: string,
  _fileType: string,
): Promise<{ blobUrl: string; dataUrl: string }> {
  return { blobUrl: dataUrl, dataUrl };
}
