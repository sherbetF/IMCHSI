import React, { useState, useEffect, useMemo } from "react";
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
  Hospital,
  CalendarCheck,
  Check,
  X,
  XCircle,
  ChevronDown,
  ChevronUp,
  Stethoscope,
  Activity,
  Edit3,
  RefreshCw,
  ClipboardList,
  ShieldCheck,
  CalendarDays,
  Syringe,
  Eye,
  Paperclip,
  Upload,
  Image as ImageIcon,
  Lock,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useFacility } from "@/context/FacilityContext";
import { toast } from "sonner";
import {
  RheumatologyRecord,
  RheumatologyStatus,
  DoctorReviewTimeframe,
  DoctorRequiredInvestigation,
  CONTROLLED_REVIEW_TIMEFRAMES,
  CONTROLLED_INVESTIGATIONS,
  RheumatologySubscriptionStatus,
  createRheumatologyReferral,
  resubmitRheumatologyReferral,
  submitDoctorReview,
  returnRheumatologyReferral,
  rejectRheumatologyReferral,
  scheduleRheumatologyAppointments,
  rescheduleRheumatologyAppointments,
  subscribeToRheumatologyReferrals,
} from "@/services/rheumatologyService";
import { combineDateAndTime, extractDateAndTimeString } from "@/utils/dateUtils";
import { RheumatologyAttachmentsManager } from "./RheumatologyAttachmentsManager";
import {
  uploadRheumatologyAttachment,
  formatAttachmentSize,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_ATTACHMENTS_PER_REFERRAL,
  ALLOWED_RHEUMATOLOGY_MIME_TYPES,
} from "@/services/rheumatologyAttachmentsService";

export const DOCTOR_TIME_SLOTS = [
  "08:30 AM",
  "09:00 AM",
  "09:30 AM",
  "10:00 AM",
  "10:30 AM",
  "11:00 AM",
  "11:30 AM",
  "02:00 PM",
  "02:30 PM",
  "03:00 PM",
];

export const BLOOD_TIME_SLOTS = ["08:00 AM", "08:30 AM", "09:00 AM", "09:30 AM", "10:00 AM"];

// Helper to format Firestore timestamp or string safely
function formatDisplayTimestamp(val: unknown): string {
  if (!val) return "—";
  let d: Date | null = null;
  if (typeof val === "object" && val !== null) {
    if ("toDate" in val && typeof (val as { toDate: () => Date }).toDate === "function") {
      d = (val as { toDate: () => Date }).toDate();
    } else if ("seconds" in val && typeof (val as { seconds: number }).seconds === "number") {
      d = new Date((val as { seconds: number }).seconds * 1000);
    }
  } else if (val instanceof Date) {
    d = val;
  } else if (typeof val === "string") {
    return val;
  }

  if (!d || isNaN(d.getTime())) return "—";

  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  let hours = d.getHours();
  const mins = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  const timeStr = `${String(hours).padStart(2, "0")}:${mins} ${ampm}`;

  return `${day}/${month}/${year} @ ${timeStr}`;
}

// Helper to format date-only
function formatDisplayDateOnly(val: unknown): string {
  const full = formatDisplayTimestamp(val);
  if (full === "—") return "—";
  return full.split(" @ ")[0] || full.split(" ")[0] || full;
}

export function RheumatologyAppointment() {
  const navigate = useNavigate();
  const {
    selectedFacility,
    isAdmin,
    isDoctor,
    isParamedicNurse,
    userRole,
    facilityId,
    setIsModalOpen,
    openModal,
  } = useFacility();

  // Unified Subscription Data
  const [referrals, setReferrals] = useState<RheumatologyRecord[]>([]);
  const [subStatus, setSubStatus] = useState<RheumatologySubscriptionStatus>("loading");
  const [loading, setLoading] = useState<boolean>(true);

  // Common UI State
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Facility View State
  const [activeTab, setActiveTab] = useState<"request" | "tracker">(
    isDoctor || isParamedicNurse || isAdmin ? "tracker" : "request",
  );
  const [submittedBanner, setSubmittedBanner] = useState<{
    referralNumber: string;
    patientName: string;
  } | null>(null);
  const [isFadingOut, setIsFadingOut] = useState(false);

  // Facility Form State
  const [formData, setFormData] = useState({
    patientName: "",
    mrn: "",
    contactNumber: "",
    email: "",
    urgency: "Routine" as "Routine" | "Urgent",
    referringDoctor: "",
    department: "",
    clinicalIndication: "",
    diagnosis: "",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleAttachmentFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const currentCount = selectedFiles.length;
    const newFiles: File[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      if (currentCount + newFiles.length >= MAX_ATTACHMENTS_PER_REFERRAL) {
        toast.error(`Maximum limit of ${MAX_ATTACHMENTS_PER_REFERRAL} attachments per referral.`);
        break;
      }

      if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
        toast.error(
          `File "${file.name}" exceeds the 10 MB maximum limit (${formatAttachmentSize(file.size)}).`,
        );
        continue;
      }

      const contentType = file.type.toLowerCase();
      if (!ALLOWED_RHEUMATOLOGY_MIME_TYPES.includes(contentType as any)) {
        toast.error(`File "${file.name}" format is not supported. Please use PDF, JPEG, or PNG.`);
        continue;
      }

      if (selectedFiles.some((f) => f.name === file.name && f.size === file.size)) {
        continue;
      }

      newFiles.push(file);
    }

    if (newFiles.length > 0) {
      setSelectedFiles((prev) => [...prev, ...newFiles]);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemoveSelectedFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Facility Edit & Resubmit Modal State
  const [resubmitTarget, setResubmitTarget] = useState<RheumatologyRecord | null>(null);
  const [resubmitForm, setResubmitForm] = useState({
    patientName: "",
    mrn: "",
    contactNumber: "",
    email: "",
    clinicalIndication: "",
    diagnosis: "",
  });
  const [isResubmitting, setIsResubmitting] = useState(false);

  // Doctor Workspace State
  const [doctorActiveTab, setDoctorActiveTab] = useState<
    "pending" | "awaiting" | "scheduled" | "returned" | "rejected" | "all"
  >("pending");
  const [doctorReviewTarget, setDoctorReviewTarget] = useState<RheumatologyRecord | null>(null);
  const [reviewDecisionMode, setReviewDecisionMode] = useState<"accept" | "return" | "reject">(
    "accept",
  );
  const [reviewTimeframe, setReviewTimeframe] = useState<DoctorReviewTimeframe>("Within 4 Months");
  const [customTimeframe, setCustomTimeframe] = useState("");
  const [selectedInvestigations, setSelectedInvestigations] = useState<
    DoctorRequiredInvestigation[]
  >([]);
  const [noInvestigationsRequired, setNoInvestigationsRequired] = useState(false);
  const [doctorInstructions, setDoctorInstructions] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [isDoctorSubmitting, setIsDoctorSubmitting] = useState(false);

  // Paramedic Workspace State
  const [paramedicActiveTab, setParamedicActiveTab] = useState<"awaiting" | "scheduled" | "all">(
    "awaiting",
  );
  const [schedulingTarget, setSchedulingTarget] = useState<RheumatologyRecord | null>(null);
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [docApptDate, setDocApptDate] = useState("");
  const [docApptTime, setDocApptTime] = useState("09:00 AM");
  const [hasBloodTaking, setHasBloodTaking] = useState(true);
  const [bloodApptDate, setBloodApptDate] = useState("");
  const [bloodApptTime, setBloodApptTime] = useState("08:30 AM");
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [isSchedulingSubmitting, setIsSchedulingSubmitting] = useState(false);

  // Inspector Modal State (Read-only for all roles)
  const [inspectTarget, setInspectTarget] = useState<RheumatologyRecord | null>(null);

  // -------------------------------------------------------------
  // Real-Time Trusted Subscription
  // -------------------------------------------------------------
  useEffect(() => {
    if (!isAdmin && !isDoctor) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeToRheumatologyReferrals((data, status) => {
      setReferrals(data);
      setSubStatus(status);
      setLoading(false);
    });
    return () => unsub();
  }, [facilityId, isDoctor, isParamedicNurse, isAdmin]);

  // Auto-switch non-facility roles to tracker/workspace
  useEffect(() => {
    if (isDoctor || isParamedicNurse || isAdmin) {
      setActiveTab("tracker");
    }
  }, [isDoctor, isParamedicNurse, isAdmin]);

  // Auto-dismiss submitted banner after 60 seconds
  useEffect(() => {
    if (submittedBanner) {
      setIsFadingOut(false);
      const timer = setTimeout(() => setIsFadingOut(true), 60000);
      const dismissTimer = setTimeout(() => {
        setSubmittedBanner(null);
        setIsFadingOut(false);
      }, 61000);
      return () => {
        clearTimeout(timer);
        clearTimeout(dismissTimer);
      };
    }
  }, [submittedBanner]);

  // Derived filtered records for Search & Status
  const filteredReferrals = useMemo(() => {
    return referrals.filter((r) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        r.patientName.toLowerCase().includes(q) ||
        r.mrn.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        (r.referralNumber && r.referralNumber.toLowerCase().includes(q)) ||
        r.diagnosis.toLowerCase().includes(q) ||
        r.clinicalIndication.toLowerCase().includes(q) ||
        r.facilityName.toLowerCase().includes(q) ||
        (r.referringDoctor && r.referringDoctor.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      // Doctor Workspace filtering
      if (isDoctor) {
        if (doctorActiveTab === "pending") {
          return r.status === "Pending Doctor Review";
        } else if (doctorActiveTab === "awaiting") {
          return r.status === "Awaiting Scheduling";
        } else if (doctorActiveTab === "scheduled") {
          return r.status === "Scheduled";
        } else if (doctorActiveTab === "returned") {
          return r.status === "Returned to Facility";
        } else if (doctorActiveTab === "rejected") {
          return r.status === "Rejected";
        } else if (doctorActiveTab === "all") {
          return true;
        }
        return true;
      }

      // Paramedic Workspace filtering
      if (isParamedicNurse) {
        if (paramedicActiveTab === "awaiting") {
          return r.status === "Awaiting Scheduling";
        } else if (paramedicActiveTab === "scheduled") {
          return r.status === "Scheduled";
        } else if (paramedicActiveTab === "all") {
          return true;
        }
        return true;
      }

      // Facility & Admin filtering (generic status dropdown)
      if (statusFilter !== "All") {
        if (statusFilter === "Legacy") {
          return r.status === "Pending Confirmation";
        }
        return r.status === statusFilter;
      }

      return true;
    });
  }, [
    referrals,
    searchQuery,
    isDoctor,
    doctorActiveTab,
    isParamedicNurse,
    paramedicActiveTab,
    statusFilter,
  ]);

  // Counts for Metric Cards
  const counts = useMemo(() => {
    return {
      total: referrals.length,
      pendingDoctor: referrals.filter((r) => r.status === "Pending Doctor Review").length,
      awaitingScheduling: referrals.filter((r) => r.status === "Awaiting Scheduling").length,
      scheduled: referrals.filter((r) => r.status === "Scheduled").length,
      returned: referrals.filter((r) => r.status === "Returned to Facility").length,
      rejected: referrals.filter((r) => r.status === "Rejected").length,
      legacy: referrals.filter((r) => r.status === "Pending Confirmation").length,
    };
  }, [referrals]);

  // -------------------------------------------------------------
  // Facility Form Submission
  // -------------------------------------------------------------
  const handleFacilitySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};

    if (!selectedFacility && !facilityId) {
      setIsModalOpen(true);
      return;
    }

    if (!formData.patientName.trim()) errors.patientName = "Patient full name is required";
    if (!formData.mrn.trim()) {
      errors.mrn = "Identification No. / MRN is required";
    } else if (/[^a-zA-Z0-9]/.test(formData.mrn.trim())) {
      errors.mrn = "Identification No. can only contain letters and numbers (no symbols)";
    }
    if (!formData.contactNumber.trim()) errors.contactNumber = "Contact phone number is required";
    if (!formData.referringDoctor.trim())
      errors.referringDoctor = "Referring doctor name is required";
    if (!formData.department.trim()) errors.department = "Department is required";
    if (!formData.clinicalIndication.trim())
      errors.clinicalIndication = "Clinical indication is required";
    if (!formData.diagnosis.trim())
      errors.diagnosis = "Clinical diagnosis / impression is required";

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setFormErrors({});
    setIsSubmitting(true);

    try {
      const res = await createRheumatologyReferral({
        patientName: formData.patientName.trim(),
        mrn: formData.mrn.trim(),
        contactNumber: formData.contactNumber.trim(),
        email: formData.email.trim() || undefined,
        procedureType: "Rheumatology Clinical Consultation",
        urgency: formData.urgency,
        referringDoctor: formData.referringDoctor.trim(),
        department: formData.department.trim(),
        clinicalIndication: formData.clinicalIndication.trim(),
        diagnosis: formData.diagnosis.trim(),
      });

      setSubmittedBanner({
        referralNumber: res.referralNumber,
        patientName: formData.patientName.trim(),
      });

      toast.success(`Referral submitted successfully! Referral Number: ${res.referralNumber}`);

      // Upload any selected clinical documents
      if (selectedFiles.length > 0) {
        toast.info(`Uploading ${selectedFiles.length} supporting clinical document(s)...`);
        let failedCount = 0;
        for (const file of selectedFiles) {
          try {
            await uploadRheumatologyAttachment(res.id, file);
          } catch (uploadErr) {
            console.error("Failed to upload clinical attachment:", uploadErr);
            failedCount++;
          }
        }

        if (failedCount > 0) {
          toast.warning(
            `Referral created, but ${failedCount} document(s) failed to upload. You can re-upload them from Track Referrals.`,
          );
        } else {
          toast.success("Supporting clinical documents successfully attached!");
        }
      }

      // Reset Form and attachments
      setFormData({
        patientName: "",
        mrn: "",
        contactNumber: "",
        email: "",
        urgency: "Routine",
        referringDoctor: "",
        department: "",
        clinicalIndication: "",
        diagnosis: "",
      });
      setSelectedFiles([]);

      setActiveTab("tracker");
    } catch (err: unknown) {
      const e = err as { message?: string };
      console.error("Referral submission failed:", err);
      toast.error(e.message || "Failed to submit Rheumatology referral. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // -------------------------------------------------------------
  // Facility Edit & Resubmit
  // -------------------------------------------------------------
  const openResubmitModal = (refItem: RheumatologyRecord) => {
    setResubmitTarget(refItem);
    setResubmitForm({
      patientName: refItem.patientName,
      mrn: refItem.mrn,
      contactNumber: refItem.contactNumber,
      email: refItem.email || "",
      clinicalIndication: refItem.clinicalIndication,
      diagnosis: refItem.diagnosis,
    });
  };

  const handleResubmitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resubmitTarget) return;

    if (
      !resubmitForm.patientName.trim() ||
      !resubmitForm.mrn.trim() ||
      !resubmitForm.contactNumber.trim() ||
      !resubmitForm.clinicalIndication.trim() ||
      !resubmitForm.diagnosis.trim()
    ) {
      toast.error("Please fill in all required clinical fields before resubmitting.");
      return;
    }

    setIsResubmitting(true);
    try {
      await resubmitRheumatologyReferral({
        referralId: resubmitTarget.id,
        patientName: resubmitForm.patientName.trim(),
        mrn: resubmitForm.mrn.trim(),
        contactNumber: resubmitForm.contactNumber.trim(),
        email: resubmitForm.email.trim() || undefined,
        clinicalIndication: resubmitForm.clinicalIndication.trim(),
        diagnosis: resubmitForm.diagnosis.trim(),
      });

      toast.success(
        `Referral ${resubmitTarget.referralNumber || resubmitTarget.id} resubmitted successfully! It is now pending doctor review.`,
      );
      setResubmitTarget(null);
    } catch (err: unknown) {
      const e = err as { message?: string };
      console.error("Resubmission failed:", err);
      toast.error(e.message || "Failed to resubmit referral.");
    } finally {
      setIsResubmitting(false);
    }
  };

  // -------------------------------------------------------------
  // Doctor Review Modal Actions
  // -------------------------------------------------------------
  const openDoctorReviewModal = (refItem: RheumatologyRecord) => {
    setDoctorReviewTarget(refItem);
    setReviewDecisionMode("accept");
    setReviewTimeframe("Within 4 Months");
    setCustomTimeframe("");
    setSelectedInvestigations([]);
    setNoInvestigationsRequired(false);
    setDoctorInstructions("");
    setReturnReason("");
    setRejectReason("");
  };

  const handleDoctorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doctorReviewTarget) return;

    setIsDoctorSubmitting(true);
    try {
      if (reviewDecisionMode === "accept") {
        if (!noInvestigationsRequired && selectedInvestigations.length === 0) {
          toast.error(
            "Please select the required investigations or confirm that no prerequisite blood investigations are required.",
          );
          setIsDoctorSubmitting(false);
          return;
        }

        await submitDoctorReview({
          referralId: doctorReviewTarget.id,
          reviewTimeframe,
          customTimeframe: reviewTimeframe === "Other" ? customTimeframe.trim() : undefined,
          requiredInvestigations: noInvestigationsRequired ? [] : selectedInvestigations,
          doctorInstructions: doctorInstructions.trim() || undefined,
        });
        toast.success(
          `Review submitted for ${doctorReviewTarget.patientName}. Referral moved to Awaiting Scheduling.`,
        );
      } else if (reviewDecisionMode === "return") {
        if (!returnReason.trim() || returnReason.trim().length < 5) {
          toast.error("A return reason of at least 5 characters is required.");
          setIsDoctorSubmitting(false);
          return;
        }
        await returnRheumatologyReferral({
          referralId: doctorReviewTarget.id,
          returnReason: returnReason.trim(),
        });
        toast.success(
          `Referral returned to ${doctorReviewTarget.facilityName} for additional information.`,
        );
      } else if (reviewDecisionMode === "reject") {
        if (!rejectReason.trim() || rejectReason.trim().length < 5) {
          toast.error("A clinical rejection reason of at least 5 characters is required.");
          setIsDoctorSubmitting(false);
          return;
        }
        await rejectRheumatologyReferral({
          referralId: doctorReviewTarget.id,
          rejectReason: rejectReason.trim(),
        });
        toast.error(`Referral rejected for ${doctorReviewTarget.patientName}.`);
      }

      setDoctorReviewTarget(null);
    } catch (err: unknown) {
      const e = err as { message?: string };
      console.error("Doctor operation failed:", err);
      toast.error(e.message || "Operation failed.");
    } finally {
      setIsDoctorSubmitting(false);
    }
  };

  // -------------------------------------------------------------
  // Paramedic Scheduling Modal Actions
  // -------------------------------------------------------------
  const openParamedicScheduleModal = (refItem: RheumatologyRecord, reschedule: boolean) => {
    setSchedulingTarget(refItem);
    setIsRescheduling(reschedule);
    setScheduleError(null);

    // Initial dates and times from existing record if rescheduling
    if (reschedule && refItem.doctorAppointmentDate) {
      const extracted = extractDateAndTimeString(refItem.doctorAppointmentDate);
      if (extracted) {
        setDocApptDate(extracted.date);
        setDocApptTime(extracted.time);
      } else {
        setDocApptDate("");
        setDocApptTime("09:00 AM");
      }
    } else {
      setDocApptDate("");
      setDocApptTime("09:00 AM");
    }

    if (refItem.bloodTakingDate) {
      setHasBloodTaking(true);
      const extracted = extractDateAndTimeString(refItem.bloodTakingDate);
      if (extracted) {
        setBloodApptDate(extracted.date);
        setBloodApptTime(extracted.time);
      } else {
        setBloodApptDate("");
        setBloodApptTime("08:30 AM");
      }
    } else {
      // Default to doctor's investigations: if doctor requested none, default to false
      setHasBloodTaking(
        Array.isArray(refItem.requiredInvestigations) && refItem.requiredInvestigations.length > 0,
      );
      setBloodApptDate("");
      setBloodApptTime("08:30 AM");
    }
  };

  const handleParamedicScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedulingTarget) return;

    if (!docApptDate) {
      setScheduleError("Doctor Consultation Appointment Date is mandatory.");
      return;
    }

    const doctorDateObj = combineDateAndTime(docApptDate, docApptTime);
    if (!doctorDateObj) {
      setScheduleError("Invalid Doctor Consultation Appointment date or time.");
      return;
    }

    let bloodDateObj: Date | null = null;
    if (hasBloodTaking) {
      if (!bloodApptDate) {
        setScheduleError(
          "Blood Taking Appointment Date is required when blood testing is enabled.",
        );
        return;
      }
      bloodDateObj = combineDateAndTime(bloodApptDate, bloodApptTime);
      if (!bloodDateObj) {
        setScheduleError("Invalid Blood Taking Appointment date or time.");
        return;
      }

      // Validate sequencing: blood taking must occur on or before doctor review
      if (bloodDateObj.getTime() > doctorDateObj.getTime()) {
        setScheduleError(
          "Invalid Sequencing: Prerequisite blood-taking appointment cannot be after the doctor review appointment.",
        );
        return;
      }
    }

    setScheduleError(null);
    setIsSchedulingSubmitting(true);

    try {
      if (isRescheduling) {
        await rescheduleRheumatologyAppointments({
          referralId: schedulingTarget.id,
          doctorAppointmentDate: doctorDateObj,
          bloodTakingDate: hasBloodTaking ? bloodDateObj : null,
        });
        toast.success(`Rescheduled appointment for ${schedulingTarget.patientName}.`);
      } else {
        await scheduleRheumatologyAppointments({
          referralId: schedulingTarget.id,
          doctorAppointmentDate: doctorDateObj,
          bloodTakingDate: hasBloodTaking ? bloodDateObj : null,
        });
        toast.success(`Successfully scheduled appointment for ${schedulingTarget.patientName}.`);
      }

      setSchedulingTarget(null);
    } catch (err: unknown) {
      const e = err as { message?: string };
      console.error("Paramedic scheduling failed:", err);
      toast.error(e.message || "Failed to save scheduling.");
    } finally {
      setIsSchedulingSubmitting(false);
    }
  };

  // Helper Badge for Status
  const renderStatusBadge = (status: RheumatologyStatus) => {
    switch (status) {
      case "Pending Doctor Review":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-sky-300 bg-sky-50 px-2.5 py-0.5 text-[11px] font-bold text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300">
            <Clock className="h-3 w-3" />
            Pending Doctor Review
          </span>
        );
      case "Awaiting Scheduling":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-indigo-300 bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
            <CheckCircle2 className="h-3 w-3" />
            Awaiting Scheduling
          </span>
        );
      case "Scheduled":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            <CalendarCheck className="h-3 w-3" />
            Scheduled
          </span>
        );
      case "Returned to Facility":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
            <AlertCircle className="h-3 w-3" />
            Returned for Info
          </span>
        );
      case "Rejected":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-rose-300 bg-rose-50 px-2.5 py-0.5 text-[11px] font-bold text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300">
            <XCircle className="h-3 w-3" />
            Rejected
          </span>
        );
      case "Pending Confirmation":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
            Legacy Record (Read-Only)
          </span>
        );
      default:
        return (
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-700">
            {status}
          </span>
        );
    }
  };

  // Direct-Route Protection: Access to Rheumatology from Hospital navigation is restricted to authenticated Admin.
  // Authorized Rheumatology Doctors access their dedicated workflow.
  if (!isAdmin && !isDoctor) {
    return (
      <section className="mx-auto max-w-[1200px] px-5 pt-16 pb-20 min-h-[calc(100vh-200px)] flex flex-col items-center justify-center">
        <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center space-y-5 shadow-sm">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 mx-auto">
            <Lock className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-heading">Administrator Access Required</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Access to the Rheumatology module from Hospital navigation is restricted to authorized
              Administrators. Authorized Rheumatology Doctors may access via Hospital Staff Access.
            </p>
          </div>
          <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">
            <button
              type="button"
              onClick={() => openModal("admin")}
              className="flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity cursor-pointer"
            >
              <ShieldCheck className="h-4 w-4" />
              <span>Hospital Staff Access</span>
            </button>
            <button
              type="button"
              onClick={() => navigate({ to: "/" })}
              className="flex items-center justify-center gap-2 rounded-xl border border-border px-5 py-2.5 text-xs font-semibold text-foreground hover:bg-background transition-colors cursor-pointer"
            >
              <span>Back to Home</span>
            </button>
          </div>
        </div>
      </section>
    );
  }

  // -------------------------------------------------------------
  // RENDER: Role-Aware Portal UI
  // -------------------------------------------------------------
  return (
    <section className="mx-auto max-w-[1200px] px-4 sm:px-6 pt-4 pb-12">
      {/* 1. PORTAL HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight text-heading">
              {isDoctor
                ? "Rheumatology Referral Review"
                : isParamedicNurse
                  ? "Rheumatology Appointment Scheduling"
                  : isAdmin
                    ? "Rheumatology Oversight"
                    : "Rheumatology Request Portal"}
            </h2>
            {isDoctor && (
              <span className="rounded-md bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                Doctor Mode
              </span>
            )}
            {isParamedicNurse && (
              <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                Paramedic Mode
              </span>
            )}
            {isAdmin && (
              <span className="rounded-md bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                Admin Oversight
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {isDoctor
              ? "Review clinical referrals and provide appointment instructions • Hospital Sultan Ismail"
              : isParamedicNurse
                ? "Schedule blood-taking and doctor review appointments according to clinical orders"
                : isAdmin
                  ? "Centralized administrative tracking and status oversight across all healthcare facilities"
                  : "Clinical Consultations & Joint Disease Clinic • Hospital Sultan Ismail"}
          </p>
        </div>

        {/* Facility Tab Toggle (Only shown for facility users) */}
        {!isDoctor && !isParamedicNurse && !isAdmin && (
          <div className="flex gap-2 rounded-lg border border-border bg-surface p-1">
            <button
              type="button"
              onClick={() => setActiveTab("request")}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                activeTab === "request"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Send className="h-4 w-4" />
              Book Referral
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("tracker")}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                activeTab === "tracker"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ClipboardList className="h-4 w-4" />
              Track Referrals ({referrals.length})
            </button>
          </div>
        )}
      </div>

      {/* 2. SUBMISSION SUCCESS BANNER */}
      {submittedBanner && (
        <div
          className={`mt-6 rounded-xl border border-emerald-300 bg-emerald-50 p-4 sm:p-5 transition-all duration-1000 ease-in-out dark:border-emerald-800 dark:bg-emerald-950/40 ${
            isFadingOut
              ? "opacity-0 -translate-y-2 scale-95 pointer-events-none"
              : "opacity-100 translate-y-0 scale-100 animate-in fade-in slide-in-from-top-2"
          }`}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div>
                <h3 className="text-base font-bold text-emerald-800 dark:text-emerald-300">
                  Rheumatology Referral Submitted Successfully!
                </h3>
                <p className="mt-0.5 text-xs text-foreground">
                  Referral tracking number:{" "}
                  <span className="font-mono font-bold text-heading text-sm">
                    {submittedBanner.referralNumber}
                  </span>{" "}
                  for patient{" "}
                  <strong className="text-heading">{submittedBanner.patientName}</strong>. Status:{" "}
                  <span className="font-semibold text-sky-700 dark:text-sky-300">
                    Pending Doctor Review
                  </span>
                  . Awaiting clinical review by Rheumatology Specialist.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setSubmittedBanner(null);
                setIsFadingOut(false);
              }}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-emerald-100 hover:text-foreground transition-colors dark:hover:bg-emerald-900"
              title="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* 3. WORKSPACE SUMMARY METRIC CARDS (For Doctor, Paramedic, Admin) */}
      {(isDoctor || isParamedicNurse || isAdmin) && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-border bg-background p-4 shadow-xs">
            <p className="text-xs font-semibold text-muted-foreground">Pending Review</p>
            <p className="text-2xl font-bold text-sky-600 dark:text-sky-400 mt-1">
              {counts.pendingDoctor}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Awaiting doctor triage</p>
          </div>

          <div className="rounded-xl border border-border bg-background p-4 shadow-xs">
            <p className="text-xs font-semibold text-muted-foreground">Awaiting Scheduling</p>
            <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">
              {counts.awaitingScheduling}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Ready for paramedic</p>
          </div>

          <div className="rounded-xl border border-border bg-background p-4 shadow-xs">
            <p className="text-xs font-semibold text-muted-foreground">Scheduled</p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
              {counts.scheduled}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Appointments confirmed</p>
          </div>

          <div className="rounded-xl border border-border bg-background p-4 shadow-xs">
            <p className="text-xs font-semibold text-muted-foreground">Returned / Rejected</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
              {counts.returned + counts.rejected}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {counts.returned} returned • {counts.rejected} rejected
            </p>
          </div>
        </div>
      )}

      {/* 4. FACILITY BOOKING FORM (Only shown when activeTab === 'request' and user is facility) */}
      {activeTab === "request" && !isDoctor && !isParamedicNurse && !isAdmin && (
        <div className="mt-8 grid gap-8 lg:grid-cols-3">
          <form
            onSubmit={handleFacilitySubmit}
            className="rounded-xl border border-border bg-background p-6 lg:col-span-2 shadow-xs"
          >
            <div className="space-y-6">
              {/* Patient Details */}
              <div className="space-y-4">
                <h3 className="text-base font-bold text-heading border-b border-border pb-2 flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" />
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
                      placeholder="e.g. Ahmad bin Abdullah"
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
                        const sanitized = e.target.value.replace(/[^a-zA-Z0-9]/g, "");
                        setFormData({ ...formData, mrn: sanitized });
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

                  <div>
                    <label className="block text-xs font-semibold text-heading">
                      Patient Email <span className="text-muted-foreground">(Optional)</span>
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="e.g. patient@example.com"
                      className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  </div>
                </div>
              </div>

              {/* Clinical Referral Details */}
              <div className="space-y-4">
                <h3 className="text-base font-bold text-heading border-b border-border pb-2 flex items-center gap-2">
                  <Stethoscope className="h-4 w-4 text-primary" />
                  2. Referral & Clinical Details
                </h3>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-heading">
                      Procedure Modality
                    </label>
                    <input
                      type="text"
                      disabled
                      value="Rheumatology Clinical Consultation"
                      className="mt-1 w-full rounded-lg border border-border bg-surface/50 px-3 py-2 text-sm font-semibold text-muted-foreground"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-heading">
                      Urgency Level <span className="text-destructive">*</span>
                    </label>
                    <select
                      value={formData.urgency}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          urgency: e.target.value as "Routine" | "Urgent",
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                    >
                      <option value="Routine">Routine (Standard Specialized Review)</option>
                      <option value="Urgent">
                        Urgent (High Clinical Suspicion / Active Vasculitis)
                      </option>
                    </select>
                  </div>

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
                      Department / Ward <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.department}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                      placeholder="e.g. Outpatient Medical Clinic / KK"
                      className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                    {formErrors.department && (
                      <p className="mt-1 text-xs text-destructive">{formErrors.department}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-heading">
                    Clinical Indication & History of Joint / Connective Tissue Disease{" "}
                    <span className="text-destructive">*</span>
                  </label>
                  <textarea
                    rows={3}
                    value={formData.clinicalIndication}
                    onChange={(e) =>
                      setFormData({ ...formData, clinicalIndication: e.target.value })
                    }
                    placeholder="Describe joint pain distribution, morning stiffness duration, inflammatory markers, systemic features, previous DMARD therapy..."
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  {formErrors.clinicalIndication && (
                    <p className="mt-1 text-xs text-destructive">{formErrors.clinicalIndication}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-heading">
                    Working Diagnosis / Clinical Impression{" "}
                    <span className="text-destructive">*</span>
                  </label>
                  <textarea
                    rows={2}
                    value={formData.diagnosis}
                    onChange={(e) => setFormData({ ...formData, diagnosis: e.target.value })}
                    placeholder="e.g. Suspected Rheumatoid Arthritis, SLE with cutaneous manifestations, Seronegative Spondyloarthritis..."
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  {formErrors.diagnosis && (
                    <p className="mt-1 text-xs text-destructive">{formErrors.diagnosis}</p>
                  )}
                </div>
              </div>

              {/* Supporting Clinical Documents */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <h3 className="text-base font-bold text-heading flex items-center gap-2">
                    <Paperclip className="h-4 w-4 text-primary" />
                    3. Supporting Clinical Documents
                    <span className="text-xs font-normal text-muted-foreground">(Optional)</span>
                  </h3>
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary font-mono">
                    {selectedFiles.length}/{MAX_ATTACHMENTS_PER_REFERRAL}
                  </span>
                </div>

                <p className="text-xs text-muted-foreground">
                  Attach referral letters, previous specialist summaries, laboratory results (e.g.
                  FBC, ESR, CRP, ANA), or relevant imaging reports.
                  <br />
                  <span className="font-semibold text-heading">Accepted formats:</span> PDF, JPEG,
                  PNG • Max 10 MB per file • Up to 5 documents.
                </p>

                {/* Hidden input */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleAttachmentFilesSelected}
                  multiple
                  accept=".pdf,image/jpeg,image/png"
                  className="hidden"
                />

                {/* Dropzone / Upload button */}
                {selectedFiles.length < MAX_ATTACHMENTS_PER_REFERRAL && (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-surface/30 p-5 text-center cursor-pointer hover:border-primary/60 hover:bg-surface/60 transition-all"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary mb-2">
                      <Upload className="h-5 w-5" />
                    </div>
                    <p className="text-xs font-semibold text-heading">
                      Click to select clinical documents to attach
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      PDF documents or JPEG/PNG medical images (max 10 MB)
                    </p>
                  </div>
                )}

                {/* Selected Files List */}
                {selectedFiles.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-heading">
                      Selected Documents ({selectedFiles.length}):
                    </p>
                    <div className="divide-y divide-border/60 rounded-lg border border-border bg-surface/40">
                      {selectedFiles.map((file, idx) => {
                        const isPdf =
                          file.type === "application/pdf" ||
                          file.name.toLowerCase().endsWith(".pdf");
                        return (
                          <div
                            key={`${file.name}-${idx}`}
                            className="flex items-center justify-between p-2.5 text-xs"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                                  isPdf
                                    ? "bg-rose-100 text-rose-600 dark:bg-rose-950/50"
                                    : "bg-blue-100 text-blue-600 dark:bg-blue-950/50"
                                }`}
                              >
                                {isPdf ? (
                                  <FileText className="h-3.5 w-3.5" />
                                ) : (
                                  <ImageIcon className="h-3.5 w-3.5" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-heading">{file.name}</p>
                                <p className="text-[10px] text-muted-foreground font-mono">
                                  {formatAttachmentSize(file.size)}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveSelectedFile(idx)}
                              className="rounded-md p-1 text-muted-foreground hover:bg-rose-100 hover:text-rose-600 transition-colors dark:hover:bg-rose-950/50 cursor-pointer"
                              title="Remove file"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-border pt-4">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 shadow-xs"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Submitting Referral...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Submit Rheumatology Referral
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Right Info Box */}
          <div className="space-y-6">
            <div className="rounded-xl border border-border bg-surface p-5 shadow-xs">
              <h4 className="flex items-center gap-2 text-sm font-bold text-heading">
                <Info className="h-4 w-4 text-primary" />
                Clinic Referral Guidelines
              </h4>
              <ul className="mt-3 space-y-2.5 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span>
                    <strong>Specialist Triage:</strong> Every referral is clinically assessed by the
                    Rheumatology Doctor prior to scheduling.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span>
                    <strong>Two-Appointment Workflow:</strong> If prerequisite blood investigations
                    are required, a blood-taking date will precede the specialist consultation.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span>
                    <strong>Returned Referrals:</strong> If further history or test results are
                    needed, referrals can be promptly edited and resubmitted without losing
                    priority.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span>
                    <strong>Supporting Clinical Documents:</strong> Attach PDF documents or medical
                    images (referral letter, lab results, imaging summaries) to assist the
                    specialist in clinical assessment.
                  </span>
                </li>
              </ul>
            </div>

            <div className="rounded-xl border border-border bg-background p-5 shadow-xs">
              <h4 className="text-sm font-bold text-heading">Clinic Location</h4>
              <p className="mt-1 text-xs text-muted-foreground">
                Rheumatology Specialist Clinic, Level 2, Specialist Complex, Hospital Sultan Ismail,
                Johor Bahru
              </p>
              <div className="mt-3 rounded-lg border border-border bg-surface p-3 text-xs">
                <p className="font-semibold text-heading">Enquiries Extension:</p>
                <p className="text-primary font-mono font-medium">+60 7-356 5000 (Ext. 2441)</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. REFERRAL TRACKING & WORKSPACE LIST */}
      {(activeTab === "tracker" || isDoctor || isParamedicNurse || isAdmin) && (
        <div className="mt-8 space-y-6">
          {/* Doctor Workspace Tabs */}
          {isDoctor && (
            <div className="flex flex-wrap gap-2 border-b border-border pb-3">
              <button
                type="button"
                onClick={() => setDoctorActiveTab("pending")}
                className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition-colors ${
                  doctorActiveTab === "pending"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "border border-border bg-surface text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                <Clock className="h-3.5 w-3.5" />
                <span>Pending Review ({counts.pendingDoctor})</span>
              </button>

              <button
                type="button"
                onClick={() => setDoctorActiveTab("awaiting")}
                className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition-colors ${
                  doctorActiveTab === "awaiting"
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "border border-border bg-surface text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Awaiting Scheduling ({counts.awaitingScheduling})</span>
              </button>

              <button
                type="button"
                onClick={() => setDoctorActiveTab("scheduled")}
                className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition-colors ${
                  doctorActiveTab === "scheduled"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "border border-border bg-surface text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                <CalendarCheck className="h-3.5 w-3.5" />
                <span>Scheduled ({counts.scheduled})</span>
              </button>

              <button
                type="button"
                onClick={() => setDoctorActiveTab("returned")}
                className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition-colors ${
                  doctorActiveTab === "returned"
                    ? "bg-amber-600 text-white shadow-xs"
                    : "border border-border bg-surface text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                <AlertCircle className="h-3.5 w-3.5" />
                <span>Returned ({counts.returned})</span>
              </button>

              <button
                type="button"
                onClick={() => setDoctorActiveTab("rejected")}
                className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition-colors ${
                  doctorActiveTab === "rejected"
                    ? "bg-rose-600 text-white shadow-xs"
                    : "border border-border bg-surface text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                <XCircle className="h-3.5 w-3.5" />
                <span>Rejected ({counts.rejected})</span>
              </button>

              <button
                type="button"
                onClick={() => setDoctorActiveTab("all")}
                className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition-colors ${
                  doctorActiveTab === "all"
                    ? "bg-slate-700 text-white shadow-xs"
                    : "border border-border bg-surface text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                <ClipboardList className="h-3.5 w-3.5" />
                <span>All ({counts.total})</span>
              </button>
            </div>
          )}

          {/* Paramedic Workspace Tabs */}
          {isParamedicNurse && (
            <div className="flex flex-wrap gap-2 border-b border-border pb-3">
              <button
                type="button"
                onClick={() => setParamedicActiveTab("awaiting")}
                className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition-colors ${
                  paramedicActiveTab === "awaiting"
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "border border-border bg-surface text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Awaiting Scheduling ({counts.awaitingScheduling})</span>
              </button>

              <button
                type="button"
                onClick={() => setParamedicActiveTab("scheduled")}
                className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition-colors ${
                  paramedicActiveTab === "scheduled"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "border border-border bg-surface text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                <CalendarCheck className="h-3.5 w-3.5" />
                <span>Scheduled ({counts.scheduled})</span>
              </button>

              <button
                type="button"
                onClick={() => setParamedicActiveTab("all")}
                className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition-colors ${
                  paramedicActiveTab === "all"
                    ? "bg-slate-700 text-white shadow-xs"
                    : "border border-border bg-surface text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                <ClipboardList className="h-3.5 w-3.5" />
                <span>All ({counts.total})</span>
              </button>
            </div>
          )}

          {/* Search & Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-background p-4 shadow-xs">
            <div className="relative min-w-[260px] flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by patient name, referral number, MRN, diagnosis, facility..."
                className="w-full rounded-lg border border-border bg-surface pl-9 pr-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>

            {/* Generic Status Dropdown (ONLY shown for Facility and Admin; HIDDEN for Doctor and Paramedic) */}
            {!isDoctor && !isParamedicNurse && (
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Filter:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold outline-none"
                >
                  <option value="All">All Referrals ({referrals.length})</option>
                  <option value="Pending Doctor Review">Pending Doctor Review</option>
                  <option value="Awaiting Scheduling">Awaiting Scheduling</option>
                  <option value="Scheduled">Scheduled</option>
                  <option value="Returned to Facility">Returned for Info</option>
                  <option value="Rejected">Rejected</option>
                  {counts.legacy > 0 && (
                    <option value="Legacy">Legacy Records ({counts.legacy})</option>
                  )}
                </select>
              </div>
            )}
          </div>

          {/* Loading, Empty, and Error States */}
          {loading ? (
            <div className="rounded-xl border border-border bg-background p-12 text-center">
              <RefreshCw className="h-8 w-8 animate-spin text-primary mx-auto" />
              <p className="text-sm font-semibold text-heading mt-3">
                Loading Rheumatology records...
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Connecting to authoritative registry
              </p>
            </div>
          ) : subStatus === "permissionDenied" ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-8 text-center">
              <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
              <h3 className="text-sm font-bold text-destructive mt-2">Access Denied</h3>
              <p className="text-xs text-muted-foreground mt-1">
                You do not have authorization to view this Rheumatology dataset.
              </p>
            </div>
          ) : filteredReferrals.length === 0 ? (
            <div className="rounded-xl border border-border bg-background p-12 text-center">
              <ClipboardList className="h-8 w-8 text-muted-foreground mx-auto" />
              <h3 className="text-sm font-bold text-heading mt-2">No Referrals Found</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {searchQuery || statusFilter !== "All"
                  ? "No matching referrals found for current filters."
                  : "No Rheumatology referrals have been submitted yet."}
              </p>
            </div>
          ) : (
            /* Referral List / Cards */
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-background shadow-xs">
              {filteredReferrals.map((r) => {
                const isExpanded = expandedId === r.id;
                const displayRef = r.referralNumber || r.id;

                return (
                  <div
                    key={r.id}
                    className="border-b border-border/60 px-4 py-3.5 transition-colors hover:bg-surface/50"
                  >
                    {/* Top Summary Row */}
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs">
                      {/* Left: Referral Number, Patient Name, MRN, Facility Badge */}
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="font-mono text-xs font-bold text-primary">
                          {displayRef}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold text-heading">{r.patientName}</span>
                          <span className="text-xs font-mono text-muted-foreground">({r.mrn})</span>
                        </div>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            r.urgency === "Urgent"
                              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                              : "bg-surface text-muted-foreground border border-border/50"
                          }`}
                        >
                          {r.urgency}
                        </span>

                        {/* Facility Identifier for Doctor, Paramedic & Admin */}
                        {(isDoctor || isParamedicNurse || isAdmin) && (
                          <span className="rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                            {r.facilityName}
                          </span>
                        )}
                      </div>

                      {/* Right: Status Badge & Primary Action Buttons */}
                      <div className="flex flex-wrap items-center gap-2">
                        {renderStatusBadge(r.status)}

                        {/* DOCTOR ACTION: Review Referral */}
                        {isDoctor && r.status === "Pending Doctor Review" && (
                          <button
                            type="button"
                            onClick={() => openDoctorReviewModal(r)}
                            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-xs hover:opacity-90 transition-opacity"
                          >
                            <Stethoscope className="h-3.5 w-3.5" />
                            <span>Review Referral</span>
                          </button>
                        )}

                        {/* PARAMEDIC ACTION: Schedule */}
                        {isParamedicNurse && r.status === "Awaiting Scheduling" && (
                          <button
                            type="button"
                            onClick={() => openParamedicScheduleModal(r, false)}
                            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition-colors"
                          >
                            <CalendarCheck className="h-3.5 w-3.5" />
                            <span>Schedule Appointment</span>
                          </button>
                        )}

                        {/* PARAMEDIC ACTION: Reschedule */}
                        {isParamedicNurse && r.status === "Scheduled" && (
                          <button
                            type="button"
                            onClick={() => openParamedicScheduleModal(r, true)}
                            className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition-colors dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          >
                            <CalendarDays className="h-3.5 w-3.5" />
                            <span>Reschedule</span>
                          </button>
                        )}

                        {/* FACILITY ACTION: Edit & Resubmit when Returned */}
                        {!isDoctor &&
                          !isParamedicNurse &&
                          !isAdmin &&
                          r.status === "Returned to Facility" && (
                            <button
                              type="button"
                              onClick={() => openResubmitModal(r)}
                              className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-amber-700 transition-colors"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                              <span>Edit & Resubmit</span>
                            </button>
                          )}

                        {/* Details Toggle Button */}
                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : r.id)}
                          className="rounded-lg border border-border bg-surface p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                          title={isExpanded ? "Collapse" : "Expand Details"}
                        >
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* EXPANDED CLINICAL DETAILS */}
                    {isExpanded && (
                      <div className="mt-4 pt-3 border-t border-border/60 space-y-3.5 text-xs">
                        {/* Clinical Presentation Grid */}
                        <div className="grid gap-3 sm:grid-cols-2 bg-surface/40 p-3 rounded-lg border border-border/40">
                          <div>
                            <span className="font-bold text-heading">Referring Doctor: </span>
                            <span className="text-muted-foreground">
                              {r.referringDoctor || "N/A"} ({r.department || "Outpatient"})
                            </span>
                          </div>
                          <div>
                            <span className="font-bold text-heading">Submitted Date: </span>
                            <span className="text-muted-foreground font-mono">
                              {formatDisplayTimestamp(r.submittedAt || r.createdAt)}
                            </span>
                          </div>
                          <div className="sm:col-span-2">
                            <span className="font-bold text-heading">Clinical Indication: </span>
                            <span className="text-foreground">{r.clinicalIndication}</span>
                          </div>
                          <div className="sm:col-span-2">
                            <span className="font-bold text-heading">Working Diagnosis: </span>
                            <span className="text-foreground">{r.diagnosis}</span>
                          </div>
                        </div>

                        {/* DOCTOR REVIEW OUTCOME BANNER (If reviewed) */}
                        {r.doctorReviewStatus === "Reviewed" && (
                          <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-3 text-xs text-indigo-950 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="font-bold flex items-center gap-1.5">
                                <Stethoscope className="h-3.5 w-3.5 text-indigo-600" />
                                Doctor Review Assessment: {r.reviewTimeframe || "Routine"}
                              </span>
                              <span className="text-[11px] text-muted-foreground font-mono">
                                Reviewed: {formatDisplayTimestamp(r.reviewedAt)}
                              </span>
                            </div>

                            <div>
                              <span className="font-semibold">Required Investigations: </span>
                              <span className="font-mono">
                                {Array.isArray(r.requiredInvestigations) &&
                                r.requiredInvestigations.length > 0
                                  ? r.requiredInvestigations.join(", ")
                                  : "None (Direct consultation without prerequisite bloodwork)"}
                              </span>
                            </div>

                            {r.doctorInstructions && (
                              <div>
                                <span className="font-semibold">Doctor Instructions: </span>
                                <span>{r.doctorInstructions}</span>
                              </div>
                            )}

                            {r.reviewedByDoctorNameSnapshot && (
                              <div className="text-[11px] text-muted-foreground">
                                Reviewing Specialist: {r.reviewedByDoctorNameSnapshot}
                              </div>
                            )}
                          </div>
                        )}

                        {/* SCHEDULED DATES DISPLAY (If scheduled) */}
                        {r.status === "Scheduled" && (
                          <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="font-bold flex items-center gap-1.5">
                                <CalendarCheck className="h-3.5 w-3.5 text-emerald-600" />
                                Confirmed Rheumatology Appointments
                              </span>
                              <span className="text-[11px] text-muted-foreground font-mono">
                                Scheduled: {formatDisplayTimestamp(r.scheduledAt)}
                              </span>
                            </div>

                            <div className="grid gap-2 sm:grid-cols-2 pt-1">
                              <div className="bg-emerald-100/60 dark:bg-emerald-900/50 p-2 rounded-md">
                                <p className="font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1">
                                  <Stethoscope className="h-3 w-3" />
                                  Rheumatology Doctor Consultation:
                                </p>
                                <p className="font-mono font-bold text-sm mt-0.5 text-emerald-800 dark:text-emerald-300">
                                  {formatDisplayTimestamp(r.doctorAppointmentDate)}
                                </p>
                              </div>

                              <div className="bg-emerald-100/60 dark:bg-emerald-900/50 p-2 rounded-md">
                                <p className="font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1">
                                  <Syringe className="h-3 w-3" />
                                  Blood Taking Appointment:
                                </p>
                                <p className="font-mono font-bold text-sm mt-0.5 text-emerald-800 dark:text-emerald-300">
                                  {r.bloodTakingDate
                                    ? formatDisplayTimestamp(r.bloodTakingDate)
                                    : "Not Required"}
                                </p>
                              </div>
                            </div>

                            {r.scheduledByNameSnapshot && (
                              <p className="text-[11px] text-muted-foreground pt-1">
                                Scheduled By: {r.scheduledByNameSnapshot}
                              </p>
                            )}
                          </div>
                        )}

                        {/* RETURNED REASON DISPLAY */}
                        {r.status === "Returned to Facility" && r.returnReason && (
                          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200 space-y-1">
                            <p className="font-bold flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                              <AlertCircle className="h-3.5 w-3.5" />
                              Reason for Return to Facility:
                            </p>
                            <p className="pl-5">{r.returnReason}</p>
                            {r.reviewedByDoctorNameSnapshot && (
                              <p className="pl-5 text-[11px] text-muted-foreground">
                                Returned by: {r.reviewedByDoctorNameSnapshot}
                              </p>
                            )}
                          </div>
                        )}

                        {/* REJECTED REASON DISPLAY */}
                        {r.status === "Rejected" && r.rejectReason && (
                          <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200 space-y-1">
                            <p className="font-bold flex items-center gap-1.5 text-rose-800 dark:text-rose-300">
                              <XCircle className="h-3.5 w-3.5" />
                              Referral Rejection Reason:
                            </p>
                            <p className="pl-5">{r.rejectReason}</p>
                            {r.reviewedByDoctorNameSnapshot && (
                              <p className="pl-5 text-[11px] text-muted-foreground">
                                Rejected by: {r.reviewedByDoctorNameSnapshot}
                              </p>
                            )}
                          </div>
                        )}

                        {/* SUPPORTING CLINICAL DOCUMENTS (Facility, Doctor, Admin ONLY; Paramedics strictly blocked) */}
                        {!isParamedicNurse && (
                          <div className="pt-2">
                            <RheumatologyAttachmentsManager
                              referralId={r.id}
                              referralStatus={r.status}
                              referralFacilityId={r.facilityId}
                              userFacilityId={facilityId}
                              userRole={userRole}
                              isDoctor={isDoctor}
                              isAdmin={isAdmin}
                              isParamedicNurse={isParamedicNurse}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 6. DOCTOR REVIEW WORKSPACE MODAL */}
      {/* ------------------------------------------------------------- */}
      {doctorReviewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-background p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <h3 className="text-lg font-bold text-heading flex items-center gap-2">
                  <Stethoscope className="h-5 w-5 text-primary" />
                  Clinical Referral Review
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                  Referral: {doctorReviewTarget.referralNumber || doctorReviewTarget.id} • Facility:{" "}
                  {doctorReviewTarget.facilityName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDoctorReviewTarget(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Referral Information Summary */}
            <div className="mt-4 rounded-xl border border-border bg-surface/50 p-4 text-xs space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-muted-foreground font-semibold">Patient Name: </span>
                  <span className="font-bold text-heading">{doctorReviewTarget.patientName}</span>
                </div>
                <div>
                  <span className="text-muted-foreground font-semibold">IC / MRN: </span>
                  <span className="font-mono text-heading">{doctorReviewTarget.mrn}</span>
                </div>
                <div>
                  <span className="text-muted-foreground font-semibold">Contact: </span>
                  <span className="text-heading">{doctorReviewTarget.contactNumber}</span>
                </div>
                <div>
                  <span className="text-muted-foreground font-semibold">Referring Doctor: </span>
                  <span className="text-heading">
                    {doctorReviewTarget.referringDoctor || "N/A"} (
                    {doctorReviewTarget.department || "KK"})
                  </span>
                </div>
              </div>
              <div className="border-t border-border/40 pt-2">
                <span className="text-muted-foreground font-semibold">Clinical Indication: </span>
                <p className="mt-0.5 text-heading font-medium">
                  {doctorReviewTarget.clinicalIndication}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground font-semibold">Working Diagnosis: </span>
                <p className="mt-0.5 text-heading font-medium">{doctorReviewTarget.diagnosis}</p>
              </div>
            </div>

            {/* Supporting Clinical Document Attachments for Doctor Review */}
            <div className="mt-4">
              <RheumatologyAttachmentsManager
                referralId={doctorReviewTarget.id}
                referralStatus={doctorReviewTarget.status}
                referralFacilityId={doctorReviewTarget.facilityId}
                userFacilityId={facilityId}
                userRole={userRole}
                isDoctor={true}
                isAdmin={isAdmin}
                isParamedicNurse={false}
                isCompact={true}
              />
            </div>

            {/* Doctor Decision Form */}
            <form onSubmit={handleDoctorSubmit} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-heading mb-1.5">
                  Clinical Action Decision:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setReviewDecisionMode("accept")}
                    className={`rounded-lg py-2 px-3 text-xs font-bold border transition-colors ${
                      reviewDecisionMode === "accept"
                        ? "border-primary bg-primary text-primary-foreground shadow-xs"
                        : "border-border bg-surface text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Accept & Schedule
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewDecisionMode("return")}
                    className={`rounded-lg py-2 px-3 text-xs font-bold border transition-colors ${
                      reviewDecisionMode === "return"
                        ? "border-amber-500 bg-amber-500 text-white shadow-xs"
                        : "border-border bg-surface text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Return for Info
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewDecisionMode("reject")}
                    className={`rounded-lg py-2 px-3 text-xs font-bold border transition-colors ${
                      reviewDecisionMode === "reject"
                        ? "border-rose-600 bg-rose-600 text-white shadow-xs"
                        : "border-border bg-surface text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Reject Referral
                  </button>
                </div>
              </div>

              {/* ACTION: Accept & Proceed to Scheduling */}
              {reviewDecisionMode === "accept" && (
                <div className="space-y-4 pt-2 border-t border-border">
                  <div>
                    <label className="block text-xs font-semibold text-heading">
                      Recommended Review Timeframe: <span className="text-destructive">*</span>
                    </label>
                    <select
                      value={reviewTimeframe}
                      onChange={(e) => setReviewTimeframe(e.target.value as DoctorReviewTimeframe)}
                      className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                    >
                      {CONTROLLED_REVIEW_TIMEFRAMES.map((tf) => (
                        <option key={tf} value={tf}>
                          {tf}
                        </option>
                      ))}
                    </select>
                  </div>

                  {reviewTimeframe === "Other" && (
                    <div>
                      <label className="block text-xs font-semibold text-heading">
                        Specify Custom Timeframe: <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="text"
                        value={customTimeframe}
                        onChange={(e) => setCustomTimeframe(e.target.value)}
                        placeholder="e.g. In 9 months post-biopsy"
                        className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                        required
                      />
                    </div>
                  )}

                  {/* Required Investigations */}
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-heading">
                        Prerequisite Blood Investigations:
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={noInvestigationsRequired}
                          onChange={(e) => {
                            setNoInvestigationsRequired(e.target.checked);
                            if (e.target.checked) setSelectedInvestigations([]);
                          }}
                          className="rounded border-border"
                        />
                        <span>No prerequisite blood investigations</span>
                      </label>
                    </div>

                    {!noInvestigationsRequired && (
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        {CONTROLLED_INVESTIGATIONS.map((inv) => {
                          const checked = selectedInvestigations.includes(inv);
                          return (
                            <label
                              key={inv}
                              className={`flex items-center gap-2 rounded-lg border p-2 text-xs font-semibold cursor-pointer transition-colors ${
                                checked
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border bg-surface text-muted-foreground hover:bg-accent"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setNoInvestigationsRequired(false);
                                    setSelectedInvestigations([...selectedInvestigations, inv]);
                                  } else {
                                    setSelectedInvestigations(
                                      selectedInvestigations.filter((i) => i !== inv),
                                    );
                                  }
                                }}
                                className="sr-only"
                              />
                              <span className="font-mono">{inv}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {!noInvestigationsRequired && selectedInvestigations.length === 0 && (
                      <p className="mt-1.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                        * Please select one or more prerequisite investigations, or check &quot;No
                        prerequisite blood investigations&quot;.
                      </p>
                    )}
                  </div>

                  {/* Doctor Instructions */}
                  <div>
                    <label className="block text-xs font-semibold text-heading">
                      Appointment & Clinical Scheduling Instructions:
                    </label>
                    <textarea
                      rows={2}
                      value={doctorInstructions}
                      onChange={(e) => setDoctorInstructions(e.target.value)}
                      placeholder="e.g. Schedule blood tests 2 weeks before consultation. Bring prior hand X-rays."
                      className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  </div>
                </div>
              )}

              {/* ACTION: Return to Facility */}
              {reviewDecisionMode === "return" && (
                <div className="space-y-3 pt-2 border-t border-border">
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                    <p className="font-bold flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                      <AlertCircle className="h-4 w-4" />
                      Returning Referral for Additional Information
                    </p>
                    <p className="mt-1">
                      The referring facility will be notified with your feedback and may update the
                      clinical details and resubmit.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-heading">
                      Return Reason / Information Needed from Facility:{" "}
                      <span className="text-destructive">*</span>
                    </label>
                    <textarea
                      rows={3}
                      value={returnReason}
                      onChange={(e) => setReturnReason(e.target.value)}
                      placeholder="e.g. Please attach latest renal profile, complete blood count, and ANA titer results before specialist consultation."
                      className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                      required
                    />
                  </div>
                </div>
              )}

              {/* ACTION: Reject Referral */}
              {reviewDecisionMode === "reject" && (
                <div className="space-y-3 pt-2 border-t border-border">
                  <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
                    <p className="font-bold flex items-center gap-1.5 text-rose-800 dark:text-rose-300">
                      <XCircle className="h-4 w-4" />
                      Referral Rejection Warning
                    </p>
                    <p className="mt-1">
                      Rejection is terminal and closes this referral record. The referring facility
                      will not be able to resubmit this request.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-heading">
                      Clinical Rejection Reason: <span className="text-destructive">*</span>
                    </label>
                    <textarea
                      rows={3}
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="e.g. Condition is more appropriately managed by Orthopedic Clinic for mechanical osteoarthritis."
                      className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                      required
                    />
                  </div>
                </div>
              )}

              <div className="mt-6 flex justify-end gap-3 border-t border-border pt-4">
                <button
                  type="button"
                  onClick={() => setDoctorReviewTarget(null)}
                  className="rounded-lg border border-border bg-surface px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isDoctorSubmitting}
                  className={`rounded-lg px-5 py-2 text-xs font-bold text-white transition-opacity disabled:opacity-50 ${
                    reviewDecisionMode === "accept"
                      ? "bg-primary hover:opacity-90"
                      : reviewDecisionMode === "return"
                        ? "bg-amber-600 hover:bg-amber-700"
                        : "bg-rose-600 hover:bg-rose-700"
                  }`}
                >
                  {isDoctorSubmitting ? (
                    <RefreshCw className="h-4 w-4 animate-spin mx-auto" />
                  ) : reviewDecisionMode === "accept" ? (
                    "Approve for Scheduling"
                  ) : reviewDecisionMode === "return" ? (
                    "Confirm Return to Facility"
                  ) : (
                    "Confirm Rejection"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 7. PARAMEDIC SCHEDULING MODAL */}
      {/* ------------------------------------------------------------- */}
      {schedulingTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-background p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <h3 className="text-lg font-bold text-heading flex items-center gap-2">
                  <CalendarCheck className="h-5 w-5 text-emerald-600" />
                  {isRescheduling
                    ? "Reschedule Appointments"
                    : "Schedule Rheumatology Appointments"}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                  Referral: {schedulingTarget.referralNumber || schedulingTarget.id} • Patient:{" "}
                  {schedulingTarget.patientName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSchedulingTarget(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Doctor's Orders Highlight Box */}
            <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/70 p-4 text-xs dark:border-indigo-900 dark:bg-indigo-950/40 space-y-1.5">
              <p className="font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                <Stethoscope className="h-4 w-4 text-indigo-600" />
                Doctor's Clinical Recommendation:
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <span className="font-semibold text-muted-foreground">Timeframe: </span>
                  <span className="font-bold text-indigo-900 dark:text-indigo-200">
                    {schedulingTarget.reviewTimeframe || "Routine"}
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-muted-foreground">Prerequisite Tests: </span>
                  <span className="font-mono text-indigo-900 dark:text-indigo-200">
                    {Array.isArray(schedulingTarget.requiredInvestigations) &&
                    schedulingTarget.requiredInvestigations.length > 0
                      ? schedulingTarget.requiredInvestigations.join(", ")
                      : "None"}
                  </span>
                </div>
              </div>
              {schedulingTarget.doctorInstructions && (
                <div className="border-t border-indigo-200/60 pt-1.5 dark:border-indigo-900/60">
                  <span className="font-semibold text-muted-foreground">Instructions: </span>
                  <span className="text-indigo-950 dark:text-indigo-200">
                    {schedulingTarget.doctorInstructions}
                  </span>
                </div>
              )}
            </div>

            {/* Scheduling Inputs */}
            <form onSubmit={handleParamedicScheduleSubmit} className="mt-5 space-y-5">
              {/* Doctor Consultation Appointment (MANDATORY) */}
              <div className="space-y-2 rounded-xl border border-border bg-surface/30 p-4">
                <label className="block text-xs font-bold text-heading flex items-center gap-1.5">
                  <Stethoscope className="h-4 w-4 text-primary" />
                  1. Rheumatology Doctor Consultation Appointment{" "}
                  <span className="text-destructive">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-muted-foreground">
                      Date (YYYY-MM-DD):
                    </label>
                    <input
                      type="date"
                      value={docApptDate}
                      onChange={(e) => setDocApptDate(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary font-mono"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-muted-foreground">
                      Time Slot:
                    </label>
                    <select
                      value={docApptTime}
                      onChange={(e) => setDocApptTime(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary font-mono"
                    >
                      {docApptTime && !DOCTOR_TIME_SLOTS.includes(docApptTime) && (
                        <option value={docApptTime}>{docApptTime}</option>
                      )}
                      {DOCTOR_TIME_SLOTS.map((slot) => (
                        <option key={slot} value={slot}>
                          {slot}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Blood Taking Appointment (OPTIONAL) */}
              <div className="space-y-3 rounded-xl border border-border bg-surface/30 p-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-heading flex items-center gap-1.5">
                    <Syringe className="h-4 w-4 text-emerald-600" />
                    2. Prerequisite Blood-Taking Appointment (Optional)
                  </label>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasBloodTaking}
                      onChange={(e) => setHasBloodTaking(e.target.checked)}
                      className="rounded border-border"
                    />
                    <span>Requires Blood-Taking</span>
                  </label>
                </div>

                {hasBloodTaking ? (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-[11px] font-semibold text-muted-foreground">
                        Date (Must be on or before consultation):
                      </label>
                      <input
                        type="date"
                        value={bloodApptDate}
                        onChange={(e) => setBloodApptDate(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary font-mono"
                        required={hasBloodTaking}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-muted-foreground">
                        Time Slot:
                      </label>
                      <select
                        value={bloodApptTime}
                        onChange={(e) => setBloodApptTime(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary font-mono"
                      >
                        {bloodApptTime && !BLOOD_TIME_SLOTS.includes(bloodApptTime) && (
                          <option value={bloodApptTime}>{bloodApptTime}</option>
                        )}
                        {BLOOD_TIME_SLOTS.map((slot) => (
                          <option key={slot} value={slot}>
                            {slot}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    {isRescheduling
                      ? "Blood taking appointment will be cleared upon saving."
                      : "No blood-taking appointment will be scheduled."}
                  </p>
                )}
              </div>

              {scheduleError && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{scheduleError}</span>
                </div>
              )}

              <div className="mt-6 flex justify-end gap-3 border-t border-border pt-4">
                <button
                  type="button"
                  onClick={() => setSchedulingTarget(null)}
                  className="rounded-lg border border-border bg-surface px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSchedulingSubmitting}
                  className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  {isSchedulingSubmitting ? (
                    <RefreshCw className="h-4 w-4 animate-spin mx-auto" />
                  ) : isRescheduling ? (
                    "Save Reschedule"
                  ) : (
                    "Confirm Schedule"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 8. FACILITY EDIT & RESUBMIT MODAL */}
      {/* ------------------------------------------------------------- */}
      {resubmitTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-background p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <h3 className="text-lg font-bold text-heading flex items-center gap-2">
                  <Edit3 className="h-5 w-5 text-amber-600" />
                  Edit & Resubmit Referral
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                  Referral: {resubmitTarget.referralNumber || resubmitTarget.id}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setResubmitTarget(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Doctor's Return Feedback */}
            <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200 space-y-1">
              <p className="font-bold flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                <AlertCircle className="h-4 w-4" />
                Doctor's Feedback & Information Requested:
              </p>
              <p className="pl-5 font-medium">
                {resubmitTarget.returnReason || "Please provide updated clinical notes."}
              </p>
              {resubmitTarget.reviewedByDoctorNameSnapshot && (
                <p className="pl-5 text-[11px] text-muted-foreground">
                  Specialist: {resubmitTarget.reviewedByDoctorNameSnapshot}
                </p>
              )}
            </div>

            <form onSubmit={handleResubmitSubmit} className="mt-5 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 text-xs">
                <div>
                  <label className="block font-semibold text-heading">Patient Name:</label>
                  <input
                    type="text"
                    value={resubmitForm.patientName}
                    onChange={(e) =>
                      setResubmitForm({ ...resubmitForm, patientName: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-heading">Identification / MRN:</label>
                  <input
                    type="text"
                    value={resubmitForm.mrn}
                    onChange={(e) =>
                      setResubmitForm({
                        ...resubmitForm,
                        mrn: e.target.value.replace(/[^a-zA-Z0-9]/g, ""),
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-heading">Contact Phone:</label>
                  <input
                    type="tel"
                    value={resubmitForm.contactNumber}
                    onChange={(e) =>
                      setResubmitForm({ ...resubmitForm, contactNumber: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-heading">Email (Optional):</label>
                  <input
                    type="email"
                    value={resubmitForm.email}
                    onChange={(e) => setResubmitForm({ ...resubmitForm, email: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-heading">
                  Updated Clinical Indication & Lab Findings:{" "}
                  <span className="text-destructive">*</span>
                </label>
                <textarea
                  rows={3}
                  value={resubmitForm.clinicalIndication}
                  onChange={(e) =>
                    setResubmitForm({ ...resubmitForm, clinicalIndication: e.target.value })
                  }
                  placeholder="Provide requested lab results, ESR/CRP values, or additional medical history..."
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-heading">
                  Updated Impression / Diagnosis: <span className="text-destructive">*</span>
                </label>
                <textarea
                  rows={2}
                  value={resubmitForm.diagnosis}
                  onChange={(e) => setResubmitForm({ ...resubmitForm, diagnosis: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                  required
                />
              </div>

              {/* Supporting Clinical Documents Management for Resubmission */}
              <div className="mt-4">
                <RheumatologyAttachmentsManager
                  referralId={resubmitTarget.id}
                  referralStatus={resubmitTarget.status}
                  referralFacilityId={resubmitTarget.facilityId}
                  userFacilityId={facilityId}
                  userRole={userRole}
                  isDoctor={false}
                  isAdmin={isAdmin}
                  isParamedicNurse={false}
                  isCompact={true}
                />
              </div>

              <div className="mt-6 flex justify-end gap-3 border-t border-border pt-4">
                <button
                  type="button"
                  onClick={() => setResubmitTarget(null)}
                  className="rounded-lg border border-border bg-surface px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isResubmitting}
                  className="rounded-lg bg-primary px-5 py-2 text-xs font-bold text-primary-foreground shadow-xs hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {isResubmitting ? (
                    <RefreshCw className="h-4 w-4 animate-spin mx-auto" />
                  ) : (
                    "Resubmit to Doctor"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
