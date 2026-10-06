import { useState, useEffect } from "react";
import {
  Calendar as CalendarIcon,
  Clock,
  Heart,
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
  Lock,
  Hospital,
  LogOut,
  CalendarCheck,
  Check,
  X,
  XCircle,
  ChevronDown,
  ChevronUp,
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
import {
  getLocalDateTimeString,
  formatDisplayDateTime,
  formatDisplayScheduledDate,
} from "@/utils/dateUtils";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type AppointmentRequest = AppointmentRecord;

export function RheumatologyAppointment() {
  const { selectedFacility, setSelectedFacility, isAdmin, setIsModalOpen, facilityId } =
    useFacility();
  const [activeTab, setActiveTab] = useState<"request" | "tracker">(
    isAdmin ? "tracker" : "request",
  );
  const [requests, setRequests] = useState<AppointmentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittedRef, setSubmittedRef] = useState<AppointmentRequest | null>(null);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Admin schedule modal state
  const [schedulingReq, setSchedulingReq] = useState<AppointmentRequest | null>(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [rawDate, setRawDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("09:00 AM");

  // Admin rejection modal state
  const [rejectingReq, setRejectingReq] = useState<AppointmentRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectedBy, setRejectedBy] = useState("");

  // Form State
  const [formData, setFormData] = useState({
    patientName: "",
    mrn: "",
    contactNumber: "",
    email: "",
    procedureType: "Rheumatology Clinical Consultation",
    urgency: "Routine" as AppointmentRequest["urgency"],
    referringDoctor: "",
    department: "",
    clinicalIndication: "",
    diagnosis: "",
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  // Notice modal state
  const [showNoticeModal, setShowNoticeModal] = useState(false);
  const [pendingReq, setPendingReq] = useState<AppointmentRequest | null>(null);
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
  const [selectedFormReq, setSelectedFormReq] = useState<AppointmentRecord | null>(null);

  const [subStatus, setSubStatus] = useState<string>("loading");

  // Real-time Firestore sync with facility isolation
  useEffect(() => {
    setLoading(true);

    const unsub = subscribeToAppointments("rheumatology", facilityId, isAdmin, (data, status) => {
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
    if (!formData.referringDoctor.trim())
      errors.referringDoctor = "Referring doctor name is required";
    if (!formData.department.trim()) errors.department = "Department is required";
    if (!formData.clinicalIndication.trim())
      errors.clinicalIndication = "Clinical indication is required";
    if (!formData.diagnosis.trim()) errors.diagnosis = "Impression is required";

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setFormErrors({});

    const docName = formData.referringDoctor.trim();
    const deptName = formData.department.trim();
    const combinedRef = docName ? `${docName} (${deptName})` : deptName;

    const activeFacilityId = facilityId || (selectedFacility ? selectedFacility.facilityId : "");

    const newReq: AppointmentRequest = {
      id: `RHEUM-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      facilityId: activeFacilityId,
      facilityName: selectedFacility.name,
      facilityCategory: selectedFacility.category,
      patientName: formData.patientName.trim(),
      mrn: formData.mrn.trim(),
      contactNumber: formData.contactNumber.trim(),
      email: formData.email.trim() || "N/A",
      procedureType: "Rheumatology Clinical Consultation",
      urgency: formData.urgency,
      referringDoctor: combinedRef,
      department: deptName,
      clinicalIndication: formData.clinicalIndication.trim(),
      diagnosis: formData.diagnosis.trim(),
      status: "Pending Confirmation",
      createdAt: getLocalDateTimeString(),
    };

    setIsCheckingDuplicate(true);
    try {
      const colRef = collection(db, "rheumatology_appointments");
      const q = isAdmin
        ? query(colRef, where("mrn", "==", formData.mrn.trim()))
        : query(
            colRef,
            where("facilityId", "==", activeFacilityId),
            where("mrn", "==", formData.mrn.trim()),
          );
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const docs = querySnapshot.docs.map((doc) => doc.data() as AppointmentRecord);
        // Sort newest first
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
      await createAppointment("rheumatology", pendingReq);
      setSubmittedRef(pendingReq);

      // Reset Form
      setFormData({
        patientName: "",
        mrn: "",
        contactNumber: "",
        email: "",
        procedureType: "Rheumatology Clinical Consultation",
        urgency: "Routine",
        referringDoctor: "",
        department: "",
        clinicalIndication: "",
        diagnosis: "",
      });
      setShowNoticeModal(false);
      setPendingReq(null);
    } catch (err) {
      console.error("Failed to create appointment in Firebase:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedulingReq || !scheduleDate) return;
    const fullSchedule = `${scheduleDate} @ ${scheduleTime}`;

    try {
      await updateAppointment("rheumatology", schedulingReq.id, {
        scheduledDate: fullSchedule,
        status: "Scheduled",
      });
      toast.success(`Successfully scheduled appointment for ${schedulingReq.patientName}`);
      setSchedulingReq(null);
      setScheduleDate("");
    } catch (err) {
      console.error("Failed to update schedule in Firebase:", err);
      toast.error("Failed to schedule appointment");
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: AppointmentRequest["status"]) => {
    if (!isAdmin) return;
    try {
      await updateAppointment("rheumatology", id, { status: newStatus });
      toast.success(`Updated status to ${newStatus}`);
    } catch (err) {
      console.error("Failed to update status:", err);
      toast.error("Failed to update status");
    }
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingReq || !rejectReason.trim() || !rejectedBy.trim()) return;
    try {
      await updateAppointment("rheumatology", rejectingReq.id, {
        status: "Rejected",
        rejectReason: rejectReason.trim(),
        rejectedBy: rejectedBy.trim(),
      });
      toast.error(`Rejected appointment request for ${rejectingReq.patientName}`);
      setRejectingReq(null);
      setRejectReason("");
      setRejectedBy("");
    } catch (err) {
      console.error("Failed to reject request:", err);
      toast.error("Failed to reject request");
    }
  };

  const filteredRequests = requests.filter((r) => {
    const matchesSearch =
      r.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.mrn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.diagnosis.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.referringDoctor.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.facilityName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "All" || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <section className="mx-auto max-w-[1200px] px-5 pt-4 pb-10">
      {/* Tab Controls & Firebase Status */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h2 className="text-2xl font-bold text-heading">Rheumatology Request Portal</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Rheumatology Clinic • Hospital Sultan Ismail
          </p>
        </div>

        {!isAdmin && (
          <div className="flex gap-2 rounded-lg border border-border bg-surface p-1">
            <button
              onClick={() => setActiveTab("request")}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                activeTab === "request"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <CalendarIcon className="h-4 w-4" />
              Book Appointment
            </button>
            <button
              onClick={() => setActiveTab("tracker")}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                activeTab === "tracker"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <CalendarCheck className="h-4 w-4" />
              Track Requests ({requests.length})
            </button>
          </div>
        )}
      </div>

      {/* Confirmation Modal Banner after submission */}
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
                  Appointment Request Submitted Successfully!
                </h3>
                <p className="mt-0.5 text-xs text-foreground">
                  Your request reference number is{" "}
                  <span className="font-mono font-bold text-heading">{submittedRef.id}</span>.
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

      {/* TAB 1: Booking Form (Only available for non-admin referring facilities) */}
      {activeTab === "request" && !isAdmin && (
        <div className="mt-8 grid gap-8 lg:grid-cols-3">
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
                      placeholder="e.g. Patient Full Name"
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

                  <div className="sm:col-span-1 max-w-sm">
                    <label className="block text-xs font-semibold text-heading">
                      Contact Phone Number <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="tel"
                      value={formData.contactNumber}
                      onChange={(e) => setFormData({ ...formData, contactNumber: e.target.value })}
                      placeholder="e.g. +60 12-345 6789"
                      className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                    {formErrors.contactNumber && (
                      <p className="mt-1 text-xs text-destructive">{formErrors.contactNumber}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Section 2: Clinical Details */}
              <div className="space-y-4">
                <h3 className="text-base font-bold text-heading border-b border-border pb-2">
                  2. Referral & Clinical Details
                </h3>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-heading">
                      Referring Doctor <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.referringDoctor}
                      onChange={(e) =>
                        setFormData({ ...formData, referringDoctor: e.target.value })
                      }
                      placeholder="e.g. Dr. Tan Ai Ling"
                      className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                    {formErrors.referringDoctor && (
                      <p className="mt-1 text-xs text-destructive">{formErrors.referringDoctor}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-heading">
                      Department <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.department}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                      placeholder="e.g. Outpatient Department"
                      className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                    {formErrors.department && (
                      <p className="mt-1 text-xs text-destructive">{formErrors.department}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-heading">
                    Clinical Indication & History <span className="text-destructive">*</span>
                  </label>
                  <textarea
                    rows={3}
                    value={formData.clinicalIndication}
                    onChange={(e) =>
                      setFormData({ ...formData, clinicalIndication: e.target.value })
                    }
                    placeholder="Describe patient's symptoms, joint involvement, inflammatory markers, prior DMARDs/steroid treatments..."
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  {formErrors.clinicalIndication && (
                    <p className="mt-1 text-xs text-destructive">{formErrors.clinicalIndication}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-heading">
                    Impression <span className="text-destructive">*</span>
                  </label>
                  <textarea
                    rows={2}
                    value={formData.diagnosis}
                    onChange={(e) => setFormData({ ...formData, diagnosis: e.target.value })}
                    placeholder="Provide primary working impression (e.g. Systemic Lupus Erythematosus (SLE), Rheumatoid Arthritis, Ankylosing Spondylitis, Psoriatic Arthritis, Gout)."
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  {formErrors.diagnosis && (
                    <p className="mt-1 text-xs text-destructive">{formErrors.diagnosis}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-border pt-4">
              <button
                type="submit"
                className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                <Send className="h-4 w-4" />
                Submit Appointment Request
              </button>
            </div>
          </form>

          {/* Right Info Box */}
          <div className="space-y-6">
            <div className="rounded-xl border border-border bg-surface p-5">
              <h4 className="flex items-center gap-2 text-sm font-bold text-heading">
                <Info className="h-4 w-4 text-primary" />
                Clinic Operational Guidelines
              </h4>
              <ul className="mt-3 space-y-2.5 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span>
                    <strong>Operating Hours:</strong> Monday – Friday: 08:00 AM – 05:00 PM (Closed
                    on public holidays).
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span>
                    <strong>Consultation Mode:</strong> Specialist Rheumatology Clinic evaluation,
                    autoimmune disease diagnosis and therapy optimization.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span>
                    <strong>Inpatient / Very Urgent Requests:</strong> Urgent referrals require
                    direct verbal call to the clinic extension +60 7-356 5000 (Ext. 2214).
                  </span>
                </li>
              </ul>
            </div>

            <div className="rounded-xl border border-border bg-background p-5">
              <h4 className="text-sm font-bold text-heading">Rheumatology Clinic Location</h4>
              <p className="mt-1 text-xs text-muted-foreground">
                Room 21 , Internal Medicine Clinic , Level 2 , Hospital Sultan Ismail , Johor Bahru
              </p>
              <div className="mt-3 rounded-lg border border-border bg-surface p-3 text-xs">
                <p className="font-semibold text-heading">Enquiries Hotline:</p>
                <p className="text-primary font-mono font-medium">+60 7-356 5000 (Ext. 2214)</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Tracker */}
      {(activeTab === "tracker" || isAdmin) && (
        <div className="mt-8">
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
              </select>
            </div>
          </div>

          <div className="mt-6 divide-y divide-border overflow-hidden rounded-xl border border-border bg-background">
            {filteredRequests.map((r) => {
              const isExpanded = expandedId === r.id;
              return (
                <div
                  key={r.id}
                  className="border-b border-border/60 px-4 py-3 transition-colors hover:bg-surface/50"
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs">
                    {/* Left: Ref ID, Patient Name, MRN, Urgency, Facility (if Admin) */}
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-mono font-bold text-primary">{r.id}</span>
                      <span className="font-bold text-heading text-sm">{r.patientName}</span>
                      <span className="rounded bg-surface px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground border border-border/40">
                        {r.mrn}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          r.urgency === "Urgent"
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                            : "bg-surface text-muted-foreground border border-border/40"
                        }`}
                      >
                        {r.urgency}
                      </span>
                      {isAdmin && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                          {r.facilityName}
                        </span>
                      )}
                    </div>

                    {/* Right: Status badge & Toggle Arrow */}
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          r.status === "Scheduled"
                            ? "bg-emerald-600 text-white shadow-xs"
                            : r.status === "Confirmed"
                              ? "bg-primary text-primary-foreground shadow-xs"
                              : r.status === "Rejected"
                                ? "bg-destructive text-destructive-foreground shadow-xs"
                                : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                        }`}
                      >
                        {r.status}
                      </span>

                      <button
                        onClick={() => setExpandedId(isExpanded ? null : r.id)}
                        className="rounded-lg p-1 text-muted-foreground hover:bg-surface hover:text-foreground transition-colors"
                        title={isExpanded ? "Collapse" : "Expand"}
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Expanded View */}
                  {isExpanded && (
                    <div className="mt-3 border-t border-border/60 pt-3 text-xs space-y-3">
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 rounded-lg bg-surface/40 p-3 border border-border/40">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Doctor
                          </p>
                          <p className="font-semibold text-heading mt-0.5">{r.referringDoctor}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Contact
                          </p>
                          <p className="font-semibold text-heading mt-0.5">{r.contactNumber}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Date Requested
                          </p>
                          <p className="font-semibold text-heading mt-0.5">{r.createdAt}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Appointment Date
                          </p>
                          <p
                            className={`font-semibold mt-0.5 ${r.scheduledDate ? "text-emerald-600 dark:text-emerald-400 font-mono font-bold" : "text-muted-foreground"}`}
                          >
                            {r.scheduledDate || "Not Scheduled"}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-1.5 px-1">
                        <div>
                          <span className="font-bold text-heading">Indication: </span>
                          <span className="text-muted-foreground">{r.clinicalIndication}</span>
                        </div>
                        <div>
                          <span className="font-bold text-heading">Impression: </span>
                          <span className="text-muted-foreground">{r.diagnosis}</span>
                        </div>
                        {r.duplicateJustification && (
                          <div className="mt-1.5 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5 text-xs text-foreground">
                            <span className="font-bold text-amber-700 dark:text-amber-400">
                              Duplicate Request Justification:{" "}
                            </span>
                            <span className="text-muted-foreground">
                              {r.duplicateJustification}
                            </span>
                          </div>
                        )}
                        {r.status === "Rejected" && r.rejectReason && (
                          <div className="mt-2 rounded-lg border border-destructive/20 bg-destructive/5 p-2.5 text-xs text-destructive">
                            <p className="font-bold">Rejection Reason: {r.rejectReason}</p>
                            {r.rejectedBy && (
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                Rejected By: {r.rejectedBy}
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-2 px-1">
                        {/* Print / View Request Slip Button */}
                        <button
                          type="button"
                          onClick={() => setSelectedFormReq(r)}
                          className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 transition-colors shadow-xs"
                          title="View & Download Official Request Form Slip"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          <span>View Official Request Form</span>
                        </button>

                        {/* Admin Action Buttons */}
                        {isAdmin && (
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              onClick={() => {
                                setSchedulingReq(r);
                                setScheduleDate(r.scheduledDate?.split(" @ ")[0] || "");
                                setScheduleTime(r.scheduledDate?.split(" @ ")[1] || "09:00 AM");
                              }}
                              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 shadow-xs transition-colors"
                            >
                              <CalendarCheck className="h-3.5 w-3.5" />
                              <span>{r.scheduledDate ? "Reschedule" : "Schedule"}</span>
                            </button>

                            <select
                              value={r.status}
                              onChange={(e) =>
                                handleUpdateStatus(
                                  r.id,
                                  e.target.value as AppointmentRequest["status"],
                                )
                              }
                              className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-semibold outline-none"
                            >
                              <option value="Pending Confirmation">Pending Confirmation</option>
                              <option value="Confirmed">Confirmed</option>
                              <option value="Under Review">Under Review</option>
                              <option value="Scheduled">Scheduled</option>
                            </select>

                            <button
                              onClick={() => {
                                setRejectingReq(r);
                                setRejectReason("");
                                setRejectedBy("");
                              }}
                              className="flex items-center gap-1 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive hover:bg-destructive/20 transition-colors"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              <span>Reject</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {filteredRequests.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground space-y-2">
                <p className="leading-relaxed">
                  {subStatus === "authenticationRequired"
                    ? "Historical request tracking requires authenticated facility access. Please sign in with your facility account to view appointment records."
                    : subStatus === "permissionDenied"
                      ? "Permission denied: Protected facility data requires authorized access."
                      : loading
                        ? "Loading rheumatology appointments from Firebase..."
                        : "No appointment requests found matching your filters."}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Admin Schedule Modal */}
      {schedulingReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-2xl border border-border bg-background shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-2 text-primary font-bold">
                <CalendarCheck className="h-5 w-5" />
                <h3 className="text-base font-bold">Schedule Appointment</h3>
              </div>
              <button
                onClick={() => setSchedulingReq(null)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-surface"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-xl border border-border/80 bg-surface/50 p-3 text-xs space-y-1">
              <p className="font-bold text-heading">
                {schedulingReq.patientName} ({schedulingReq.mrn})
              </p>
              <p className="text-muted-foreground">
                Referring Facility: {schedulingReq.facilityName}
              </p>
              <p className="text-muted-foreground">Doctor: {schedulingReq.referringDoctor}</p>
            </div>

            <form onSubmit={handleSaveSchedule} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-heading">Appointment Date</label>
                <input
                  type="date"
                  value={rawDate}
                  onChange={(e) => {
                    setRawDate(e.target.value);
                    if (e.target.value) {
                      const [y, m, d] = e.target.value.split("-");
                      setScheduleDate(`${d}/${m}/${y}`);
                    } else {
                      setScheduleDate("");
                    }
                  }}
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                  required
                />
                {scheduleDate && (
                  <p className="mt-1 text-xs text-primary font-mono font-semibold">
                    Formatted Date: {scheduleDate}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-heading">
                  Appointment Time Slot
                </label>
                <select
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary font-medium"
                >
                  <option value="08:00 AM">08:00 AM</option>
                  <option value="08:30 AM">08:30 AM</option>
                  <option value="09:00 AM">09:00 AM</option>
                  <option value="09:30 AM">09:30 AM</option>
                  <option value="10:00 AM">10:00 AM</option>
                  <option value="10:30 AM">10:30 AM</option>
                  <option value="11:00 AM">11:00 AM</option>
                  <option value="11:30 AM">11:30 AM</option>
                  <option value="02:00 PM">02:00 PM</option>
                  <option value="02:30 PM">02:30 PM</option>
                  <option value="03:00 PM">03:00 PM</option>
                  <option value="03:30 PM">03:30 PM</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setSchedulingReq(null)}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-surface transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
                >
                  Save Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Duplicate MRN Warning & Justification Modal */}
      {showDuplicateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-2xl border border-amber-500/30 bg-surface p-6 shadow-2xl space-y-5 overflow-hidden">
            <div className="flex items-start justify-between border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-heading">Existing Record Found</h3>
                  <p className="text-xs text-muted-foreground">
                    Duplicate Identification Number Alert
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowDuplicateModal(false);
                  setPendingReq(null);
                }}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted/20 hover:text-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-2 text-xs">
              <p className="font-semibold text-heading">
                A prior rheumatology request exists for Identification No.{" "}
                <span className="font-mono font-bold text-primary">{pendingReq?.mrn}</span>:
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1 font-medium">
                <div>
                  <span className="text-muted-foreground">Reference ID: </span>
                  <span className="font-mono font-bold text-heading">{duplicateOriginalId}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Current Status: </span>
                  <span className="font-bold text-amber-700 dark:text-amber-400">
                    {duplicateOriginalStatus}
                  </span>
                </div>
                {duplicateOriginalDate && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Scheduled Date: </span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {duplicateOriginalDate}
                    </span>
                  </div>
                )}
                {duplicateOriginalStatus === "Rejected" && duplicateOriginalReason && (
                  <div className="col-span-2 text-destructive">
                    <span className="font-bold">Prior Rejection Reason: </span>
                    <span>{duplicateOriginalReason}</span>
                  </div>
                )}
              </div>
            </div>

            <form onSubmit={handleDuplicateSubmit} className="space-y-4">
              <div
                className={`transition-all duration-300 rounded-xl p-1 ${
                  justificationBlink ? "ring-2 ring-destructive" : ""
                }`}
              >
                <label className="block text-xs font-bold text-heading uppercase tracking-wider mb-1.5">
                  Clinical Justification for New Request <span className="text-destructive">*</span>
                </label>
                <textarea
                  value={duplicateJustification}
                  onChange={(e) => {
                    setDuplicateJustification(e.target.value);
                    if (e.target.value.trim()) setDuplicateError("");
                  }}
                  placeholder="Provide clinical justification (e.g. New onset systemic symptoms, acute flare, or urgent secondary review)"
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
                  className="rounded-xl border border-border px-4 py-2.5 text-xs sm:text-sm font-semibold hover:bg-muted/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-primary px-5 py-2.5 text-xs sm:text-sm font-bold text-primary-foreground hover:opacity-90 transition-opacity"
                >
                  Submit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Notice Modal */}
      {showNoticeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl space-y-5 overflow-hidden">
            <div className="flex items-start justify-between border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-heading">Important Requirement Notice</h3>
                  <p className="text-xs text-muted-foreground">
                    Please review before submitting request
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowNoticeModal(false);
                  setPendingReq(null);
                }}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted/20 hover:text-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-xl border border-border bg-background/50 p-4 space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <p className="font-medium text-xs sm:text-sm leading-relaxed text-foreground">
                  Please ensure that the patient has been provided with the Rheumatology Request
                  Form
                </p>
              </div>

              <div className="flex items-start gap-3 pt-2.5 border-t border-border/50">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <p className="font-semibold text-xs sm:text-sm leading-relaxed text-destructive">
                  Patients who attend their scheduled appointment without the Rheumatology Request
                  Form will not be accepted for the consultation
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-border pt-4">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  setShowNoticeModal(false);
                  setPendingReq(null);
                }}
                className="rounded-xl border border-border px-4 py-2.5 text-xs sm:text-sm font-semibold hover:bg-muted/10 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmSubmit}
                className="flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-xs sm:text-sm font-bold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {isSubmitting ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Rejection Modal */}
      {rejectingReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-2xl border border-border bg-background shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-2 text-destructive font-bold">
                <XCircle className="h-5 w-5" />
                <h3 className="text-base font-bold">Reject Appointment Request</h3>
              </div>
              <button
                onClick={() => setRejectingReq(null)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-surface"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs space-y-1">
              <p className="font-bold text-heading">
                {rejectingReq.patientName} ({rejectingReq.mrn})
              </p>
              <p className="text-muted-foreground">
                Referring Facility: {rejectingReq.facilityName}
              </p>
            </div>

            <form onSubmit={handleRejectSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-heading">Rejection Reason</label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Enter the reason for rejecting this request..."
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary min-h-[80px]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-heading">Rejected By</label>
                <input
                  type="text"
                  value={rejectedBy}
                  onChange={(e) => setRejectedBy(e.target.value)}
                  placeholder="Your Name / Designation"
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setRejectingReq(null)}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-surface transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:opacity-90 transition-opacity"
                >
                  Submit Rejection
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Official Form Preview & Download Modal */}
      {selectedFormReq && (
        <EchoFormModal request={selectedFormReq} onClose={() => setSelectedFormReq(null)} />
      )}
    </section>
  );
}
