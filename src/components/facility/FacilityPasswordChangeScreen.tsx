import React, { useState } from "react";
import { useFacility } from "@/context/FacilityContext";
import { httpsCallable } from "firebase/functions";
import { functions, auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { toast } from "sonner";
import { validateFacilityPasswordForm } from "@/utils/facilityPasswordSecurity";
import {
  KeyRound,
  ShieldCheck,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  Lock,
  LogOut,
  RefreshCw,
} from "lucide-react";

export const FacilityPasswordChangeScreen: React.FC = () => {
  const { selectedFacility, refreshUserProfile } = useFacility();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Policy Checks via shared production helper
  const formValidation = validateFacilityPasswordForm(newPassword, confirmPassword);
  const { hasMinLength, hasLetter, hasNumber, isMatch, valid: isFormValid } = formValidation;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!formValidation.valid) {
      setErrorMessage(formValidation.error || "Please check password requirements.");
      return;
    }

    setIsSubmitting(true);
    try {
      const changePasswordCallable = httpsCallable<
        { newPassword: string },
        { success: boolean; message: string; facilityId: string }
      >(functions, "changeFacilityPassword");

      const result = await changePasswordCallable({ newPassword });

      if (result.data && result.data.success) {
        // Zero persistence: clear password fields from memory immediately
        setNewPassword("");
        setConfirmPassword("");

        // Refresh and verify trusted profile state from Firestore
        const isVerifiedClean = await refreshUserProfile();
        if (isVerifiedClean) {
          toast.success("Private password established successfully. Welcome to HospitalHub.");
        } else {
          // If flag verification failed, keep fail-closed
          setErrorMessage(
            "Password was updated, but profile verification is still pending. Please refresh or try again.",
          );
        }
      } else {
        setErrorMessage(result.data?.message || "Failed to establish password. Please try again.");
      }
    } catch (err: unknown) {
      const error = err as { message?: string; code?: string };
      console.error("Error setting private password:", err);
      setErrorMessage(
        error.message ||
          "Failed to establish private password. Please check requirements and try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Sign out failed:", err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 sm:p-6 text-slate-100">
      <div className="w-full max-w-lg bg-slate-850 rounded-3xl border border-slate-750 p-6 sm:p-8 shadow-2xl space-y-6">
        {/* Header Icon & Title */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 mb-2">
            <KeyRound className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Create Your Private Password
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
            Your administrator issued a temporary password for this account. Please create your own
            private password before continuing.
          </p>
        </div>

        {/* Facility Identity Pill */}
        {selectedFacility && (
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl px-4 py-3 flex items-center justify-between">
            <div className="space-y-0.5 text-left">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Facility Account
              </p>
              <p className="text-sm font-semibold text-white">{selectedFacility.name}</p>
            </div>
            <span className="text-[11px] font-mono bg-slate-900/60 border border-slate-700 text-blue-300 px-2.5 py-1 rounded-lg">
              {selectedFacility.facilityId}
            </span>
          </div>
        )}

        {/* Password Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* New Password */}
          <div className="space-y-1.5 text-left">
            <label className="block text-xs font-semibold text-slate-300">New Password</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                disabled={isSubmitting}
                placeholder="Enter new private password"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Confirm New Password */}
          <div className="space-y-1.5 text-left">
            <label className="block text-xs font-semibold text-slate-300">
              Confirm New Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={isSubmitting}
                placeholder="Re-enter new private password"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200"
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Password Policy Checklist */}
          <div className="bg-slate-800/50 border border-slate-750 rounded-2xl p-3.5 space-y-2 text-left">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
              Password Requirements
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div
                className={`flex items-center gap-1.5 ${hasMinLength ? "text-emerald-400 font-medium" : "text-slate-400"}`}
              >
                {hasMinLength ? (
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                )}
                <span>At least 8 characters</span>
              </div>
              <div
                className={`flex items-center gap-1.5 ${hasLetter ? "text-emerald-400 font-medium" : "text-slate-400"}`}
              >
                {hasLetter ? (
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                )}
                <span>At least one letter</span>
              </div>
              <div
                className={`flex items-center gap-1.5 ${hasNumber ? "text-emerald-400 font-medium" : "text-slate-400"}`}
              >
                {hasNumber ? (
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                )}
                <span>At least one number</span>
              </div>
              <div
                className={`flex items-center gap-1.5 ${isMatch ? "text-emerald-400 font-medium" : "text-slate-400"}`}
              >
                {isMatch ? (
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                )}
                <span>Passwords match</span>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 pt-1 border-t border-slate-700/50">
              Note: Passwords are case-sensitive.
            </p>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-start gap-2 text-left animate-in fade-in duration-150">
              <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={!isFormValid || isSubmitting}
            className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-sm text-white shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Establishing Password...</span>
              </>
            ) : (
              <span>Save Private Password & Continue</span>
            )}
          </button>
        </form>

        {/* Footer with Sign Out */}
        <div className="pt-2 border-t border-slate-750 flex items-center justify-between text-xs text-slate-400">
          <span>Need help? Contact administrator.</span>
          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-200 transition-colors font-medium"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
