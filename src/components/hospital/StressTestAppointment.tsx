import { useState, useEffect, useRef } from "react";
import {
  Calendar as CalendarIcon,
  Clock,
  Activity,
  User,
  Phone,
  AlertCircle,
  CheckCircle2,
  Send,
  Search,
  Filter,
  Info,
  Lock,
  Hospital,
  LogOut,
  CalendarCheck,
  FileCheck,
  Upload,
  FileText,
  X,
  Check,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useFacility } from "@/context/FacilityContext";
import {
  subscribeToAppointments,
  createAppointment,
  updateAppointment,
  seedInitialDataIfEmpty,
  AppointmentRecord,
} from "@/services/firebaseAppointments";

export type TestResultFile = {
  fileName: string;
  uploadedAt: string;
  summaryNotes: string;
};

export type StressTestRequest = AppointmentRecord;

export function StressTestAppointment() {
  const { selectedFacility, setSelectedFacility, isAdmin, setIsModalOpen } = useFacility();
  const [activeTab, setActiveTab] = useState<"request" | "tracker">(
    isAdmin ? "tracker" : "request",
  );
  const [requests, setRequests] = useState<StressTestRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittedRef, setSubmittedRef] = useState<StressTestRequest | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Admin schedule modal state
  const [schedulingReq, setSchedulingReq] = useState<StressTestRequest | null>(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [rawDate, setRawDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("09:00 AM");

  // Admin upload result modal state
  const [uploadingReq, setUploadingReq] = useState<StressTestRequest | null>(null);
  const [resultFileName, setResultFileName] = useState("");
  const [resultSummaryNotes, setResultSummaryNotes] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      const file = e.dataTransfer.files[0];
      setSelectedFile(file);
      setResultFileName(file.name);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setResultFileName(file.name);
    }
  };

  // Real-time Firestore sync with facility isolation
  useEffect(() => {
    seedInitialDataIfEmpty();
    setLoading(true);

    const unsub = subscribeToAppointments(
      "stress",
      selectedFacility ? selectedFacility.name : null,
      isAdmin,
      (data) => {
        setRequests(data);
        setLoading(false);
      },
    );

    return () => unsub();
  }, [selectedFacility, isAdmin]);

  // Switch to tracker tab automatically when in admin mode
  useEffect(() => {
    if (isAdmin) {
      setActiveTab("tracker");
    }
  }, [isAdmin]);

  // Auto-dismiss submitted reference banner after 3 seconds
  useEffect(() => {
    if (submittedRef) {
      const timer = setTimeout(() => {
        setSubmittedRef(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [submittedRef]);

  // Form State
  const [formData, setFormData] = useState({
    patientName: "",
    mrn: "",
    contactNumber: "",
    email: "",
    procedureType: "Exercise Stress Test (Treadmill)",
    urgency: "Routine" as StressTestRequest["urgency"],
    referringDoctor: "",
    department: "",
    clinicalIndication: "",
    diagnosis: "",
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

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
    if (!formData.department.trim()) errors.department = "Department is required";
    if (!formData.clinicalIndication.trim())
      errors.clinicalIndication = "Clinical indication is required";
    if (!formData.diagnosis.trim()) errors.diagnosis = "Diagnosis is required";

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setFormErrors({});

    const docName = formData.referringDoctor.trim();
    const deptName = formData.department.trim();
    const combinedRef = docName ? `${docName} (${deptName})` : deptName;

    const newReq: StressTestRequest = {
      id: `EST-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      facilityName: selectedFacility.name,
      facilityCategory: selectedFacility.category,
      patientName: formData.patientName.trim(),
      mrn: formData.mrn.trim(),
      contactNumber: formData.contactNumber.trim(),
      email: formData.email.trim() || "N/A",
      procedureType: "Exercise Stress Test (Treadmill)",
      urgency: formData.urgency,
      referringDoctor: combinedRef,
      department: deptName,
      clinicalIndication: formData.clinicalIndication.trim(),
      diagnosis: formData.diagnosis.trim(),
      status: "Pending Confirmation",
      createdAt: new Date().toISOString().replace("T", " ").substring(0, 16),
    };

    try {
      await createAppointment("stress", newReq);
      setSubmittedRef(newReq);

      // Reset Form
      setFormData({
        patientName: "",
        mrn: "",
        contactNumber: "",
        email: "",
        procedureType: "Exercise Stress Test (Treadmill)",
        urgency: "Routine",
        referringDoctor: "",
        department: "",
        clinicalIndication: "",
        diagnosis: "",
      });
    } catch (err) {
      console.error("Failed to create stress test request in Firebase:", err);
    }
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedulingReq || !scheduleDate) return;
    const fullSchedule = `${scheduleDate} @ ${scheduleTime}`;

    try {
      await updateAppointment("stress", schedulingReq.id, {
        scheduledDate: fullSchedule,
        status: "Scheduled",
      });
      setSchedulingReq(null);
      setScheduleDate("");
    } catch (err) {
      console.error("Failed to update stress test schedule in Firebase:", err);
    }
  };

  const handleSaveResult = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadingReq || !resultFileName) return;
    const newResult: TestResultFile = {
      fileName: resultFileName,
      uploadedAt: new Date().toISOString().replace("T", " ").substring(0, 16),
      summaryNotes: resultSummaryNotes.trim() || "Stress Test report attached.",
    };

    try {
      await updateAppointment("stress", uploadingReq.id, {
        resultFile: newResult,
        status: "Completed - Result Ready",
      });
      setUploadingReq(null);
      setResultFileName("");
      setResultSummaryNotes("");
      setSelectedFile(null);
    } catch (err) {
      console.error("Failed to upload stress test result to Firebase:", err);
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
          <h2 className="text-2xl font-bold text-heading">Exercise Stress Test Request Portal</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Non-Invasive Cardiovascular Laboratory • Hospital Sultan Ismail
          </p>
        </div>

        <div className="flex gap-2 rounded-lg border border-border bg-surface p-1">
          {!isAdmin && (
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
          )}
          <button
            onClick={() => setActiveTab("tracker")}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === "tracker" || isAdmin
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <CalendarCheck className="h-4 w-4" />
            Track Requests ({requests.length})
          </button>
        </div>
      </div>

      {/* Confirmation Banner */}
      {submittedRef && (
        <div className="mt-6 rounded-xl border border-success/30 bg-success-soft p-4 sm:p-5 transition-all duration-500 animate-in fade-in slide-in-from-top-2">
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
              onClick={() => setSubmittedRef(null)}
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
                      placeholder="e.g. Chong Wei Lian"
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
                      placeholder="e.g. 750410015541 or ID554109"
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
                      placeholder="e.g. +60 16-772 3891"
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
                      Procedure Modality
                    </label>
                    <input
                      type="text"
                      disabled
                      value="Exercise Stress Test (Treadmill)"
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
                          urgency: e.target.value as StressTestRequest["urgency"],
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                    >
                      <option value="Routine">Routine (Within 4–6 weeks)</option>
                      <option value="Urgent">Urgent (Within 1–2 weeks)</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:col-span-2 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-heading">
                        Referring Doctor
                      </label>
                      <input
                        type="text"
                        value={formData.referringDoctor}
                        onChange={(e) =>
                          setFormData({ ...formData, referringDoctor: e.target.value })
                        }
                        placeholder="e.g. Dr. Lim Wei Hong"
                        className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-heading">
                        Department <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.department}
                        onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                        placeholder="e.g. Cardiology Department"
                        className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                      />
                      {formErrors.department && (
                        <p className="mt-1 text-xs text-destructive">{formErrors.department}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-heading">
                    Clinical Indication & Cardiovascular Risk Profile{" "}
                    <span className="text-destructive">*</span>
                  </label>
                  <textarea
                    rows={3}
                    value={formData.clinicalIndication}
                    onChange={(e) =>
                      setFormData({ ...formData, clinicalIndication: e.target.value })
                    }
                    placeholder="Describe exertional symptoms, exercise tolerance, resting ECG baseline, risk factors (DM, HPT, Dyslipidemia)..."
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  {formErrors.clinicalIndication && (
                    <p className="mt-1 text-xs text-destructive">{formErrors.clinicalIndication}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-heading">
                    Diagnosis / Working Assessment <span className="text-destructive">*</span>
                  </label>
                  <textarea
                    rows={2}
                    value={formData.diagnosis}
                    onChange={(e) => setFormData({ ...formData, diagnosis: e.target.value })}
                    placeholder="e.g. Rule out Inducible Myocardial Ischemia / Angina Pectoris Assessment."
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
                Submit Stress Test Request
              </button>
            </div>
          </form>

          {/* Right Info Box */}
          <div className="space-y-6">
            <div className="rounded-xl border border-border bg-surface p-5">
              <h4 className="flex items-center gap-2 text-sm font-bold text-heading">
                <Info className="h-4 w-4 text-primary" />
                Lab Operational Guidelines
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
                    <strong>Stress Test Mode:</strong> Exercise Stress Treadmill Test (Bruce
                    Protocol) adult cardiac evaluation.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span>
                    <strong>Inpatient / Very Urgent Requests:</strong> Requests require direct
                    verbal call to the lab extension +60 7-356 5000 (Ext. 2215).
                  </span>
                </li>
                <li className="flex items-start gap-2 text-amber-600 dark:text-amber-400">
                  <span className="font-bold">•</span>
                  <span>
                    <strong>Reminder:</strong> Please ensure that the patient has been provided with
                    the Exercise Stress Test form and has signed the consent form.
                  </span>
                </li>
              </ul>
            </div>

            <div className="rounded-xl border border-border bg-background p-5">
              <h4 className="text-sm font-bold text-heading">Stress Test Room Location</h4>
              <p className="mt-1 text-xs text-muted-foreground">
                Room 10 , Internal Medicine Clinic , Level 2 , Hospital Sultan Ismail , Johor Bahru
              </p>
              <div className="mt-3 rounded-lg border border-border bg-surface p-3 text-xs">
                <p className="font-semibold text-heading">Enquiries Hotline:</p>
                <p className="text-primary font-mono font-medium">+60 7-356 5000 (Ext. 2215)</p>
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
                <option value="Completed - Result Ready">Completed - Result Ready</option>
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
                      <span className="font-mono text-xs font-bold text-primary">{r.id}</span>
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
                      {isAdmin && (
                        <span className="rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                          {r.facilityName}
                        </span>
                      )}
                    </div>

                    {/* Right: Status, Scheduled Date, Result Badge, Admin Actions, Toggle */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                          r.status === "Scheduled"
                            ? "bg-primary/20 text-primary border border-primary/30"
                            : r.status === "Completed - Result Ready"
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30"
                              : r.status === "Confirmed"
                                ? "bg-success-soft text-success"
                                : r.status === "Pending Confirmation"
                                  ? "bg-warning-soft text-warning"
                                  : "bg-accent text-accent-foreground"
                        }`}
                      >
                        {r.status}
                      </span>

                      {r.scheduledDate && (
                        <span className="hidden sm:flex items-center gap-1 rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary font-mono">
                          <CalendarCheck className="h-3 w-3" />
                          <span>{r.scheduledDate}</span>
                        </span>
                      )}

                      {/* Admin-only Controls: Schedule & Upload Result */}
                      {isAdmin && (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              setSchedulingReq(r);
                              const existingDate = r.scheduledDate?.split(" @ ")[0] || "";
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
                              setScheduleTime(r.scheduledDate?.split(" @ ")[1] || "09:00 AM");
                            }}
                            className="rounded-lg border border-primary/40 bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
                          >
                            {r.scheduledDate ? "Reschedule" : "Schedule"}
                          </button>

                          <button
                            onClick={() => {
                              setUploadingReq(r);
                              setResultFileName(
                                r.resultFile?.fileName ||
                                  `StressTest_Result_${r.patientName.replace(/\s+/g, "_")}.pdf`,
                              );
                              setResultSummaryNotes(r.resultFile?.summaryNotes || "");
                            }}
                            className="rounded-lg border border-emerald-600/40 bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white shadow-sm hover:opacity-90 transition-opacity"
                          >
                            {r.resultFile ? "Edit Result" : "Upload Result"}
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
                    <div className="mt-2.5 rounded-lg border border-border bg-surface/80 p-3 text-xs space-y-2 animate-in fade-in duration-150">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-muted-foreground">
                        <div>
                          <span className="font-bold text-heading">Procedure:</span>{" "}
                          {r.procedureType}
                        </div>
                        <div>
                          <span className="font-bold text-heading">Doctor:</span>{" "}
                          {r.referringDoctor || "N/A"}
                        </div>
                        <div>
                          <span className="font-bold text-heading">Contact:</span> {r.contactNumber}
                        </div>
                      </div>
                      <div>
                        <span className="font-bold text-heading">Diagnosis:</span>{" "}
                        <span className="text-foreground">{r.diagnosis}</span>
                      </div>
                      <div>
                        <span className="font-bold text-heading">Clinical Indication:</span>{" "}
                        <span className="text-foreground">{r.clinicalIndication}</span>
                      </div>

                      {r.resultFile && (
                        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2.5 text-xs text-emerald-700 dark:text-emerald-400 space-y-1">
                          <div className="flex items-center gap-1.5 font-bold">
                            <FileCheck className="h-3.5 w-3.5 shrink-0" />
                            <span>Attached Diagnostic Result: {r.resultFile.fileName}</span>
                            <span className="text-[10px] text-muted-foreground font-normal">
                              ({r.resultFile.uploadedAt})
                            </span>
                          </div>
                          {r.resultFile.summaryNotes && (
                            <p className="text-muted-foreground text-[11px]">
                              <strong>Findings / Notes:</strong> {r.resultFile.summaryNotes}
                            </p>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between border-t border-border/40 pt-1.5 text-[11px] text-muted-foreground">
                        <span>
                          Facility: {r.facilityName} ({r.facilityCategory || "Healthcare Facility"})
                        </span>
                        <span>Submitted: {r.createdAt}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {filteredRequests.length === 0 && (
              <div className="p-12 text-center text-sm text-muted-foreground">
                <AlertCircle className="mx-auto h-8 w-8 text-muted-foreground/50" />
                <p className="mt-2">
                  {loading
                    ? "Loading stress test appointments from Firebase..."
                    : "No appointment requests found matching your filter."}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Admin Scheduling Modal */}
      {schedulingReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-2xl border border-border bg-background shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-2 text-heading font-bold">
                <CalendarCheck className="h-5 w-5 text-primary" />
                <h3>Schedule Stress Test Appointment</h3>
              </div>
              <button
                onClick={() => setSchedulingReq(null)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-surface"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs space-y-1">
              <p className="font-bold text-heading">
                {schedulingReq.patientName} ({schedulingReq.mrn})
              </p>
              <p className="text-muted-foreground">
                Facility: <strong>{schedulingReq.facilityName}</strong>
              </p>
              <p className="text-muted-foreground">Procedure: {schedulingReq.procedureType}</p>
            </div>

            <form onSubmit={handleSaveSchedule} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-heading uppercase tracking-wider">
                  Select Appointment Date (dd/mm/yyyy)
                </label>
                <input
                  type="date"
                  required
                  value={rawDate}
                  onChange={(e) => {
                    const val = e.target.value;
                    setRawDate(val);
                    if (val) {
                      const [yyyy, mm, dd] = val.split("-");
                      setScheduleDate(`${dd}/${mm}/${yyyy}`);
                    } else {
                      setScheduleDate("");
                    }
                  }}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold outline-none focus:border-primary"
                />
                {scheduleDate && (
                  <p className="text-xs font-bold text-primary flex items-center gap-1.5 mt-1">
                    <CalendarCheck className="h-3.5 w-3.5" />
                    Selected Date: <span className="underline">{scheduleDate}</span> (dd/mm/yyyy)
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-heading uppercase tracking-wider">
                  Select Time Slot
                </label>
                <select
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold outline-none focus:border-primary"
                >
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

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSchedulingReq(null)}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-semibold hover:bg-surface"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90"
                >
                  <Check className="h-4 w-4" />
                  Save Schedule to Cloud
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Upload Result Modal */}
      {uploadingReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-2xl border border-border bg-background shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-2 text-heading font-bold">
                <Upload className="h-5 w-5 text-emerald-600" />
                <h3>Upload Stress Test Result</h3>
              </div>
              <button
                onClick={() => setUploadingReq(null)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-surface"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs space-y-1">
              <p className="font-bold text-heading">
                {uploadingReq.patientName} ({uploadingReq.mrn})
              </p>
              <p className="text-muted-foreground">
                Referring Facility: <strong>{uploadingReq.facilityName}</strong>
              </p>
            </div>

            <form onSubmit={handleSaveResult} className="space-y-4">
              {/* Drag and Drop / Device File Upload */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-heading uppercase tracking-wider">
                  Diagnostic Result Document (PDF / File)
                </label>

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                  className="hidden"
                />

                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`group cursor-pointer rounded-2xl border-2 border-dashed p-5 text-center transition-all ${
                    isDragging
                      ? "border-emerald-600 bg-emerald-500/10 scale-[1.01]"
                      : "border-border bg-surface hover:border-emerald-500/50 hover:bg-surface/80"
                  }`}
                >
                  {selectedFile || resultFileName ? (
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
                        <FileCheck className="h-6 w-6" />
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-sm font-bold text-heading break-all">
                          {selectedFile ? selectedFile.name : resultFileName}
                        </p>
                        {selectedFile && (
                          <p className="text-xs text-muted-foreground">
                            {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Device File
                            Attached
                          </p>
                        )}
                      </div>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:underline pt-1">
                        <Upload className="h-3.5 w-3.5" />
                        Click or drag another file to replace
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center space-y-2 py-2">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-emerald-500/10 group-hover:text-emerald-600 transition-colors">
                        <Upload className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-heading">
                          Drag & drop result file here
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          or{" "}
                          <span className="text-emerald-600 font-bold underline">
                            browse file from device
                          </span>
                        </p>
                      </div>
                      <p className="text-[11px] text-muted-foreground/70">
                        Supports PDF, DOC, DOCX, PNG, JPG (Max 25MB)
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-heading uppercase tracking-wider">
                  Report File Name / Document Title
                </label>
                <div className="relative">
                  <FileText className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    required
                    value={resultFileName}
                    onChange={(e) => setResultFileName(e.target.value)}
                    placeholder="e.g. StressTest_Report_Ahmad.pdf"
                    className="w-full rounded-xl border border-border bg-surface pl-9 pr-3 py-2 text-sm font-medium outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-heading uppercase tracking-wider">
                  Diagnostic Findings / Summary Remarks
                </label>
                <textarea
                  rows={3}
                  value={resultSummaryNotes}
                  onChange={(e) => setResultSummaryNotes(e.target.value)}
                  placeholder="e.g. Negative for inducible myocardial ischemia. Reached 94% target HR."
                  className="w-full rounded-xl border border-border bg-surface p-3 text-sm font-medium outline-none focus:border-emerald-600"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setUploadingReq(null)}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-semibold hover:bg-surface"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90"
                >
                  <Check className="h-4 w-4" />
                  Save & Publish Result to Cloud
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
