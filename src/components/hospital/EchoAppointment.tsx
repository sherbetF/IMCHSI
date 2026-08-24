import { useState, useEffect } from "react";
import {
  Calendar as CalendarIcon,
  Clock,
  Heart,
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
  Check,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useFacility } from "@/context/FacilityContext";
import {
  subscribeToAppointments,
  createAppointment,
  updateAppointment,
  AppointmentRecord,
} from "@/services/firebaseAppointments";

export type AppointmentRequest = AppointmentRecord;

export function EchoAppointment() {
  const { selectedFacility, setSelectedFacility, isAdmin, setIsModalOpen } = useFacility();
  const [activeTab, setActiveTab] = useState<"request" | "tracker">(
    isAdmin ? "tracker" : "request",
  );
  const [requests, setRequests] = useState<AppointmentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittedRef, setSubmittedRef] = useState<AppointmentRequest | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Admin schedule modal state
  const [schedulingReq, setSchedulingReq] = useState<AppointmentRequest | null>(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [rawDate, setRawDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("09:00 AM");

  // Form State
  const [formData, setFormData] = useState({
    patientName: "",
    mrn: "",
    contactNumber: "",
    email: "",
    procedureType: "Transthoracic Echocardiogram (TTE)",
    urgency: "Routine" as AppointmentRequest["urgency"],
    referringDoctor: "",
    department: "",
    clinicalIndication: "",
    diagnosis: "",
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  // Real-time Firestore sync with facility isolation
  useEffect(() => {
    setLoading(true);

    const unsub = subscribeToAppointments(
      "echo",
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

  // Auto-dismiss submitted reference banner after 3 seconds
  useEffect(() => {
    if (submittedRef) {
      const timer = setTimeout(() => {
        setSubmittedRef(null);
      }, 3000);
      return () => clearTimeout(timer);
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

    const newReq: AppointmentRequest = {
      id: `ECHO-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      facilityName: selectedFacility.name,
      facilityCategory: selectedFacility.category,
      patientName: formData.patientName.trim(),
      mrn: formData.mrn.trim(),
      contactNumber: formData.contactNumber.trim(),
      email: formData.email.trim() || "N/A",
      procedureType: "Transthoracic Echocardiogram (TTE)",
      urgency: formData.urgency,
      referringDoctor: combinedRef,
      department: deptName,
      clinicalIndication: formData.clinicalIndication.trim(),
      diagnosis: formData.diagnosis.trim(),
      status: "Pending Confirmation",
      createdAt: new Date().toISOString().replace("T", " ").substring(0, 16),
    };

    try {
      await createAppointment("echo", newReq);
      setSubmittedRef(newReq);

      // Reset Form
      setFormData({
        patientName: "",
        mrn: "",
        contactNumber: "",
        email: "",
        procedureType: "Transthoracic Echocardiogram (TTE)",
        urgency: "Routine",
        referringDoctor: "",
        department: "",
        clinicalIndication: "",
        diagnosis: "",
      });
    } catch (err) {
      console.error("Failed to create appointment in Firebase:", err);
    }
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedulingReq || !scheduleDate) return;
    const fullSchedule = `${scheduleDate} @ ${scheduleTime}`;

    try {
      await updateAppointment("echo", schedulingReq.id, {
        scheduledDate: fullSchedule,
        status: "Scheduled",
      });
      setSchedulingReq(null);
      setScheduleDate("");
    } catch (err) {
      console.error("Failed to update schedule in Firebase:", err);
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: AppointmentRequest["status"]) => {
    if (!isAdmin) return;
    try {
      await updateAppointment("echo", id, { status: newStatus });
    } catch (err) {
      console.error("Failed to update status:", err);
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
          <h2 className="text-2xl font-bold text-heading">Echocardiogram Request Portal</h2>
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

      {/* Confirmation Modal Banner after submission */}
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
                      Procedure Modality
                    </label>
                    <input
                      type="text"
                      disabled
                      value="Transthoracic Echocardiogram (TTE)"
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
                          urgency: e.target.value as AppointmentRequest["urgency"],
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
                        placeholder="e.g. Dr. Tan Ai Ling"
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
                        placeholder="e.g. Klinik Kesihatan Sultan Ismail"
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
                    Clinical Indication & History <span className="text-destructive">*</span>
                  </label>
                  <textarea
                    rows={3}
                    value={formData.clinicalIndication}
                    onChange={(e) =>
                      setFormData({ ...formData, clinicalIndication: e.target.value })
                    }
                    placeholder="Describe patient's symptoms, cardiovascular risks, murmur, prior ECG findings..."
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  {formErrors.clinicalIndication && (
                    <p className="mt-1 text-xs text-destructive">{formErrors.clinicalIndication}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-heading">
                    Diagnosis <span className="text-destructive">*</span>
                  </label>
                  <textarea
                    rows={2}
                    value={formData.diagnosis}
                    onChange={(e) => setFormData({ ...formData, diagnosis: e.target.value })}
                    placeholder="Provide primary working diagnosis (e.g. Hypertensive Heart Disease, Aortic Stenosis, Heart Failure)."
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
                    <strong>Echocardiogram Mode:</strong> Transthoracic Echocardiogram (TTE)
                    standard adult cardiac evaluation only.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span>
                    <strong>Inpatient / Very Urgent Requests:</strong> Requests require direct
                    verbal call to the lab extension +60 7-356 5000 (Ext. 2225).
                  </span>
                </li>
              </ul>
            </div>

            <div className="rounded-xl border border-border bg-background p-5">
              <h4 className="text-sm font-bold text-heading">Echo Room Location</h4>
              <p className="mt-1 text-xs text-muted-foreground">
                Room 15 , Internal Medicine Clinic , Level 2 , Hospital Sultan Ismail , Johor Bahru
              </p>
              <div className="mt-3 rounded-lg border border-border bg-surface p-3 text-xs">
                <p className="font-semibold text-heading">Enquiries Hotline:</p>
                <p className="text-primary font-mono font-medium">+60 7-356 5000 (Ext. 2225)</p>
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

                    {/* Right: Status, Scheduled Date, Action, Toggle */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                          r.status === "Scheduled"
                            ? "bg-primary/20 text-primary border border-primary/30"
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

                      {isAdmin && (
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
                      <div className="flex items-center justify-between border-t border-border/40 pt-1.5 text-[11px] text-muted-foreground">
                        <span>
                          Facility: {r.facilityName} ({r.facilityCategory || "Healthcare Facility"})
                        </span>
                        <span>Submitted: {r.createdAt}</span>
                      </div>

                      {isAdmin && (
                        <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-2">
                          <span className="font-bold text-heading">Admin Status Actions:</span>
                          <button
                            onClick={() => handleUpdateStatus(r.id, "Confirmed")}
                            className="rounded bg-success/10 px-2 py-1 text-[11px] font-bold text-success hover:bg-success/20"
                          >
                            Mark Confirmed
                          </button>
                          <button
                            onClick={() => handleUpdateStatus(r.id, "Under Review")}
                            className="rounded bg-amber-500/10 px-2 py-1 text-[11px] font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-500/20"
                          >
                            Under Review
                          </button>
                        </div>
                      )}
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
                    ? "Loading appointments from Firebase..."
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
                <h3>Schedule Echo Appointment</h3>
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
                Referring Facility: {schedulingReq.facilityName}
              </p>
              <p className="text-muted-foreground">
                Procedure: {schedulingReq.procedureType} • Urgency: {schedulingReq.urgency}
              </p>
            </div>

            <form onSubmit={handleSaveSchedule} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-heading">Select Date</label>
                <input
                  type="date"
                  value={rawDate}
                  onChange={(e) => {
                    setRawDate(e.target.value);
                    if (e.target.value) {
                      const [yyyy, mm, dd] = e.target.value.split("-");
                      setScheduleDate(`${dd}/${mm}/${yyyy}`);
                    } else {
                      setScheduleDate("");
                    }
                  }}
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-heading">Select Time Slot</label>
                <select
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
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
                  <option value="04:00 PM">04:00 PM</option>
                </select>
              </div>

              {scheduleDate && (
                <div className="rounded-lg border border-primary/20 bg-primary/10 p-2.5 text-xs text-primary font-mono text-center font-bold">
                  Scheduled for: {scheduleDate} @ {scheduleTime}
                </div>
              )}

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
                  disabled={!scheduleDate}
                  className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  <CalendarCheck className="h-4 w-4" />
                  <span>Save Schedule to Cloud</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
