import { createFileRoute, redirect } from "@tanstack/react-router";
import { FacilityAccountManager } from "@/components/admin/FacilityAccountManager";
import { useFacility } from "@/context/FacilityContext";
import { RefreshCw, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/admin-facilities")({
  component: AdminFacilitiesPage,
});

function AdminFacilitiesPage() {
  const { userRole, isAdmin, currentUser } = useFacility();

  // If we have a user but profile role isn't loaded yet, show loading
  if (currentUser && userRole === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-10 text-center">
        <RefreshCw className="h-10 w-10 animate-spin text-primary/40" />
        <p className="mt-4 text-sm font-bold text-muted-foreground">
          Verifying administrator privileges...
        </p>
      </div>
    );
  }

  // Protection: only active Admin role
  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-10 text-center">
        <ShieldCheck className="h-16 w-16 text-muted-foreground/20" />
        <h2 className="mt-6 text-xl font-bold text-heading">Access Restricted</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          This area is reserved for authorized system administrators only.
        </p>
        <button
          onClick={() => (window.location.href = "/")}
          className="mt-6 rounded-xl bg-primary px-6 py-2.5 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90"
        >
          Return Home
        </button>
      </div>
    );
  }

  return <FacilityAccountManager />;
}
