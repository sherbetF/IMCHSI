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
  KeyRound,
  Sparkles,
  Info,
} from "lucide-react";
import jataNegaraLogo from "@/assets/jata-negara.svg";
import { FACILITIES_DATA, FacilityCategory } from "@/data/facilities";
import { useFacility, getFacilityId, getFacilityAuthEmail } from "@/context/FacilityContext";
import { db, auth } from "@/lib/firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  setPersistence,
  browserSessionPersistence,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { toast } from "sonner";

/**
 * Validates admin password strength (words only: letters and spaces only, no numbers, minimum 6 characters)
 */
const validateAdminPasswordStrength = (password: string): boolean => {
  const trimmed = password.trim();
  if (trimmed.length < 6) return false;
  // Words only: alphabetic letters and spaces only (no numbers, no special characters)
  return /^[a-zA-Z\s]+$/.test(trimmed);
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

  // Facility auth state
  const [isFacilityLoginOpen, setIsFacilityLoginOpen] = useState(false);
  const [facilityPassword, setFacilityPassword] = useState("");
  const [facilityError, setFacilityError] = useState("");
  const [facilityLoading, setFacilityLoading] = useState(false);
  const [showForgotNotice, setShowForgotNotice] = useState(false);
  const [isFirstTimeFacility, setIsFirstTimeFacility] = useState(false);

  // Check if facility is signing in for the first time
  useEffect(() => {
    if (!isFacilityLoginOpen || !selectedName) {
      setIsFirstTimeFacility(false);
      return;
    }
    let isMounted = true;
    const checkFirstTime = async () => {
      try {
        const facId = getFacilityId(selectedName);
        const facDocRef = doc(db, "facilities", facId);
        const facDocSnap = await getDoc(facDocRef);
        if (isMounted) {
          if (!facDocSnap.exists() || facDocSnap.data()?.isFirstTime === true) {
            setIsFirstTimeFacility(true);
          } else {
            setIsFirstTimeFacility(false);
          }
        }
      } catch (err) {
        console.warn("Could not check facility first-time status:", err);
      }
    };
    checkFirstTime();
    return () => {
      isMounted = false;
    };
  }, [isFacilityLoginOpen, selectedName]);

  // Admin Facility Accounts Management state
  const [allAccounts, setAllAccounts] = useState<Record<string, Record<string, unknown>>>({});
  const [adminLoading, setAdminLoading] = useState(false);

  const refreshAdminAccounts = async () => {
    setAdminLoading(true);
    try {
      const colRef = collection(db, "users");
      const q = query(colRef, where("role", "==", "facility"));
      const snap = await getDocs(q);
      const accounts: Record<string, Record<string, unknown>> = {};
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.facilityId) {
          accounts[data.facilityId as string] = { id: docSnap.id, ...data };
        }
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

  // Sync state when modal opens or closes or selectedFacility changes
  useEffect(() => {
    if (!isModalOpen) {
      setIsFacilityLoginOpen(false);
      setFacilityPassword("");
      setFacilityError("");
      setShowForgotNotice(false);
      setAdminPassword("");
      setAuthError("");
    } else {
      if (modalStep === "admin") {
        setAuthError("");
        setIsFacilityLoginOpen(false);
        setIsAdminAuthOpen(true);
      } else {
        setIsAdminAuthOpen(false);
      }
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
  }, [selectedFacility, modalStep, isModalOpen]);

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
      // If Hospital category, connect seamless facility session without password
      if (selectedCategory === "Hospital") {
        setFacilityLoading(true);
        try {
          const facId = getFacilityId(selectedName);
          const email = getFacilityAuthEmail(facId, 0);
          const defaultPass = `hospital_hsi_${facId}`;
          let userCredential;
          try {
            await setPersistence(auth, browserSessionPersistence);
            userCredential = await signInWithEmailAndPassword(auth, email, defaultPass);
          } catch (authErr: unknown) {
            const err = authErr as { code?: string };
            if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential") {
              await setPersistence(auth, browserSessionPersistence);
              userCredential = await createUserWithEmailAndPassword(auth, email, defaultPass);
            } else {
              throw authErr;
            }
          }
          const user = userCredential.user;
          const userDocRef = doc(db, "users", user.uid);
          const userDocSnap = await getDoc(userDocRef);
          if (!userDocSnap.exists()) {
            await setDoc(userDocRef, {
              role: "facility",
              facilityId: facId,
              facilityName: selectedName,
              category: "Hospital",
              active: true,
              createdAt: new Date().toISOString(),
            });
          }
          setSelectedFacility({
            category: selectedCategory,
            name: selectedName,
          });
          toast.success(`Successfully logged into ${selectedName}`);
          closeModal();
        } catch (err) {
          console.error("Hospital login error:", err);
          toast.error("Failed to connect to hospital facility.");
        } finally {
          setFacilityLoading(false);
        }
        return;
      }

      // Password-protected categories: Open password login dialog directly
      setFacilityError("");
      setFacilityPassword("");
      setShowForgotNotice(false);
      setIsFacilityLoginOpen(true);
    }
  };

  const handleFacilityLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setFacilityError("");
    setFacilityLoading(true);

    const facId = getFacilityId(selectedName);

    try {
      // Check if a resetCount exists for this facility
      let resetCount = 0;
      try {
        const facDocRef = doc(db, "facilities", facId);
        const facDocSnap = await getDoc(facDocRef);
        if (facDocSnap.exists() && typeof facDocSnap.data().resetCount === "number") {
          resetCount = facDocSnap.data().resetCount;
        }
      } catch (err) {
        console.warn("Could not read facility registry doc:", err);
      }

      const email = getFacilityAuthEmail(facId, resetCount);

      if (facilityPassword.length < 6) {
        setFacilityError("Password must be at least 6 characters.");
        setFacilityLoading(false);
        return;
      }

      let userCredential;
      try {
        await setPersistence(auth, browserSessionPersistence);
        userCredential = await signInWithEmailAndPassword(auth, email, facilityPassword);
      } catch (authErr: unknown) {
        const err = authErr as { code?: string };
        // If account does not exist in Firebase Auth yet, provision it on first use
        if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential") {
          try {
            await setPersistence(auth, browserSessionPersistence);
            userCredential = await createUserWithEmailAndPassword(auth, email, facilityPassword);
          } catch (createErr: unknown) {
            const cErr = createErr as { code?: string };
            if (cErr.code === "auth/email-already-in-use") {
              setFacilityError(
                `Incorrect password for ${selectedName}. Please try again or contact the administrator to reset your password.`,
              );
              setShowForgotNotice(true);
              setFacilityLoading(false);
              return;
            }
            if (cErr.code === "auth/weak-password") {
              setFacilityError("Password must be at least 6 characters.");
              setFacilityLoading(false);
              return;
            }
            setFacilityError("Incorrect password for this facility.");
            setShowForgotNotice(true);
            setFacilityLoading(false);
            return;
          }
        } else {
          setFacilityError("Incorrect password for this facility.");
          setShowForgotNotice(true);
          setFacilityLoading(false);
          return;
        }
      }

      const user = userCredential.user;

      // Ensure profile exists in users/{uid}
      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        await setDoc(userDocRef, {
          role: "facility",
          facilityId: facId,
          facilityName: selectedName,
          category: selectedCategory,
          active: true,
          createdAt: new Date().toISOString(),
        });
      } else {
        const data = userDocSnap.data();
        if (data.active === false) {
          await auth.signOut();
          setFacilityError(
            "This facility account is currently disabled. Please contact the administrator.",
          );
          setFacilityLoading(false);
          return;
        }
      }

      // Record or update facility registry doc
      try {
        const facDocRef = doc(db, "facilities", facId);
        const facDocSnap = await getDoc(facDocRef);
        if (!facDocSnap.exists()) {
          await setDoc(facDocRef, {
            facilityId: facId,
            facilityName: selectedName,
            category: selectedCategory,
            status: "Active",
            isFirstTime: false,
            resetCount,
            createdAt: new Date().toISOString(),
          });
        } else {
          await setDoc(
            facDocRef,
            {
              isFirstTime: false,
              updatedAt: new Date().toISOString(),
            },
            { merge: true },
          );
        }
      } catch (err) {
        console.warn("Could not save facility record:", err);
      }

      setIsFirstTimeFacility(false);
      setSelectedFacility({
        category: selectedCategory,
        name: selectedName,
      });

      setIsFacilityLoginOpen(false);
      setFacilityPassword("");
      closeModal();
      toast.success(`Successfully signed in to ${selectedName}`);
    } catch (err) {
      console.error("Facility login error:", err);
      setFacilityError("Failed to sign in. Please verify your credentials.");
    } finally {
      setFacilityLoading(false);
    }
  };

  const handleAdminResetFacility = async (facilityName: string) => {
    const facId = getFacilityId(facilityName);
    if (
      !window.confirm(
        `Are you sure you want to reset the password for ${facilityName}? The clinic will be able to set a new password on their next sign-in.`,
      )
    ) {
      return;
    }
    try {
      const facDocRef = doc(db, "facilities", facId);
      const facDocSnap = await getDoc(facDocRef);
      const currentReset =
        facDocSnap.exists() && typeof facDocSnap.data().resetCount === "number"
          ? (facDocSnap.data().resetCount as number)
          : 0;

      await setDoc(
        facDocRef,
        {
          facilityId: facId,
          facilityName,
          resetCount: currentReset + 1,
          status: "Active",
          isFirstTime: true,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );

      toast.success(
        `Password reset for ${facilityName}. The facility can now create a new password upon next sign-in.`,
      );
      refreshAdminAccounts();
    } catch (err) {
      console.error("Error resetting facility account:", err);
      toast.error("Failed to reset facility password.");
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setFacilityLoading(true);

    try {
      let userCredential;
      try {
        await setPersistence(auth, browserSessionPersistence);
        userCredential = await signInWithEmailAndPassword(auth, "admin@auth.local", adminPassword);
      } catch (authErr: unknown) {
        const err = authErr as { code?: string };
        if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential") {
          // If admin account does not exist in Firebase Auth yet, provision on first use
          if (!validateAdminPasswordStrength(adminPassword)) {
            if (/[0-9]/.test(adminPassword)) {
              setAuthError("Admin password requirement: words only (no numbers allowed).");
            } else if (adminPassword.trim().length < 6) {
              setAuthError("Admin password must be at least 6 characters (words only).");
            } else {
              setAuthError("Admin password requirement: words only (letters and spaces only).");
            }
            setFacilityLoading(false);
            return;
          }
          try {
            await setPersistence(auth, browserSessionPersistence);
            userCredential = await createUserWithEmailAndPassword(
              auth,
              "admin@auth.local",
              adminPassword,
            );
          } catch (createErr: unknown) {
            const cErr = createErr as { code?: string };
            if (cErr.code === "auth/email-already-in-use") {
              setAuthError("Incorrect administrator password.");
              setFacilityLoading(false);
              return;
            }
            setAuthError("Incorrect administrator password.");
            setFacilityLoading(false);
            return;
          }
        } else {
          setAuthError("Incorrect administrator password.");
          setFacilityLoading(false);
          return;
        }
      }

      const user = userCredential.user;
      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        await setDoc(userDocRef, {
          role: "admin",
          active: true,
          username: "admin",
          createdAt: new Date().toISOString(),
        });
      } else {
        const data = userDocSnap.data();
        if (data.active === false || data.role !== "admin") {
          await auth.signOut();
          setAuthError("This administrator account is disabled or unauthorized.");
          setFacilityLoading(false);
          return;
        }
      }

      setSelectedFacility({
        category: "Hospital Sultan Ismail Admin",
        name: "Hospital Sultan Ismail (Admin Mode)",
      });

      setIsAdminAuthOpen(true);
      setAdminPassword("");
      setAuthError("");
      toast.success("Administrator access granted!");
    } catch (err) {
      console.error("Admin sign in failed:", err);
      setAuthError("Incorrect administrator password.");
    } finally {
      setFacilityLoading(false);
    }
  };

  const handleAdminToggleStatus = async (
    facilityName: string,
    accountData: Record<string, unknown>,
  ) => {
    const currentActive = accountData.active !== false;
    const newActive = !currentActive;
    if (
      !window.confirm(
        `Are you sure you want to ${newActive ? "reactivate" : "disable"} the account for ${facilityName}?`,
      )
    ) {
      return;
    }
    try {
      const docRef = doc(db, "users", accountData.id as string);
      await updateDoc(docRef, { active: newActive });
      toast.success(
        `Successfully set ${facilityName} status to ${newActive ? "Active" : "Disabled"}!`,
      );
      refreshAdminAccounts();
    } catch (err) {
      console.error("Error updating account status:", err);
      toast.error("Failed to update status.");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200 overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-background shadow-2xl overflow-hidden flex flex-col my-auto">
        {/* =========================================================================
            VIEW 1: FACILITY LOGIN FORM (SIMPLE, CLEAN, NO USERNAME CONFUSION)
        ========================================================================= */}
        {isFacilityLoginOpen ? (
          <div className="flex flex-col">
            <div className="border-b border-border bg-surface p-5 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                  <Building2 className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-base font-bold text-heading">Facility Sign In</h2>
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
              {/* First-time login / Create password notice */}
              {isFirstTimeFacility && (
                <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 text-xs space-y-1.5 animate-in fade-in duration-200">
                  <div className="flex items-center gap-2 text-sm font-bold text-primary">
                    <KeyRound className="h-4 w-4 shrink-0" />
                    <span>Please create a password</span>
                  </div>
                  <p className="text-muted-foreground leading-relaxed">
                    This is the first time{" "}
                    <span className="font-semibold text-foreground">{selectedName}</span> is signing
                    in. Please create a password (minimum 6 characters) for your clinic. You will
                    use this password for all future sign-ins.
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
                  Facility
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
                  {isFirstTimeFacility ? "Create Password" : "Password"}
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
                      isFirstTimeFacility
                        ? "Create a password (minimum 6 characters)..."
                        : "Enter facility password..."
                    }
                    className="w-full rounded-xl border border-border bg-background pl-10 pr-4 py-2.5 text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    autoFocus
                    required
                  />
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 shrink-0">
                {!isFirstTimeFacility ? (
                  <button
                    type="button"
                    onClick={() => setShowForgotNotice(!showForgotNotice)}
                    className="text-xs font-bold text-primary hover:underline"
                  >
                    Forgot Password?
                  </button>
                ) : (
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Info className="h-3.5 w-3.5 text-primary" />
                    First time setup
                  </span>
                )}

                <div className="flex gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setIsFacilityLoginOpen(false);
                      setFacilityPassword("");
                      setFacilityError("");
                      setShowForgotNotice(false);
                    }}
                    className="rounded-xl border border-border px-4 py-2.5 text-xs font-semibold hover:bg-surface"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={facilityLoading || !facilityPassword}
                    className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {facilityLoading ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    <span>
                      {facilityLoading
                        ? "Verifying..."
                        : isFirstTimeFacility
                          ? "Create & Sign In"
                          : "Sign In"}
                    </span>
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
                    View active status and enable/disable portal accounts for primary-care health
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
                            const facId = getFacilityId(facilityName);
                            const account = allAccounts[facId];
                            const isConfigured = !!account;
                            const isActive = isConfigured && account.active !== false;

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
                                      className={`px-1.5 py-0.5 rounded font-bold uppercase text-[9px] ${
                                        !isConfigured
                                          ? "bg-muted text-muted-foreground"
                                          : isActive
                                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                            : "bg-destructive/10 text-destructive"
                                      }`}
                                    >
                                      {!isConfigured
                                        ? "Not Logged In Yet"
                                        : isActive
                                          ? "Active"
                                          : "Disabled"}
                                    </span>
                                  </p>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleAdminResetFacility(facilityName)}
                                    className="rounded px-2.5 py-1 text-[10px] font-bold border border-border bg-surface hover:bg-accent text-foreground transition-all"
                                    title="Reset credentials so clinic can set new password"
                                  >
                                    Reset Password
                                  </button>
                                  {isConfigured && (
                                    <button
                                      type="button"
                                      onClick={() => handleAdminToggleStatus(facilityName, account)}
                                      className={`rounded px-2.5 py-1 text-[10px] font-bold ${
                                        isActive
                                          ? "border border-destructive/20 bg-destructive/5 text-destructive hover:bg-destructive/10"
                                          : "border border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                                      }`}
                                    >
                                      {isActive ? "Disable" : "Enable"}
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
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-1.5">
                  <div className="flex items-center gap-2 text-sm font-bold text-heading">
                    <Lock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <h3>Internal Medicine Admin Access</h3>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Enter the administrator password (words only, no numbers) to manage referral
                    requests and view registered facilities.
                  </p>
                </div>

                {/* Error Box */}
                {authError && (
                  <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3.5 text-xs text-destructive font-semibold">
                    {authError}
                  </div>
                )}

                <div className="space-y-2">
                  <label className="block text-xs font-bold text-heading uppercase tracking-wider">
                    Admin Password
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
                      placeholder="Enter admin password (words only)..."
                      className="w-full rounded-xl border border-border bg-background pl-10 pr-4 py-2.5 text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      autoFocus
                      required
                    />
                  </div>
                </div>

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
                    disabled={facilityLoading || !adminPassword}
                    className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    <span>{facilityLoading ? "Verifying..." : "Admin Sign In"}</span>
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

            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
              Please select your referring healthcare facility
            </p>

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
                  <Check className="h-4 w-4" />
                  <span>Confirm Facility</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
