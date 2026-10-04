import { AppointmentRecord } from "@/services/firebaseAppointments";
import { generateEchoFormHTML } from "./echoFormGenerator";

/**
 * Utility helper to safely handle Data URLs, PDF blobs, and file previews
 * preventing Chrome "This page has been blocked by Chrome" (ERR_BLOCKED_BY_CLIENT) errors
 * and ensuring files open in a new tab for native PDF viewing instead of downloading.
 */

export function dataUrlToBlob(
  dataUrl: string,
  fallbackMime: string = "application/pdf",
): Blob | null {
  try {
    if (!dataUrl || typeof dataUrl !== "string") return null;
    if (!dataUrl.startsWith("data:")) return null;

    const parts = dataUrl.split(",");
    if (parts.length < 2) return null;

    const header = parts[0];
    const base64Data = parts[1];

    const mimeMatch = header.match(/data:(.*?);/);
    let mimeType = mimeMatch ? mimeMatch[1] : fallbackMime;

    if (mimeType === "application/octet-stream") {
      mimeType = fallbackMime;
    }

    const binaryString = atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);

    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return new Blob([bytes], { type: mimeType });
  } catch (err) {
    console.error("Failed to convert data URL to Blob:", err);
    return null;
  }
}

/**
 * Safely creates an Object URL (blob:) from a data URL or returns the existing URL.
 */
export function createSafeFileUrl(
  dataUrlOrUrl: string,
  fallbackMime: string = "application/pdf",
): { url: string; revoke: () => void } | null {
  if (!dataUrlOrUrl) return null;

  if (dataUrlOrUrl.startsWith("blob:") || dataUrlOrUrl.startsWith("http")) {
    return {
      url: dataUrlOrUrl,
      revoke: () => {},
    };
  }

  const blob = dataUrlToBlob(dataUrlOrUrl, fallbackMime);
  if (blob) {
    const objectUrl = URL.createObjectURL(blob);
    return {
      url: objectUrl,
      revoke: () => {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {
          // ignore
        }
      },
    };
  }

  return {
    url: dataUrlOrUrl,
    revoke: () => {},
  };
}

/**
 * Opens a PDF or image document directly in a new browser tab for viewing in Chrome's native PDF reader.
 * Does NOT force download so the user can review the file immediately in their browser.
 */
export function openPdfInNewTab(
  dataUrlOrUrl: string,
  fileName: string = "Diagnostic_Report.pdf",
): void {
  if (!dataUrlOrUrl) return;

  const isImage =
    /\.(png|jpg|jpeg|webp|gif|bmp|svg)$/i.test(fileName) || dataUrlOrUrl.startsWith("data:image/");

  const mimeType = isImage ? "image/png" : "application/pdf";
  let targetUrl = dataUrlOrUrl;

  if (dataUrlOrUrl.startsWith("data:")) {
    const blob = dataUrlToBlob(dataUrlOrUrl, mimeType);
    if (blob) {
      targetUrl = URL.createObjectURL(blob);
    }
  }

  // Open the same-origin blob URL directly in a new tab to launch Chrome's native PDF reader
  const newTab = window.open(targetUrl, "_blank");
  if (!newTab) {
    // If popup blocked, use anchor click simulation
    const a = document.createElement("a");
    a.href = targetUrl;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

/**
 * Opens the official Outsource Diagnostic Report form in a new browser tab for direct viewing.
 */
export function openReportFormInNewTab(req: AppointmentRecord): void {
  const htmlContent = generateEchoFormHTML(req);
  const newTab = window.open("", "_blank");
  if (newTab) {
    newTab.document.write(htmlContent);
    newTab.document.close();
  }
}

/**
 * Safely triggers file download when user explicitly clicks a Download action.
 */
export function downloadBlobFile(dataUrlOrUrl: string, fileName: string): void {
  if (!dataUrlOrUrl) return;

  let downloadUrl = dataUrlOrUrl;
  let shouldRevoke = false;

  if (dataUrlOrUrl.startsWith("data:")) {
    const blob = dataUrlToBlob(dataUrlOrUrl);
    if (blob) {
      downloadUrl = URL.createObjectURL(blob);
      shouldRevoke = true;
    }
  }

  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = fileName || "download.pdf";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  if (shouldRevoke) {
    setTimeout(() => {
      try {
        URL.revokeObjectURL(downloadUrl);
      } catch {
        // ignore
      }
    }, 15000);
  }
}
