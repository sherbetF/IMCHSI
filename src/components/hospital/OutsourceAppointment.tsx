import { useState, useEffect, useRef } from "react";
import {
  Calendar as CalendarIcon,
  Clock,
  AlertTriangle,
  AlertCircle,
  FileText,
  CheckCircle2,
  Send,
  Search,
  Filter,
  Info,
  CalendarCheck,
  Check,
  X,
  XCircle,
  ChevronDown,
  ChevronUp,
  Upload,
  Paperclip,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { useFacility } from "@/context/FacilityContext";
import { toast } from "sonner";
import {
  subscribeToAppointments,
  createAppointment,
  updateAppointment,
  AppointmentRecord,
} from "@/services/firebaseAppointments";
import { EchoFormModal } from "./EchoFormModal";
import { openPdfInNewTab, openReportFormInNewTab } from "@/utils/fileViewerUtils";
import {
  getLocalDateTimeString,
  getLocalDateString,
  formatDisplayDateOnly,
  formatDisplayDateTime,
  formatDisplayScheduledDate,
} from "@/utils/dateUtils";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type OutsourceReport = AppointmentRecord;

function getTestTypeCode(procedure: string): string {
  if (!procedure) return "RAD";
  const p = procedure.toUpperCase();
  if (p.includes("MRI") || p.includes("MAGNETIC")) return "MRI";
  if (p.includes("CT SCAN") || p.includes("COMPUTED") || p.includes("CTS") || p.includes("CT"))
    return "CTS";
  if (p.includes("CORONARY") || p.includes("COROS") || p.includes("ANGIOGRAM")) return "COR";
  if (p.includes("EEG") || p.includes("ELECTROENCEPHALOGRAM")) return "EEG";
  if (p.includes("NCS") || p.includes("NERVE")) return "NCS";
  if (p.includes("USG") || p.includes("ULTRASONOGRAPHY") || p.includes("ULTRASOUND")) return "USG";
  const clean = p.replace(/[^A-Z]/g, "");
  if (clean.length >= 3) return clean.slice(0, 3);
  return clean.padEnd(3, "X");
}

function getHospitalCode(hospital: string): string {
  if (!hospital) return "GEN";
  const h = hospital.toUpperCase();
  if (h.includes("KPJ")) return "KPJ";
  if (h.includes("COLUMBIA") || h.includes("TEBRAU")) return "COL";
  if (h.includes("PASIR GUDANG") || h.includes("HPG")) return "HPG";
  if (h.includes("PREMIER") || h.includes("PIL") || h.includes("LABS")) return "PIL";
  const clean = h.replace(/[^A-Z]/g, "");
  if (clean.length >= 3) return clean.slice(0, 3);
  return clean.padEnd(3, "H");
}

function generateReportId(procedure: string, hospital: string): string {
  const testCode = getTestTypeCode(procedure);
  const hospCode = getHospitalCode(hospital);
  const random4Digits = Math.floor(1000 + Math.random() * 9000);
  return `${testCode}-${hospCode}-${random4Digits}`;
}

function formatReportId(id: string, procedure?: string, hospital?: string): string {
  if (!id) return "";
  if (/^[A-Z0-9]{2,4}-[A-Z0-9]{2,4}-\d{4}$/.test(id) && !id.startsWith("OUT-")) {
    return id;
  }
  const testCode = getTestTypeCode(procedure || "");
  const hospCode = getHospitalCode(hospital || "");
  const numPart = id.replace(/[^0-9]/g, "").slice(-4) || "1001";
  return `${testCode}-${hospCode}-${numPart}`;
}

const OUTSOURCE_MODALITIES = [
  "Computed Tomography Scan ( CT SCAN )",
  "Coronary Angiogram ( COROS )",
  "Electroencephalogram ( EEG )",
  "Magnetic Resonance Imaging ( MRI )",
  "Nerve Conduction Study ( NCS )",
  "Ultrasonography ( USG )",
  "Other Diagnostic Report",
];

const PRIVATE_HOSPITALS = [
  "Columbia Asia Tebrau",
  "Hospital Pasir Gudang",
  "KPJ Dato' Onn Specialist",
  "KPJ Johor Specialist",
  "KPJ Pasir Gudang Specialist",
  "KPJ Puteri Specialist",
  "Premier Integrated Labs",
];

export function OutsourceAppointment() {
  const { selectedFacility, setSelectedFacility, isAdmin, setIsModalOpen } = useFacility();
  const [activeTab, setActiveTab] = useState<"request" | "tracker">("tracker");
  const [requests, setRequests] = useState<OutsourceReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittedRef, setSubmittedRef] = useState<OutsourceReport | null>(null);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Admin schedule modal state
  const [schedulingReq, setSchedulingReq] = useState<OutsourceReport | null>(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [rawDate, setRawDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("09:00 AM");

  // Admin rejection modal state
  const [rejectingReq, setRejectingReq] = useState<OutsourceReport | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectedBy, setRejectedBy] = useState("");

  // Admin upload report modal state
  const [uploadingReq, setUploadingReq] = useState<OutsourceReport | null>(null);
  const [resultFileName, setResultFileName] = useState("");
  const [summaryNotes, setSummaryNotes] = useState("");

  // Drag & drop file attachment state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileDataUrl, setFileDataUrl] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [formData, setFormData] = useState({
    patientName: "",
    mrn: "", // IC Number / Identification No.
    testDate: getLocalDateString(), // Test Date DD/MM/YYYY
    procedureType: "Computed Tomography Scan ( CT SCAN )",
    customProcedure: "",
    sourceHospital: "Columbia Asia Tebrau",
    customHospital: "",
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  // Notice modal state
  const [showNoticeModal, setShowNoticeModal] = useState(false);
  const [pendingReq, setPendingReq] = useState<OutsourceReport | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Duplicate Request Handling State
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateJustification, setDuplicateJustification] = useState("");
  const [duplicateError, setDuplicateError] = useState("");
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);
  const [justificationBlink, setJustificationBlink] = useState(false);
  const [duplicateOriginalStatus, setDuplicateOriginalStatus] = useState("");
  const [duplicateOriginalId, setDuplicateOriginalId] = useState("");
  const [duplicateOriginalDate, setDuplicateOriginalDate] = useState("");
  const [duplicateOriginalReason, setDuplicateOriginalReason] = useState("");

  // Form preview modal state
  const [selectedFormReq, setSelectedFormReq] = useState<OutsourceReport | null>(null);

  // Real-time Firestore sync with facility isolation
  useEffect(() => {
    setLoading(true);

    const unsub = subscribeToAppointments(
      "outsource",
      selectedFacility ? selectedFacility.name : null,
      isAdmin,
      (data) => {
        setRequests(data);
        setLoading(false);
      },
    );

    return () => unsub();
  }, [selectedFacility?.name, isAdmin]);

  // Switch to tracker tab automatically when in admin mode
  useEffect(() => {
    if (isAdmin) {
      setActiveTab("tracker");
    }
  }, [isAdmin]);

  // Auto-dismiss submitted reference banner after 1 minute (60s), then gradually disappear
  useEffect(() => {
    if (submittedRef) {
      setIsFadingOut(false);
      const timer = setTimeout(() => {
        setIsFadingOut(true);
      }, 60000);

      const dismissTimer = setTimeout(() => {
        setSubmittedRef(null);
        setIsFadingOut(false);
      }, 61000);

      return () => {
        clearTimeout(timer);
        clearTimeout(dismissTimer);
      };
    }
  }, [submittedRef]);

  // Drag and drop file handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const processFile = async (file: File) => {
    setSelectedFile(file);
    setFormErrors((prev) => {
      if (!prev.selectedFile) return prev;
      const updated = { ...prev };
      delete updated.selectedFile;
      return updated;
    });
    try {
      const reader = new FileReader();
      reader.onload = () => {
        setFileDataUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("Failed to read file", err);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};

    if (!selectedFacility) {
      setIsModalOpen(true);
      return;
    }

    if (!formData.patientName.trim()) errors.patientName = "Patient full name is required";
    if (!formData.mrn.trim()) {
      errors.mrn = "Identification No. is required";
    } else if (/[^a-zA-Z0-9]/.test(formData.mrn.trim())) {
      errors.mrn = "Identification No. can only contain letters and numbers (no symbols)";
    }
    if (!formData.testDate.trim()) {
      errors.testDate = "Test date is required";
    }
    if (!selectedFile) {
      errors.selectedFile = "Upload Radiology / Diagnostic File is required before submitting";
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setFormErrors({});

    const effectiveHospital = formData.sourceHospital;

    const effectiveProcedure =
      formData.procedureType === "Other Diagnostic Report"
        ? formData.customProcedure.trim() || "Outsource Diagnostic Report"
        : formData.procedureType;

    const newReq: OutsourceReport = {
      id: generateReportId(effectiveProcedure, effectiveHospital),
      facilityName: selectedFacility.name,
      facilityCategory: selectedFacility.category,
      patientName: formData.patientName.trim(),
      mrn: formData.mrn.trim(),
      testDate: formatDisplayDateOnly(formData.testDate.trim()),
      contactNumber: "N/A",
      email: "N/A",
      procedureType: effectiveProcedure,
      urgency: "Routine",
      referringDoctor: effectiveHospital,
      department: "Outsource Radiology",
      clinicalIndication: `Outsource ${effectiveProcedure} from ${effectiveHospital}`,
      diagnosis: `${effectiveProcedure} (${effectiveHospital})`,
      status: selectedFile ? "Completed - Result Ready" : "Pending Confirmation",
      createdAt: getLocalDateTimeString(),
      ...(selectedFile
        ? {
            resultFile: {
              fileName: selectedFile.name,
              uploadedAt: getLocalDateTimeString(),
              summaryNotes: `Report file attached (${(selectedFile.size / 1024 / 1024).toFixed(2)} MB)`,
              dataUrl: fileDataUrl,
            },
          }
        : {}),
    };

    setIsCheckingDuplicate(true);
    try {
      const colRef = collection(db, "outsource_appointments");
      const q = query(colRef, where("mrn", "==", formData.mrn.trim()));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const docs = querySnapshot.docs.map((doc) => doc.data() as OutsourceReport);
        docs.sort(
          (a, b) => new Date(b.createdAt || "").getTime() - new Date(a.createdAt || "").getTime(),
        );
        const latestPrev = docs[0];
        setDuplicateOriginalStatus(latestPrev.status || "Pending Confirmation");
        setDuplicateOriginalId(latestPrev.id || "");
        setDuplicateOriginalDate(latestPrev.scheduledDate || "");
        setDuplicateOriginalReason(latestPrev.rejectReason || "");

        setPendingReq(newReq);
        setDuplicateJustification("");
        setDuplicateError("");
        setShowDuplicateModal(true);
        return;
      }
    } catch (err) {
      console.error("Error checking duplicate: ", err);
    } finally {
      setIsCheckingDuplicate(false);
    }

    setPendingReq(newReq);
    setShowNoticeModal(true);
  };

  const handleDuplicateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!duplicateJustification.trim()) {
      setDuplicateError("Justification is required to proceed.");
      setJustificationBlink(true);
      setTimeout(() => {
        setJustificationBlink(false);
      }, 1500);
      return;
    }
    if (!pendingReq) return;

    const updatedReq = {
      ...pendingReq,
      duplicateJustification: duplicateJustification.trim(),
    };
    setPendingReq(updatedReq);
    setShowDuplicateModal(false);
    setShowNoticeModal(true);
  };

  const handleConfirmSubmit = async () => {
    if (!pendingReq) return;
    setIsSubmitting(true);
    try {
      await createAppointment("outsource", pendingReq);
      setSubmittedRef(pendingReq);

      setFormData({
        patientName: "",
        mrn: "",
        testDate: getLocalDateString(),
        procedureType: "Computed Tomography Scan ( CT SCAN )",
        customProcedure: "",
        sourceHospital: "Columbia Asia Tebrau",
        customHospital: "",
      });
      setSelectedFile(null);
      setFileDataUrl("");
      setShowNoticeModal(false);
      setPendingReq(null);
      setActiveTab("tracker");
    } catch (err) {
      console.error("Failed to create outsource record in Firebase:", err);
      toast.error("Failed to submit record");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedulingReq || !scheduleDate) return;
    const fullSchedule = `${scheduleDate} @ ${scheduleTime}`;

    try {
      await updateAppointment("outsource", schedulingReq.id, {
        scheduledDate: fullSchedule,
        status: "Scheduled",
      });
      toast.success(`Successfully scheduled review for ${schedulingReq.patientName}`);
      setSchedulingReq(null);
      setScheduleDate("");
    } catch (err) {
      console.error("Failed to update schedule in Firebase:", err);
      toast.error("Failed to schedule review");
    }
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingReq || !rejectReason.trim() || !rejectedBy.trim()) return;
    try {
      await updateAppointment("outsource", rejectingReq.id, {
        status: "Rejected",
        rejectReason: rejectReason.trim(),
        rejectedBy: rejectedBy.trim(),
      });
      toast.error(`Rejected record entry for ${rejectingReq.patientName}`);
      setRejectingReq(null);
      setRejectReason("");
      setRejectedBy("");
    } catch (err) {
      console.error("Failed to reject request:", err);
      toast.error("Failed to reject request");
    }
  };

  const handleSaveResult = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadingReq || !resultFileName.trim()) return;
    try {
      await updateAppointment("outsource", uploadingReq.id, {
        status: "Completed - Result Ready",
        resultFile: {
          fileName: resultFileName.trim(),
          uploadedAt: getLocalDateTimeString(),
          summaryNotes: summaryNotes.trim() || "Report linked to database",
        },
      });
      toast.success(`Report file attached for ${uploadingReq.patientName}`);
      setUploadingReq(null);
      setResultFileName("");
      setSummaryNotes("");
    } catch (err) {
      console.error("Failed to attach report:", err);
      toast.error("Failed to attach report");
    }
  };

  const filteredRequests = requests.filter((r) => {
    const formattedId = formatReportId(r.id, r.procedureType, r.referringDoctor);
    const matchesSearch =
      r.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      formattedId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.mrn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.testDate && r.testDate.toLowerCase().includes(searchQuery.toLowerCase())) ||
      r.referringDoctor.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.facilityName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.procedureType.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "All" || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <section className="mx-auto max-w-[1200px] px-5 pt-4 pb-10 min-h-[calc(100vh-200px)]">
      {/* Tab Controls & Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h2 className="text-2xl font-bold text-heading">
            Outsource Radiology & Diagnostic Reports
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Internal Medicine Clinic • Hospital Sultan Ismail
          </p>
        </div>

        {!isAdmin && (
          <div className="flex gap-2 rounded-lg border border-border bg-surface p-1">
            <button
              onClick={() => setActiveTab("tracker")}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                activeTab === "tracker"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <CalendarCheck className="h-4 w-4" />
              Diagnostic Reports ({requests.length})
            </button>
            <button
              onClick={() => setActiveTab("request")}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                activeTab === "request"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <CalendarIcon className="h-4 w-4" />
              Upload Report
            </button>
          </div>
        )}
      </div>

      {/* Confirmation Banner after submission */}
      {submittedRef && (
        <div
          className={`mt-6 rounded-xl border border-success/30 bg-success-soft p-4 sm:p-5 transition-all duration-1000 ease-in-out ${
            isFadingOut
              ? "opacity-0 -translate-y-2 scale-95 pointer-events-none"
              : "opacity-100 translate-y-0 scale-100 animate-in fade-in slide-in-from-top-2"
          }`}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
              <div>
                <h3 className="text-base font-bold text-success">
                  Outsource Report Submitted Successfully!
                </h3>
                <p className="mt-0.5 text-xs text-foreground">
                  Your request reference number is{" "}
                  <span className="font-mono font-bold text-heading">
                    {formatReportId(
                      submittedRef.id,
                      submittedRef.procedureType,
                      submittedRef.referringDoctor,
                    )}
                  </span>
                  .
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setSubmittedRef(null);
                setIsFadingOut(false);
              }}
              className="rounded-md p-1 text-muted-foreground hover:bg-success/10 hover:text-foreground transition-colors"
              title="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* TAB 1: Booking Form */}
      {activeTab === "request" && !isAdmin && (
        <div className="mt-8 grid gap-8 lg:grid-cols-3 min-h-[480px]">
          <form
            onSubmit={handleSubmit}
            className="rounded-xl border border-border bg-background p-6 lg:col-span-2"
          >
            <div className="space-y-6">
              {/* Section 1: Patient Information */}
              <div className="space-y-4">
                <h3 className="text-base font-bold text-heading border-b border-border pb-2">
                  1. Patient Details
                </h3>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-heading">
                      Patient Full Name <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.patientName}
                      onChange={(e) => setFormData({ ...formData, patientName: e.target.value })}
                      placeholder="e.g. Ahmad Razak bin Abdullah"
                      className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                    {formErrors.patientName && (
                      <p className="mt-1 text-xs text-destructive">{formErrors.patientName}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-heading">
                      IC Number / Passport / Identification No.{" "}
                      <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.mrn}
                      onChange={(e) => {
                        const alphanumericOnly = e.target.value.replace(/[^a-zA-Z0-9]/g, "");
                        setFormData({ ...formData, mrn: alphanumericOnly });
                      }}
                      placeholder="e.g. 880512015541 or ID884920"
                      className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                    {formErrors.mrn && (
                      <p className="mt-1 text-xs text-destructive">{formErrors.mrn}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-heading">
                      Test Date <span className="text-destructive">*</span>
                    </label>
                    <div className="relative mt-1">
                      <input
                        type="text"
                        value={formData.testDate}
                        onChange={(e) => setFormData({ ...formData, testDate: e.target.value })}
                        placeholder="DD/MM/YYYY"
                        className="w-full rounded-lg border border-border bg-surface px-3 py-2 pr-9 text-sm outline-none focus:border-primary font-medium"
                      />
                      <input
                        type="date"
                        onChange={(e) => {
                          if (e.target.value) {
                            setFormData({
                              ...formData,
                              testDate: formatDisplayDateOnly(e.target.value),
                            });
                          }
                        }}
                        className="absolute right-2 top-2 h-5 w-5 opacity-0 cursor-pointer z-10"
                        title="Pick Date"
                      />
                      <CalendarIcon className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                    </div>
                    {formErrors.testDate ? (
                      <p className="mt-1 text-xs text-destructive">{formErrors.testDate}</p>
                    ) : (
                      <p className="mt-1 text-[11px] text-muted-foreground">Format: DD/MM/YYYY</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Section 2: Outsource Details */}
              <div className="space-y-4">
                <h3 className="text-base font-bold text-heading border-b border-border pb-2">
                  2. Referral & Outsource Details
                </h3>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-heading">
                      Procedure Modality <span className="text-destructive">*</span>
                    </label>
                    <select
                      value={formData.procedureType}
                      onChange={(e) => setFormData({ ...formData, procedureType: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary font-semibold"
                    >
                      {OUTSOURCE_MODALITIES.map((mod) => (
                        <option key={mod} value={mod}>
                          {mod}
                        </option>
                      ))}
                    </select>
                  </div>

                  {formData.procedureType === "Other Diagnostic Report" && (
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-heading">
                        Specify Custom Diagnostic Modality{" "}
                        <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.customProcedure}
                        onChange={(e) =>
                          setFormData({ ...formData, customProcedure: e.target.value })
                        }
                        placeholder="e.g. PET-CT Scan, Bone Densitometry (DEXA)..."
                        className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                      />
                    </div>
                  )}

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-heading">
                      Source Private Hospital / Clinic <span className="text-destructive">*</span>
                    </label>
                    <select
                      value={formData.sourceHospital}
                      onChange={(e) => setFormData({ ...formData, sourceHospital: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary font-semibold"
                    >
                      {PRIVATE_HOSPITALS.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-border pt-4">
              <button
                type="submit"
                disabled={isCheckingDuplicate}
                className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {isCheckingDuplicate ? (
                  <>
                    <Clock className="h-4 w-4 animate-spin" />
                    Checking Duplicates...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Submit Report to Database
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Right Sidebar: Drag and Drop File Upload Section */}
          <div className="space-y-6">
            <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-border pb-3">
                <Upload className="h-4 w-4 text-primary shrink-0" />
                <h4 className="text-sm font-bold text-heading">
                  Upload Radiology / Diagnostic File <span className="text-destructive">*</span>
                </h4>
              </div>

              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-all ${
                  isDragging
                    ? "border-primary bg-primary/10 scale-[1.01]"
                    : selectedFile
                      ? "border-emerald-500/50 bg-emerald-500/10"
                      : formErrors.selectedFile
                        ? "border-destructive/80 bg-destructive/5 hover:border-destructive"
                        : "border-border bg-background hover:border-primary/50 hover:bg-surface"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.dcm"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                <div className="flex flex-col items-center justify-center gap-2">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                      selectedFile
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : formErrors.selectedFile
                          ? "bg-destructive/10 text-destructive"
                          : "bg-primary/10 text-primary"
                    }`}
                  >
                    {selectedFile ? (
                      <Paperclip className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                    ) : formErrors.selectedFile ? (
                      <AlertCircle className="h-6 w-6" />
                    ) : (
                      <Upload className="h-6 w-6" />
                    )}
                  </div>

                  {selectedFile ? (
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 break-all">
                        {selectedFile.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFile(null);
                          setFileDataUrl("");
                        }}
                        className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-destructive hover:underline"
                      >
                        <Trash2 className="h-3 w-3" /> Remove File
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p
                        className={`text-xs font-bold ${formErrors.selectedFile ? "text-destructive" : "text-heading"}`}
                      >
                        Drag & drop file here, or click to browse
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Supports PDF, Scanned Images, DICOM, Reports
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {formErrors.selectedFile && !selectedFile && (
                <p className="flex items-center gap-1.5 text-xs font-semibold text-destructive mt-2">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{formErrors.selectedFile}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Tracker */}
      {(activeTab === "tracker" || isAdmin) && (
        <div className="mt-8 min-h-[480px]">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-background p-4">
            <div className="relative min-w-[260px] flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by patient name, IC, MRN, hospital, or modality..."
                className="w-full rounded-lg border border-border bg-surface pl-9 pr-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold outline-none"
              >
                <option value="All">All Statuses ({requests.length})</option>
                <option value="Pending Confirmation">Pending Confirmation</option>
                <option value="Confirmed">Confirmed</option>
                <option value="Scheduled">Scheduled</option>
                <option value="Under Review">Under Review</option>
                <option value="Completed - Result Ready">Completed - Result Ready</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>
          </div>

          <div className="mt-6 divide-y divide-border overflow-hidden rounded-xl border border-border bg-background">
            {loading ? (
              <div className="p-8 text-center text-sm font-semibold text-muted-foreground">
                Loading outsource records...
              </div>
            ) : filteredRequests.length === 0 ? (
              <div className="p-8 text-center text-sm font-semibold text-muted-foreground">
                No outsource records found matching your filters.
              </div>
            ) : (
              filteredRequests.map((r) => {
                const isExpanded = expandedId === r.id;
                return (
                  <div
                    key={r.id}
                    className="border-b border-border/60 px-4 py-3 transition-colors hover:bg-surface/50"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs">
                      {/* Left: Ref ID, Patient Name, IC No */}
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="font-mono text-xs font-bold text-primary">
                          {formatReportId(r.id, r.procedureType, r.referringDoctor)}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold text-heading">{r.patientName}</span>
                          <span className="text-xs font-mono text-muted-foreground">({r.mrn})</span>
                        </div>
                      </div>

                      {/* Right: Hospital / Status, Scheduled Date, Action, Toggle */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                            r.status === "Scheduled"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-300/60"
                              : r.status === "Confirmed"
                                ? "bg-success-soft text-success"
                                : r.status === "Pending Confirmation"
                                  ? "bg-warning-soft text-warning"
                                  : r.status === "Rejected"
                                    ? "bg-destructive/10 text-destructive border border-destructive/20"
                                    : "bg-primary/15 text-primary border border-primary/25 font-semibold"
                          }`}
                        >
                          {r.status === "Completed - Result Ready"
                            ? r.referringDoctor || "Private Hospital / Clinic"
                            : r.status}
                        </span>

                        {r.scheduledDate && r.scheduledDate !== "----------" && (
                          <span className="hidden sm:flex items-center gap-1 rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary font-mono">
                            <CalendarCheck className="h-3 w-3" />
                            <span>{formatDisplayScheduledDate(r.scheduledDate)}</span>
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            if (r.resultFile?.dataUrl) {
                              openPdfInNewTab(r.resultFile.dataUrl, r.resultFile.fileName);
                            } else {
                              openReportFormInNewTab(r);
                            }
                          }}
                          className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary hover:bg-primary/20 transition-colors shadow-xs"
                          title="View Outsource Diagnostic Report"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          <span>View Report</span>
                        </button>

                        {isAdmin && r.status !== "Rejected" && (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => {
                                setSchedulingReq(r);
                                const existingDate =
                                  r.scheduledDate && r.scheduledDate !== "----------"
                                    ? r.scheduledDate.split(" @ ")[0] || ""
                                    : "";
                                let formatted = existingDate;
                                let raw = "";
                                if (existingDate.includes("/")) {
                                  const [dd, mm, yyyy] = existingDate.split("/");
                                  formatted = existingDate;
                                  raw = `${yyyy}-${mm}-${dd}`;
                                } else if (existingDate.includes("-")) {
                                  const [yyyy, mm, dd] = existingDate.split("-");
                                  formatted = `${dd}/${mm}/${yyyy}`;
                                  raw = existingDate;
                                }
                                setScheduleDate(formatted);
                                setRawDate(raw);
                                setScheduleTime(
                                  r.scheduledDate && r.scheduledDate !== "----------"
                                    ? r.scheduledDate.split(" @ ")[1] || "09:00 AM"
                                    : "09:00 AM",
                                );
                              }}
                              className="rounded-lg border border-primary/40 bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
                            >
                              {r.scheduledDate && r.scheduledDate !== "----------"
                                ? "Reschedule"
                                : "Schedule"}
                            </button>

                            <button
                              onClick={() => {
                                setUploadingReq(r);
                                setResultFileName(r.resultFile?.fileName || "");
                                setSummaryNotes(r.resultFile?.summaryNotes || "");
                              }}
                              className="rounded-lg border border-blue-500/40 bg-blue-600 px-2.5 py-1 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition-opacity"
                            >
                              Attach Report
                            </button>
                          </div>
                        )}

                        <button
                          onClick={() => setExpandedId(isExpanded ? null : r.id)}
                          className="flex items-center gap-1 rounded-md p-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                          title={isExpanded ? "Collapse details" : "Expand details"}
                        >
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Expanded Detail View */}
                    {isExpanded && (
                      <div className="mt-2.5 rounded-lg border border-border bg-surface/80 p-3 text-xs space-y-2 animate-in fade-in duration-150 relative">
                        {isAdmin && r.status !== "Rejected" && (
                          <button
                            type="button"
                            onClick={() => {
                              setRejectingReq(r);
                              setRejectReason("");
                              setRejectedBy("");
                            }}
                            className="absolute top-2.5 right-2.5 flex h-7 w-7 items-center justify-center rounded-lg border border-destructive/20 bg-destructive/5 text-destructive hover:bg-destructive/15 transition-colors shadow-xs"
                            title="Reject Request"
                          >
                            <X className="h-4 w-4 stroke-[2.5]" />
                          </button>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-muted-foreground pr-8">
                          <div>
                            <span className="font-bold text-heading">Modality / Test:</span>{" "}
                            {r.procedureType}
                          </div>
                          <div>
                            <span className="font-bold text-heading">Test Date:</span>{" "}
                            <span className="font-semibold text-primary">
                              {r.testDate || "N/A"}
                            </span>
                          </div>
                          <div>
                            <span className="font-bold text-heading">Source Hospital:</span>{" "}
                            {r.referringDoctor || "N/A"}
                          </div>
                        </div>

                        {r.resultFile && (
                          <div className="rounded-xl border border-blue-500/25 bg-blue-500/10 p-3 text-xs space-y-1 mt-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                            <div>
                              <p className="font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                                <Paperclip className="h-3.5 w-3.5" />
                                Attached Report Document: {r.resultFile.fileName}
                              </p>
                              <p className="text-foreground">{r.resultFile.summaryNotes}</p>
                            </div>
                            {r.resultFile.dataUrl && (
                              <button
                                type="button"
                                onClick={() => setSelectedFormReq(r)}
                                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 transition-colors shadow-xs shrink-0 flex items-center gap-1.5"
                                title="View or download attached report file"
                              >
                                <FileText className="h-3.5 w-3.5" />
                                <span>View / Download File</span>
                              </button>
                            )}
                          </div>
                        )}

                        {r.duplicateJustification && (
                          <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-xs space-y-1 mt-2">
                            <p className="font-bold text-amber-700 dark:text-amber-400">
                              Duplicate Request Justification
                            </p>
                            <p className="text-foreground">{r.duplicateJustification}</p>
                          </div>
                        )}

                        {r.status === "Rejected" && (
                          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs space-y-1 mt-2">
                            <p className="font-bold text-destructive">Record Entry Rejected</p>
                            {r.rejectReason && (
                              <p className="text-foreground">
                                <span className="font-semibold">Reason:</span> {r.rejectReason}
                              </p>
                            )}
                            {r.rejectedBy && (
                              <p className="text-muted-foreground text-[11px]">
                                Rejected by: {r.rejectedBy}
                              </p>
                            )}
                          </div>
                        )}

                        <div className="flex items-center justify-end border-t border-border/40 pt-1.5 text-[11px] text-muted-foreground">
                          <span>Submitted: {formatDisplayDateTime(r.createdAt)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* MODAL 1: NOTICE / CONFIRMATION MODAL */}
      {showNoticeModal && pendingReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Info className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-heading">Confirm Outsource Report Log</h3>
                  <p className="text-xs text-muted-foreground">
                    Verify details before saving to database
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowNoticeModal(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted/20 hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs bg-background p-4 rounded-xl border border-border">
              <div className="flex justify-between border-b border-border/50 pb-2">
                <span className="text-muted-foreground font-semibold">Patient Name:</span>
                <span className="font-bold text-heading">{pendingReq.patientName}</span>
              </div>
              <div className="flex justify-between border-b border-border/50 pb-2">
                <span className="text-muted-foreground font-semibold">
                  IC / Identification No.:
                </span>
                <span className="font-bold text-foreground">{pendingReq.mrn}</span>
              </div>
              <div className="flex justify-between border-b border-border/50 pb-2">
                <span className="text-muted-foreground font-semibold">Test Date:</span>
                <span className="font-bold text-primary">{pendingReq.testDate || "N/A"}</span>
              </div>
              <div className="flex justify-between border-b border-border/50 pb-2">
                <span className="text-muted-foreground font-semibold">Modality:</span>
                <span className="font-bold text-primary">{pendingReq.procedureType}</span>
              </div>
              <div className="flex justify-between border-b border-border/50 pb-2">
                <span className="text-muted-foreground font-semibold">Source Hospital:</span>
                <span className="font-semibold text-foreground">{pendingReq.referringDoctor}</span>
              </div>
              {selectedFile && (
                <div className="flex justify-between border-b border-border/50 pb-2">
                  <span className="text-muted-foreground font-semibold">Attached File:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {selectedFile.name}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground font-semibold">Facility Context:</span>
                <span className="font-semibold text-foreground">{pendingReq.facilityName}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowNoticeModal(false)}
                className="rounded-xl border border-border px-4 py-2 text-xs font-bold hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSubmit}
                disabled={isSubmitting}
                className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Clock className="h-4 w-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    <span>Confirm & Save</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: DUPLICATE WARNING MODAL */}
      {showDuplicateModal && pendingReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl space-y-5">
            <div className="flex items-start justify-between border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-heading">Duplicate Request Identified</h3>
                  <p className="text-xs text-muted-foreground">Action required to proceed</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowDuplicateModal(false);
                  setPendingReq(null);
                }}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted/20 hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 space-y-3 text-sm">
              <p className="font-semibold text-red-800 dark:text-red-400 leading-relaxed">
                A duplicate request has been identified. If you wish to proceed, please provide a
                justification for this request.
              </p>
              {duplicateOriginalId && (
                <div className="mt-2 pt-2 border-t border-red-500/10 text-xs text-red-700 dark:text-red-300 font-semibold flex flex-col gap-1">
                  <div>
                    <span className="opacity-80">Previous Request Status:</span>{" "}
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        duplicateOriginalStatus.toUpperCase() === "SCHEDULED"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-300/60 dark:border-emerald-700/50"
                          : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                      }`}
                    >
                      {duplicateOriginalStatus}
                    </span>
                  </div>
                  <div>
                    {duplicateOriginalStatus.toUpperCase() === "SCHEDULED" ? (
                      <>
                        <span className="opacity-80">Scheduled date:</span>{" "}
                        <span className="font-bold text-red-800 dark:text-red-300">
                          {duplicateOriginalDate || "Not specified"}
                        </span>
                      </>
                    ) : duplicateOriginalStatus.toUpperCase() === "REJECTED" ? (
                      <>
                        <span className="opacity-80">Reason:</span>{" "}
                        <span className="font-bold text-red-800 dark:text-red-300 italic">
                          "{duplicateOriginalReason || "No reason provided"}"
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="opacity-80">Previous Request ID:</span>{" "}
                        <span className="font-bold">{duplicateOriginalId}</span>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={handleDuplicateSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="block text-xs font-bold text-heading uppercase tracking-wider">
                  Justification <span className="text-destructive">*</span>
                </label>
                <textarea
                  value={duplicateJustification}
                  onChange={(e) => {
                    setDuplicateJustification(e.target.value);
                    if (duplicateError) setDuplicateError("");
                  }}
                  placeholder="Provide clinical or administrative justification for resubmitting..."
                  rows={3}
                  className={`w-full rounded-xl border bg-background p-3 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary ${
                    justificationBlink
                      ? "border-red-500 ring-2 ring-red-500 animate-pulse bg-red-500/10"
                      : duplicateError
                        ? "border-destructive"
                        : "border-border"
                  }`}
                />
                {duplicateError && (
                  <p className="text-[11px] font-bold text-destructive">{duplicateError}</p>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowDuplicateModal(false);
                    setPendingReq(null);
                  }}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-bold hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-destructive px-5 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90"
                >
                  Proceed with Justification
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: ADMIN SCHEDULE MODAL */}
      {schedulingReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
                  <CalendarCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-heading">Schedule Outsource Review</h3>
                  <p className="text-xs text-muted-foreground">{schedulingReq.patientName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSchedulingReq(null)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted/20"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSchedule} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-heading">Review Date</label>
                <input
                  type="date"
                  value={rawDate}
                  onChange={(e) => {
                    setRawDate(e.target.value);
                    setScheduleDate(e.target.value);
                  }}
                  className="w-full rounded-xl border border-border bg-background p-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-heading">Time Slot</label>
                <input
                  type="text"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  placeholder="e.g. 09:00 AM"
                  className="w-full rounded-xl border border-border bg-background p-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSchedulingReq(null)}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-bold hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
                >
                  Confirm Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: ADMIN REJECT MODAL */}
      {rejectingReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 text-red-600">
                  <XCircle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-heading">Reject Record Entry</h3>
                  <p className="text-xs text-muted-foreground">{rejectingReq.patientName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRejectingReq(null)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted/20"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleRejectSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-heading">Rejection Reason *</label>
                <textarea
                  rows={3}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Specify reason for rejecting record entry..."
                  className="w-full rounded-xl border border-border bg-background p-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-heading">
                  Rejected By (Officer)
                </label>
                <input
                  type="text"
                  value={rejectedBy}
                  onChange={(e) => setRejectedBy(e.target.value)}
                  placeholder="e.g. Dr. Hassan (Outsource Coordinator)"
                  className="w-full rounded-xl border border-border bg-background p-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRejectingReq(null)}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-bold hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-destructive px-5 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90"
                >
                  Confirm Rejection
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: ADMIN ATTACH REPORT / RESULT FILE MODAL */}
      {uploadingReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600">
                  <Upload className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-heading">Attach Completed Report File</h3>
                  <p className="text-xs text-muted-foreground">{uploadingReq.patientName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setUploadingReq(null)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted/20"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveResult} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-heading">
                  Report Document / File Name <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={resultFileName}
                  onChange={(e) => setResultFileName(e.target.value)}
                  placeholder="e.g. MRI_Brain_Scan_Report_Razak.pdf"
                  className="w-full rounded-xl border border-border bg-background p-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-heading">
                  Summary / Clinical Notes
                </label>
                <textarea
                  rows={2}
                  value={summaryNotes}
                  onChange={(e) => setSummaryNotes(e.target.value)}
                  placeholder="e.g. Full official radiology report linked and verified."
                  className="w-full rounded-xl border border-border bg-background p-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setUploadingReq(null)}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-bold hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700"
                >
                  Save & Complete
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FORM PREVIEW MODAL */}
      {selectedFormReq && (
        <EchoFormModal request={selectedFormReq} onClose={() => setSelectedFormReq(null)} />
      )}
    </section>
  );
}
