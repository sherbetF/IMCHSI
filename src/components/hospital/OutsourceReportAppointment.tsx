import { useState, useEffect, useRef } from "react";
import {
  Calendar as CalendarIcon,
  Clock,
  User,
  Phone,
  AlertCircle,
  AlertTriangle,
  FileText,
  CheckCircle2,
  Send,
  Search,
  Filter,
  Info,
  Building2,
  Lock,
  Hospital,
  LogOut,
  Check,
  X,
  XCircle,
  ChevronDown,
  ChevronUp,
  Upload,
  FileDown,
  ExternalLink,
  Eye,
  Database,
  Layers,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useFacility } from "@/context/FacilityContext";
import { toast } from "sonner";
import {
  subscribeToAppointments,
  createAppointment,
  updateAppointment,
  deleteAppointment,
  AppointmentRecord,
} from "@/services/firebaseAppointments";
import { OutsourceFormModal } from "./OutsourceFormModal";
import {
  getLocalDateTimeString,
  formatDisplayDateTime,
  formatDisplayDateOnly,
} from "@/utils/dateUtils";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { uploadReportFile, deleteReportFile } from "@/services/reportStorage";

export type OutsourceReport = AppointmentRecord;

const PRIVATE_HOSPITALS = [
  "KPJ Johor Specialist Hospital",
  "Columbia Asia Hospital Iskandar Puteri",
  "Gleneagles Hospital Medini Johor",
  "Regency Specialist Hospital (Masai)",
  "KPJ Bandar Dato' Onn Specialist Hospital",
  "KPJ Pasir Gudang Specialist Hospital",
  "Pantai Hospital Batu Pahat",
  "Putra Specialist Hospital (Batu Pahat)",
  "Kensington Green Specialist Centre",
  "Sunway Medical Centre",
  "Prince Court Medical Centre",
  "Subang Jaya Medical Centre (SJMC)",
  "Other Private Hospital / Diagnostic Centre",
];

const MODALITIES = [
  "MRI",
  "CT SCAN",
  "ULTRASOUND (USG)",
  "COROS (CAG)",
  "EEG",
  "NCS / EMG",
  "X-RAY",
  "MAMMOGRAM",
  "NUCLEAR MEDICINE / PET-CT",
  "OTHER",
];

const COMMON_REPORT_TYPES: Record<string, string[]> = {
  MRI: [
    "MRI-Brain",
    "MRI-Brain + MRA",
    "MRI-Spine (Cervical)",
    "MRI-Spine (Lumbar)",
    "MRI-Spine (Thoracic)",
    "MRI-Knee",
    "MRI-Shoulder",
    "MRI-Cardiac",
    "MRI-Liver / MRCP",
    "MRI-Pelvis",
  ],
  "CT SCAN": [
    "CT-Brain",
    "CT-PA (Pulmonary Angiogram)",
    "CT-TAP (Thorax, Abdomen & Pelvis)",
    "CT-Thorax",
    "CT-Abdomen & Pelvis",
    "CTCA (Coronary Angiogram)",
    "CT-Paranasal Sinus",
    "CT-KUB / Urography",
    "CT-Angiography (Lower Limb)",
  ],
  "ULTRASOUND (USG)": [
    "USG-Abdomen & HBS",
    "USG-KUB / Renal",
    "USG-Doppler Lower Limb (DVT)",
    "USG-Carotid Doppler",
    "USG-Thyroid / Neck",
    "USG-Pelvis / TVS",
    "USG-Musculoskeletal",
  ],
  "COROS (CAG)": [
    "COROS (Diagnostic CAG)",
    "COROS + PCI / Stenting",
    "Right Heart Catheterisation",
    "Coronary Angiogram & Graft Study",
  ],
  EEG: [
    "EEG-Routine (20-30 min)",
    "EEG-Sleep Deprived",
    "Video EEG Monitoring",
    "Ambulatory 24H EEG",
  ],
  "NCS / EMG": [
    "NCS-Upper Limbs (CTS Study)",
    "NCS-Lower Limbs (Polyneuropathy)",
    "NCS + Needle EMG (Radiculopathy)",
    "Repetitive Nerve Stimulation (Myasthenia)",
  ],
  "X-RAY": [
    "X-Ray Chest (CXR)",
    "X-Ray Spine (LS / Cervical)",
    "X-Ray KUB",
    "X-Ray Skeletal Survey",
  ],
  MAMMOGRAM: ["Mammogram Bilateral", "Mammogram + Breast Ultrasound"],
  "NUCLEAR MEDICINE / PET-CT": [
    "PET-CT Whole Body",
    "Bone Scintigraphy / Scan",
    "Renal DTPA / DMSA Scan",
    "Myocardial Perfusion Scan (MPS)",
  ],
};

export function OutsourceReportAppointment() {
  const { selectedFacility, setSelectedFacility, isAdmin, setIsModalOpen, facilityId } =
    useFacility();
  const [activeTab, setActiveTab] = useState<"request" | "tracker">(
    isAdmin ? "tracker" : "request",
  );
  const [requests, setRequests] = useState<OutsourceReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittedRef, setSubmittedRef] = useState<OutsourceReport | null>(null);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // File Upload state
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Admin rejection / review modal state
  const [rejectingReq, setRejectingReq] = useState<OutsourceReport | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectedBy, setRejectedBy] = useState("");

  // Form State
  const [formData, setFormData] = useState({
    patientName: "",
    mrn: "",
    contactNumber: "",
    email: "",
    hospitalOrigin: "KPJ Johor Specialist Hospital",
    customHospital: "",
    modality: "MRI",
    reportType: "MRI-Brain",
    customReportType: "",
    studyDate: new Date().toISOString().split("T")[0],
    urgency: "Routine" as OutsourceReport["urgency"],
    referringDoctor: "",
    department: "Internal Medicine",
    clinicalIndication: "",
    findingsSummary: "",
    diagnosis: "",
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [modalityFilter, setModalityFilter] = useState("All");

  // Notice modal state
  const [showNoticeModal, setShowNoticeModal] = useState(false);
  const [pendingReq, setPendingReq] = useState<OutsourceReport | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Duplicate Request Handling State
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateJustification, setDuplicateJustification] = useState("");
  const [duplicateError, setDuplicateError] = useState("");
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);
  const [duplicateOriginalStatus, setDuplicateOriginalStatus] = useState("");
  const [duplicateOriginalId, setDuplicateOriginalId] = useState("");
  const [duplicateOriginalDate, setDuplicateOriginalDate] = useState("");
  const [duplicateOriginalReason, setDuplicateOriginalReason] = useState("");

  // Form preview modal state
  const [selectedFormReq, setSelectedFormReq] = useState<OutsourceReport | null>(null);

  const [subStatus, setSubStatus] = useState<string>("loading");

  // Real-time Firestore sync with facility isolation
  useEffect(() => {
    setLoading(true);

    const scope: AppointmentReadScope = isAdmin
      ? { type: "central" }
      : { type: "facility", facilityId: facilityId || "" };

    const unsub = subscribeToAppointments("outsource", scope, (data, status) => {
      setRequests(data);
      if (status) setSubStatus(status);
      setLoading(false);
    });

    return () => unsub();
  }, [facilityId, isAdmin]);

  // Switch to tracker tab automatically when in admin mode
  useEffect(() => {
    if (isAdmin) {
      setActiveTab("tracker");
    }
  }, [isAdmin]);

  // Auto-dismiss submitted reference banner
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

  // Handle Drag and Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      toast.error("File is too large. Maximum size is 20MB.");
      return;
    }

    const allowedTypes = ["application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (file.type && !allowedTypes.includes(file.type)) {
      toast.error("Invalid file format. Please attach a PDF or image (PNG/JPEG).");
      return;
    }

    setSelectedFile(file);
    toast.success(`Attached file: ${file.name}`);
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
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
    if (!formData.contactNumber.trim()) errors.contactNumber = "Contact phone number is required";

    const finalHospital =
      formData.hospitalOrigin === "Other Private Hospital / Diagnostic Centre"
        ? formData.customHospital.trim()
        : formData.hospitalOrigin;
    if (!finalHospital) errors.hospitalOrigin = "Hospital of origin is required";

    const finalReportType =
      formData.reportType === "Custom" || !formData.reportType
        ? formData.customReportType.trim()
        : formData.reportType;
    if (!finalReportType) errors.reportType = "Report type / procedure name is required";

    if (!formData.studyDate) errors.studyDate = "Study date is required";
    if (!formData.clinicalIndication.trim())
      errors.clinicalIndication = "Clinical indication is required";
    if (!formData.findingsSummary.trim() && !formData.diagnosis.trim())
      errors.findingsSummary = "Findings summary or radiologist impression is required";

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setFormErrors({});

    const docName = formData.referringDoctor.trim();
    const deptName = formData.department.trim();
    const combinedRef = docName ? `${docName} (${deptName})` : deptName;

    const activeFacilityId = facilityId || (selectedFacility ? selectedFacility.facilityId : "");

    const newReq: OutsourceReport = {
      id: `OUT-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      facilityId: activeFacilityId,
      facilityName: selectedFacility.name,
      facilityCategory: selectedFacility.category,
      patientName: formData.patientName.trim(),
      mrn: formData.mrn.trim(),
      contactNumber: formData.contactNumber.trim(),
      email: formData.email.trim() || "N/A",
      hospitalOrigin: finalHospital,
      modality: formData.modality,
      reportType: finalReportType,
      procedureType: `${formData.modality} - ${finalReportType}`,
      studyDate: formData.studyDate,
      urgency: formData.urgency,
      referringDoctor: combinedRef,
      department: deptName,
      clinicalIndication: formData.clinicalIndication.trim(),
      findingsSummary: formData.findingsSummary.trim(),
      diagnosis: formData.diagnosis.trim() || formData.findingsSummary.trim(),
      status: "Verified",
      createdAt: getLocalDateTimeString(),
      ...(selectedFile
        ? {
            attachedReport: {
              fileName: selectedFile.name,
              fileSize: selectedFile.size,
              fileType: selectedFile.type || "application/pdf",
              uploadedAt: getLocalDateTimeString(),
            },
          }
        : {}),
    };

    setIsCheckingDuplicate(true);
    try {
      const colRef = collection(db, "outsource_reports");
      const q = isAdmin
        ? query(colRef, where("mrn", "==", formData.mrn.trim()))
        : query(
            colRef,
            where("facilityId", "==", activeFacilityId),
            where("mrn", "==", formData.mrn.trim()),
          );
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const docs = querySnapshot.docs.map((doc) => doc.data() as OutsourceReport);
        docs.sort(
          (a, b) => new Date(b.createdAt || "").getTime() - new Date(a.createdAt || "").getTime(),
        );
        const latestPrev = docs[0];
        setDuplicateOriginalStatus(latestPrev.status || "Verified");
        setDuplicateOriginalId(latestPrev.id || "");
        setDuplicateOriginalDate(latestPrev.studyDate || latestPrev.scheduledDate || "");
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
    let uploadedStoragePath: string | null = null;
    try {
      let finalReq = { ...pendingReq };

      // Upload file to Firebase Storage if selected
      if (selectedFile) {
        const uploadMeta = await uploadReportFile(
          selectedFile,
          pendingReq.facilityId,
          pendingReq.id,
          true,
          `Report file attached (${(selectedFile.size / 1024 / 1024).toFixed(2)} MB)`,
        );
        uploadedStoragePath = uploadMeta.storagePath;

        finalReq = {
          ...finalReq,
          resultFile: uploadMeta,
          attachedReport: {
            storagePath: uploadMeta.storagePath,
            fileName: uploadMeta.fileName,
            fileSize: uploadMeta.fileSize,
            fileType: uploadMeta.contentType,
            uploadedAt: uploadMeta.uploadedAt,
          },
        };
      }

      await createAppointment("outsource", finalReq);
      setSubmittedRef(finalReq);

      // Reset Form
      setFormData({
        patientName: "",
        mrn: "",
        contactNumber: "",
        email: "",
        hospitalOrigin: "KPJ Johor Specialist Hospital",
        customHospital: "",
        modality: "MRI",
        reportType: "MRI-Brain",
        customReportType: "",
        studyDate: new Date().toISOString().split("T")[0],
        urgency: "Routine",
        referringDoctor: "",
        department: "Internal Medicine",
        clinicalIndication: "",
        findingsSummary: "",
        diagnosis: "",
      });
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";

      setShowNoticeModal(false);
      setPendingReq(null);
      toast.success("Outsource Radiology Report successfully saved to Firebase database!");
    } catch (err) {
      console.error("Failed to create outsource report in Firebase:", err);
      if (uploadedStoragePath) {
        await deleteReportFile(uploadedStoragePath).catch(() => {});
      }
      toast.error("Failed to save report to database.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: AppointmentRecord["status"]) => {
    if (!isAdmin) return;
    try {
      await updateAppointment("outsource", id, { status: newStatus });
      toast.success(`Updated status to ${newStatus}`);
    } catch (err) {
      console.error("Failed to update status:", err);
      toast.error("Failed to update status");
    }
  };

  const handleDelete = async (id: string) => {
    if (!isAdmin) return;
    if (!window.confirm("Are you sure you want to delete this report record permanently?")) return;
    try {
      await deleteAppointment("outsource", id);
      toast.success("Report record deleted from database.");
    } catch (err) {
      console.error("Failed to delete record:", err);
      toast.error("Failed to delete record");
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
      toast.error(`Report marked as Rejected`);
      setRejectingReq(null);
      setRejectReason("");
      setRejectedBy("");
    } catch (err) {
      console.error("Failed to update reject status:", err);
      toast.error("Failed to reject report");
    }
  };

  // Filtered requests
  const filteredRequests = requests.filter((r) => {
    const q = searchQuery.toLowerCase();
    const matchSearch =
      r.patientName.toLowerCase().includes(q) ||
      r.mrn.toLowerCase().includes(q) ||
      r.id.toLowerCase().includes(q) ||
      (r.reportType && r.reportType.toLowerCase().includes(q)) ||
      (r.hospitalOrigin && r.hospitalOrigin.toLowerCase().includes(q)) ||
      (r.modality && r.modality.toLowerCase().includes(q)) ||
      (r.diagnosis && r.diagnosis.toLowerCase().includes(q));

    const matchStatus = statusFilter === "All" || r.status === statusFilter;
    const matchModality = modalityFilter === "All" || r.modality === modalityFilter;

    return matchSearch && matchStatus && matchModality;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Verified":
      case "Archived":
      case "Confirmed":
      case "Completed - Result Ready":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <Check className="h-3 w-3" />
            {status}
          </span>
        );
      case "Pending Review":
      case "Pending Confirmation":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <Clock className="h-3 w-3" />
            {status}
          </span>
        );
      case "Under Review":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <Info className="h-3 w-3" />
            Under Review
          </span>
        );
      case "Rejected":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive border border-destructive/20">
            <X className="h-3 w-3" />
            Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="flex-1">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-surface via-background to-background py-10 sm:py-12">
        <div className="absolute inset-0 bg-grid-pattern opacity-5 pointer-events-none" />
        <div className="mx-auto max-w-[1200px] px-5 relative z-10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="eyebrow text-primary">OUTSOURCE RADIOLOGY DATABASE</span>
                <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                  MRI • CT • USG • COROS • EEG • NCS
                </span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-heading">
                Outsource Radiology & Diagnostic Database
              </h1>
              <p className="text-sm sm:text-base text-muted-foreground max-w-2xl">
                Centralized hospital repository for radiology and electrodiagnostic reports (MRI, CT
                Scan, Ultrasound, Coronary Angiogram, EEG, NCS) outsourced to private medical
                centers.
              </p>
            </div>

            {/* Context Badge */}
            <div className="flex flex-col sm:flex-row md:flex-col items-start md:items-end gap-2">
              {selectedFacility ? (
                <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-2.5 shadow-sm">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Building2 className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Accessing As
                    </p>
                    <p className="text-xs font-bold text-foreground">
                      {selectedFacility.name}{" "}
                      <span className="text-muted-foreground font-normal">
                        ({selectedFacility.category})
                      </span>
                    </p>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                  className="flex items-center gap-2 rounded-2xl border border-dashed border-primary/40 bg-primary/5 px-4 py-2.5 text-xs font-bold text-primary hover:bg-primary/10 transition-colors"
                >
                  <Building2 className="h-4 w-4" />
                  <span>Select Facility</span>
                </button>
              )}
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="mt-8 flex border-b border-border">
            <button
              type="button"
              onClick={() => setActiveTab("request")}
              className={`flex items-center gap-2 border-b-2 px-6 py-3 text-sm font-bold transition-colors cursor-pointer ${
                activeTab === "request"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Upload className="h-4 w-4" />
              <span>Upload / Add Report</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("tracker")}
              className={`flex items-center gap-2 border-b-2 px-6 py-3 text-sm font-bold transition-colors cursor-pointer relative ${
                activeTab === "tracker"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Database className="h-4 w-4" />
              <span>Outsource Database Tracker</span>
              <span className="ml-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-extrabold text-primary">
                {requests.length}
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* Submitted Reference Alert Banner */}
      {submittedRef && (
        <div
          className={`border-b border-emerald-500/20 bg-emerald-500/10 px-5 py-4 transition-opacity duration-1000 ${
            isFadingOut ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}
        >
          <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-sm">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-heading">
                  Report Successfully Stored in Database!
                </h4>
                <p className="text-xs text-muted-foreground">
                  Reference: <strong className="text-foreground">{submittedRef.id}</strong> •{" "}
                  {submittedRef.reportType} from {submittedRef.hospitalOrigin}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedFormReq(submittedRef);
                }}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-colors"
              >
                <Eye className="h-3.5 w-3.5" />
                <span>View Full Record</span>
              </button>
              <button
                type="button"
                onClick={() => setSubmittedRef(null)}
                className="rounded-lg p-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="mx-auto max-w-[1200px] px-5 py-8">
        {activeTab === "request" ? (
          /* TAB 1: UPLOAD / ENTRY FORM */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Form Section */}
            <div className="lg:col-span-2 space-y-6">
              <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-sm space-y-6">
                <div className="border-b border-border pb-4">
                  <h2 className="text-lg font-bold text-heading">
                    Outsource Radiology Report Information
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Record reports from private hospitals (MRI, CT, USG, COROS, EEG, NCS). Upload
                    the accompanying PDF/image report to link it to the cloud database.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Patient Details */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <User className="h-3.5 w-3.5" />
                      <span>1. Patient Identification</span>
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-heading mb-1.5">
                          Patient Full Name *
                        </label>
                        <input
                          type="text"
                          value={formData.patientName}
                          onChange={(e) =>
                            setFormData({ ...formData, patientName: e.target.value })
                          }
                          placeholder="e.g. AHMAD RAZAK BIN ABDULLAH"
                          className={`w-full rounded-xl border p-3 text-xs font-semibold outline-none transition-all placeholder:text-muted-foreground/60 ${
                            formErrors.patientName
                              ? "border-destructive focus:border-destructive bg-destructive/5"
                              : "border-border bg-background focus:border-primary"
                          }`}
                        />
                        {formErrors.patientName && (
                          <p className="mt-1 text-[11px] text-destructive font-semibold">
                            {formErrors.patientName}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-heading mb-1.5">
                          IC / Passport Number *
                        </label>
                        <input
                          type="text"
                          value={formData.mrn}
                          onChange={(e) =>
                            setFormData({ ...formData, mrn: e.target.value.toUpperCase() })
                          }
                          placeholder="e.g. MRN or ID-0000"
                          className={`w-full rounded-xl border p-3 text-xs font-semibold outline-none transition-all placeholder:text-muted-foreground/60 ${
                            formErrors.mrn
                              ? "border-destructive focus:border-destructive bg-destructive/5"
                              : "border-border bg-background focus:border-primary"
                          }`}
                        />
                        {formErrors.mrn && (
                          <p className="mt-1 text-[11px] text-destructive font-semibold">
                            {formErrors.mrn}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-heading mb-1.5">
                          Contact Phone Number *
                        </label>
                        <input
                          type="tel"
                          value={formData.contactNumber}
                          onChange={(e) =>
                            setFormData({ ...formData, contactNumber: e.target.value })
                          }
                          placeholder="e.g. +60 12-345 6789"
                          className={`w-full rounded-xl border p-3 text-xs font-semibold outline-none transition-all placeholder:text-muted-foreground/60 ${
                            formErrors.contactNumber
                              ? "border-destructive focus:border-destructive bg-destructive/5"
                              : "border-border bg-background focus:border-primary"
                          }`}
                        />
                        {formErrors.contactNumber && (
                          <p className="mt-1 text-[11px] text-destructive font-semibold">
                            {formErrors.contactNumber}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-heading mb-1.5">
                          Patient Email (Optional)
                        </label>
                        <input
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          placeholder="e.g. patient@example.com"
                          className="w-full rounded-xl border border-border bg-background p-3 text-xs font-semibold outline-none focus:border-primary placeholder:text-muted-foreground/60"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Private Hospital & Modality Selection */}
                  <div className="space-y-4 pt-2 border-t border-border">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <Hospital className="h-3.5 w-3.5" />
                      <span>2. Private Hospital Origin & Modality</span>
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-heading mb-1.5">
                          Hospital / Private Center of Origin *
                        </label>
                        <select
                          value={formData.hospitalOrigin}
                          onChange={(e) =>
                            setFormData({ ...formData, hospitalOrigin: e.target.value })
                          }
                          className="w-full rounded-xl border border-border bg-background p-3 text-xs font-semibold outline-none focus:border-primary cursor-pointer"
                        >
                          {PRIVATE_HOSPITALS.map((hosp) => (
                            <option key={hosp} value={hosp}>
                              {hosp}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-heading mb-1.5">
                          Examination Modality *
                        </label>
                        <select
                          value={formData.modality}
                          onChange={(e) => {
                            const mod = e.target.value;
                            const defaultType =
                              COMMON_REPORT_TYPES[mod] && COMMON_REPORT_TYPES[mod][0]
                                ? COMMON_REPORT_TYPES[mod][0]
                                : "";
                            setFormData({
                              ...formData,
                              modality: mod,
                              reportType: defaultType,
                            });
                          }}
                          className="w-full rounded-xl border border-border bg-background p-3 text-xs font-semibold outline-none focus:border-primary cursor-pointer"
                        >
                          {MODALITIES.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Custom Hospital input if selected other */}
                    {formData.hospitalOrigin === "Other Private Hospital / Diagnostic Centre" && (
                      <div>
                        <label className="block text-xs font-bold text-heading mb-1.5">
                          Specify Private Hospital / Imaging Centre Name *
                        </label>
                        <input
                          type="text"
                          value={formData.customHospital}
                          onChange={(e) =>
                            setFormData({ ...formData, customHospital: e.target.value })
                          }
                          placeholder="e.g. Pantai Hospital Ayer Keroh, Sunway Medical Velocity"
                          className="w-full rounded-xl border border-border bg-background p-3 text-xs font-semibold outline-none focus:border-primary placeholder:text-muted-foreground/60"
                        />
                      </div>
                    )}

                    {/* Report Type / Procedure Name */}
                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-heading">
                        Report Type / Examination Name *
                      </label>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {(COMMON_REPORT_TYPES[formData.modality] || []).map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() =>
                              setFormData({
                                ...formData,
                                reportType: preset,
                                customReportType: "",
                              })
                            }
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                              formData.reportType === preset
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
                            }`}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>

                      <input
                        type="text"
                        value={
                          formData.reportType === "Custom" ||
                          !COMMON_REPORT_TYPES[formData.modality]?.includes(formData.reportType)
                            ? formData.customReportType || formData.reportType
                            : formData.reportType
                        }
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            reportType: e.target.value,
                            customReportType: e.target.value,
                          })
                        }
                        placeholder="e.g. MRI-Brain, CT-PA, USG-Abdomen, COROS / CAG, EEG-Routine, NCS"
                        className={`w-full rounded-xl border p-3 text-xs font-semibold outline-none transition-all placeholder:text-muted-foreground/60 ${
                          formErrors.reportType
                            ? "border-destructive focus:border-destructive bg-destructive/5"
                            : "border-border bg-background focus:border-primary"
                        }`}
                      />
                      {formErrors.reportType && (
                        <p className="text-[11px] text-destructive font-semibold">
                          {formErrors.reportType}
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-heading mb-1.5">
                          Study / Scan Date (Date Done) *
                        </label>
                        <input
                          type="date"
                          value={formData.studyDate}
                          onChange={(e) => setFormData({ ...formData, studyDate: e.target.value })}
                          className="w-full rounded-xl border border-border bg-background p-3 text-xs font-semibold outline-none focus:border-primary cursor-pointer"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-heading mb-1.5">
                          Urgency / Clinical Priority
                        </label>
                        <select
                          value={formData.urgency}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              urgency: e.target.value as OutsourceReport["urgency"],
                            })
                          }
                          className="w-full rounded-xl border border-border bg-background p-3 text-xs font-semibold outline-none focus:border-primary cursor-pointer"
                        >
                          <option value="Routine">Routine</option>
                          <option value="Urgent">Urgent</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Doctor & Clinical Details */}
                  <div className="space-y-4 pt-2 border-t border-border">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5" />
                      <span>3. Clinical Findings & Radiologist Report</span>
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-heading mb-1.5">
                          Reporting Radiologist / Consultant / Referring Doctor
                        </label>
                        <input
                          type="text"
                          value={formData.referringDoctor}
                          onChange={(e) =>
                            setFormData({ ...formData, referringDoctor: e.target.value })
                          }
                          placeholder="e.g. Dr. Lim (Consultant Radiologist)"
                          className="w-full rounded-xl border border-border bg-background p-3 text-xs font-semibold outline-none focus:border-primary placeholder:text-muted-foreground/60"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-heading mb-1.5">
                          Internal Department / Ward
                        </label>
                        <input
                          type="text"
                          value={formData.department}
                          onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                          placeholder="e.g. Neurology, Cardiology, Ward 7B"
                          className="w-full rounded-xl border border-border bg-background p-3 text-xs font-semibold outline-none focus:border-primary placeholder:text-muted-foreground/60"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-heading mb-1.5">
                        Clinical Indication / History & Reason for Outsource *
                      </label>
                      <textarea
                        value={formData.clinicalIndication}
                        onChange={(e) =>
                          setFormData({ ...formData, clinicalIndication: e.target.value })
                        }
                        rows={2}
                        placeholder="e.g. Sudden severe headache and focal neurological deficit; out-of-pocket urgent MRI at private hospital."
                        className={`w-full rounded-xl border p-3 text-xs font-semibold outline-none transition-all placeholder:text-muted-foreground/60 resize-y ${
                          formErrors.clinicalIndication
                            ? "border-destructive focus:border-destructive bg-destructive/5"
                            : "border-border bg-background focus:border-primary"
                        }`}
                      />
                      {formErrors.clinicalIndication && (
                        <p className="mt-1 text-[11px] text-destructive font-semibold">
                          {formErrors.clinicalIndication}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-heading mb-1.5">
                        Radiologist Key Findings & Conclusion / Impression *
                      </label>
                      <textarea
                        value={formData.findingsSummary}
                        onChange={(e) =>
                          setFormData({ ...formData, findingsSummary: e.target.value })
                        }
                        rows={3}
                        placeholder="Transcribe or paste the summary of findings / impression from the private radiology report."
                        className={`w-full rounded-xl border p-3 text-xs font-semibold outline-none transition-all placeholder:text-muted-foreground/60 resize-y ${
                          formErrors.findingsSummary
                            ? "border-destructive focus:border-destructive bg-destructive/5"
                            : "border-border bg-background focus:border-primary"
                        }`}
                      />
                      {formErrors.findingsSummary && (
                        <p className="mt-1 text-[11px] text-destructive font-semibold">
                          {formErrors.findingsSummary}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Section 4: Drag & Drop File Upload */}
                  <div className="space-y-4 pt-2 border-t border-border">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <Upload className="h-3.5 w-3.5" />
                      <span>4. Upload / Drag & Drop Report Document (PDF, Image)</span>
                    </h3>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,image/*,.doc,.docx"
                      onChange={handleFileSelect}
                      className="hidden"
                    />

                    {!selectedFile ? (
                      <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-all ${
                          isDragging
                            ? "border-primary bg-primary/10 scale-[1.01]"
                            : "border-border hover:border-primary/50 hover:bg-muted/30 bg-background"
                        }`}
                      >
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-3">
                          <Upload className="h-6 w-6" />
                        </div>
                        <p className="text-sm font-bold text-heading">
                          Drag and drop report file here, or{" "}
                          <span className="text-primary underline">browse</span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Supports PDF, Scanned Images (PNG, JPG), Word Documents up to 15MB
                        </p>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-white">
                            <FileText className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-heading">{selectedFile.name}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {(selectedFile.size / 1024).toFixed(1)} KB • Ready to link in Firebase
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleRemoveFile}
                            className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                            title="Remove file"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Submit Button */}
                  <div className="pt-4 border-t border-border flex items-center justify-end">
                    <button
                      type="submit"
                      disabled={isCheckingDuplicate}
                      className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
                    >
                      {isCheckingDuplicate ? (
                        <>
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                          <span>Checking Records...</span>
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4" />
                          <span>Save Report to Outsource Database</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Right Information Sidebar */}
            <div className="space-y-6">
              {/* Quick Info Card */}
              <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-2.5 text-primary">
                  <Sparkles className="h-5 w-5" />
                  <h3 className="text-sm font-bold text-heading">About Outsource Database</h3>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  This database securely logs and references all diagnostic and radiological scans
                  performed at private partner centers (KPJ, Gleneagles, Columbia Asia, Regency,
                  etc.) for HSI patients.
                </p>
                <div className="space-y-2 text-xs text-foreground font-medium pt-2 border-t border-border">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span>Instant alphanumeric duplicate tracking</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span>Real-time Firebase multi-facility synchronization</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span>Embedded PDF & Image report attachment viewer</span>
                  </div>
                </div>
              </div>

              {/* Statistics Card */}
              <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Database Summary
                </h4>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="rounded-xl border border-border bg-background p-3 text-center">
                    <p className="text-2xl font-black text-primary">{requests.length}</p>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase mt-0.5">
                      Total Reports
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-background p-3 text-center">
                    <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                      {
                        requests.filter((r) => r.status === "Verified" || r.status === "Archived")
                          .length
                      }
                    </p>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase mt-0.5">
                      Verified
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* TAB 2: OUTSOURCE TRACKER & DATABASE TABLE */
          <div className="space-y-6">
            {/* Search and Filters */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by report type (MRI-Brain, CT-PA), IC, patient, hospital..."
                  className="w-full rounded-xl border border-border bg-surface pl-10 pr-4 py-2.5 text-xs font-semibold outline-none focus:border-primary placeholder:text-muted-foreground/60 shadow-sm"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">Modality:</span>
                  <select
                    value={modalityFilter}
                    onChange={(e) => setModalityFilter(e.target.value)}
                    className="rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold outline-none focus:border-primary cursor-pointer shadow-sm"
                  >
                    <option value="All">All Modalities</option>
                    {MODALITIES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">Status:</span>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold outline-none focus:border-primary cursor-pointer shadow-sm"
                  >
                    <option value="All">All Statuses</option>
                    <option value="Verified">Verified</option>
                    <option value="Pending Review">Pending Review</option>
                    <option value="Under Review">Under Review</option>
                    <option value="Archived">Archived</option>
                    <option value="Rejected">Rejected</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Outsource Records Table */}
            <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border bg-muted/40 font-bold uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-5 py-4">Report Type / Modality</th>
                      <th className="px-5 py-4">Patient Name & IC</th>
                      <th className="px-5 py-4">Origin Hospital & Radiologist</th>
                      <th className="px-5 py-4">Study / Upload Date</th>
                      <th className="px-5 py-4">Findings & Impression</th>
                      <th className="px-5 py-4">Attached File</th>
                      <th className="px-5 py-4">Status</th>
                      <th className="px-5 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {loading ? (
                      <tr>
                        <td colSpan={8} className="px-5 py-12 text-center text-muted-foreground">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                            <span>Loading outsource reports from Firebase...</span>
                          </div>
                        </td>
                      </tr>
                    ) : filteredRequests.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-5 py-12 text-center text-muted-foreground">
                          <div className="flex flex-col items-center justify-center gap-2 max-w-md mx-auto">
                            <Database className="h-8 w-8 text-muted-foreground/50" />
                            <p className="font-semibold text-foreground">
                              No Outsource Reports Found
                            </p>
                            <p className="text-xs leading-relaxed">
                              {subStatus === "authenticationRequired"
                                ? "Historical request tracking requires authenticated facility access. Please sign in with your facility account to view appointment records."
                                : subStatus === "permissionDenied"
                                  ? "Permission denied: Protected facility data requires authorized access."
                                  : searchQuery
                                    ? "No records match your search criteria."
                                    : "Upload or add your first outsource radiology report."}
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredRequests.map((req) => (
                        <tr key={req.id} className="hover:bg-muted/20 transition-colors group">
                          {/* 1. REPORT TYPE COLUMN (Replaces ECHO-2026-xxxx as requested) */}
                          <td className="px-5 py-4 font-bold text-foreground">
                            <div className="flex flex-col gap-1">
                              <span className="text-sm font-extrabold text-primary tracking-tight">
                                {req.reportType || req.procedureType}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span className="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary uppercase">
                                  {req.modality || "Radiology"}
                                </span>
                                <span className="text-[10px] font-mono text-muted-foreground">
                                  {req.id}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* 2. Patient Name & IC */}
                          <td className="px-5 py-4">
                            <div className="flex flex-col">
                              <span className="font-bold text-heading text-sm">
                                {req.patientName}
                              </span>
                              <span className="font-mono text-xs text-muted-foreground font-semibold">
                                {req.mrn}
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                {req.contactNumber}
                              </span>
                            </div>
                          </td>

                          {/* 3. Origin Hospital */}
                          <td className="px-5 py-4">
                            <div className="flex flex-col gap-0.5">
                              <span className="font-bold text-emerald-700 dark:text-emerald-400">
                                {req.hospitalOrigin || "Private Hospital"}
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                {req.referringDoctor || "N/A"}
                              </span>
                              {req.department && (
                                <span className="text-[10px] text-muted-foreground/80">
                                  Dept: {req.department}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 4. Study & Upload Date */}
                          <td className="px-5 py-4">
                            <div className="flex flex-col">
                              <span className="font-bold text-foreground">
                                Study: {req.studyDate || formatDisplayDateOnly(req.createdAt)}
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                Saved: {formatDisplayDateTime(req.createdAt)}
                              </span>
                            </div>
                          </td>

                          {/* 5. Findings Summary */}
                          <td className="px-5 py-4 max-w-xs">
                            <div
                              className="line-clamp-2 text-xs text-muted-foreground font-medium"
                              title={req.findingsSummary || req.diagnosis}
                            >
                              {req.findingsSummary || req.diagnosis || req.clinicalIndication}
                            </div>
                          </td>

                          {/* 6. Attached Report File */}
                          <td className="px-5 py-4">
                            {req.resultFile?.storagePath ||
                            req.attachedReport?.storagePath ||
                            req.attachedReport?.fileData ||
                            req.resultFile?.dataUrl ? (
                              <button
                                type="button"
                                onClick={() => setSelectedFormReq(req)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold text-xs transition-colors border border-emerald-500/20"
                                title="View attached scan / PDF report"
                              >
                                <FileText className="h-3.5 w-3.5" />
                                <span>View File</span>
                              </button>
                            ) : (
                              <span className="text-[11px] text-muted-foreground/60 italic">
                                No file
                              </span>
                            )}
                          </td>

                          {/* 7. Status */}
                          <td className="px-5 py-4">{getStatusBadge(req.status)}</td>

                          {/* 8. Actions */}
                          <td className="px-5 py-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setSelectedFormReq(req)}
                                className="flex items-center gap-1 rounded-lg bg-muted/60 hover:bg-muted p-2 text-xs font-bold text-foreground transition-colors"
                                title="View Full Report Summary & Record"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>

                              {isAdmin && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateStatus(req.id, "Verified")}
                                    className="rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 p-2 text-emerald-600 transition-colors"
                                    title="Mark as Verified"
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setRejectingReq(req)}
                                    className="rounded-lg bg-destructive/10 hover:bg-destructive/20 p-2 text-destructive transition-colors"
                                    title="Reject or Discard Report"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(req.id)}
                                    className="rounded-lg hover:bg-destructive/10 p-2 text-muted-foreground hover:text-destructive transition-colors"
                                    title="Delete from Database"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Confirmation Notice Modal */}
      {showNoticeModal && pendingReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl space-y-5">
            <div className="flex items-start justify-between border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Database className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-heading">
                    Confirm Outsource Report Entry
                  </h3>
                  <p className="text-xs text-muted-foreground">Verify details before saving</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowNoticeModal(false);
                  setPendingReq(null);
                }}
                className="rounded-lg p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs bg-muted/30 p-4 rounded-xl border border-border">
              <div className="grid grid-cols-3 gap-1">
                <span className="text-muted-foreground font-semibold">Report Type:</span>
                <span className="col-span-2 font-bold text-primary">{pendingReq.reportType}</span>

                <span className="text-muted-foreground font-semibold">Modality:</span>
                <span className="col-span-2 font-bold">{pendingReq.modality}</span>

                <span className="text-muted-foreground font-semibold">Hospital Origin:</span>
                <span className="col-span-2 font-bold text-emerald-700 dark:text-emerald-400">
                  {pendingReq.hospitalOrigin}
                </span>

                <span className="text-muted-foreground font-semibold">Patient Name:</span>
                <span className="col-span-2 font-bold">{pendingReq.patientName}</span>

                <span className="text-muted-foreground font-semibold">IC / MRN:</span>
                <span className="col-span-2 font-mono font-bold">{pendingReq.mrn}</span>

                <span className="text-muted-foreground font-semibold">Study Date:</span>
                <span className="col-span-2 font-bold">{pendingReq.studyDate}</span>

                <span className="text-muted-foreground font-semibold">Attached File:</span>
                <span className="col-span-2 font-bold">
                  {pendingReq.attachedReport ? pendingReq.attachedReport.fileName : "None"}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => {
                  setShowNoticeModal(false);
                  setPendingReq(null);
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSubmit}
                disabled={isSubmitting}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-sm hover:opacity-90 disabled:opacity-50"
              >
                {isSubmitting ? "Saving..." : "Confirm & Save to Firebase"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Request Identified Modal */}
      {showDuplicateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in duration-200">
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
                className="rounded-lg p-1 text-muted-foreground hover:text-foreground transition-colors"
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
                        duplicateOriginalStatus.toUpperCase() === "SCHEDULED" ||
                        duplicateOriginalStatus.toUpperCase() === "VERIFIED"
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
                  Justification *
                </label>
                <textarea
                  value={duplicateJustification}
                  onChange={(e) => {
                    setDuplicateJustification(e.target.value);
                    if (e.target.value.trim()) setDuplicateError("");
                  }}
                  placeholder="Provide clinical justification (e.g. Subsequent follow-up scan, repeated study due to acute clinical deterioration)"
                  className="w-full min-h-[100px] rounded-xl border border-border bg-background p-3 text-sm font-semibold outline-none focus:border-primary placeholder:text-muted-foreground/60 resize-y"
                />
                {duplicateError && (
                  <p className="text-xs text-destructive font-semibold">{duplicateError}</p>
                )}
              </div>

              <div className="flex justify-end gap-3 border-t border-border pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowDuplicateModal(false);
                    setPendingReq(null);
                  }}
                  className="rounded-xl px-4 py-2.5 text-xs font-bold text-muted-foreground hover:bg-muted/20 hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
                >
                  Submit Justification
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Rejection Modal */}
      {rejectingReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl space-y-5">
            <div className="flex items-start justify-between border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                  <XCircle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-heading">Reject Outsource Report</h3>
                  <p className="text-xs text-muted-foreground">
                    Record ID: {rejectingReq.id} • {rejectingReq.patientName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRejectingReq(null)}
                className="rounded-lg p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleRejectSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-heading">
                  Rejection Reason / Comments *
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="e.g. Incomplete scan slices, illegible handwritten report, incorrect patient demographic data."
                  rows={3}
                  required
                  className="w-full rounded-xl border border-border bg-background p-3 text-xs font-semibold outline-none focus:border-primary placeholder:text-muted-foreground/60 resize-y"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-heading">
                  Rejected By (Staff / Doctor Name) *
                </label>
                <input
                  type="text"
                  value={rejectedBy}
                  onChange={(e) => setRejectedBy(e.target.value)}
                  placeholder="e.g. Dr. Azman (Medical Officer)"
                  required
                  className="w-full rounded-xl border border-border bg-background p-3 text-xs font-semibold outline-none focus:border-primary placeholder:text-muted-foreground/60"
                />
              </div>

              <div className="flex justify-end gap-3 border-t border-border pt-4">
                <button
                  type="button"
                  onClick={() => setRejectingReq(null)}
                  className="rounded-xl px-4 py-2.5 text-xs font-bold text-muted-foreground hover:bg-muted/20"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-destructive px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:opacity-90"
                >
                  Confirm Rejection
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detailed Form View / Document Modal */}
      {selectedFormReq && (
        <OutsourceFormModal request={selectedFormReq} onClose={() => setSelectedFormReq(null)} />
      )}
    </div>
  );
}
