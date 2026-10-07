import React, { useState } from "react";
import { Lock, KeyRound, ShieldCheck, Check, X, AlertTriangle, Eye, EyeOff } from "lucide-react";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useFacility } from "@/context/FacilityContext";
import { validateFacilityPasswordForm } from "@/utils/facilityPasswordSecurity";
import { toast } from "sonner";

interface AdminChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminChangePasswordModal: React.FC<AdminChangePasswordModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { isAdmin, currentUser } = useFacility();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleReset = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsLoading(false);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    // Step 1: Verify authenticated Admin session
    if (!isAdmin || !currentUser || !auth.currentUser) {
      setErrorMessage("Unauthorized: You must be signed in as an active Administrator.");
      return;
    }

    const userEmail = auth.currentUser.email;
    if (!userEmail) {
      setErrorMessage("Authenticated admin user is missing an email address.");
      return;
    }

    // Step 2: Validate inputs
    if (!currentPassword.trim()) {
      setErrorMessage("Please enter your current password.");
      return;
    }

    const valRes = validateFacilityPasswordForm(newPassword, confirmNewPassword);
    if (!valRes.valid) {
      setErrorMessage(valRes.error || "Password does not meet required policy criteria.");
      return;
    }

    setIsLoading(true);

    try {
      // Step 3: Reauthenticate currently logged-in Admin using current password
      const credential = EmailAuthProvider.credential(userEmail, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);

      // Step 4: Update password using client SDK
      await updatePassword(auth.currentUser, newPassword);

      // Step 5: Successful completion
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setSuccessMessage("Your password has been changed successfully.");
      toast.success("Your password has been changed successfully.");
    } catch (err: unknown) {
      const authErr = err as { code?: string; message?: string };
      const code = authErr.code || "";

      if (
        code === "auth/wrong-password" ||
        code === "auth/invalid-credential" ||
        code === "auth/invalid-password"
      ) {
        setErrorMessage("Current password is incorrect.");
      } else if (code === "auth/too-many-requests") {
        setErrorMessage("Too many failed attempts. Please wait a moment and try again.");
      } else if (code === "auth/requires-recent-login") {
        setErrorMessage(
          "Security timeout: Please sign out and sign in again before changing your password.",
        );
      } else if (code === "auth/weak-password") {
        setErrorMessage("New password is too weak according to Firebase security policy.");
      } else if (code === "auth/network-request-failed") {
        setErrorMessage("Network connection error. Please check your connection and try again.");
      } else {
        setErrorMessage("Failed to update password. Please verify your details and try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const validation = validateFacilityPasswordForm(newPassword, confirmNewPassword);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200 overflow-y-auto">
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-background shadow-2xl overflow-hidden flex flex-col my-auto">
        {/* Header */}
        <div className="border-b border-border bg-surface p-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
              <KeyRound className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-heading">Change My Password</h2>
              <p className="text-xs text-muted-foreground truncate">
                Administrator Self-Service Credentials
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-surface hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMessage && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3.5 text-xs text-destructive font-semibold flex items-start gap-2 animate-in fade-in">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-700 dark:text-emerald-300 font-bold flex items-start gap-2 animate-in fade-in">
              <Check className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Current Password Field */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-heading uppercase tracking-wider">
              Current Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
              <input
                type={showCurrentPassword ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  setErrorMessage(null);
                }}
                placeholder="Enter current password..."
                className="w-full rounded-xl border border-border bg-background pl-10 pr-10 py-2.5 text-sm font-medium outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
              >
                {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* New Password Field */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-heading uppercase tracking-wider">
              New Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
              <input
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setErrorMessage(null);
                }}
                placeholder="Enter new password..."
                className="w-full rounded-xl border border-border bg-background pl-10 pr-10 py-2.5 text-sm font-medium outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                required
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
              >
                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Confirm New Password Field */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-heading uppercase tracking-wider">
              Confirm New Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
              <input
                type={showConfirmPassword ? "text" : "password"}
                value={confirmNewPassword}
                onChange={(e) => {
                  setConfirmNewPassword(e.target.value);
                  setErrorMessage(null);
                }}
                placeholder="Re-enter new password..."
                className="w-full rounded-xl border border-border bg-background pl-10 pr-10 py-2.5 text-sm font-medium outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Password Policy Indicator */}
          {newPassword.length > 0 && (
            <div className="rounded-xl border border-border bg-surface p-3 space-y-1 text-xs text-muted-foreground">
              <p className="font-bold text-foreground text-[11px]">Password Policy Checklist:</p>
              <div className="grid grid-cols-2 gap-1 mt-1 text-[11px]">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`h-2 w-2 rounded-full ${validation.hasMinLength ? "bg-emerald-500" : "bg-muted"}`}
                  />
                  <span>At least 8 chars</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`h-2 w-2 rounded-full ${validation.hasLetter ? "bg-emerald-500" : "bg-muted"}`}
                  />
                  <span>At least 1 letter</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`h-2 w-2 rounded-full ${validation.hasNumber ? "bg-emerald-500" : "bg-muted"}`}
                  />
                  <span>At least 1 number</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`h-2 w-2 rounded-full ${validation.isMatch ? "bg-emerald-500" : "bg-muted"}`}
                  />
                  <span>Passwords match</span>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 border-t border-border pt-4 shrink-0">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-xl border border-border px-4 py-2 text-xs font-semibold hover:bg-surface transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !currentPassword || !newPassword || !confirmNewPassword}
              className="flex items-center gap-2 rounded-xl bg-amber-500 text-amber-950 px-5 py-2 text-xs font-bold shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isLoading ? (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-amber-950 border-t-transparent" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              <span>{isLoading ? "Updating..." : "Update Password"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
