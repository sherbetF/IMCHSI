import React, { useState, useEffect } from "react";
import { X, FileText, Download, FileDown, ExternalLink } from "lucide-react";
import { AppointmentRecord } from "@/services/firebaseAppointments";
import { calculateAgeFromIC, detectGenderFromIC, formatDateOnly } from "@/utils/echoFormGenerator";
import { createSafeFileUrl, downloadBlobFile, openPdfInNewTab } from "@/utils/fileViewerUtils";

interface OutsourceFormModalProps {
  request: AppointmentRecord;
  onClose: () => void;
}

export function OutsourceFormModal({ request, onClose }: OutsourceFormModalProps) {
  const [safeFileUrl, setSafeFileUrl] = useState<string | null>(null);

  const age = calculateAgeFromIC(request.mrn);
  const gender = detectGenderFromIC(request.mrn);
  const studyDateStr = request.studyDate || formatDateOnly(request.createdAt);
  const uploadDateStr = formatDateOnly(request.createdAt);

  const attached = request.attachedReport;
  const rawDataUrl = attached?.fileData;
  const fileName =
    attached?.fileName || `${request.reportType || "Outsource_Report"}_${request.mrn}.pdf`;

  const isPdf =
    attached?.fileType?.includes("pdf") ||
    attached?.fileName?.toLowerCase().endsWith(".pdf") ||
    attached?.fileData?.startsWith("data:application/pdf");
  const isImage =
    attached?.fileType?.includes("image") ||
    attached?.fileName?.toLowerCase().match(/\.(png|jpg|jpeg|webp)$/) ||
    attached?.fileData?.startsWith("data:image/");

  useEffect(() => {
    if (!rawDataUrl) {
      setSafeFileUrl(null);
      return;
    }

    const safeObj = createSafeFileUrl(rawDataUrl);
    if (safeObj) {
      setSafeFileUrl(safeObj.url);
      return () => {
        safeObj.revoke();
      };
    } else {
      setSafeFileUrl(rawDataUrl);
    }
  }, [rawDataUrl]);

  const handleDownloadAttached = () => {
    if (!rawDataUrl && !safeFileUrl) return;
    downloadBlobFile(safeFileUrl || rawDataUrl!, fileName);
  };

  const handleOpenAttached = () => {
    if (!rawDataUrl && !safeFileUrl) return;
    openPdfInNewTab(safeFileUrl || rawDataUrl!, fileName);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-2 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative flex flex-col w-full max-w-4xl max-h-[92vh] rounded-2xl border border-border bg-background shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-5 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-heading">
                  Outsource Radiology Report — {request.reportType || request.procedureType}
                </h3>
                <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary uppercase">
                  {request.modality || "Radiology"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Patient:{" "}
                <span className="font-semibold text-foreground">{request.patientName}</span> (
                {request.mrn}) • Hospital:{" "}
                <span className="font-semibold text-foreground">
                  {request.hospitalOrigin || "Private Hospital"}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {attached?.fileData && (
              <button
                type="button"
                onClick={handleDownloadAttached}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-colors"
                title="Download attached report file"
              >
                <FileDown className="h-4 w-4" />
                <span>Download Report</span>
              </button>
            )}

            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
            >
              <Download className="h-4 w-4" />
              <span>Print / PDF</span>
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

        {/* Modal Body: Document & Preview View */}
        <div className="flex-1 overflow-auto bg-neutral-100 dark:bg-neutral-900/90 p-4 sm:p-6 space-y-6">
          {/* Official Summary Card */}
          <div className="mx-auto max-w-[210mm] bg-white text-black shadow-lg rounded-xl border border-neutral-300 p-6 sm:p-8 space-y-6">
            {/* Header */}
            <div className="border-b-2 border-black pb-4 text-center">
              <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-600">
                Hospital Sultan Ismail, Johor Bahru • Internal Medicine Department
              </p>
              <h2 className="text-xl font-extrabold uppercase tracking-tight mt-1 text-black">
                Outsource Radiology & Diagnostic Database Record
              </h2>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-xs font-medium text-neutral-700">
                <span>
                  <strong>Report Ref:</strong> {request.id}
                </span>
                <span>•</span>
                <span>
                  <strong>Facility:</strong> {request.facilityName}
                </span>
                <span>•</span>
                <span>
                  <strong>Date Uploaded:</strong> {uploadDateStr}
                </span>
              </div>
            </div>

            {/* Patient & Study Info Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-neutral-50 p-4 rounded-lg border border-neutral-200 text-xs">
              <div className="space-y-2">
                <p className="font-bold uppercase tracking-wider text-neutral-500 text-[10px]">
                  Patient Information
                </p>
                <div className="grid grid-cols-3 gap-1">
                  <span className="text-neutral-500 font-medium">Full Name:</span>
                  <span className="col-span-2 font-bold uppercase text-black">
                    {request.patientName}
                  </span>

                  <span className="text-neutral-500 font-medium">IC / Passport:</span>
                  <span className="col-span-2 font-bold font-mono text-black">{request.mrn}</span>

                  <span className="text-neutral-500 font-medium">Age / Gender:</span>
                  <span className="col-span-2 font-semibold text-black">
                    {age} • {gender}
                  </span>

                  <span className="text-neutral-500 font-medium">Contact No:</span>
                  <span className="col-span-2 font-semibold text-black">
                    {request.contactNumber}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="font-bold uppercase tracking-wider text-neutral-500 text-[10px]">
                  Origin & Examination Details
                </p>
                <div className="grid grid-cols-3 gap-1">
                  <span className="text-neutral-500 font-medium">Hospital Origin:</span>
                  <span className="col-span-2 font-bold text-emerald-800">
                    {request.hospitalOrigin || "Private Hospital"}
                  </span>

                  <span className="text-neutral-500 font-medium">Modality / Type:</span>
                  <span className="col-span-2 font-bold text-black">
                    {request.modality || "Radiology"} — {request.reportType}
                  </span>

                  <span className="text-neutral-500 font-medium">Study Date:</span>
                  <span className="col-span-2 font-bold text-black">{studyDateStr}</span>

                  <span className="text-neutral-500 font-medium">Reporting Doc:</span>
                  <span className="col-span-2 font-semibold text-black">
                    {request.referringDoctor || "N/A"}
                  </span>
                </div>
              </div>
            </div>

            {/* Clinical Indication */}
            <div className="space-y-1.5 text-xs">
              <h4 className="font-bold uppercase tracking-wider text-neutral-700 text-[11px] border-b border-neutral-200 pb-1">
                Clinical Indication / History
              </h4>
              <p className="text-neutral-800 leading-relaxed whitespace-pre-wrap bg-neutral-50/70 p-3 rounded border border-neutral-200 font-medium">
                {request.clinicalIndication || "None provided"}
              </p>
            </div>

            {/* Key Findings Summary & Impression */}
            <div className="space-y-1.5 text-xs">
              <h4 className="font-bold uppercase tracking-wider text-neutral-700 text-[11px] border-b border-neutral-200 pb-1">
                Radiologist Findings & Official Summary
              </h4>
              <p className="text-neutral-900 leading-relaxed whitespace-pre-wrap bg-neutral-50 p-3.5 rounded border border-neutral-200 font-semibold">
                {request.findingsSummary || request.diagnosis || "No summary transcribed"}
              </p>
            </div>

            {/* Diagnosis / Impression */}
            {request.diagnosis && (
              <div className="space-y-1.5 text-xs">
                <h4 className="font-bold uppercase tracking-wider text-neutral-700 text-[11px] border-b border-neutral-200 pb-1">
                  Diagnosis / Conclusion
                </h4>
                <p className="text-neutral-900 leading-relaxed bg-neutral-50 p-3 rounded border border-neutral-200 font-medium">
                  {request.diagnosis}
                </p>
              </div>
            )}

            {/* Status & Footer */}
            <div className="pt-4 border-t border-neutral-200 flex items-center justify-between text-[11px] text-neutral-500">
              <span>
                Status: <strong className="uppercase text-neutral-800">{request.status}</strong>
              </span>
              <span>Archived in HSI Non-Invasive Internal Medicine Cloud</span>
            </div>
          </div>

          {/* Attached Document Preview Box */}
          {attached?.fileData && (
            <div className="mx-auto max-w-[210mm] bg-white dark:bg-card shadow-lg rounded-xl border border-border p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <span className="font-bold text-sm text-heading">
                    Attached Document Preview ({attached.fileName})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleOpenAttached}
                    className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open in Tab
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadAttached}
                    className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download File
                  </button>
                </div>
              </div>

              {isPdf && safeFileUrl ? (
                <div className="w-full h-[650px] rounded-lg overflow-hidden border border-border bg-neutral-100">
                  <object
                    data={`${safeFileUrl}#toolbar=1`}
                    type="application/pdf"
                    className="w-full h-full border-none"
                  >
                    <iframe
                      src={`${safeFileUrl}#toolbar=1`}
                      title={attached.fileName}
                      className="w-full h-full border-none"
                    />
                  </object>
                </div>
              ) : isImage ? (
                <div className="flex justify-center p-2 bg-neutral-100 dark:bg-neutral-800 rounded-lg overflow-hidden border border-border">
                  <img
                    src={safeFileUrl || attached.fileData}
                    alt={attached.fileName}
                    className="max-h-[600px] w-auto object-contain rounded"
                  />
                </div>
              ) : (
                <div className="p-8 text-center bg-neutral-50 dark:bg-neutral-900 rounded-lg border border-dashed border-border space-y-3">
                  <FileText className="h-10 w-10 text-muted-foreground mx-auto" />
                  <p className="text-sm font-semibold text-foreground">{attached.fileName}</p>
                  <button
                    type="button"
                    onClick={handleDownloadAttached}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-sm"
                  >
                    <Download className="h-4 w-4" />
                    Download File ({(attached.fileSize / 1024).toFixed(1)} KB)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
