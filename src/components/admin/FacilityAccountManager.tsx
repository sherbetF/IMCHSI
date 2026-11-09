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
  ArrowLeft,
  ClipboardList,
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

// In-memory session cache to provide instant 0ms perceived loading on revisit
let cachedManagedAccountsData: ListManagedAccountsResponse | null = null;

export function FacilityAccountManager() {
  const { isAdmin } = useFacility();
  const [data, setData] = useState<ListManagedAccountsResponse | null>(
    () => cachedManagedAccountsData,
  );
  const [isLoading, setIsLoading] = useState<boolean>(() => !cachedManagedAccountsData);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"FACILITIES" | "STAFF" | "DOCTORS">("FACILITIES");

  // In-flight fetch deduplication ref to prevent duplicate calls from StrictMode or rapid re-renders
  const isFetchingRef = React.useRef<boolean>(false);

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
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setIsLoading(true);
    setError(null);
    try {
      const listManaged = httpsCallable<void, ListManagedAccountsResponse>(
        functions,
        "listManagedAccounts",
      );
      const result = await listManaged();
      cachedManagedAccountsData = result.data;
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
      isFetchingRef.current = false;
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
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            ACTIVE
          </span>
        );
      case "INACTIVE":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            INACTIVE
          </span>
        );
      case "NOT_CREATED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-surface text-muted-foreground border border-border">
            <XCircle className="w-3.5 h-3.5 text-muted-foreground" />
            NOT CREATED
          </span>
        );
      case "CONFLICT":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-destructive/15 text-destructive border border-destructive/30 animate-pulse">
            <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
            CONFLICT
          </span>
        );
      case "SECURITY_MISMATCH":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/15 text-purple-800 dark:text-purple-300 border border-purple-500/30">
            <AlertTriangle className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            SECURITY MISMATCH
          </span>
        );
      case "PARTIAL_MISSING_PROFILE":
      case "PARTIAL_MISSING_AUTH":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-500/15 text-orange-800 dark:text-orange-300 border border-orange-500/30">
            <AlertTriangle className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
            PARTIAL
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-surface text-muted-foreground border border-border">
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
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity shadow-xs cursor-pointer"
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
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-foreground bg-surface border border-border rounded-lg hover:bg-accent transition-colors shadow-xs cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5 text-primary" />
            Reset
          </button>
          <button
            onClick={() => setDisableTarget(target)}
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/15 border border-amber-500/30 rounded-lg hover:bg-amber-500/25 transition-colors shadow-xs cursor-pointer"
          >
            <Power className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
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
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-foreground bg-surface border border-border rounded-lg hover:bg-accent transition-colors shadow-xs cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5 text-primary" />
            Reset
          </button>
          <button
            onClick={() => setReactivateTarget(target)}
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/25 transition-colors shadow-xs cursor-pointer"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            Reactivate
          </button>
        </div>
      );
    }

    return (
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-destructive bg-destructive/15 border border-destructive/30 rounded-lg"
        title="This account requires manual investigation before changes can be made."
      >
        <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
        Manual Review
      </span>
    );
  };

  if (!isAdmin) {
    return (
      <section className="mx-auto max-w-[1200px] px-5 py-16 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4">
          <ShieldCheck className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-bold text-heading">Administrator Access Required</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          The Facility Account Manager requires an authenticated Administrator profile from the
          production database.
        </p>
        <button
          onClick={() => (window.location.href = "/")}
          className="mt-6 rounded-lg bg-primary px-6 py-2.5 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity cursor-pointer"
        >
          Return to Home
        </button>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-[1200px] px-5 pt-4 pb-12 space-y-6">
      {/* Header & Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-2xl font-bold text-heading">Facility Account Manager</h2>
            <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-400">
              Admin Access
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Non-Invasive Cardiovascular Laboratory • Hospital Sultan Ismail
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => (window.location.href = "/")}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-foreground hover:bg-accent transition-colors shadow-xs cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back</span>
          </button>
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Total Consumers */}
        <div className="rounded-xl border border-border bg-background p-4 shadow-xs transition-colors hover:border-primary/40">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            Total Consumers
          </p>
          <p className="font-mono text-2xl font-extrabold text-heading mt-1.5">
            {data?.summary ? data.summary.totalConsumers : 84}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">84 canonical</p>
        </div>

        {/* Active Consumers */}
        <div className="rounded-xl border border-border bg-background p-4 shadow-xs transition-colors hover:border-emerald-500/40">
          <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
            Active Consumers
          </p>
          <p className="font-mono text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1.5">
            {data?.summary ? (
              data.summary.activeConsumers
            ) : (
              <span className="inline-block w-8 h-7 bg-muted animate-pulse rounded" />
            )}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Healthy & ready</p>
        </div>

        {/* Paramedic */}
        <div className="rounded-xl border border-border bg-background p-4 shadow-xs transition-colors hover:border-primary/40">
          <p className="text-xs font-bold text-primary uppercase tracking-wider">Paramedic</p>
          <p className="font-mono text-2xl font-extrabold text-primary mt-1.5">
            {data?.summary ? (
              `${data.summary.activeStaff} / ${data.summary.totalStaff}`
            ) : (
              <span className="inline-block w-12 h-7 bg-muted animate-pulse rounded" />
            )}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Centralized scheduling</p>
        </div>

        {/* Doctor Accounts */}
        <div className="rounded-xl border border-border bg-background p-4 shadow-xs transition-colors hover:border-primary/40">
          <p className="text-xs font-bold text-primary uppercase tracking-wider">Doctor Accounts</p>
          <p className="font-mono text-2xl font-extrabold text-primary mt-1.5">
            {data?.summary ? (
              `${data.summary.activeDoctors ?? 0} / ${data.summary.totalDoctors ?? data.doctors?.length ?? 0}`
            ) : (
              <span className="inline-block w-12 h-7 bg-muted animate-pulse rounded" />
            )}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Rheumatology specialists</p>
        </div>

        {/* Inactive */}
        <div className="rounded-xl border border-border bg-background p-4 shadow-xs transition-colors hover:border-amber-500/40">
          <p className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
            Inactive
          </p>
          <p className="font-mono text-2xl font-extrabold text-amber-600 dark:text-amber-400 mt-1.5">
            {data?.summary ? (
              data.summary.inactiveConsumers + (data.summary.inactiveDoctors ?? 0)
            ) : (
              <span className="inline-block w-8 h-7 bg-muted animate-pulse rounded" />
            )}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Disabled accounts</p>
        </div>

        {/* Conflicts / Warn */}
        <div className="rounded-xl border border-border bg-background p-4 shadow-xs transition-colors hover:border-destructive/40">
          <p className="text-xs font-bold text-destructive uppercase tracking-wider">
            Conflicts / Warn
          </p>
          <p className="font-mono text-2xl font-extrabold text-destructive mt-1.5">
            {data?.summary ? (
              data.summary.conflictCount + data.summary.warningCount
            ) : (
              <span className="inline-block w-8 h-7 bg-muted animate-pulse rounded" />
            )}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Requires audit</p>
        </div>
      </div>

      {/* Role Navigation Tabs */}
      <div className="flex border-b border-border gap-2 overflow-x-auto pb-0">
        <button
          type="button"
          onClick={() => setActiveTab("FACILITIES")}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === "FACILITIES"
              ? "border-primary text-primary bg-surface/50 rounded-t-lg"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Consumer / Facility</span>
          <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-surface border border-border text-muted-foreground font-mono">
            {data?.summary.totalConsumers ?? 84}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("STAFF")}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === "STAFF"
              ? "border-primary text-primary bg-surface/50 rounded-t-lg"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Paramedic</span>
          <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-surface border border-border text-muted-foreground font-mono">
            {data?.summary.totalStaff ?? 1}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("DOCTORS")}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === "DOCTORS"
              ? "border-primary text-primary bg-surface/50 rounded-t-lg"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
          }`}
        >
          <Stethoscope className="w-4 h-4" />
          <span>Doctor Accounts</span>
          <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-surface border border-border text-primary font-mono font-semibold">
            {data?.doctors?.length ?? data?.summary.totalDoctors ?? 0}
          </span>
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-destructive">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-bold">Error Loading Managed Accounts</h4>
            <p className="text-xs mt-0.5 text-destructive/90">{error}</p>
          </div>
        </div>
      )}

      {/* SECTION 1: CONSUMER / FACILITY ACCOUNTS (84 Canonical Facilities) */}
      {activeTab === "FACILITIES" && (
        <div className="rounded-xl border border-border bg-background overflow-hidden shadow-xs space-y-0">
          <div className="p-4 sm:p-5 border-b border-border bg-surface/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold text-heading">
                    Facility / Consumer Accounts
                  </h2>
                  {isLoading && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-primary bg-primary/10 border border-primary/20 rounded-md animate-pulse">
                      <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                      Syncing
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  84 Canonical Healthcare Facilities across Johor
                </p>
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search facility name or ID..."
                  className="pl-9 pr-3 py-1.5 text-xs rounded-lg border border-border bg-surface text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary w-48 sm:w-60 shadow-2xs"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-surface text-foreground focus:outline-none focus:border-primary shadow-2xs cursor-pointer"
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
                  className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-surface text-foreground focus:outline-none focus:border-primary shadow-2xs cursor-pointer"
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
            <table className="min-w-full divide-y divide-border text-left text-sm">
              <thead className="bg-surface/50 text-muted-foreground text-xs uppercase font-bold tracking-wider border-b border-border">
                <tr>
                  <th className="py-3.5 px-4 sm:px-6">Facility</th>
                  <th className="py-3.5 px-4">Category</th>
                  <th className="py-3.5 px-4">Canonical ID</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 sm:px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-background">
                {isLoading && !data ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={`facility-skeleton-${i}`} className="animate-pulse">
                      <td className="py-3.5 px-4 sm:px-6">
                        <div className="h-4 bg-muted rounded w-44 mb-1.5" />
                        <div className="h-2.5 bg-muted/60 rounded w-24 sm:hidden" />
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="h-5 bg-muted/60 rounded-md w-24" />
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="h-3.5 bg-muted/60 rounded w-28 font-mono" />
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="h-6 bg-muted/60 rounded-full w-20" />
                      </td>
                      <td className="py-3.5 px-4 sm:px-6 text-right">
                        <div className="h-7 bg-muted/60 rounded-lg w-20 ml-auto" />
                      </td>
                    </tr>
                  ))
                ) : filteredConsumers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-muted-foreground text-xs">
                      No facility accounts match your search or filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredConsumers.map((item) => (
                    <tr key={item.facilityId} className="hover:bg-accent/40 transition-colors">
                      <td className="py-3.5 px-4 sm:px-6">
                        <div className="font-bold text-heading">{item.facilityName}</div>
                        <div className="text-xs text-muted-foreground sm:hidden font-mono mt-0.5">
                          {item.facilityId}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-block px-2 py-0.5 rounded-md text-xs font-semibold bg-surface border border-border text-foreground">
                          {item.category}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-muted-foreground">
                        {item.facilityId}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-1 items-start">
                          {getStatusBadge(item.status)}
                          <span className="text-[11px] text-muted-foreground max-w-xs truncate">
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
        <div className="rounded-xl border border-border bg-background overflow-hidden shadow-xs">
          <div className="p-4 sm:p-5 border-b border-border bg-surface/50 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-heading">Paramedic Account</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Centralized scheduling role responsible for all facility appointments
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-primary/10 text-primary border border-primary/20 rounded-lg">
              1 Centralized Account
            </span>
          </div>

          <div className="divide-y divide-border bg-background">
            {data?.staff && data.staff.length > 0 ? (
              data.staff.map((s) => (
                <div
                  key={s.accountKey}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-accent/40 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20">
                      <UserCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-heading">{s.displayName}</p>
                        {getStatusBadge(s.status)}
                      </div>
                      <p className="text-xs font-mono text-muted-foreground mt-0.5">
                        Key: {s.accountKey} • Role: Paramedic
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">{s.statusDetails}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {renderActionButtons("PARAMEDIC_NURSE", s.accountKey, s.displayName, s.status)}
                  </div>
                </div>
              ))
            ) : isLoading && !data ? (
              <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-pulse">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-muted shrink-0" />
                  <div className="space-y-2">
                    <div className="h-4 bg-muted rounded w-36" />
                    <div className="h-3 bg-muted/60 rounded w-48" />
                  </div>
                </div>
                <div className="h-7 bg-muted/60 rounded-lg w-20 shrink-0" />
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No staff accounts returned.
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 3: DOCTOR ACCOUNTS (Individual Rheumatology Doctors) */}
      {activeTab === "DOCTORS" && (
        <div className="rounded-xl border border-border bg-background overflow-hidden shadow-xs space-y-0">
          <div className="p-4 sm:p-5 border-b border-border bg-surface/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20">
                <Stethoscope className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-heading">Doctor Accounts</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Manage individual Rheumatology Doctor accounts
                </p>
              </div>
            </div>

            {/* Doctor Controls */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={doctorSearchQuery}
                  onChange={(e) => setDoctorSearchQuery(e.target.value)}
                  placeholder="Search doctor name or ID..."
                  className="pl-9 pr-3 py-1.5 text-xs rounded-lg border border-border bg-surface text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary w-44 sm:w-56 shadow-2xs"
                />
              </div>

              <select
                value={doctorStatusFilter}
                onChange={(e) => setDoctorStatusFilter(e.target.value)}
                className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-surface text-foreground focus:outline-none focus:border-primary shadow-2xs cursor-pointer"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="CONFLICT">Conflict</option>
                <option value="SECURITY_MISMATCH">Security Mismatch</option>
              </select>

              <button
                type="button"
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
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Create Doctor</span>
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
            <table className="min-w-full divide-y divide-border text-left text-sm">
              <thead className="bg-surface/50 text-muted-foreground text-xs uppercase font-bold tracking-wider border-b border-border">
                <tr>
                  <th className="py-3.5 px-4 sm:px-6">Doctor Name</th>
                  <th className="py-3.5 px-4">Doctor ID</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 sm:px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-background">
                {isLoading && !data ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={`doctor-skeleton-${i}`} className="animate-pulse">
                      <td className="py-3.5 px-4 sm:px-6">
                        <div className="h-4 bg-slate-200 rounded w-40" />
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="h-3.5 bg-slate-100 rounded w-24 font-mono" />
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="h-6 bg-muted/60 rounded-full w-20" />
                      </td>
                      <td className="py-3.5 px-4 sm:px-6 text-right">
                        <div className="h-7 bg-muted/60 rounded-lg w-20 ml-auto" />
                      </td>
                    </tr>
                  ))
                ) : filteredDoctors.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center">
                      <div className="max-w-sm mx-auto space-y-3">
                        <div className="w-12 h-12 rounded-xl bg-surface border border-border flex items-center justify-center mx-auto text-muted-foreground">
                          <Stethoscope className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-bold text-heading text-sm">
                            {doctorSearchQuery || doctorStatusFilter !== "ALL"
                              ? "No matching Doctor accounts"
                              : "No Doctor accounts have been created yet"}
                          </h3>
                          <p className="text-xs text-muted-foreground mt-1">
                            {doctorSearchQuery || doctorStatusFilter !== "ALL"
                              ? "Try clearing your search query or status filter."
                              : "Create a Rheumatology Doctor account to allow specialists to review incoming referrals."}
                          </p>
                        </div>
                        {!doctorSearchQuery && doctorStatusFilter === "ALL" && (
                          <button
                            type="button"
                            onClick={() => {
                              resetFormState();
                              setCreateTarget({
                                accountType: "DOCTOR",
                                identifier: "NEW_DOCTOR",
                                displayName: "",
                                currentStatus: "NOT_CREATED",
                              });
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity cursor-pointer"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            <span>Create First Doctor</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredDoctors.map((docItem) => (
                    <tr key={docItem.doctorId} className="hover:bg-accent/40 transition-colors">
                      <td className="py-3.5 px-4 sm:px-6">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary border border-primary/20 flex items-center justify-center font-bold text-xs shrink-0">
                            {docItem.displayName.replace(/^Dr\.?\s*/i, "").charAt(0) || "D"}
                          </div>
                          <div>
                            <div className="font-bold text-heading">{docItem.displayName}</div>
                            <div className="text-[11px] text-muted-foreground sm:hidden font-mono mt-0.5">
                              {docItem.doctorId}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-muted-foreground">
                        {docItem.doctorId}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-1 items-start">
                          {getStatusBadge(docItem.status)}
                          <span
                            className="text-[11px] text-muted-foreground max-w-xs truncate"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-background rounded-2xl max-w-md w-full p-6 shadow-2xl border border-border space-y-5 text-foreground">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0">
                  {createTarget.accountType === "DOCTOR" ? (
                    <Stethoscope className="w-5 h-5" />
                  ) : (
                    <UserPlus className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-heading">
                    {createTarget.accountType === "DOCTOR"
                      ? "Create Doctor Account"
                      : "Create Account"}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {createTarget.accountType === "DOCTOR"
                      ? "Rheumatology Specialist"
                      : createTarget.displayName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={resetFormState}
                disabled={isSubmitting}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {lastOperationSuccess ? (
              <div className="py-4 space-y-4">
                <div className="bg-emerald-500/15 border border-emerald-500/30 rounded-xl p-4 text-center space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                  <h4 className="font-bold text-emerald-800 dark:text-emerald-300">
                    {createTarget.accountType === "DOCTOR"
                      ? "Doctor Account Created Successfully"
                      : "Account Created Successfully"}
                  </h4>
                  <p className="text-xs text-emerald-800 dark:text-emerald-300">
                    The account for <strong>{createTarget.displayName || formDisplayName}</strong>{" "}
                    is now ready.
                  </p>
                </div>

                <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
                  {createTarget.accountType === "DOCTOR" && createdDoctorId && (
                    <div className="space-y-1">
                      <p className="text-[11px] font-bold text-heading uppercase tracking-wider">
                        Doctor ID (Login Identifier)
                      </p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-background border border-border rounded-lg px-3 py-2 font-mono text-sm text-heading select-all">
                          {createdDoctorId}
                        </div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(createdDoctorId);
                            toast.success("Doctor ID copied to clipboard");
                          }}
                          className="p-2 text-primary hover:bg-accent rounded-lg transition-colors border border-border shadow-2xs cursor-pointer"
                          title="Copy to clipboard"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-1">
                    <p className="text-[11px] font-bold text-heading uppercase tracking-wider">
                      {createTarget.accountType === "CONSUMER"
                        ? "Temporary Password"
                        : "Account Password"}
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-background border border-border rounded-lg px-3 py-2 font-mono text-sm text-heading select-all">
                        {formPassword}
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(formPassword);
                          toast.success("Password copied to clipboard");
                        }}
                        className="p-2 text-primary hover:bg-accent rounded-lg transition-colors border border-border shadow-2xs cursor-pointer"
                        title="Copy to clipboard"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[11px] font-bold text-destructive uppercase tracking-wider">
                      Important Security Note
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                      {createTarget.accountType === "DOCTOR"
                        ? "Make sure to securely copy or provide this initial password to the doctor. It will not be shown again."
                        : createTarget.accountType === "CONSUMER"
                          ? "Provide this temporary password securely to the facility. It will be required to create a new private password after signing in."
                          : "Warning: This password will not be shown again. Ensure you have copied it before closing."}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={resetFormState}
                  className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:opacity-90 transition-opacity cursor-pointer"
                >
                  Close Manager
                </button>
              </div>
            ) : (
              <form onSubmit={handleCreateAccount} className="space-y-4">
                {createTarget.accountType === "DOCTOR" ? (
                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1">
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
                      className="w-full text-sm border border-border bg-surface text-foreground rounded-lg px-3 py-2 placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Full name or professional title (2–100 characters). Doctor ID will be securely
                      generated on the server.
                    </p>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1">
                      Canonical Identity
                    </label>
                    <input
                      type="text"
                      disabled
                      value={createTarget.identifier}
                      className="w-full text-xs font-mono bg-surface border border-border rounded-lg px-3 py-2 text-muted-foreground"
                    />
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-foreground">
                      {createTarget.accountType === "CONSUMER"
                        ? "Temporary Password"
                        : "New Password"}
                    </label>
                    <button
                      type="button"
                      onClick={generateSecureRandomPassword}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline cursor-pointer"
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
                      className="w-full text-sm border border-border bg-surface text-foreground rounded-lg px-3 py-2 pr-10 placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {createTarget.accountType === "CONSUMER" && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      The facility will use this temporary password for the first login and will
                      then be required to create its own private password.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Confirm Password
                  </label>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={formConfirmPassword}
                    onChange={(e) => setFormConfirmPassword(e.target.value)}
                    required
                    placeholder="Re-enter password"
                    className="w-full text-sm border border-border bg-surface text-foreground rounded-lg px-3 py-2 placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                  />
                </div>

                <div className="bg-surface p-3 rounded-xl border border-border text-xs text-muted-foreground space-y-1">
                  <p className="font-semibold text-heading">Password Policy:</p>
                  <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground text-[11px]">
                    <li>Minimum 8 characters</li>
                    <li>At least one alphabetic letter</li>
                    <li>At least one numeric digit</li>
                    <li>Case-sensitive</li>
                  </ul>
                </div>

                {actionError && (
                  <div className="bg-destructive/15 text-destructive text-xs p-3 rounded-xl border border-destructive/30">
                    {actionError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={resetFormState}
                    disabled={isSubmitting}
                    className="px-4 py-2 text-xs font-semibold text-foreground bg-surface border border-border rounded-lg hover:bg-accent transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 text-xs font-bold text-primary-foreground bg-primary rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity shadow-sm flex items-center gap-1.5 cursor-pointer"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-background rounded-2xl max-w-md w-full p-6 shadow-2xl border border-border space-y-5 text-foreground">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-heading">
                    {resetTarget.accountType === "CONSUMER"
                      ? "Reset to Temporary Password"
                      : "Reset Password"}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {resetTarget.accountType === "DOCTOR"
                      ? `Doctor ${resetTarget.displayName}`
                      : resetTarget.displayName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={resetFormState}
                disabled={isSubmitting}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {lastOperationSuccess ? (
              <div className="py-4 space-y-4">
                <div className="bg-emerald-500/15 border border-emerald-500/30 rounded-xl p-4 text-center space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                  <h4 className="font-bold text-emerald-800 dark:text-emerald-300">
                    {resetTarget.accountType === "CONSUMER"
                      ? "Temporary Password Reset Successfully"
                      : "Password Reset Successfully"}
                  </h4>
                  <p className="text-xs text-emerald-800 dark:text-emerald-300">
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

                <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
                  <div className="space-y-1">
                    <p className="text-[11px] font-bold text-heading uppercase tracking-wider">
                      {resetTarget.accountType === "CONSUMER"
                        ? "Temporary Password"
                        : "New Password"}
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-background border border-border rounded-lg px-3 py-2 font-mono text-sm text-heading select-all">
                        {formPassword}
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(formPassword);
                          toast.success("Password copied to clipboard");
                        }}
                        className="p-2 text-primary hover:bg-accent rounded-lg transition-colors border border-border shadow-2xs cursor-pointer"
                        title="Copy to clipboard"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[11px] font-bold text-destructive uppercase tracking-wider">
                      Important Security Note
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                      Warning: This password will not be shown again. Ensure you have copied it
                      before closing.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={resetFormState}
                  className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:opacity-90 transition-opacity cursor-pointer"
                >
                  Close Manager
                </button>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    {resetTarget.accountType === "DOCTOR" ? "Doctor ID" : "Canonical Identity"}
                  </label>
                  <input
                    type="text"
                    disabled
                    value={resetTarget.identifier}
                    className="w-full text-xs font-mono bg-surface border border-border rounded-lg px-3 py-2 text-muted-foreground"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-foreground">
                      {resetTarget.accountType === "CONSUMER"
                        ? "New Temporary Password"
                        : "New Password"}
                    </label>
                    <button
                      type="button"
                      onClick={generateSecureRandomPassword}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline cursor-pointer"
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
                      className="w-full text-sm border border-border bg-surface text-foreground rounded-lg px-3 py-2 pr-10 placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Confirm New Password
                  </label>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={formConfirmPassword}
                    onChange={(e) => setFormConfirmPassword(e.target.value)}
                    required
                    placeholder="Re-enter new password"
                    className="w-full text-sm border border-border bg-surface text-foreground rounded-lg px-3 py-2 placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                  />
                </div>

                <div className="bg-surface p-3 rounded-xl border border-border text-xs text-muted-foreground space-y-1">
                  <p className="font-semibold text-heading">Password Policy:</p>
                  <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground text-[11px]">
                    <li>Minimum 8 characters</li>
                    <li>At least one alphabetic letter</li>
                    <li>At least one numeric digit</li>
                    <li>Case-sensitive</li>
                  </ul>
                </div>

                {resetTarget.currentStatus === "INACTIVE" && (
                  <div className="bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-300 p-3 rounded-xl text-xs">
                    <p className="font-semibold">Note for Inactive Account:</p>
                    <p className="mt-0.5">
                      Resetting the password updates credentials but does <strong>not</strong>{" "}
                      automatically reactivate the account. To restore login access, click
                      Reactivate separately.
                    </p>
                  </div>
                )}

                {actionError && (
                  <div className="bg-destructive/15 text-destructive text-xs p-3 rounded-xl border border-destructive/30">
                    {actionError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={resetFormState}
                    disabled={isSubmitting}
                    className="px-4 py-2 text-xs font-semibold text-foreground bg-surface border border-border rounded-lg hover:bg-accent transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 text-xs font-bold text-destructive-foreground bg-destructive rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity shadow-sm flex items-center gap-1.5 cursor-pointer"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-background rounded-2xl max-w-md w-full p-6 shadow-2xl border border-border space-y-4 text-foreground">
            <div className="flex items-center gap-3 text-amber-600">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                <Power className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-heading">
                  Disable {disableTarget.displayName}?
                </h3>
                <p className="text-xs text-muted-foreground font-mono">
                  {disableTarget.accountType === "DOCTOR"
                    ? `Doctor ID: ${disableTarget.identifier}`
                    : disableTarget.identifier}
                </p>
              </div>
            </div>

            <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed bg-amber-500/15 p-3 rounded-xl border border-amber-500/30">
              {disableTarget.accountType === "DOCTOR"
                ? "This Doctor will no longer be able to sign in or access Rheumatology referrals. Historical clinical attribution on reviewed referrals is preserved."
                : "This account will no longer be able to sign in to HospitalHub until reactivated by an administrator. Historical appointment records and canonical facility identity are preserved."}
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={resetFormState}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold text-foreground bg-surface border border-border rounded-lg hover:bg-accent transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleToggleActiveStatus(disableTarget, false)}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-bold text-destructive-foreground bg-destructive rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity shadow-sm flex items-center gap-1.5 cursor-pointer"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-background rounded-2xl max-w-md w-full p-6 shadow-2xl border border-border space-y-4 text-foreground">
            <div className="flex items-center gap-3 text-emerald-600">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-heading">
                  Reactivate {reactivateTarget.displayName}?
                </h3>
                <p className="text-xs text-muted-foreground font-mono">
                  {reactivateTarget.accountType === "DOCTOR"
                    ? `Doctor ID: ${reactivateTarget.identifier}`
                    : reactivateTarget.identifier}
                </p>
              </div>
            </div>

            <p className="text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed bg-emerald-500/15 p-3 rounded-xl border border-emerald-500/30">
              {reactivateTarget.accountType === "DOCTOR"
                ? "Reactivation restores sign-in and referral review access for this Doctor. Existing Doctor ID and historical records remain unchanged."
                : "Reactivation restores login access for this account. Current password is not changed."}
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={resetFormState}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold text-foreground bg-surface border border-border rounded-lg hover:bg-accent transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleToggleActiveStatus(reactivateTarget, true)}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-opacity shadow-sm flex items-center gap-1.5 cursor-pointer"
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
    </section>
  );
}
