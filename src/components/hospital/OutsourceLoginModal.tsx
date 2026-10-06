import React, { useState } from "react";
import { Lock, X, ShieldCheck, FileSpreadsheet } from "lucide-react";
import { useFacility } from "@/context/FacilityContext";
import { toast } from "sonner";

export function OutsourceLoginModal() {
  const { isOutsourceAuthOpen, closeOutsourceAuth, loginOutsource } = useFacility();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!isOutsourceAuthOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setError("");
    setLoading(true);

    try {
      const res = await loginOutsource(password);
      if (res.success) {
        setPassword("");
        toast.success("Outsource service provider authentication successful!");
      } else {
        setPassword("");
        setError(res.error || "Invalid outsource credentials or account not provisioned.");
      }
    } catch {
      setPassword("");
      setError("Invalid outsource credentials or account not provisioned.");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setPassword("");
    setError("");
    closeOutsourceAuth();
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-background shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="border-b border-border bg-surface p-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
              <FileSpreadsheet className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-heading">Outsource Diagnostic Portal</h2>
              <p className="text-xs text-muted-foreground">
                Hospital Sultan Ismail External Reports
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCancel}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-surface transition-all"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-1">
            <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span>Provider Authentication Required</span>
            </p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Enter your assigned outsource service provider password to manage radiology scans,
              EEG/NCS studies, and diagnostic reports.
            </p>
          </div>

          {error && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive font-semibold">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-heading uppercase tracking-wider">
              Outsource Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
                placeholder="Enter password..."
                className="w-full rounded-xl border border-border bg-background pl-10 pr-4 py-2.5 text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                autoFocus
                required
              />
            </div>
          </div>

          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-xl border border-border px-4 py-2 text-xs font-semibold hover:bg-surface"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !password}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {loading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              <span>{loading ? "Authenticating..." : "Sign In"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
