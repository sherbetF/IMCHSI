import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/hospital/SiteHeader";
import { OutsourceAppointment } from "@/components/hospital/OutsourceAppointment";
import { SiteFooter } from "@/components/hospital/SiteFooter";
import { useFacility } from "@/context/FacilityContext";
import { Lock, Eye, EyeOff, AlertCircle, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/outsource")({
  head: () => ({
    meta: [
      { title: "Outsource Radiology & Diagnostic Reports Database — Hospital Sultan Ismail" },
      {
        name: "description",
        content:
          "Internal database for storing, searching, and managing outsourced diagnostic reports (MRI, CT SCAN, USG, COROS, EEG, NCS, etc.) from external private hospitals.",
      },
      {
        property: "og:title",
        content: "Outsource Radiology & Diagnostic Reports Database — Hospital Sultan Ismail",
      },
      {
        property: "og:description",
        content:
          "Internal database for storing, searching, and managing outsourced diagnostic reports from private hospitals.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OutsourcePage,
});

function OutsourcePage() {
  const { isOutsourceAuthenticated, verifyOutsourcePassword } = useFacility();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError("Please enter the password.");
      return;
    }
    setIsSubmitting(true);
    const isValid = verifyOutsourcePassword(password);
    setIsSubmitting(false);

    if (!isValid) {
      setError("Incorrect password. Please try again.");
      setPassword("");
    } else {
      setError("");
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <main className="flex-1">
        {isOutsourceAuthenticated ? (
          <OutsourceAppointment />
        ) : (
          <div className="mx-auto max-w-lg px-5 py-20">
            <div className="rounded-2xl border border-border bg-surface p-8 shadow-xl text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20">
                <Lock className="h-7 w-7" />
              </div>
              <h1 className="mt-5 text-xl font-bold text-heading">Outsource Portal Restricted</h1>
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                Access to the Outsource Diagnostic Reports database is protected. Enter the password
                to view, search, and upload records.
              </p>

              <form onSubmit={handleUnlock} className="mt-6 space-y-4 text-left">
                <div>
                  <label className="block text-xs font-semibold text-heading mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (error) setError("");
                      }}
                      placeholder="Enter password..."
                      className={`w-full rounded-xl border bg-background px-4 py-2.5 pr-10 text-sm outline-none transition-all ${
                        error
                          ? "border-destructive focus:border-destructive ring-1 ring-destructive/30"
                          : "border-border focus:border-primary focus:ring-1 focus:ring-primary/20"
                      }`}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
                >
                  <span>Unlock Outsource Database</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>
            </div>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
