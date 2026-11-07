import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/hospital/SiteHeader";
import { SiteFooter } from "@/components/hospital/SiteFooter";
import { FacilityAccountManager } from "@/components/admin/FacilityAccountManager";
import { useFacility } from "@/context/FacilityContext";
import { RefreshCw, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/admin-facilities")({
  head: () => ({
    meta: [
      { title: "Facility Account Manager — Hospital Sultan Ismail" },
      {
        name: "description",
        content:
          "Centralized account management for Consumer Facilities, Paramedics, and Specialists at Hospital Sultan Ismail.",
      },
      {
        property: "og:title",
        content: "Facility Account Manager — Hospital Sultan Ismail",
      },
      {
        property: "og:description",
        content:
          "Centralized account management for Consumer Facilities and Paramedics at Hospital Sultan Ismail.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminFacilitiesPage,
});

function AdminFacilitiesPage() {
  const { userRole, isAdmin, currentUser } = useFacility();

  // If we have a user but profile role isn't loaded yet, show loading
  if (currentUser && userRole === null) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="flex min-h-[60vh] flex-col items-center justify-center p-10 text-center">
          <RefreshCw className="h-10 w-10 animate-spin text-primary/40" />
          <p className="mt-4 text-sm font-bold text-muted-foreground">
            Verifying administrator privileges...
          </p>
        </div>
        <SiteFooter />
      </div>
    );
  }

  // Protection: only active Admin role
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="flex min-h-[60vh] flex-col items-center justify-center p-10 text-center">
          <ShieldCheck className="h-16 w-16 text-muted-foreground/20" />
          <h2 className="mt-6 text-xl font-bold text-heading">Access Restricted</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            This area is reserved for authorized system administrators only.
          </p>
          <button
            onClick={() => (window.location.href = "/")}
            className="mt-6 rounded-lg bg-primary px-6 py-2.5 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
          >
            Return Home
          </button>
        </div>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <FacilityAccountManager />
      <SiteFooter />
    </div>
  );
}
