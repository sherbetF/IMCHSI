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
import { useFacility, getFacilityAuthEmail } from "@/context/FacilityContext";
import { db, auth } from "@/lib/firebase";
import {
  signInWithEmailAndPassword,
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
      : FACILITIES_DATA[0]?.items[0]?.facilityName || "",
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
  const [firstLoginWelcomeUser, setFirstLoginWelcomeUser] = useState<{
    uid: string;
    facilityName: string;
    category: FacilityCategory;
  } | null>(null);

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
        setSelectedName(group.items[0].facilityName);
      }
    }
  }, [selectedFacility, modalStep, isModalOpen]);

  const currentCategoryData = FACILITIES_DATA.find((g) => g.category === selectedCategory);
  const availableFacilities = currentCategoryData
    ? currentCategoryData.items.map((f) => f.facilityName)
    : [];

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
      setSelectedName(group.items[0].facilityName);
    } else {
      setSelectedName("");
    }
  };

  const handleConfirm = async () => {
    if (selectedCategory && selectedName) {
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

    const group = FACILITIES_DATA.find((g) => g.category === selectedCategory);
    const facilityObj = group?.items.find((f) => f.facilityName === selectedName);
    const facId = facilityObj ? facilityObj.facilityId : "";

    try {
      const email = getFacilityAuthEmail(facId);

      if (facilityPassword.length < 6) {
        setFacilityError("Password must be at least 6 characters.");
        setFacilityLoading(false);
        return;
      }

      let userCredential;
      try {
        await setPersistence(auth, browserSessionPersistence);
        userCredential = await signInWithEmailAndPassword(auth, email, facilityPassword);
      } catch {
        setFacilityPassword("");
        setFacilityError("Invalid facility or password.");
        setShowForgotNotice(true);
        setFacilityLoading(false);
        return;
      }

      const user = userCredential.user;

      // Validate trusted authorization profile in users/{uid}
      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        await auth.signOut();
        setFacilityPassword("");
        setFacilityError("Invalid facility or password.");
        setFacilityLoading(false);
        return;
      }

      const data = userDocSnap.data();
      if (data.active === false) {
        await auth.signOut();
        setFacilityError(
          "This facility account is currently disabled. Please contact the administrator.",
        );
        setFacilityLoading(false);
        return;
      }

      if (data.role !== "facility" || data.facilityId !== facId) {
        await auth.signOut();
        setFacilityPassword("");
        setFacilityError("Invalid facility or password.");
        setFacilityLoading(false);
        return;
      }

      // Check if this is the first login recorded for a non-hospital facility
      if (!data.firstLoginAcknowledgedAt && selectedCategory !== "Hospital") {
        setFirstLoginWelcomeUser({
          uid: user.uid,
          facilityName: selectedName,
          category: selectedCategory,
        });
        setFacilityPassword("");
        setFacilityLoading(false);
        return;
      }

      setSelectedFacility({
        facilityId: facId,
        category: selectedCategory,
        name: selectedName,
      });

      setIsFacilityLoginOpen(false);
      setFacilityPassword("");
      closeModal();
      toast.success(`Successfully signed in to ${selectedName}`);
    } catch (err) {
      console.error("Facility login error:", err);
      setFacilityPassword("");
      setFacilityError("Invalid facility or password.");
    } finally {
      setFacilityLoading(false);
    }
  };

  const handleAdminResetFacility = async (facilityName: string) => {
    let facId = "";
    for (const group of FACILITIES_DATA) {
      const match = group.items.find((f) => f.facilityName === facilityName);
      if (match) {
        facId = match.facilityId;
        break;
      }
    }
    toast.info(
      `Password resets must be executed using the trusted backend script: node scripts/reset-facility-password.js ${facId}`,
      { duration: 6000 },
    );
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setFacilityLoading(true);

    try {
      await setPersistence(auth, browserSessionPersistence);
      const userCredential = await signInWithEmailAndPassword(
        auth,
        "admin@auth.local",
        adminPassword,
      );
      const user = userCredential.user;
      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        await auth.signOut();
        setAdminPassword("");
        setAuthError(
          "Administrator authorization profile not found. Administrator accounts must be provisioned through a trusted backend.",
        );
        setFacilityLoading(false);
        return;
      }

      const data = userDocSnap.data();
      if (data.active !== true || data.role !== "admin") {
        await auth.signOut();
        setAdminPassword("");
        setAuthError("This administrator account is disabled or unauthorized.");
        setFacilityLoading(false);
        return;
      }

      setSelectedFacility({
        facilityId: "admin",
        category: "Hospital Sultan Ismail Admin",
        name: "Hospital Sultan Ismail (Admin Mode)",
      });

      setIsAdminAuthOpen(true);
      setAdminPassword("");
      setAuthError("");
      toast.success("Administrator access granted!");
      closeModal();
    } catch (err: unknown) {
      console.error("Admin sign in failed:", err);
      setAdminPassword("");
      setAuthError("Incorrect administrator password or unprovisioned administrator account.");
    } finally {
      setFacilityLoading(false);
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
              {/* Facility Sign-In Notice */}
              <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 text-xs space-y-1.5 animate-in fade-in duration-200">
                <div className="flex items-center gap-2 text-sm font-bold text-primary">
                  <KeyRound className="h-4 w-4 shrink-0" />
                  <span>Facility Sign-In</span>
                </div>
                <p className="text-muted-foreground leading-relaxed">
                  Please enter the password provisioned by your administrator for{" "}
                  <span className="font-semibold text-foreground">{selectedName}</span>. Contact the
                  administrator if you need credential assistance.
                </p>
              </div>

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
                  Password
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
                    placeholder="Enter facility password..."
                    className="w-full rounded-xl border border-border bg-background pl-10 pr-4 py-2.5 text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    autoFocus
                    required
                  />
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowForgotNotice(!showForgotNotice)}
                  className="text-xs font-bold text-primary hover:underline"
                >
                  Forgot Password?
                </button>

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
                    <span>{facilityLoading ? "Verifying..." : "Sign In"}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        ) : isAdminAuthOpen ? (
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
                  Enter the administrator password to manage referral requests and view registered
                  facilities.
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
                    placeholder="Enter admin password..."
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

      {/* First-Time Login Welcome Modal (Non-Hospital Facilities) */}
      {firstLoginWelcomeUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl border border-primary/20 bg-background p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-primary">
              <Sparkles className="h-6 w-6 shrink-0" />
              <h3 className="text-base font-bold text-heading">Welcome to Hospital Staff Hub</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Welcome. This is the first login recorded for this facility (
              <span className="font-semibold text-foreground">
                {firstLoginWelcomeUser.facilityName}
              </span>
              ).
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Your facility account is active for use. Please keep your password secure and contact
              the administrator if a password reset is required.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={async () => {
                  const targetUid = firstLoginWelcomeUser.uid;
                  const targetName = firstLoginWelcomeUser.facilityName;
                  const targetCategory = firstLoginWelcomeUser.category;
                  try {
                    await updateDoc(doc(db, "users", targetUid), {
                      firstLoginAcknowledgedAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    });
                  } catch (err) {
                    console.warn("Could not save firstLoginAcknowledgedAt timestamp:", err);
                  }
                  setSelectedFacility({
                    category: targetCategory,
                    name: targetName,
                  });
                  setFirstLoginWelcomeUser(null);
                  setIsFacilityLoginOpen(false);
                  setFacilityPassword("");
                  closeModal();
                  toast.success(`Successfully signed in to ${targetName}`);
                }}
                className="w-full rounded-xl bg-primary py-2.5 text-xs font-bold text-primary-foreground shadow hover:opacity-90 transition-opacity"
              >
                OK / Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
