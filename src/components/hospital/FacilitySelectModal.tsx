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

export function FacilitySelectModal() {
  const {
    selectedFacility,
    setSelectedFacility,
    isModalOpen,
    setIsModalOpen,
    modalStep,
    setModalStep,
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

  // Admin state
  const [isAdminAuthOpen, setIsAdminAuthOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [authError, setAuthError] = useState("");

  // Sync state when modal opens or selectedFacility changes
  useEffect(() => {
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
  }, [selectedFacility]);

  const currentCategoryData = FACILITIES_DATA.find((g) => g.category === selectedCategory);
  const availableFacilities = currentCategoryData ? currentCategoryData.items : [];

  const filteredFacilities = availableFacilities.filter((facility) =>
    facility.toLowerCase().includes(searchQuery.toLowerCase().trim()),
  );

  useEffect(() => {
    const currentGroup = FACILITIES_DATA.find((g) => g.category === selectedCategory);
    const facilities = currentGroup ? currentGroup.items : [];
    const filtered = facilities.filter((facility) =>
      facility.toLowerCase().includes(searchQuery.toLowerCase().trim()),
    );
    if (filtered.length > 0 && !filtered.includes(selectedName)) {
      setSelectedName(filtered[0]);
    }
  }, [searchQuery, selectedCategory, selectedName]);

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

  const handleConfirm = () => {
    if (selectedCategory && selectedName) {
      setSelectedFacility({
        category: selectedCategory,
        name: selectedName,
      });
    }
  };

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPassword === "clinicimc") {
      setSelectedFacility({
        category: "Hospital Sultan Ismail Admin",
        name: "Hospital Sultan Ismail (Admin Mode)",
      });
      setIsAdminAuthOpen(false);
      setAdminPassword("");
      setAuthError("");
    } else {
      setAuthError("Incorrect administrator password.");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200 overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-background shadow-2xl overflow-hidden flex flex-col my-auto">
        {/* =========================================================================
            VIEW 1: ADMIN LOGIN FORM
        ========================================================================= */}
        {isAdminAuthOpen ? (
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
                  Enter the administrator password to manage referral requests, appointment
                  schedules, and upload diagnostic reports.
                </p>
              </div>

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
                  />
                </div>
                {authError && <p className="text-xs text-destructive font-medium">{authError}</p>}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAdminAuthOpen(false)}
                  className="rounded-xl border border-border px-4 py-2.5 text-xs font-semibold hover:bg-surface"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
                >
                  <ShieldCheck className="h-4 w-4" />
                  <span>Admin Sign In</span>
                </button>
              </div>
            </form>
          </div>
        ) : modalStep === "greeting" ? (
          /* =========================================================================
              VIEW 2: SIMPLE & ELEGANT GREETING POPUP
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
              VIEW 3: FACILITY SELECTION POPUP
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
                  onClick={() => {
                    setIsAdminAuthOpen(true);
                    setAuthError("");
                    setAdminPassword("");
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary transition-all hover:bg-primary/20 shrink-0"
                  title="Hospital Admin Login"
                >
                  <ShieldCheck className="h-4 w-4" />
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
                onClick={() => setModalStep("greeting")}
                className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground order-2 sm:order-1"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back</span>
              </button>

              <div className="flex items-center gap-3 w-full sm:w-auto justify-end order-1 sm:order-2">
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={!selectedCategory || !selectedName}
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
