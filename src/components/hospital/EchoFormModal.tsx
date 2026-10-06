import React, { useState, useEffect } from "react";
import { X, FileText, Download, ExternalLink, FileCheck, Eye } from "lucide-react";
import { AppointmentRecord } from "../../services/firebaseAppointments";
import { downloadEchoPDFForm, generateEchoFormHTML } from "../../utils/echoFormGenerator";
import { getReportBlob, viewReportFile, downloadReportFile } from "../../services/reportStorage";
import { createSafeFileUrl, openPdfInNewTab, downloadBlobFile } from "../../utils/fileViewerUtils";

interface EchoFormModalProps {
  request: AppointmentRecord;
  onClose: () => void;
}

export function EchoFormModal({ request, onClose }: EchoFormModalProps) {
  const [safeFileUrl, setSafeFileUrl] = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState<boolean>(false);

  const storagePath = request.resultFile?.storagePath;
  const rawDataUrl = request.resultFile?.dataUrl;
  const fileName = request.resultFile?.fileName || "Diagnostic_Report.pdf";
  const hasUploadedFile = Boolean(storagePath || rawDataUrl);

  const isImage =
    /\.(png|jpg|jpeg|webp|gif|bmp|svg)$/i.test(fileName) ||
    rawDataUrl?.startsWith("data:image/") ||
    request.resultFile?.contentType?.startsWith("image/");

  const isPdf =
    /\.pdf$/i.test(fileName) ||
    rawDataUrl?.startsWith("data:application/pdf") ||
    request.resultFile?.contentType === "application/pdf" ||
    (!isImage && hasUploadedFile);

  // Load file from Firebase Storage (or legacy dataUrl) into a transient, revocable Blob URL
  useEffect(() => {
    let currentObjectUrl: string | null = null;
    let isCancelled = false;

    async function loadFile() {
      if (storagePath) {
        setIsLoadingFile(true);
        try {
          const blob = await getReportBlob(storagePath);
          if (!isCancelled) {
            currentObjectUrl = URL.createObjectURL(blob);
            setSafeFileUrl(currentObjectUrl);
          }
        } catch (err) {
          console.error("Failed to load report from storage:", err);
          if (!isCancelled) {
            setSafeFileUrl(null);
          }
        } finally {
          if (!isCancelled) {
            setIsLoadingFile(false);
          }
        }
      } else if (rawDataUrl) {
        const safeObj = createSafeFileUrl(rawDataUrl);
        if (safeObj) {
          currentObjectUrl = safeObj.url;
          setSafeFileUrl(currentObjectUrl);
        } else {
          setSafeFileUrl(rawDataUrl);
        }
      } else {
        setSafeFileUrl(null);
      }
    }

    loadFile();

    return () => {
      isCancelled = true;
      if (currentObjectUrl && currentObjectUrl.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(currentObjectUrl);
        } catch {
          // ignore
        }
      }
    };
  }, [storagePath, rawDataUrl]);

  const handleDownload = async () => {
    if (storagePath) {
      await downloadReportFile(storagePath, fileName);
    } else if (safeFileUrl || rawDataUrl) {
      downloadBlobFile(safeFileUrl || rawDataUrl!, fileName);
    } else {
      downloadEchoPDFForm(request);
    }
  };

  const handleOpenInNewTab = async () => {
    if (storagePath) {
      await viewReportFile(storagePath, fileName);
    } else if (safeFileUrl || rawDataUrl) {
      openPdfInNewTab(safeFileUrl || rawDataUrl!, fileName);
    }
  };

  const htmlContent = !hasUploadedFile ? generateEchoFormHTML(request) : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-2 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative flex flex-col w-full max-w-5xl h-[92vh] max-h-[92vh] rounded-2xl border border-border bg-background shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-5 py-3.5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-heading truncate">
                  {hasUploadedFile
                    ? `Diagnostic Report: ${request.procedureType || "Radiology File"}`
                    : request.procedureType?.includes("Stress Test")
                      ? "Exercise Stress Test Request Form"
                      : request.procedureType?.includes("Holter")
                        ? "24 Hours Holter Monitoring Request Form"
                        : request.procedureType?.includes("Blood Pressure") ||
                            request.procedureType?.includes("ABPM")
                          ? "24 Hours Blood Pressure Monitoring Request Form"
                          : request.procedureType?.includes("Lung Function") ||
                              request.procedureType?.includes("Spirometry")
                            ? "Lung Function Test / Spirometry Request Form"
                            : request.procedureType?.includes("Outsource") ||
                                request.procedureType?.includes("MRI") ||
                                request.procedureType?.includes("CT") ||
                                request.procedureType?.includes("USG") ||
                                request.procedureType?.includes("COROS") ||
                                request.procedureType?.includes("EEG") ||
                                request.procedureType?.includes("NCS") ||
                                request.department === "Outsource Radiology"
                              ? "Outsource Diagnostic Report"
                              : "Echocardiogram Request Form"}
                </h3>
                {hasUploadedFile && (
                  <span className="hidden sm:inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    <FileCheck className="h-3 w-3" />
                    Verified Document
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">
                Patient:{" "}
                <span className="font-semibold text-foreground">{request.patientName}</span> (
                {request.mrn})
                {request.referringDoctor && (
                  <span className="ml-2 font-semibold text-primary">
                    • {request.referringDoctor}
                  </span>
                )}
                {request.resultFile?.fileName && (
                  <span className="ml-2 text-muted-foreground font-mono">
                    • {request.resultFile.fileName}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {hasUploadedFile && (
              <button
                type="button"
                onClick={handleOpenInNewTab}
                className="hidden sm:flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-bold text-foreground hover:bg-accent transition-colors shadow-xs"
                title="Open PDF in a new tab"
              >
                <ExternalLink className="h-4 w-4" />
                <span>Open in Tab</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleDownload}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
              title="Download official file"
            >
              <Download className="h-4 w-4" />
              <span>Download File</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-2 text-muted-foreground hover:bg-muted/20 hover:text-foreground transition-colors ml-1"
              title="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Modal Body / Document View */}
        <div className="flex-1 overflow-auto bg-neutral-200/70 dark:bg-neutral-900/90 p-2 sm:p-4 flex flex-col justify-center items-center">
          {hasUploadedFile ? (
            isLoadingFile ? (
              <div className="p-8 text-center bg-white dark:bg-card rounded-xl shadow-lg border border-border space-y-4 max-w-md">
                <FileText className="h-12 w-12 text-primary mx-auto animate-pulse" />
                <h4 className="text-sm font-bold text-heading">Loading Protected Report...</h4>
                <p className="text-xs text-muted-foreground">
                  Fetching authorized document from Firebase Storage...
                </p>
              </div>
            ) : isImage ? (
              <div className="flex flex-col items-center justify-center p-4 bg-white dark:bg-neutral-800 rounded-xl shadow-xl max-w-full max-h-full overflow-auto">
                <img
                  src={safeFileUrl || rawDataUrl}
                  alt={fileName}
                  className="max-h-[720px] max-w-full object-contain rounded-lg shadow-md"
                />
                <div className="mt-3 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleOpenInNewTab}
                    className="flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
                  >
                    <Eye className="h-3.5 w-3.5" /> Full Resolution
                  </button>
                  <span className="text-muted-foreground">•</span>
                  <span className="text-xs text-muted-foreground font-mono">{fileName}</span>
                </div>
              </div>
            ) : isPdf && safeFileUrl ? (
              <div className="w-full h-full bg-white rounded-xl shadow-xl overflow-hidden border border-neutral-300 dark:border-neutral-700 flex flex-col">
                <object
                  data={`${safeFileUrl}#toolbar=1&navpanes=1&scrollbar=1`}
                  type="application/pdf"
                  className="w-full h-full border-none flex-1"
                >
                  <iframe
                    src={`${safeFileUrl}#toolbar=1&navpanes=1`}
                    title={fileName}
                    className="w-full h-full border-none flex-1"
                  >
                    <div className="p-8 text-center bg-white space-y-4">
                      <FileText className="h-12 w-12 text-primary mx-auto" />
                      <h4 className="text-base font-bold text-heading">
                        Previewing PDF: {fileName}
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        If your browser does not support embedding PDF files, click below to open or
                        download.
                      </p>
                      <div className="flex justify-center gap-3 pt-2">
                        <button
                          type="button"
                          onClick={handleOpenInNewTab}
                          className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow-sm"
                        >
                          Open PDF in New Window
                        </button>
                        <button
                          type="button"
                          onClick={handleDownload}
                          className="rounded-xl border border-border px-4 py-2 text-xs font-bold text-foreground"
                        >
                          Download PDF
                        </button>
                      </div>
                    </div>
                  </iframe>
                </object>
              </div>
            ) : (
              <div className="p-8 text-center bg-white dark:bg-card rounded-xl shadow-lg border border-border space-y-4 max-w-md">
                <FileText className="h-12 w-12 text-primary mx-auto" />
                <h4 className="text-sm font-bold text-heading">Diagnostic Report Ready</h4>
                <p className="text-xs text-muted-foreground">{fileName}</p>
                <div className="flex justify-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow-sm"
                  >
                    Download File
                  </button>
                </div>
              </div>
            )
          ) : (
            <div className="w-full max-w-[210mm] bg-white text-black shadow-xl rounded-sm min-h-[297mm] p-4 sm:p-8 border border-neutral-300 overflow-auto">
              <iframe
                srcDoc={htmlContent}
                title={`${request.procedureType || "Request"} Form Preview`}
                className="w-full h-[750px] border-none"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
