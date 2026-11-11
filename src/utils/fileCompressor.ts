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
 * Image auto-scaling compressor using HTML5 Canvas.
 * Automatically resizes large photo scans (10MB+) down to ~200KB while preserving crisp text readability.
 */
export async function compressImageToFit(
  file: File,
  maxDimension = 1800,
  quality = 0.8,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load image for processing"));
    };

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let width = img.width;
      let height = img.height;

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas context unavailable"));
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      const targetMime = "image/jpeg";
      const dataUrl = canvas.toDataURL(targetMime, quality);
      resolve(dataUrl);
    };

    img.src = objectUrl;
  });
}

/**
 * Native FileReader conversion with Firestore 1MB payload safety check.
 */
export async function fileToDataUrl(file: File): Promise<string> {
  const isImage = file.type.startsWith("image/") || /\.(jpg|jpeg|png|webp|bmp)$/i.test(file.name);

  if (isImage && file.size > 500 * 1024) {
    try {
      // Auto-downscale large photo scans so they fit cleanly within Firestore payload limits
      return await compressImageToFit(file);
    } catch {
      // Fallback to direct read if canvas fails
    }
  }

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });

  // Firestore document limit is 1,048,576 bytes. Base64 strings over ~900,000 characters will fail.
  const base64Length = rawDataUrl.length;
  const estimatedBytes = Math.round((base64Length * 3) / 4);

  if (estimatedBytes > 920000) {
    throw new Error(
      `File size (${formatBytes(file.size)}) exceeds maximum limit for database sync (1 MB limit). Please select a file under 800 KB or compress the PDF.`,
    );
  }

  return rawDataUrl;
}

export async function compressResultFile(file: File): Promise<CompressedFileResult> {
  const dataUrl = await fileToDataUrl(file);
  const estimatedBytes = Math.round(((dataUrl.length - (dataUrl.indexOf(",") + 1)) * 3) / 4);

  return {
    fileName: file.name,
    fileType: file.type || "application/pdf",
    dataUrl,
    originalSizeBytes: file.size,
    compressedSizeBytes: estimatedBytes,
    originalSizeFormatted: formatBytes(file.size),
    compressedSizeFormatted: formatBytes(estimatedBytes),
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
