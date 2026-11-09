import { useState, useEffect, useRef, useMemo } from "react";
import {
  Search,
  Filter,
  FileCheck,
  Upload,
  FileText,
  Calendar as CalendarIcon,
  CheckCircle2,
  AlertCircle,
  X,
  Download,
  Eye,
  Clock,
  Plus,
  Check,
  RefreshCw,
} from "lucide-react";
import { useFacility } from "@/context/FacilityContext";
import { toast } from "sonner";
import {
  subscribeToAllDatabaseResults,
  createExternalDiagnosticResult,
  updateAppointment,
  subscribeToAppointments,
  DiagnosticDatabaseItem,
  AppointmentRecord,
} from "@/services/firebaseAppointments";
import { compressResultFile, CompressedFileResult } from "@/utils/fileCompressor";
import {
  formatDisplayDateTime,
  formatDisplayScheduledDate,
  getLocalDateTimeString,
} from "@/utils/dateUtils";
import { generateAppointmentId, formatAppointmentCode } from "@/utils/appointmentId";
import { openPdfInNewTab } from "@/utils/fileViewerUtils";

import { FACILITIES_DATA } from "@/data/facilities";

export function DatabaseModule() {
  const { selectedFacility, isAdmin, isParamedicNurse, canManageScheduling, facilityId } =
    useFacility();

  const facilitiesList = useMemo(
    () =>
      FACILITIES_DATA.flatMap((g) =>
        g.items.map((i) => ({ facilityId: i.facilityId, name: i.facilityName })),
      ),
    [],
  );

  const [results, setResults] = useState<DiagnosticDatabaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [modalityFilter, setModalityFilter] = useState("All");

  // Direct upload for list row edit
  const directFileInputRef = useRef<HTMLInputElement>(null);
  const activeUploadItemRef = useRef<DiagnosticDatabaseItem | null>(null);

  // Modal states for adding new results
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Quick / Paramedic Upload Form State (Name, IC Number, Health Facility, Modality, File)
  const [extPatientName, setExtPatientName] = useState("");
  const [extMrn, setExtMrn] = useState("");
  const [extFacilityId, setExtFacilityId] = useState(selectedFacility?.facilityId || "");
  const [extFacilityName, setExtFacilityName] = useState(
    selectedFacility?.name || "Hospital Sultan Ismail",
  );
  const [extModality, setExtModality] =
    useState<DiagnosticDatabaseItem["modality"]>("Exercise Stress Test");

  // File Upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [compressedResult, setCompressedResult] = useState<CompressedFileResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeFacilityId = facilityId || (selectedFacility ? selectedFacility.facilityId : null);

  // Subscribe to central Database Results (Automatically retrieves all Stress Test, Holter, and lab results)
  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToAllDatabaseResults(activeFacilityId, canManageScheduling, (data) => {
      setResults(data);
      setLoading(false);
    });
    return () => unsub();
  }, [activeFacilityId, canManageScheduling]);

  useEffect(() => {
    if (selectedFacility) {
      setExtFacilityId(selectedFacility.facilityId);
      setExtFacilityName(selectedFacility.name);
    }
  }, [selectedFacility]);

  // Direct File Upload from row list
  const handleDirectUploadClick = (item: DiagnosticDatabaseItem) => {
    activeUploadItemRef.current = item;
    directFileInputRef.current?.click();
  };

  const handleDirectFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const item = activeUploadItemRef.current;
    if (!file || !item) return;

    toast.info("Uploading result file...");
    try {
      const compressed = await compressResultFile(file);
      const newResult = {
        fileName: compressed.fileName,
        uploadedAt: getLocalDateTimeString(),
        summaryNotes: `${compressed.fileName} attached.`,
        dataUrl: compressed.dataUrl,
        originalSizeBytes: compressed.originalSizeBytes,
        originalSizeFormatted: compressed.originalSizeFormatted,
        fileType: compressed.fileType,
      };

      if (item.source === "website_request" && item.collectionKey !== "diagnostic_results") {
        await updateAppointment(item.collectionKey as any, item.id, {
          resultFile: newResult,
          status: "Completed - Result Ready",
        });
      } else {
        await createExternalDiagnosticResult({
          ...item,
          resultFile: newResult,
        });
      }

      toast.success(`Diagnostic result uploaded for ${item.patientName}`);
    } catch (err) {
      console.error("Failed to upload result to Firebase:", err);
      toast.error("Failed to upload result");
    } finally {
      e.target.value = "";
      activeUploadItemRef.current = null;
    }
  };

  const handleFileChange = async (file: File | null) => {
    if (!file) {
      setSelectedFile(null);
      setCompressedResult(null);
      return;
    }

    setSelectedFile(file);
    try {
      const result = await compressResultFile(file);
      setCompressedResult(result);
    } catch (err) {
      console.error("File selection failed:", err);
      toast.error("Failed to read file.");
    }
  };

  const resetForm = () => {
    setExtPatientName("");
    setExtMrn("");
    setSelectedFile(null);
    setCompressedResult(null);
    setIsCompressing(false);
    setIsSubmitting(false);
  };

  const handleSubmitResult = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!extPatientName.trim() || !extMrn.trim()) {
      toast.error("Please enter Patient Name and IC Number.");
      return;
    }

    if (!extModality) {
      toast.error("Please select a Modality / Procedure.");
      return;
    }

    if (!compressedResult && !selectedFile) {
      toast.error("Please select a diagnostic report or result file to upload.");
      return;
    }

    setIsSubmitting(true);

    try {
      const nowStr = getLocalDateTimeString();
      const rawDocId = generateAppointmentId();
      const facId = extFacilityId || "GENERAL";
      const facName = extFacilityName || "Unspecified / General";

      const displayCode = formatAppointmentCode(rawDocId, extModality, facName, facId);

      const newDatabaseItem: DiagnosticDatabaseItem = {
        id: rawDocId,
        displayId: displayCode,
        source: "external_manual",
        modality: extModality,
        collectionKey: "diagnostic_results",
        patientName: extPatientName.trim(),
        mrn: extMrn.trim().toUpperCase(),
        facilityId: facId,
        facilityName: facName,
        referringDoctor: "Attending Paramedic / MO",
        diagnosis: "Diagnostic Examination",
        clinicalIndication: "Uploaded result record",
        diagnosticDate: formatDisplayScheduledDate(getLocalDateTimeString().split(" ")[0]),
        uploadedAt: nowStr,
        uploadedBy: isParamedicNurse
          ? "Paramedic / Nurse"
          : isAdmin
            ? "System Admin"
            : "Medical Officer",
        status: "Completed - Result Ready",
        resultFile: {
          fileName: compressedResult?.fileName || selectedFile!.name,
          uploadedAt: nowStr,
          summaryNotes: `${compressedResult?.fileName || selectedFile!.name} uploaded.`,
          dataUrl: compressedResult?.dataUrl || "",
          originalSizeBytes: compressedResult?.originalSizeBytes,
          compressedSizeBytes: compressedResult?.compressedSizeBytes,
          originalSizeFormatted: compressedResult?.originalSizeFormatted,
          compressedSizeFormatted: compressedResult?.compressedSizeFormatted,
          compressionSavingsPercent: compressedResult?.compressionSavingsPercent,
          fileType: compressedResult?.fileType,
        },
      };

      await createExternalDiagnosticResult(newDatabaseItem);
      toast.success(`Diagnostic result saved for ${extPatientName}`);

      setIsAddModalOpen(false);
      resetForm();
    } catch (err) {
      console.error("Failed to save result to Database:", err);
      toast.error("Failed to upload result to database. Please check your network connection.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredResults = useMemo(() => {
    return results.filter((r) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        (r.displayId || "").toLowerCase().includes(q) ||
        r.patientName.toLowerCase().includes(q) ||
        r.mrn.toLowerCase().includes(q) ||
        (r.referringDoctor || "").toLowerCase().includes(q) ||
        (r.facilityName || "").toLowerCase().includes(q) ||
        (r.resultFile?.fileName || "").toLowerCase().includes(q) ||
        (r.diagnosis || "").toLowerCase().includes(q);

      const matchesModality =
        modalityFilter === "All"
          ? true
          : r.modality.toLowerCase().includes(modalityFilter.toLowerCase());

      return matchesSearch && matchesModality;
    });
  }, [results, searchQuery, modalityFilter]);

  const handleDownload = (item: DiagnosticDatabaseItem) => {
    if (!item.resultFile) return;

    if (item.resultFile.dataUrl) {
      const link = document.createElement("a");
      link.href = item.resultFile.dataUrl;
      link.download = item.resultFile.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success(`Downloading ${item.resultFile.fileName}`);
    } else {
      toast.info(`Preparing download for ${item.resultFile.fileName}...`);
    }
  };

  const handleViewPdf = (item: DiagnosticDatabaseItem) => {
    if (!item.resultFile) return;

    if (item.resultFile.dataUrl) {
      openPdfInNewTab(item.resultFile.dataUrl, item.resultFile.fileName);
    }
  };

  return (
    <section className="mx-auto max-w-[1200px] px-5 pt-4 pb-10">
      {/* Hidden File Input for Direct Row Upload */}
      <input
        type="file"
        ref={directFileInputRef}
        accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
        onChange={handleDirectFileChange}
        className="hidden"
      />

      {/* Header Banner - 1:1 match with StressTestAppointment.tsx */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h2 className="text-2xl font-bold text-heading">Diagnostic Database & Result Archive</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Non-Invasive Cardiovascular & Respiratory Laboratory • Hospital Sultan Ismail
          </p>
        </div>

        {canManageScheduling && (
          <button
            onClick={() => {
              resetForm();
              setIsAddModalOpen(true);
            }}
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs sm:text-sm font-bold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity cursor-pointer"
          >
            <Plus className="h-4 w-4 stroke-[2.5]" />
            <span>Upload New Result</span>
          </button>
        )}
      </div>

      {/* Main Content Area - 1:1 match with StressTestAppointment.tsx */}
      <div className="mt-8">
        {/* Search & Filter Bar - 1:1 match with StressTestAppointment.tsx */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-background p-4">
          <div className="relative min-w-[260px] flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by patient name, ID, diagnosis, or doctor..."
              className="w-full rounded-lg border border-border bg-surface pl-9 pr-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Modality:</span>
              <select
                value={modalityFilter}
                onChange={(e) => setModalityFilter(e.target.value)}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold outline-none"
              >
                <option value="All">All Modalities ({results.length})</option>
                <option value="Stress Test">Exercise Stress Test</option>
                <option value="Holter">24H Holter</option>
                <option value="Echocardiogram">Echocardiogram</option>
                <option value="Blood Pressure">24H Blood Pressure</option>
                <option value="Lung Function">Lung Function / Spirometry</option>
              </select>
            </div>
          </div>
        </div>

        {/* Results Item List */}
        <div className="mt-6 divide-y divide-border overflow-hidden rounded-xl border border-border bg-background">
          {filteredResults.map((r) => {
            return (
              <div
                key={r.id}
                className="border-b px-4 py-3 transition-colors border-border/60 hover:bg-surface/50"
              >
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs">
                  {/* Left: Patient Name, MRN, Modality Badge */}
                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-heading">{r.patientName}</span>
                      <span className="text-xs font-mono text-muted-foreground">({r.mrn})</span>
                    </div>
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-surface text-muted-foreground border border-border/50">
                      {r.modality}
                    </span>
                  </div>

                  {/* Right: Eye (View PDF), Download Icon, Privileged Upload */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleViewPdf(r)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors shadow-xs cursor-pointer"
                      title="View Diagnostic Result PDF"
                      aria-label="View Result PDF"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDownload(r)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors shadow-xs cursor-pointer"
                      title="Download Diagnostic Result"
                      aria-label="Download Result"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>

                    {(isAdmin || isParamedicNurse) && (
                      <button
                        type="button"
                        onClick={() => handleDirectUploadClick(r)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors shadow-xs cursor-pointer"
                        title="Edit / Re-upload Result File"
                        aria-label="Edit Result"
                      >
                        <Upload className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {filteredResults.length === 0 && (
            <div className="p-12 text-center text-sm text-muted-foreground space-y-2">
              <AlertCircle className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="mt-2 leading-relaxed">
                {loading
                  ? "Loading diagnostic results from Firebase..."
                  : "No diagnostic results found matching your filter."}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Streamlined Upload Diagnostic Test Result Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-2xl border border-border bg-background p-6 shadow-2xl space-y-5">
            <div className="flex items-start justify-between border-b border-border pb-4">
              <div>
                <h3 className="text-base font-bold text-heading">Upload Procedure / Test Result</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsAddModalOpen(false);
                  resetForm();
                }}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted/20 hover:text-foreground transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitResult} className="space-y-4">
              <div className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-heading mb-1">
                    Patient Full Name <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={extPatientName}
                    onChange={(e) => setExtPatientName(e.target.value)}
                    placeholder="e.g. Tan Ah Kow"
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs sm:text-sm font-semibold outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-heading mb-1">
                    IC Number / Passport / Identification No.{" "}
                    <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={extMrn}
                    onChange={(e) => setExtMrn(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))}
                    placeholder="e.g. 880312015521"
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs sm:text-sm font-semibold outline-none focus:border-primary"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-bold text-heading mb-1">
                      Modality / Procedure <span className="text-destructive">*</span>
                    </label>
                    <select
                      required
                      value={extModality}
                      onChange={(e) => setExtModality(e.target.value as any)}
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold outline-none focus:border-primary"
                    >
                      <option value="Exercise Stress Test">Exercise Stress Test</option>
                      <option value="24H Holter">24H Holter Monitoring</option>
                      <option value="Echocardiogram">Echocardiogram</option>
                      <option value="24H Blood Pressure">24H Blood Pressure</option>
                      <option value="Lung Function / Spirometry">Lung Function / Spirometry</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-heading mb-1">
                      Health Facility{" "}
                      <span className="text-muted-foreground font-normal">(Optional)</span>
                    </label>
                    <select
                      value={extFacilityId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setExtFacilityId(id);
                        if (!id) {
                          setExtFacilityName("Unspecified / N/A");
                        } else {
                          const fac = facilitiesList.find((f) => f.facilityId === id);
                          setExtFacilityName(fac ? fac.name : "Unspecified / N/A");
                        }
                      }}
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold outline-none focus:border-primary"
                    >
                      <option value=""></option>
                      {(facilitiesList || []).map((f) => (
                        <option key={f.facilityId} value={f.facilityId}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* REQUIRED FILE SELECTION DROPZONE */}
              <div className="space-y-2 pt-1">
                <label className="block text-xs font-bold text-heading uppercase tracking-wider">
                  Select Result Report File <span className="text-destructive">*</span>
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="group flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-surface p-5 text-center transition-colors hover:border-primary cursor-pointer"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        handleFileChange(e.target.files[0]);
                      }
                    }}
                    className="hidden"
                  />

                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary mb-1.5">
                    <Upload className="h-5 w-5" />
                  </div>

                  {selectedFile ? (
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-heading">{selectedFile.name}</p>
                      <p className="text-[11px] text-muted-foreground font-semibold">
                        File size: {formatBytes(selectedFile.size)}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs font-bold text-heading">
                        Click to browse or drop result file here
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    resetForm();
                  }}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-semibold hover:bg-surface cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
                >
                  <Check className="h-4 w-4" />
                  <span>{isSubmitting ? "Uploading & Saving..." : "Upload Result"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
