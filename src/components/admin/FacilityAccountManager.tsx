import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  ShieldCheck,
  RefreshCw,
  Search,
  Building2,
  Users,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Lock,
  UserCheck,
  Activity,
  Filter,
  KeyRound,
  UserPlus,
  Power,
  Eye,
  EyeOff,
  Sparkles,
  X,
  Copy,
  Stethoscope,
} from "lucide-react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { useFacility } from "@/context/FacilityContext";
import { toast } from "sonner";

export type ManagedAccountStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "NOT_CREATED"
  | "PARTIAL_MISSING_PROFILE"
  | "PARTIAL_MISSING_AUTH"
  | "SECURITY_MISMATCH"
  | "CONFLICT";

export interface ManagedConsumerItem {
  facilityId: string;
  facilityName: string;
  category: string;
  accountType: "CONSUMER";
  status: ManagedAccountStatus;
  statusDetails: string;
}

export interface ManagedStaffItem {
  accountKey: string;
  displayName: string;
  role: "paramedic_nurse";
  accountType: "PARAMEDIC_NURSE";
  status: ManagedAccountStatus;
  statusDetails: string;
}

export interface ManagedDoctorItem {
  doctorId: string;
  displayName: string;
  role: "doctor";
  accountType: "DOCTOR";
  status: ManagedAccountStatus;
  statusDetails: string;
}

export interface ListManagedAccountsResponse {
  consumers: ManagedConsumerItem[];
  staff: ManagedStaffItem[];
  doctors?: ManagedDoctorItem[];
  summary: {
    totalConsumers: number;
    totalStaff: number;
    totalDoctors?: number;
    activeConsumers: number;
    activeStaff: number;
    activeDoctors?: number;
    inactiveConsumers: number;
    inactiveStaff: number;
    inactiveDoctors?: number;
    notCreatedConsumers: number;
    notCreatedStaff: number;
    conflictCount: number;
    warningCount: number;
  };
}

export interface ManagedAccountOperationResponse {
  success: boolean;
  message: string;
  accountType: "CONSUMER" | "PARAMEDIC_NURSE" | "DOCTOR";
  identifier: string;
  status: ManagedAccountStatus;
  auditLogged: boolean;
  warning?: string;
}

export interface CreateConsumerAccountPayload {
  accountType: "CONSUMER";
  facilityId: string;
  password: string;
}

export interface CreateStaffAccountPayload {
  accountType: "PARAMEDIC_NURSE";
  accountKey: string;
  password: string;
}

export interface CreateDoctorAccountPayload {
  accountType: "DOCTOR";
  displayName: string;
  password: string;
}

export interface ResetConsumerPasswordPayload {
  accountType: "CONSUMER";
  facilityId: string;
  newPassword: string;
}

export interface ResetStaffPasswordPayload {
  accountType: "PARAMEDIC_NURSE";
  accountKey: string;
  newPassword: string;
}

export interface ResetDoctorPasswordPayload {
  accountType: "DOCTOR";
  doctorId: string;
  newPassword: string;
}

export interface SetConsumerActiveStatusPayload {
  accountType: "CONSUMER";
  facilityId: string;
  active: boolean;
}

export interface SetStaffActiveStatusPayload {
  accountType: "PARAMEDIC_NURSE";
  accountKey: string;
  active: boolean;
}

export interface SetDoctorActiveStatusPayload {
  accountType: "DOCTOR";
  doctorId: string;
  active: boolean;
}

interface TargetAccountSelection {
  accountType: "CONSUMER" | "PARAMEDIC_NURSE" | "DOCTOR";
  identifier: string; // facilityId, accountKey, or doctorId
  displayName: string;
  currentStatus: ManagedAccountStatus;
}

export function FacilityAccountManager() {
  const { isAdmin } = useFacility();
  const [data, setData] = useState<ListManagedAccountsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"FACILITIES" | "STAFF" | "DOCTORS">("FACILITIES");

  // Facility filter state
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Doctor filter state
  const [doctorSearchQuery, setDoctorSearchQuery] = useState<string>("");
  const [doctorStatusFilter, setDoctorStatusFilter] = useState<string>("ALL");

  // Action Modals State
  const [createTarget, setCreateTarget] = useState<TargetAccountSelection | null>(null);
  const [resetTarget, setResetTarget] = useState<TargetAccountSelection | null>(null);
  const [disableTarget, setDisableTarget] = useState<TargetAccountSelection | null>(null);
  const [reactivateTarget, setReactivateTarget] = useState<TargetAccountSelection | null>(null);
  const [lastOperationSuccess, setLastOperationSuccess] = useState<boolean>(false);
  const [createdDoctorId, setCreatedDoctorId] = useState<string | null>(null);

  // Form inputs
  const [formDisplayName, setFormDisplayName] = useState<string>("");
  const [formPassword, setFormPassword] = useState<string>("");
  const [formConfirmPassword, setFormConfirmPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchManagedAccounts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const listManaged = httpsCallable<void, ListManagedAccountsResponse>(
        functions,
        "listManagedAccounts",
      );
      const result = await listManaged();
      setData(result.data);
    } catch (err: unknown) {
      const e = err as { message?: string; code?: string };
      console.error("Failed to load managed accounts from Firebase Functions:", err);
      setError(
        e.message ||
          "Unable to communicate with the Facility Account Manager callable function. Please ensure you are logged in as an authorized administrator.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      fetchManagedAccounts();
    }
  }, [isAdmin, fetchManagedAccounts]);

  const resetFormState = () => {
    setFormPassword("");
    setFormConfirmPassword("");
    setFormDisplayName("");
    setShowPassword(false);
    setActionError(null);
    setIsSubmitting(false);
    setCreateTarget(null);
    setResetTarget(null);
    setDisableTarget(null);
    setReactivateTarget(null);
    setLastOperationSuccess(false);
    setCreatedDoctorId(null);
  };

  // Cryptographically secure random password generator
  const generateSecureRandomPassword = () => {
    const letters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    const numbers = "23456789";
    const specials = "!@#$%^&*";
    const allChars = letters + numbers + specials;

    const array = new Uint8Array(16);
    crypto.getRandomValues(array);

    let generated = "";
    // Guarantee at least 1 uppercase, 1 lowercase, 1 number, 1 special
    generated += letters[array[0]! % 24]!;
    generated += letters[24 + (array[1]! % 24)]!;
    generated += numbers[array[2]! % numbers.length]!;
    generated += specials[array[3]! % specials.length]!;

    for (let i = 4; i < 16; i++) {
      generated += allChars[array[i]! % allChars.length]!;
    }

    setFormPassword(generated);
    setFormConfirmPassword(generated);
    setShowPassword(true);
  };

  // Password policy validation helper for client UX
  const validateClientPassword = (pwd: string) => {
    if (pwd.length < 8) return "Password must be at least 8 characters long.";
    if (!/[a-zA-Z]/.test(pwd)) return "Password must contain at least one letter.";
    if (!/[0-9]/.test(pwd)) return "Password must contain at least one number.";
    return null;
  };

  // Handle Create Account
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createTarget) return;

    if (createTarget.accountType === "DOCTOR") {
      const cleanName = formDisplayName.trim();
      if (cleanName.length < 2 || cleanName.length > 100) {
        setActionError("Doctor Display Name must be between 2 and 100 characters.");
        return;
      }
    }

    const pwdErr = validateClientPassword(formPassword);
    if (pwdErr) {
      setActionError(pwdErr);
      return;
    }

    if (formPassword !== formConfirmPassword) {
      setActionError("Password confirmation does not match.");
      return;
    }

    setIsSubmitting(true);
    setActionError(null);

    try {
      const createAccountCallable = httpsCallable<
        CreateConsumerAccountPayload | CreateStaffAccountPayload | CreateDoctorAccountPayload,
        ManagedAccountOperationResponse
      >(functions, "createManagedAccount");

      let payload:
        CreateConsumerAccountPayload | CreateStaffAccountPayload | CreateDoctorAccountPayload;
      if (createTarget.accountType === "CONSUMER") {
        payload = {
          accountType: "CONSUMER",
          facilityId: createTarget.identifier,
          password: formPassword,
        };
      } else if (createTarget.accountType === "PARAMEDIC_NURSE") {
        payload = {
          accountType: "PARAMEDIC_NURSE",
          accountKey: createTarget.identifier,
          password: formPassword,
        };
      } else {
        payload = {
          accountType: "DOCTOR",
          displayName: formDisplayName.trim(),
          password: formPassword,
        };
      }

      const result = await createAccountCallable(payload);
      if (createTarget.accountType === "DOCTOR" && result.data.identifier) {
        setCreatedDoctorId(result.data.identifier);
      }
      setLastOperationSuccess(true);
      toast.success(
        createTarget.accountType === "DOCTOR"
          ? "Doctor account created successfully."
          : result.data.message || "Account created successfully.",
      );
      if (result.data.warning) {
        toast.warning(result.data.warning);
      }
      await fetchManagedAccounts();
    } catch (err: unknown) {
      const e = err as { message?: string };
      console.error("Create account error:", err);
      setActionError(e.message || "Failed to create managed account.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Reset Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;

    const pwdErr = validateClientPassword(formPassword);
    if (pwdErr) {
      setActionError(pwdErr);
      return;
    }

    if (formPassword !== formConfirmPassword) {
      setActionError("Password confirmation does not match.");
      return;
    }

    setIsSubmitting(true);
    setActionError(null);

    try {
      const resetCallable = httpsCallable<
        ResetConsumerPasswordPayload | ResetStaffPasswordPayload | ResetDoctorPasswordPayload,
        ManagedAccountOperationResponse
      >(functions, "resetManagedAccountPassword");

      let payload:
        ResetConsumerPasswordPayload | ResetStaffPasswordPayload | ResetDoctorPasswordPayload;
      if (resetTarget.accountType === "CONSUMER") {
        payload = {
          accountType: "CONSUMER",
          facilityId: resetTarget.identifier,
          newPassword: formPassword,
        };
      } else if (resetTarget.accountType === "PARAMEDIC_NURSE") {
        payload = {
          accountType: "PARAMEDIC_NURSE",
          accountKey: resetTarget.identifier,
          newPassword: formPassword,
        };
      } else {
        payload = {
          accountType: "DOCTOR",
          doctorId: resetTarget.identifier,
          newPassword: formPassword,
        };
      }

      const result = await resetCallable(payload);
      setLastOperationSuccess(true);
      toast.success("Password reset successfully.");
      if (result.data.warning) {
        toast.warning(result.data.warning);
      }
      await fetchManagedAccounts();
    } catch (err: unknown) {
      const e = err as { message?: string };
      console.error("Reset password error:", err);
      setActionError(e.message || "Failed to reset password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Set Active Status (Disable / Reactivate)
  const handleToggleActiveStatus = async (
    target: TargetAccountSelection,
    newActiveState: boolean,
  ) => {
    setIsSubmitting(true);
    setActionError(null);

    try {
      const setStatusCallable = httpsCallable<
        SetConsumerActiveStatusPayload | SetStaffActiveStatusPayload | SetDoctorActiveStatusPayload,
        ManagedAccountOperationResponse
      >(functions, "setManagedAccountActiveStatus");

      let payload:
        SetConsumerActiveStatusPayload | SetStaffActiveStatusPayload | SetDoctorActiveStatusPayload;
      if (target.accountType === "CONSUMER") {
        payload = {
          accountType: "CONSUMER",
          facilityId: target.identifier,
          active: newActiveState,
        };
      } else if (target.accountType === "PARAMEDIC_NURSE") {
        payload = {
          accountType: "PARAMEDIC_NURSE",
          accountKey: target.identifier,
          active: newActiveState,
        };
      } else {
        payload = {
          accountType: "DOCTOR",
          doctorId: target.identifier,
          active: newActiveState,
        };
      }

      const result = await setStatusCallable(payload);
      toast.success(
        `Successfully ${newActiveState ? "reactivated" : "disabled"} account for ${target.displayName}`,
      );
      if (result.data.warning) {
        toast.warning(result.data.warning);
      }
      resetFormState();
      await fetchManagedAccounts();
    } catch (err: unknown) {
      const e = err as { message?: string };
      console.error("Status update error:", err);
      toast.error(e.message || "Failed to update account active status.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredConsumers = useMemo(() => {
    if (!data?.consumers) return [];
    return data.consumers.filter((c) => {
      const matchesSearch =
        c.facilityName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.facilityId.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = categoryFilter === "ALL" || c.category === categoryFilter;
      const matchesStatus = statusFilter === "ALL" || c.status === statusFilter;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [data?.consumers, searchQuery, categoryFilter, statusFilter]);

  const filteredDoctors = useMemo(() => {
    if (!data?.doctors) return [];
    return data.doctors.filter((d) => {
      const matchesSearch =
        d.displayName.toLowerCase().includes(doctorSearchQuery.toLowerCase()) ||
        d.doctorId.toLowerCase().includes(doctorSearchQuery.toLowerCase());
      const matchesStatus = doctorStatusFilter === "ALL" || d.status === doctorStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [data?.doctors, doctorSearchQuery, doctorStatusFilter]);

  const doctorStats = useMemo(() => {
    const docs = data?.doctors || [];
    const total = data?.summary?.totalDoctors ?? docs.length;
    const active = data?.summary?.activeDoctors ?? docs.filter((d) => d.status === "ACTIVE").length;
    const inactive =
      data?.summary?.inactiveDoctors ?? docs.filter((d) => d.status === "INACTIVE").length;
    const conflict = docs.filter(
      (d) => d.status === "CONFLICT" || d.status === "SECURITY_MISMATCH",
    ).length;
    return { total, active, inactive, conflict };
  }, [data?.doctors, data?.summary]);

  const getStatusBadge = (status: ManagedAccountStatus) => {
    switch (status) {
      case "ACTIVE":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            ACTIVE
          </span>
        );
      case "INACTIVE":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            INACTIVE
          </span>
        );
      case "NOT_CREATED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
            <XCircle className="w-3.5 h-3.5 text-slate-400" />
            NOT CREATED
          </span>
        );
      case "CONFLICT":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 animate-pulse">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            CONFLICT
          </span>
        );
      case "SECURITY_MISMATCH":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            <AlertTriangle className="w-3.5 h-3.5 text-purple-600" />
            SECURITY MISMATCH
          </span>
        );
      case "PARTIAL_MISSING_PROFILE":
      case "PARTIAL_MISSING_AUTH":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200">
            <AlertTriangle className="w-3.5 h-3.5 text-orange-600" />
            PARTIAL
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
            {status}
          </span>
        );
    }
  };

  const renderActionButtons = (
    accountType: "CONSUMER" | "PARAMEDIC_NURSE" | "DOCTOR",
    identifier: string,
    displayName: string,
    status: ManagedAccountStatus,
  ) => {
    const target: TargetAccountSelection = {
      accountType,
      identifier,
      displayName,
      currentStatus: status,
    };

    if (status === "NOT_CREATED") {
      if (accountType === "DOCTOR") return null;
      return (
        <button
          onClick={() => {
            resetFormState();
            setCreateTarget(target);
          }}
          disabled={isSubmitting}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 transition-colors shadow-2xs"
        >
          <UserPlus className="w-3.5 h-3.5" />
          Create Account
        </button>
      );
    }

    if (status === "ACTIVE") {
      return (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              resetFormState();
              setResetTarget(target);
            }}
            disabled={isSubmitting}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 transition-colors shadow-2xs"
          >
            <KeyRound className="w-3.5 h-3.5 text-slate-500" />
            Reset
          </button>
          <button
            onClick={() => setDisableTarget(target)}
            disabled={isSubmitting}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50 transition-colors shadow-2xs"
          >
            <Power className="w-3.5 h-3.5 text-amber-600" />
            Disable
          </button>
        </div>
      );
    }

    if (status === "INACTIVE") {
      return (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              resetFormState();
              setResetTarget(target);
            }}
            disabled={isSubmitting}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 transition-colors shadow-2xs"
          >
            <KeyRound className="w-3.5 h-3.5 text-slate-500" />
            Reset
          </button>
          <button
            onClick={() => setReactivateTarget(target)}
            disabled={isSubmitting}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 transition-colors shadow-2xs"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Reactivate
          </button>
        </div>
      );
    }

    return (
      <span
        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg"
        title="This account requires manual investigation before changes can be made."
      >
        <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
        Manual Review
      </span>
    );
  };

  if (!isAdmin) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 shadow-sm">
          <ShieldCheck className="w-12 h-12 text-amber-600 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-amber-900 mb-2">Administrator Access Required</h2>
          <p className="text-amber-700 text-sm max-w-md mx-auto">
            The Facility Account Manager requires an authenticated Administrator profile from the
            production database.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header & Status Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Facility Account Manager</h1>
              <p className="text-sm text-slate-500">
                Centralized account management for Consumer Facilities and Paramedic / Nurse roles
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchManagedAccounts}
            disabled={isLoading || isSubmitting}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors shadow-2xs"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh Status
          </button>
        </div>
      </div>

      {/* Summary Stat Cards */}
      {data?.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Total Consumers
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{data.summary.totalConsumers}</p>
            <p className="text-xs text-slate-400 mt-0.5">84 canonical</p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-xs font-medium text-emerald-600 uppercase tracking-wider">
              Active Consumers
            </p>
            <p className="text-2xl font-bold text-emerald-700 mt-1">
              {data.summary.activeConsumers}
            </p>
            <p className="text-xs text-emerald-600/70 mt-0.5">Healthy & ready</p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-xs font-medium text-blue-600 uppercase tracking-wider">
              Paramedic / Nurse
            </p>
            <p className="text-2xl font-bold text-blue-700 mt-1">
              {data.summary.activeStaff} / {data.summary.totalStaff}
            </p>
            <p className="text-xs text-blue-600/70 mt-0.5">Centralized scheduling</p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-xs font-medium text-indigo-600 uppercase tracking-wider">
              Doctor Accounts
            </p>
            <p className="text-2xl font-bold text-indigo-700 mt-1">
              {data.summary.activeDoctors ?? 0} /{" "}
              {data.summary.totalDoctors ?? data.doctors?.length ?? 0}
            </p>
            <p className="text-xs text-indigo-600/70 mt-0.5">Rheumatology specialists</p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-xs font-medium text-amber-600 uppercase tracking-wider">Inactive</p>
            <p className="text-2xl font-bold text-amber-700 mt-1">
              {data.summary.inactiveConsumers + (data.summary.inactiveDoctors ?? 0)}
            </p>
            <p className="text-xs text-amber-600/70 mt-0.5">Disabled accounts</p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-xs font-medium text-rose-600 uppercase tracking-wider">
              Conflicts / Warn
            </p>
            <p className="text-2xl font-bold text-rose-700 mt-1">
              {data.summary.conflictCount + data.summary.warningCount}
            </p>
            <p className="text-xs text-rose-600/70 mt-0.5">Requires audit</p>
          </div>
        </div>
      )}

      {/* Password Policy Banner */}
      <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-4 text-sm text-blue-950 flex items-start gap-3 shadow-2xs">
        <Lock className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="font-semibold text-blue-950">Managed Password Policy</p>
          <p className="text-blue-800 text-xs leading-relaxed">
            Minimum <strong>8 characters</strong>. Must contain at least <strong>one letter</strong>{" "}
            and <strong>one number</strong>. Passwords are case-sensitive and never stored in plain
            text or logged.
          </p>
        </div>
      </div>

      {/* Role Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-2 overflow-x-auto pb-0">
        <button
          type="button"
          onClick={() => setActiveTab("FACILITIES")}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
            activeTab === "FACILITIES"
              ? "border-blue-600 text-blue-700 bg-blue-50/50 rounded-t-xl font-semibold"
              : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Consumer / Facility</span>
          <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono">
            {data?.summary.totalConsumers ?? 84}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("STAFF")}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
            activeTab === "STAFF"
              ? "border-blue-600 text-blue-700 bg-blue-50/50 rounded-t-xl font-semibold"
              : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Paramedic / Nurse</span>
          <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono">
            {data?.summary.totalStaff ?? 1}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("DOCTORS")}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
            activeTab === "DOCTORS"
              ? "border-blue-600 text-blue-700 bg-blue-50/50 rounded-t-xl font-semibold"
              : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
          }`}
        >
          <Stethoscope className="w-4 h-4" />
          <span>Doctor Accounts</span>
          <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-mono font-semibold">
            {data?.doctors?.length ?? data?.summary.totalDoctors ?? 0}
          </span>
        </button>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl text-sm flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Error Loading Managed Accounts</p>
            <p className="text-xs mt-0.5 text-rose-700">{error}</p>
          </div>
        </div>
      )}

      {/* SECTION 1: CONSUMER / FACILITY ACCOUNTS (84 Canonical Facilities) */}
      {activeTab === "FACILITIES" && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm space-y-0">
          <div className="p-5 border-b border-slate-200 bg-slate-50/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <Building2 className="w-5 h-5 text-indigo-600" />
              <div>
                <h2 className="text-lg font-bold text-slate-900">Facility / Consumer Accounts</h2>
                <p className="text-xs text-slate-500">
                  84 Canonical Healthcare Facilities across Johor
                </p>
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search facility name or ID..."
                  className="pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-48 sm:w-60"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="text-xs border border-slate-300 rounded-xl px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="ALL">All Categories</option>
                  <option value="Hospital">Hospital</option>
                  <option value="Klinik Kesihatan">Klinik Kesihatan</option>
                  <option value="Klinik Kesihatan Ibu & Anak">KKIA</option>
                  <option value="Klinik Desa">Klinik Desa</option>
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="text-xs border border-slate-300 rounded-xl px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                  <option value="NOT_CREATED">Not Created</option>
                  <option value="CONFLICT">Conflict</option>
                </select>
              </div>
            </div>
          </div>

          {/* Table View */}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase font-semibold">
                <tr>
                  <th className="py-3.5 px-4 sm:px-6">Facility</th>
                  <th className="py-3.5 px-4">Category</th>
                  <th className="py-3.5 px-4">Canonical ID</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 sm:px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      <Activity className="w-6 h-6 animate-pulse mx-auto mb-2 text-blue-500" />
                      Checking canonical facility accounts...
                    </td>
                  </tr>
                ) : filteredConsumers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-slate-500 text-xs">
                      No facility accounts match your search or filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredConsumers.map((item) => (
                    <tr key={item.facilityId} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4 sm:px-6">
                        <div className="font-semibold text-slate-900">{item.facilityName}</div>
                        <div className="text-xs text-slate-400 sm:hidden font-mono mt-0.5">
                          {item.facilityId}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-block px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-700">
                          {item.category}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-500">
                        {item.facilityId}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-1 items-start">
                          {getStatusBadge(item.status)}
                          <span className="text-[11px] text-slate-400 max-w-xs truncate">
                            {item.statusDetails}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 sm:px-6 text-right">
                        <div className="flex items-center justify-end">
                          {renderActionButtons(
                            "CONSUMER",
                            item.facilityId,
                            item.facilityName,
                            item.status,
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
      )}

      {/* SECTION 2: PARAMEDIC / NURSE (Single Centralized Account) */}
      {activeTab === "STAFF" && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-5 border-b border-slate-200 bg-slate-50/60 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Users className="w-5 h-5 text-blue-600" />
              <div>
                <h2 className="text-lg font-bold text-slate-900">Paramedic / Nurse Account</h2>
                <p className="text-xs text-slate-500">
                  Centralized scheduling role responsible for all facility appointments
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-blue-100 text-blue-800 rounded-lg">
              1 Centralized Account
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {data?.staff && data.staff.length > 0 ? (
              data.staff.map((s) => (
                <div
                  key={s.accountKey}
                  className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-100/60 text-blue-700 flex items-center justify-center shrink-0">
                      <UserCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-900">{s.displayName}</p>
                        {getStatusBadge(s.status)}
                      </div>
                      <p className="text-xs font-mono text-slate-500 mt-0.5">
                        Key: {s.accountKey} • Role: Paramedic / Nurse
                      </p>
                      <p className="text-xs text-slate-600 mt-1">{s.statusDetails}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {renderActionButtons("PARAMEDIC_NURSE", s.accountKey, s.displayName, s.status)}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-sm text-slate-500">
                {isLoading ? "Loading staff account status..." : "No staff accounts returned."}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 3: DOCTOR ACCOUNTS (Individual Rheumatology Doctors) */}
      {activeTab === "DOCTORS" && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm space-y-0">
          <div className="p-5 border-b border-slate-200 bg-slate-50/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                <Stethoscope className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Doctor Accounts</h2>
                <p className="text-xs text-slate-500">
                  Manage individual Rheumatology Doctor accounts
                </p>
              </div>
            </div>

            {/* Doctor Controls */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={doctorSearchQuery}
                  onChange={(e) => setDoctorSearchQuery(e.target.value)}
                  placeholder="Search doctor name or ID..."
                  className="pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-44 sm:w-56"
                />
              </div>

              <select
                value={doctorStatusFilter}
                onChange={(e) => setDoctorStatusFilter(e.target.value)}
                className="text-xs border border-slate-300 rounded-xl px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="CONFLICT">Conflict</option>
                <option value="SECURITY_MISMATCH">Security Mismatch</option>
              </select>

              <button
                onClick={() => {
                  resetFormState();
                  setCreateTarget({
                    accountType: "DOCTOR",
                    identifier: "NEW_DOCTOR",
                    displayName: "",
                    currentStatus: "NOT_CREATED",
                  });
                }}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 transition-colors shadow-2xs"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Create Doctor
              </button>
            </div>
          </div>

          {/* Dedicated Sub-bar for Doctor Accounts Counters */}
          <div className="px-5 py-2.5 bg-slate-100/70 border-b border-slate-200 flex flex-wrap items-center gap-4 text-xs font-medium">
            <span className="text-slate-600">
              Total Doctors:{" "}
              <strong className="font-bold text-slate-900 font-mono">{doctorStats.total}</strong>
            </span>
            <span className="text-emerald-700 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Active: <strong className="font-bold font-mono">{doctorStats.active}</strong>
            </span>
            <span className="text-amber-700 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              Disabled / Inactive:{" "}
              <strong className="font-bold font-mono">{doctorStats.inactive}</strong>
            </span>
            {doctorStats.conflict > 0 && (
              <span className="text-rose-700 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                Conflicts / Audit:{" "}
                <strong className="font-bold font-mono">{doctorStats.conflict}</strong>
              </span>
            )}
          </div>

          {/* Table View */}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase font-semibold">
                <tr>
                  <th className="py-3.5 px-4 sm:px-6">Doctor Name</th>
                  <th className="py-3.5 px-4">Doctor ID</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 sm:px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {isLoading ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-slate-400">
                      <Activity className="w-6 h-6 animate-pulse mx-auto mb-2 text-blue-500" />
                      Loading Doctor accounts...
                    </td>
                  </tr>
                ) : filteredDoctors.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center">
                      <div className="max-w-sm mx-auto space-y-3">
                        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                          <Stethoscope className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-slate-800 text-sm">
                            {doctorSearchQuery || doctorStatusFilter !== "ALL"
                              ? "No matching Doctor accounts"
                              : "No Doctor accounts have been created yet"}
                          </h3>
                          <p className="text-xs text-slate-500 mt-1">
                            {doctorSearchQuery || doctorStatusFilter !== "ALL"
                              ? "Try clearing your search query or status filter."
                              : "Create a Rheumatology Doctor account to allow specialists to review incoming referrals."}
                          </p>
                        </div>
                        {!doctorSearchQuery && doctorStatusFilter === "ALL" && (
                          <button
                            onClick={() => {
                              resetFormState();
                              setCreateTarget({
                                accountType: "DOCTOR",
                                identifier: "NEW_DOCTOR",
                                displayName: "",
                                currentStatus: "NOT_CREATED",
                              });
                            }}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors shadow-2xs"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            Create First Doctor
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredDoctors.map((docItem) => (
                    <tr key={docItem.doctorId} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4 sm:px-6">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0">
                            {docItem.displayName.replace(/^Dr\.?\s*/i, "").charAt(0) || "D"}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900">
                              {docItem.displayName}
                            </div>
                            <div className="text-[11px] text-slate-400 sm:hidden font-mono mt-0.5">
                              {docItem.doctorId}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-500">
                        {docItem.doctorId}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-1 items-start">
                          {getStatusBadge(docItem.status)}
                          <span
                            className="text-[11px] text-slate-400 max-w-xs truncate"
                            title={docItem.statusDetails}
                          >
                            {docItem.statusDetails}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 sm:px-6 text-right">
                        <div className="flex items-center justify-end">
                          {renderActionButtons(
                            "DOCTOR",
                            docItem.doctorId,
                            docItem.displayName,
                            docItem.status,
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
      )}

      {/* CREATE ACCOUNT MODAL */}
      {createTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  {createTarget.accountType === "DOCTOR" ? (
                    <Stethoscope className="w-5 h-5" />
                  ) : (
                    <UserPlus className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {createTarget.accountType === "DOCTOR"
                      ? "Create Doctor Account"
                      : "Create Account"}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {createTarget.accountType === "DOCTOR"
                      ? "Rheumatology Specialist"
                      : createTarget.displayName}
                  </p>
                </div>
              </div>
              <button
                onClick={resetFormState}
                disabled={isSubmitting}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {lastOperationSuccess ? (
              <div className="py-4 space-y-4">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                  <h4 className="font-bold text-emerald-900">
                    {createTarget.accountType === "DOCTOR"
                      ? "Doctor Account Created Successfully"
                      : "Account Created Successfully"}
                  </h4>
                  <p className="text-xs text-emerald-800">
                    The account for <strong>{createTarget.displayName || formDisplayName}</strong>{" "}
                    is now ready.
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  {createTarget.accountType === "DOCTOR" && createdDoctorId && (
                    <div className="space-y-1">
                      <p className="text-[11px] font-bold text-slate-900 uppercase tracking-wider">
                        Doctor ID (Login Identifier)
                      </p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-2 font-mono text-sm text-slate-800 select-all">
                          {createdDoctorId}
                        </div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(createdDoctorId);
                            toast.success("Doctor ID copied to clipboard");
                          }}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-blue-100 shadow-2xs"
                          title="Copy to clipboard"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-1">
                    <p className="text-[11px] font-bold text-slate-900 uppercase tracking-wider">
                      {createTarget.accountType === "CONSUMER"
                        ? "Temporary Password"
                        : "Account Password"}
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-2 font-mono text-sm text-slate-800 select-all">
                        {formPassword}
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(formPassword);
                          toast.success("Password copied to clipboard");
                        }}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-blue-100 shadow-2xs"
                        title="Copy to clipboard"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[11px] font-bold text-slate-900 uppercase tracking-wider text-rose-600">
                      Important Security Note
                    </p>
                    <p className="text-xs text-slate-600 leading-relaxed font-medium">
                      {createTarget.accountType === "DOCTOR"
                        ? "Make sure to securely copy or provide this initial password to the doctor. It will not be shown again."
                        : createTarget.accountType === "CONSUMER"
                          ? "Provide this temporary password securely to the facility. It will be required to create a new private password after signing in."
                          : "Warning: This password will not be shown again. Ensure you have copied it before closing."}
                    </p>
                  </div>
                </div>

                <button
                  onClick={resetFormState}
                  className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors"
                >
                  Close Manager
                </button>
              </div>
            ) : (
              <form onSubmit={handleCreateAccount} className="space-y-4">
                {createTarget.accountType === "DOCTOR" ? (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Doctor Display Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formDisplayName}
                      onChange={(e) => setFormDisplayName(e.target.value)}
                      required
                      placeholder="e.g. Dr. Sarah Jenkins"
                      minLength={2}
                      maxLength={100}
                      className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Full name or professional title (2–100 characters). Doctor ID will be securely
                      generated on the server.
                    </p>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Canonical Identity
                    </label>
                    <input
                      type="text"
                      disabled
                      value={createTarget.identifier}
                      className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-500"
                    />
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700">
                      {createTarget.accountType === "CONSUMER"
                        ? "Temporary Password"
                        : "New Password"}
                    </label>
                    <button
                      type="button"
                      onClick={generateSecureRandomPassword}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Auto Generate
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      required
                      placeholder={
                        createTarget.accountType === "CONSUMER"
                          ? "Enter temporary password"
                          : "Enter secure password"
                      }
                      className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {createTarget.accountType === "CONSUMER" && (
                    <p className="text-[11px] text-slate-500 mt-1">
                      The facility will use this temporary password for the first login and will
                      then be required to create its own private password.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Confirm Password
                  </label>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={formConfirmPassword}
                    onChange={(e) => setFormConfirmPassword(e.target.value)}
                    required
                    placeholder="Re-enter password"
                    className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
                  <p className="font-semibold text-slate-800">Password Policy:</p>
                  <ul className="list-disc pl-4 space-y-0.5 text-slate-600 text-[11px]">
                    <li>Minimum 8 characters</li>
                    <li>At least one alphabetic letter</li>
                    <li>At least one numeric digit</li>
                    <li>Case-sensitive</li>
                  </ul>
                </div>

                {actionError && (
                  <div className="bg-rose-50 text-rose-700 text-xs p-3 rounded-xl border border-rose-200">
                    {actionError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={resetFormState}
                    disabled={isSubmitting}
                    className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Creating...
                      </>
                    ) : createTarget.accountType === "DOCTOR" ? (
                      "Create Doctor"
                    ) : (
                      "Create Account"
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* RESET PASSWORD MODAL */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {resetTarget.accountType === "CONSUMER"
                      ? "Reset to Temporary Password"
                      : "Reset Password"}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {resetTarget.accountType === "DOCTOR"
                      ? `Doctor ${resetTarget.displayName}`
                      : resetTarget.displayName}
                  </p>
                </div>
              </div>
              <button
                onClick={resetFormState}
                disabled={isSubmitting}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {lastOperationSuccess ? (
              <div className="py-4 space-y-4">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                  <h4 className="font-bold text-emerald-900">
                    {resetTarget.accountType === "CONSUMER"
                      ? "Temporary Password Reset Successfully"
                      : "Password Reset Successfully"}
                  </h4>
                  <p className="text-xs text-emerald-800">
                    {resetTarget.accountType === "CONSUMER" ? (
                      "The facility must sign in using this temporary password and create a new private password before accessing HospitalHub."
                    ) : (
                      <>
                        The password for <strong>{resetTarget.displayName}</strong> has been
                        updated.
                      </>
                    )}
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="space-y-1">
                    <p className="text-[11px] font-bold text-slate-900 uppercase tracking-wider">
                      {resetTarget.accountType === "CONSUMER"
                        ? "Temporary Password"
                        : "New Password"}
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-2 font-mono text-sm text-slate-800 select-all">
                        {formPassword}
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(formPassword);
                          toast.success("Password copied to clipboard");
                        }}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-blue-100 shadow-2xs"
                        title="Copy to clipboard"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[11px] font-bold text-slate-900 uppercase tracking-wider text-rose-600">
                      Important Security Note
                    </p>
                    <p className="text-xs text-slate-600 leading-relaxed font-medium">
                      Warning: This password will not be shown again. Ensure you have copied it
                      before closing.
                    </p>
                  </div>
                </div>

                <button
                  onClick={resetFormState}
                  className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors"
                >
                  Close Manager
                </button>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {resetTarget.accountType === "DOCTOR" ? "Doctor ID" : "Canonical Identity"}
                  </label>
                  <input
                    type="text"
                    disabled
                    value={resetTarget.identifier}
                    className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700">
                      {resetTarget.accountType === "CONSUMER"
                        ? "New Temporary Password"
                        : "New Password"}
                    </label>
                    <button
                      type="button"
                      onClick={generateSecureRandomPassword}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Auto Generate
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      required
                      placeholder={
                        resetTarget.accountType === "CONSUMER"
                          ? "Enter new temporary password"
                          : "Enter new password"
                      }
                      className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Confirm New Password
                  </label>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={formConfirmPassword}
                    onChange={(e) => setFormConfirmPassword(e.target.value)}
                    required
                    placeholder="Re-enter new password"
                    className="w-full text-sm border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
                  <p className="font-semibold text-slate-800">Password Policy:</p>
                  <ul className="list-disc pl-4 space-y-0.5 text-slate-600 text-[11px]">
                    <li>Minimum 8 characters</li>
                    <li>At least one alphabetic letter</li>
                    <li>At least one numeric digit</li>
                    <li>Case-sensitive</li>
                  </ul>
                </div>

                {resetTarget.currentStatus === "INACTIVE" && (
                  <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-xl text-xs">
                    <p className="font-semibold">Note for Inactive Account:</p>
                    <p className="mt-0.5">
                      Resetting the password updates credentials but does <strong>not</strong>{" "}
                      automatically reactivate the account. To restore login access, click
                      Reactivate separately.
                    </p>
                  </div>
                )}

                {actionError && (
                  <div className="bg-rose-50 text-rose-700 text-xs p-3 rounded-xl border border-rose-200">
                    {actionError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={resetFormState}
                    disabled={isSubmitting}
                    className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 rounded-xl hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      "Reset Password"
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* DISABLE ACCOUNT CONFIRMATION DIALOG */}
      {disableTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                <Power className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Disable {disableTarget.displayName}?
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  {disableTarget.accountType === "DOCTOR"
                    ? `Doctor ID: ${disableTarget.identifier}`
                    : disableTarget.identifier}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed bg-amber-50/70 p-3 rounded-xl border border-amber-200">
              {disableTarget.accountType === "DOCTOR"
                ? "This Doctor will no longer be able to sign in or access Rheumatology referrals. Historical clinical attribution on reviewed referrals is preserved."
                : "This account will no longer be able to sign in to HospitalHub until reactivated by an administrator. Historical appointment records and canonical facility identity are preserved."}
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={resetFormState}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleToggleActiveStatus(disableTarget, false)}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 rounded-xl hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50 transition-colors flex items-center gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Disabling...
                  </>
                ) : (
                  "Confirm Disable"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REACTIVATE ACCOUNT CONFIRMATION DIALOG */}
      {reactivateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-emerald-600">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Reactivate {reactivateTarget.displayName}?
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  {reactivateTarget.accountType === "DOCTOR"
                    ? `Doctor ID: ${reactivateTarget.identifier}`
                    : reactivateTarget.identifier}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed bg-emerald-50/70 p-3 rounded-xl border border-emerald-200">
              {reactivateTarget.accountType === "DOCTOR"
                ? "Reactivation restores sign-in and referral review access for this Doctor. Existing Doctor ID and historical records remain unchanged."
                : "Reactivation restores login access for this account. Current password is not changed."}
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={resetFormState}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleToggleActiveStatus(reactivateTarget, true)}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 transition-colors flex items-center gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Reactivating...
                  </>
                ) : (
                  "Confirm Reactivate"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default FacilityAccountManager;
