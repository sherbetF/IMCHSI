import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/hospital/SiteHeader";
import { OutsourceAppointment } from "@/components/hospital/OutsourceAppointment";
import { SiteFooter } from "@/components/hospital/SiteFooter";

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
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <main className="flex-1">
        <OutsourceAppointment />
      </main>
      <SiteFooter />
    </div>
  );
}
