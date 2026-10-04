import { useState, useEffect } from "react";
import {
  Hospital,
  Check,
  Building2,
  ChevronDown,
  ShieldCheck,
  Lock,
  ArrowLeft,
  ArrowRight,
  Search,
  X,
} from "lucide-react";
import jataNegaraLogo from "@/assets/jata-negara.svg";
import { FACILITIES_DATA, FacilityCategory } from "@/data/facilities";
import { useFacility } from "@/context/FacilityContext";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, updateDoc, collection, getDocs } from "firebase/firestore";
import { toast } from "sonner";

/**
 * Encrypts/hashes the password using SHA-256 securely in the browser.
 * Uses SubtleCrypto if available, with a bulletproof JS fallback.
 */
async function hashPassword(password: string): Promise<string> {
  if (typeof window !== "undefined" && window.crypto && window.crypto.subtle) {
    try {
      const msgBuffer = new TextEncoder().encode(password);
      const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch (e) {
      console.warn("Subtle crypto failed, falling back", e);
    }
  }
  // Standard pure JS robust hashing fallback (FNV-1a)
  let hash = 0x811c9dc5;
  for (let i = 0; i < password.length; i++) {
    hash ^= password.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Validates password strength (at least 8 characters, combination of letters and numbers)
 */
const validatePasswordStrength = (password: string): boolean => {
  if (password.length < 8) return false;
  const hasLetters = /[a-zA-Z]/.test(password);
  const hasNumbers = /[0-9]/.test(password);
  return hasLetters && hasNumbers;
};

/**
 * Validates admin password strength (at least 5 characters, no numbers)
 */
const validateAdminPasswordStrength = (password: string): boolean => {
  if (password.length < 5) return false;
  const hasNumbers = /[0-9]/.test(password);
  return !hasNumbers;
};

export function FacilitySelectModal() {
  const {
    selectedFacility,
    setSelectedFacility,
    isModalOpen,
    closeModal,
    modalStep,
    setModalStep,
    isAdmin,
  } = useFacility();

  const [selectedCategory, setSelectedCategory] = useState<FacilityCategory>(
    selectedFacility?.category && selectedFacility.category !== "Hospital Sultan Ismail Admin"
      ? (selectedFacility.category as FacilityCategory)
      : "Hospital",
  );
  const [selectedName, setSelectedName] = useState<string>(
    selectedFacility?.name && selectedFacility.category !== "Hospital Sultan Ismail Admin"
      ? selectedFacility.name
      : FACILITIES_DATA[0]?.items[0] || "",
  );

  // Search state for facility name
  const [searchQuery, setSearchQuery] = useState("");

  // Admin auth state
  const [isAdminAuthOpen, setIsAdminAuthOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [isAdminFirstTimeSetup, setIsAdminFirstTimeSetup] = useState(false);
  const [adminConfirmPassword, setConfirmAdminPassword] = useState("");

  // Facility auth state
  const [isFacilityLoginOpen, setIsFacilityLoginOpen] = useState(false);
  const [facilityPassword, setFacilityPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [facilityError, setFacilityError] = useState("");
  const [facilityLoading, setFacilityLoading] = useState(false);
  const [isFirstTimeSetup, setIsFirstTimeSetup] = useState(false);
  const [showForgotNotice, setShowForgotNotice] = useState(false);

  // Admin Facility Accounts Management state
  const [allAccounts, setAllAccounts] = useState<Record<string, Record<string, string | boolean>>>(
    {},
  );
  const [adminLoading, setAdminLoading] = useState(false);

  const refreshAdminAccounts = async () => {
    setAdminLoading(true);
    try {
      const colRef = collection(db, "facility_accounts");
      const snap = await getDocs(colRef);
      const accounts: Record<string, Record<string, string | boolean>> = {};
      snap.forEach((doc) => {
        accounts[doc.id] = doc.data();
      });
      setAllAccounts(accounts);
    } catch (err) {
      console.error("Error loading accounts:", err);
    } finally {
      setAdminLoading(false);
    }
  };

  useEffect(() => {
    if (isAdminAuthOpen && isAdmin) {
      refreshAdminAccounts();
    }
  }, [isAdminAuthOpen, isAdmin]);

  // Sync state when modal opens or selectedFacility changes
  useEffect(() => {
    if (modalStep === "admin") {
      setAuthError("");
      setIsFacilityLoginOpen(false); // Ensure facility login form is closed when admin mode is opened
      setIsAdminAuthOpen(true); // Set synchronously to render admin login immediately without flash
      const docRef = doc(db, "admin_accounts", "hsi_admin");
      getDoc(docRef)
        .then((docSnap) => {
          if (!docSnap.exists()) {
            setIsAdminFirstTimeSetup(true);
          } else {
            setIsAdminFirstTimeSetup(false);
          }
        })
        .catch((err) => {
          console.error("Error checking admin first-time setup:", err);
          setIsAdminFirstTimeSetup(false);
        });
    } else {
      setIsAdminAuthOpen(false);
    }

    if (selectedFacility && selectedFacility.category !== "Hospital Sultan Ismail Admin") {
      setSelectedCategory(selectedFacility.category as FacilityCategory);
      setSelectedName(selectedFacility.name);
    } else if (!selectedFacility) {
      const group = FACILITIES_DATA[0];
      if (group && group.items[0]) {
        setSelectedCategory(group.category);
        setSelectedName(group.items[0]);
      }
    }
  }, [selectedFacility, modalStep]);

  const currentCategoryData = FACILITIES_DATA.find((g) => g.category === selectedCategory);
  const availableFacilities = currentCategoryData ? currentCategoryData.items : [];

  const filteredFacilities = availableFacilities.filter((facility) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const facLower = facility.toLowerCase();
    if (facLower.includes(q)) return true;
    if (
      facLower.includes("klinik kesihatan") &&
      facLower.replace(/klinik kesihatan/g, "kk").includes(q)
    ) {
      return true;
    }
    if (facLower.includes("kk") && facLower.replace(/\bkk\b/g, "klinik kesihatan").includes(q)) {
      return true;
    }
    return false;
  });

  useEffect(() => {
    if (filteredFacilities.length > 0 && !filteredFacilities.includes(selectedName)) {
      setSelectedName(filteredFacilities[0]);
    }
  }, [searchQuery, selectedCategory, filteredFacilities, selectedName]);

  if (!isModalOpen) return null;

  const handleCategoryChange = (category: FacilityCategory) => {
    setSelectedCategory(category);
    setSearchQuery("");
    const group = FACILITIES_DATA.find((g) => g.category === category);
    if (group && group.items.length > 0) {
      setSelectedName(group.items[0]);
    } else {
      setSelectedName("");
    }
  };

  const handleConfirm = async () => {
    if (selectedCategory && selectedName) {
      // If Hospital category, bypass login directly
      if (selectedCategory === "Hospital") {
        setSelectedFacility({
          category: selectedCategory,
          name: selectedName,
        });
        toast.success(`Successfully logged into ${selectedName}`);
        return;
      }

      // Password-protected categories: "Klinik Kesihatan", "Klinik Kesihatan Ibu & Anak", "Klinik Desa"
      setFacilityLoading(true);
      setFacilityError("");
      try {
        const docRef = doc(db, "facility_accounts", selectedName);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
          // No account yet - show first time setup
          setIsFirstTimeSetup(true);
          setIsFacilityLoginOpen(true);
        } else {
          const data = docSnap.data();
          if (data.status === "Disabled") {
            toast.error(
              "This facility account has been disabled. Please contact the administrator.",
            );
            setFacilityError(
              "This facility account is currently disabled. Please contact the IMCHSI administrator.",
            );
            setIsFirstTimeSetup(false);
            setIsFacilityLoginOpen(true);
          } else if (data.isFirstTime || !data.passwordHash) {
            // First time setup (from admin reset)
            setIsFirstTimeSetup(true);
            setIsFacilityLoginOpen(true);
          } else {
            // Normal sign in
            setIsFirstTimeSetup(false);
            setIsFacilityLoginOpen(true);
          }
        }
      } catch (err) {
        console.error("Error accessing authentication data:", err);
        setFacilityError("Could not connect to secure server. Please try again.");
      } finally {
        setFacilityLoading(false);
      }
    }
  };

  const handleFacilityLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setFacilityError("");

    if (isFirstTimeSetup) {
      if (!validatePasswordStrength(facilityPassword)) {
        setFacilityError(
          "Password must include at least 8 characters containing a combination of both letters and numbers.",
        );
        return;
      }
      if (facilityPassword !== confirmPassword) {
        setFacilityError("Passwords do not match.");
        return;
      }

      setFacilityLoading(true);
      try {
        const hashedPw = await hashPassword(facilityPassword);
        const docRef = doc(db, "facility_accounts", selectedName);
        await setDoc(docRef, {
          facilityName: selectedName,
          category: selectedCategory,
          passwordHash: hashedPw,
          status: "Active",
          isFirstTime: false,
          createdAt: new Date().toISOString(),
        });

        // Set facility
        setSelectedFacility({
          category: selectedCategory,
          name: selectedName,
        });

        // Clear states
        setIsFacilityLoginOpen(false);
        setFacilityPassword("");
        setConfirmPassword("");
        closeModal();
        toast.success(`Account configured successfully! Logged into ${selectedName}`);
      } catch (err) {
        console.error("Setup account failed:", err);
        setFacilityError("Failed to save credentials. Please check your internet and try again.");
      } finally {
        setFacilityLoading(false);
      }
    } else {
      setFacilityLoading(true);
      try {
        const docRef = doc(db, "facility_accounts", selectedName);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
          setFacilityError("Account not found. Please reload and try again.");
          return;
        }

        const data = docSnap.data();
        if (data.status === "Disabled") {
          setFacilityError(
            "This facility account is currently disabled. Please contact the IMCHSI administrator.",
          );
          return;
        }

        const inputHashed = await hashPassword(facilityPassword);
        if (inputHashed === data.passwordHash) {
          // Successful login
          setSelectedFacility({
            category: selectedCategory,
            name: selectedName,
          });

          setIsFacilityLoginOpen(false);
          setFacilityPassword("");
          closeModal();
          toast.success(`Successfully signed in to ${selectedName}`);
        } else {
          setFacilityError("Invalid password. Please try again or contact administrator.");
        }
      } catch (err) {
        console.error("Sign in failed:", err);
        setFacilityError(
          "Authentication request failed. Please check your connection and try again.",
        );
      } finally {
        setFacilityLoading(false);
      }
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");

    if (isAdminFirstTimeSetup) {
      if (!validateAdminPasswordStrength(adminPassword)) {
        setAuthError("Password must include at least 5 characters and contain no numbers.");
        return;
      }
      if (adminPassword !== adminConfirmPassword) {
        setAuthError("Passwords do not match.");
        return;
      }

      setFacilityLoading(true);
      try {
        const hashedPw = await hashPassword(adminPassword);
        const docRef = doc(db, "admin_accounts", "hsi_admin");
        await setDoc(docRef, {
          username: "hsi_admin",
          passwordHash: hashedPw,
          createdAt: new Date().toISOString(),
        });

        setSelectedFacility({
          category: "Hospital Sultan Ismail Admin",
          name: "Hospital Sultan Ismail (Admin Mode)",
        });

        setIsAdminFirstTimeSetup(false);
        setAdminPassword("");
        setConfirmAdminPassword("");
        setAuthError("");
        toast.success("Admin account successfully configured!");
      } catch (err) {
        console.error("Setup admin account failed:", err);
        setAuthError("Failed to save credentials. Please try again.");
      } finally {
        setFacilityLoading(false);
      }
    } else {
      // Temporary fallback for legacy password clinicimc if they haven't set up the document yet
      if (adminPassword === "clinicimc") {
        setSelectedFacility({
          category: "Hospital Sultan Ismail Admin",
          name: "Hospital Sultan Ismail (Admin Mode)",
        });
        setIsAdminAuthOpen(true);
        setAdminPassword("");
        setAuthError("");
        toast.success("Administrator access granted!");
        return;
      }

      setFacilityLoading(true);
      try {
        const docRef = doc(db, "admin_accounts", "hsi_admin");
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
          setAuthError("Admin configuration not found. Please reload or setup.");
          return;
        }

        const data = docSnap.data();
        const inputHashed = await hashPassword(adminPassword);
        if (inputHashed === data.passwordHash) {
          setSelectedFacility({
            category: "Hospital Sultan Ismail Admin",
            name: "Hospital Sultan Ismail (Admin Mode)",
          });
          setIsAdminAuthOpen(true);
          setAdminPassword("");
          setAuthError("");
          toast.success("Administrator access granted!");
        } else {
          setAuthError("Incorrect administrator password.");
        }
      } catch (err) {
        console.error("Admin sign in failed:", err);
        setAuthError("Authentication request failed. Please check your connection and try again.");
      } finally {
        setFacilityLoading(false);
      }
    }
  };

  // Administrative Panel Actions
  const handleAdminResetPassword = async (facilityName: string) => {
    if (
      !window.confirm(
        `Are you sure you want to reset the password for ${facilityName}? This will clear their current password, allowing them to register a new password on their next login.`,
      )
    ) {
      return;
    }
    try {
      const docRef = doc(db, "facility_accounts", facilityName);
      await updateDoc(docRef, {
        passwordHash: "",
        isFirstTime: true,
      });
      toast.success(`Password successfully reset for ${facilityName}!`);
      refreshAdminAccounts();
    } catch (err) {
      console.error("Error resetting password:", err);
      toast.error("Failed to reset password.");
    }
  };

  const handleAdminToggleStatus = async (facilityName: string, currentStatus: string) => {
    const newStatus = currentStatus === "Active" ? "Disabled" : "Active";
    if (
      !window.confirm(
        `Are you sure you want to ${newStatus === "Active" ? "reactivate" : "disable"} the account for ${facilityName}?`,
      )
    ) {
      return;
    }
    try {
      const docRef = doc(db, "facility_accounts", facilityName);
      await updateDoc(docRef, { status: newStatus });
      toast.success(`Successfully set ${facilityName} status to ${newStatus}!`);
      refreshAdminAccounts();
    } catch (err) {
      console.error("Error updating account status:", err);
      toast.error("Failed to update status.");
    }
  };

  const handleAdminInitializeAccount = async (facilityName: string, category: FacilityCategory) => {
    try {
      const docRef = doc(db, "facility_accounts", facilityName);
      await setDoc(docRef, {
        facilityName,
        category,
        passwordHash: "",
        status: "Active",
        isFirstTime: true,
        createdAt: new Date().toISOString(),
      });
      toast.success(`Pre-created credentials shell for ${facilityName}`);
      refreshAdminAccounts();
    } catch (err) {
      console.error("Error pre-creating account:", err);
      toast.error("Failed to pre-create account.");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200 overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-background shadow-2xl overflow-hidden flex flex-col my-auto">
        {/* =========================================================================
            VIEW 1: FACILITY LOGIN FORM
        ========================================================================= */}
        {isFacilityLoginOpen ? (
          <div className="flex flex-col">
            <div className="border-b border-border bg-surface p-5 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                  <Building2 className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-base font-bold text-heading">
                    {isFirstTimeSetup ? "First-Time Login Setup" : "Facility Sign In"}
                  </h2>
                  <p className="text-xs text-muted-foreground truncate max-w-[220px] sm:max-w-[280px]">
                    {selectedName}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsFacilityLoginOpen(false);
                  setFacilityPassword("");
                  setConfirmPassword("");
                  setFacilityError("");
                  setShowForgotNotice(false);
                }}
                className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground shrink-0"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back</span>
              </button>
            </div>

            <form onSubmit={handleFacilityLogin} className="p-6 space-y-5">
              {isFirstTimeSetup && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-1.5">
                  <div className="flex items-center gap-2 text-sm font-bold text-heading">
                    <Lock className="h-4 w-4 text-primary" />
                    <h3>Secure Your Account</h3>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    This is your facility's first-time login. Please set up a strong password with
                    at least 8 characters containing both letters and numbers.
                  </p>
                </div>
              )}

              {/* Error Box */}
              {facilityError && (
                <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3.5 text-xs text-destructive font-semibold">
                  {facilityError}
                </div>
              )}

              {/* Forgot Password Help Overlay */}
              {showForgotNotice && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-800 dark:text-amber-200 space-y-1.5">
                  <p className="font-bold">Forgot Password Help</p>
                  <p className="leading-relaxed">
                    To request a password reset, please contact MA Shafiq IMC directly (ext :
                    *80064)
                  </p>
                </div>
              )}

              {/* Facility Username/Code Field */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-heading uppercase tracking-wider">
                  Facility Username (Code)
                </label>
                <input
                  type="text"
                  disabled
                  value={selectedName}
                  className="w-full rounded-xl border border-border bg-surface/50 px-4 py-2.5 text-xs font-bold text-muted-foreground"
                />
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-heading uppercase tracking-wider">
                  {isFirstTimeSetup ? "Create Password" : "Password"}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
                  <input
                    type="password"
                    value={facilityPassword}
                    onChange={(e) => {
                      setFacilityPassword(e.target.value);
                      setFacilityError("");
                    }}
                    placeholder={
                      isFirstTimeSetup
                        ? "Minimum 8 characters (letters + numbers)"
                        : "Enter password..."
                    }
                    className="w-full rounded-xl border border-border bg-background pl-10 pr-4 py-2.5 text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    autoFocus
                    required
                  />
                </div>
              </div>

              {/* Confirm Password Field (Only for first-time setup) */}
              {isFirstTimeSetup && (
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-heading uppercase tracking-wider">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        setFacilityError("");
                      }}
                      placeholder="Confirm your password..."
                      className="w-full rounded-xl border border-border bg-background pl-10 pr-4 py-2.5 text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      required
                    />
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 shrink-0">
                {!isFirstTimeSetup ? (
                  <button
                    type="button"
                    onClick={() => setShowForgotNotice(!showForgotNotice)}
                    className="text-xs font-bold text-primary hover:underline"
                  >
                    Forgot Password?
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsFacilityLoginOpen(false);
                      setFacilityPassword("");
                      setConfirmPassword("");
                      setFacilityError("");
                      setShowForgotNotice(false);
                    }}
                    className="rounded-xl border border-border px-4 py-2.5 text-xs font-semibold hover:bg-surface"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
                  >
                    <Check className="h-4 w-4" />
                    <span>{isFirstTimeSetup ? "Setup Account" : "Sign In"}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        ) : isAdminAuthOpen ? (
          isAdmin ? (
            /* =========================================================================
                ADMIN INSTRUMENT: FACILITY ACCOUNTS MANAGEMENT PANEL (LOGGED IN)
            ========================================================================= */
            <div className="flex flex-col h-[85vh] max-h-[85vh]">
              <div className="border-b border-border bg-surface p-5 flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                    <ShieldCheck className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-base font-bold text-heading">Facility Account Manager</h2>
                    <p className="text-xs text-muted-foreground">
                      Hospital Sultan Ismail Johor Bahru
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsAdminAuthOpen(false);
                  }}
                  className="rounded-xl border border-border p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-all shrink-0"
                  title="Close Manager"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Admin Panel Body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-1 text-xs">
                  <h3 className="font-bold text-heading">Portal Accounts Administrator Console</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    View active status, disable/enable, and reset passwords for primary-care health
                    clinics (Klinik Kesihatan, KKIA, Klinik Desa).
                  </p>
                </div>

                {adminLoading ? (
                  <div className="py-20 text-center text-xs text-muted-foreground font-semibold flex flex-col items-center gap-2">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <span>Loading facility configurations...</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {FACILITIES_DATA.filter((g) => g.category !== "Hospital").map((group) => (
                      <div key={group.category} className="space-y-2">
                        <h4 className="text-xs font-bold text-primary uppercase tracking-wider border-b border-border pb-1">
                          {group.category} ({group.items.length})
                        </h4>
                        <div className="divide-y divide-border/50 border border-border/80 rounded-xl bg-background overflow-hidden">
                          {group.items.map((facilityName) => {
                            const account = allAccounts[facilityName];
                            const status = account ? account.status : "Not Set";

                            return (
                              <div
                                key={facilityName}
                                className="flex items-center justify-between p-3 text-xs gap-3 hover:bg-surface/30"
                              >
                                <div className="min-w-0">
                                  <p className="font-bold text-heading truncate">{facilityName}</p>
                                  <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                                    <span>Status:</span>
                                    <span
                                      className={`px-1.5 py-0.2 rounded font-bold uppercase ${
                                        status === "Active"
                                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                          : status === "Disabled"
                                            ? "bg-destructive/10 text-destructive"
                                            : "bg-muted text-muted-foreground"
                                      }`}
                                    >
                                      {status}
                                    </span>
                                  </p>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  {status !== "Not Set" ? (
                                    <>
                                      {/* Reset Password Button */}
                                      <button
                                        type="button"
                                        onClick={() => handleAdminResetPassword(facilityName)}
                                        className="rounded border border-primary/20 bg-primary/5 px-2 py-1 text-[10px] font-bold text-primary hover:bg-primary/10"
                                      >
                                        Reset PW
                                      </button>
                                      {/* Toggle Disable Button */}
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleAdminToggleStatus(facilityName, status)
                                        }
                                        className={`rounded px-2 py-1 text-[10px] font-bold ${
                                          status === "Active"
                                            ? "border border-destructive/20 bg-destructive/5 text-destructive hover:bg-destructive/10"
                                            : "border border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                                        }`}
                                      >
                                        {status === "Active" ? "Disable" : "Enable"}
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleAdminInitializeAccount(facilityName, group.category)
                                      }
                                      className="rounded border border-border bg-surface px-2.5 py-1 text-[10px] font-bold text-muted-foreground hover:bg-accent hover:text-foreground"
                                    >
                                      Pre-create
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="border-t border-border bg-surface p-4 flex justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setIsAdminAuthOpen(false);
                    setModalStep("facility");
                    closeModal();
                  }}
                  className="rounded-xl bg-primary px-5 py-2 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            /* =========================================================================
                VIEW 2: ADMIN PASSWORD LOGIN FORM
            ========================================================================= */
            <div className="flex flex-col">
              <div className="border-b border-border bg-surface p-5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                    <ShieldCheck className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-base font-bold text-heading">Hospital Admin Access</h2>
                    <p className="text-xs text-muted-foreground">
                      Hospital Sultan Ismail Johor Bahru
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsAdminAuthOpen(false);
                    setAuthError("");
                    setModalStep("facility");
                  }}
                  className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back</span>
                </button>
              </div>

              <form onSubmit={handleAdminLogin} className="p-6 space-y-5">
                {isAdminFirstTimeSetup ? (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-1.5">
                    <div className="flex items-center gap-2 text-sm font-bold text-heading">
                      <Lock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      <h3>Secure Your Account</h3>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      This is the administrator's first-time login setup. Please set up a password
                      with at least 5 characters containing no numbers.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-1.5">
                    <div className="flex items-center gap-2 text-sm font-bold text-heading">
                      <Lock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      <h3>Internal Medicine Admin Access</h3>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Enter the administrator password to manage referral requests, appointment
                      schedules, and upload diagnostic reports.
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="block text-xs font-bold text-heading uppercase tracking-wider">
                    {isAdminFirstTimeSetup ? "Create Admin Password" : "Admin Password"}
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
                    <input
                      type="password"
                      value={adminPassword}
                      onChange={(e) => {
                        setAdminPassword(e.target.value);
                        setAuthError("");
                      }}
                      placeholder={
                        isAdminFirstTimeSetup
                          ? "Minimum 5 characters (no numbers)"
                          : "Enter admin password..."
                      }
                      className="w-full rounded-xl border border-border bg-background pl-10 pr-4 py-2.5 text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      autoFocus
                    />
                  </div>
                </div>

                {isAdminFirstTimeSetup && (
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-heading uppercase tracking-wider">
                      Confirm Admin Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
                      <input
                        type="password"
                        value={adminConfirmPassword}
                        onChange={(e) => {
                          setConfirmAdminPassword(e.target.value);
                          setAuthError("");
                        }}
                        placeholder="Confirm admin password..."
                        className="w-full rounded-xl border border-border bg-background pl-10 pr-4 py-2.5 text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                        required
                      />
                    </div>
                  </div>
                )}

                {authError && <p className="text-xs text-destructive font-medium">{authError}</p>}

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAdminAuthOpen(false);
                      setModalStep("facility");
                      closeModal();
                    }}
                    className="rounded-xl border border-border px-4 py-2.5 text-xs font-semibold hover:bg-surface"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    <span>{isAdminFirstTimeSetup ? "Setup Admin" : "Admin Sign In"}</span>
                  </button>
                </div>
              </form>
            </div>
          )
        ) : modalStep === "greeting" ? (
          /* =========================================================================
              VIEW 3: SIMPLE & ELEGANT GREETING POPUP
          ========================================================================= */
          <div className="flex flex-col text-center p-6 sm:p-8 space-y-6">
            {/* National Crest & Header */}
            <div className="space-y-4 flex flex-col items-center">
              <img
                src={jataNegaraLogo}
                alt="Coat of Arms of Malaysia"
                className="h-16 w-auto object-contain drop-shadow-sm"
              />

              <div className="space-y-1">
                <h1 className="text-xl sm:text-2xl font-extrabold text-heading tracking-tight">
                  Internal Medicine
                </h1>
                <p className="text-sm sm:text-base font-bold text-primary tracking-wide">
                  Hospital Sultan Ismail
                </p>
              </div>
            </div>

            {/* Short greeting message */}
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
              Please select your referring healthcare facility
            </p>

            {/* Main Action Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setModalStep("facility")}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-bold text-primary-foreground shadow-md hover:opacity-95 transition-all"
              >
                <span>Select Facility</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          /* =========================================================================
              VIEW 4: FACILITY SELECTION POPUP
          ========================================================================= */
          <div className="flex flex-col">
            {/* Header */}
            <div className="border-b border-border bg-surface p-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                  <Hospital className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-base font-bold text-heading">Healthcare Facility</h2>
                  <p className="text-xs text-muted-foreground">
                    Select your referring healthcare facility
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-muted-foreground transition-all hover:bg-accent hover:text-foreground shrink-0"
                  title="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Form */}
            <div className="p-6 space-y-6 overflow-y-auto max-h-[60vh]">
              {/* SECTION 1: Facility Category */}
              <div className="space-y-2.5">
                <label className="block text-xs font-bold text-heading uppercase tracking-wider">
                  1. Facility Category
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {FACILITIES_DATA.map((group) => {
                    const isSelected = selectedCategory === group.category;
                    return (
                      <button
                        key={group.category}
                        type="button"
                        onClick={() => handleCategoryChange(group.category)}
                        className={`flex items-center justify-between gap-2 rounded-xl border p-3 text-left text-xs font-semibold transition-all ${
                          isSelected
                            ? "border-primary bg-primary/10 text-primary shadow-sm"
                            : "border-border bg-surface/50 text-foreground hover:border-border hover:bg-surface"
                        }`}
                      >
                        <span className="truncate">{group.category}</span>
                        {isSelected && (
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <Check className="h-2.5 w-2.5" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* SECTION 2: Name of Facility */}
              <div className="space-y-2.5">
                <label className="block text-xs font-bold text-heading uppercase tracking-wider">
                  2. Healthcare Facility Name
                </label>

                {/* Fixed Search Box */}
                <div className="relative">
                  <Search className="absolute left-3.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Type to search facility name..."
                    className="w-full rounded-xl border border-border bg-background pl-9 pr-8 py-2 text-xs font-medium text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                      title="Clear search"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="relative">
                  <Building2 className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <select
                    value={selectedName}
                    onChange={(e) => setSelectedName(e.target.value)}
                    className="w-full appearance-none rounded-xl border border-border bg-background pl-10 pr-10 py-2.5 text-xs font-bold text-heading outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer"
                  >
                    {filteredFacilities.length === 0 ? (
                      <option value="" disabled>
                        No facilities found matching "{searchQuery}"
                      </option>
                    ) : (
                      filteredFacilities.map((facility) => (
                        <option key={facility} value={facility}>
                          {facility}
                        </option>
                      ))
                    )}
                  </select>
                  <ChevronDown className="absolute right-3.5 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-border bg-surface p-4 px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                type="button"
                onClick={closeModal}
                className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground order-2 sm:order-1"
              >
                <X className="h-3.5 w-3.5" />
                <span>Cancel</span>
              </button>

              <div className="flex items-center gap-3 w-full sm:w-auto justify-end order-1 sm:order-2">
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={!selectedCategory || !selectedName || facilityLoading}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-xs font-bold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {facilityLoading ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  <span>{facilityLoading ? "Connecting..." : "Confirm Facility"}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
