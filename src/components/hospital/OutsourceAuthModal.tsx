import { useState, useEffect, useRef } from "react";
import { Lock, Eye, EyeOff, X, ArrowRight, ShieldCheck, AlertCircle } from "lucide-react";
import { useFacility } from "@/context/FacilityContext";
import { useNavigate, useLocation } from "@tanstack/react-router";
import jataNegaraLogo from "@/assets/jata-negara.svg";

export function OutsourceAuthModal() {
  const {
    isOutsourceAuthOpen,
    closeOutsourceAuth,
    verifyOutsourcePassword,
    isOutsourceAuthenticated,
  } = useFacility();

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (isOutsourceAuthOpen) {
      setPassword("");
      setError("");
      setShowPassword(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOutsourceAuthOpen]);

  if (!isOutsourceAuthOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError("Please enter the password.");
      inputRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    const isValid = verifyOutsourcePassword(password);
    setIsSubmitting(false);

    if (isValid) {
      setError("");
      setPassword("");
      if (location.pathname !== "/outsource") {
        navigate({ to: "/outsource" });
      }
    } else {
      setError("Incorrect password. Please try again.");
      setPassword("");
      inputRef.current?.focus();
    }
  };

  const handleClose = () => {
    closeOutsourceAuth();
    if (location.pathname === "/outsource" && !isOutsourceAuthenticated) {
      navigate({ to: "/" });
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="outsource-auth-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface p-6 shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Close Button */}
        <button
          onClick={handleClose}
          type="button"
          className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header Branding */}
        <div className="flex items-center gap-3 border-b border-border pb-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <h2 id="outsource-auth-title" className="text-lg font-bold text-heading">
              Outsource Portal Access
            </h2>
            <p className="text-xs text-muted-foreground">
              Hospital Sultan Ismail — Diagnostic Reports Database
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-heading mb-1.5">
              Enter Access Password
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError("");
                }}
                placeholder="Enter password..."
                className={`w-full rounded-xl border bg-background px-3.5 py-2.5 pr-10 text-sm outline-none transition-all placeholder:text-muted-foreground ${
                  error
                    ? "border-destructive focus:border-destructive ring-1 ring-destructive/30"
                    : "border-border focus:border-primary focus:ring-1 focus:ring-primary/20"
                }`}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {error && (
              <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-destructive animate-in fade-in">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Restricted access for authorized medical personnel to view and manage outsourced
            radiology & diagnostic lab reports.
          </p>

          <div className="mt-6 flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
            >
              <span>Unlock Access</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
