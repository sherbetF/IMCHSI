import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/hospital/SiteHeader";
import { HolterAppointment } from "@/components/hospital/HolterAppointment";
import { SiteFooter } from "@/components/hospital/SiteFooter";

export const Route = createFileRoute("/holter")({
  head: () => ({
    meta: [
      { title: "24 Hours Holter Monitoring Appointment Request — Hospital Sultan Ismail" },
      {
        name: "description",
        content:
          "Request a 24 Hours Holter Monitoring appointment for continuous ambulatory ECG analysis.",
      },
      {
        property: "og:title",
        content: "24 Hours Holter Monitoring Appointment Request — Hospital Sultan Ismail",
      },
      {
        property: "og:description",
        content:
          "Request a 24 Hours Holter Monitoring appointment for continuous ambulatory ECG analysis at Hospital Sultan Ismail.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HolterPage,
});

function HolterPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <HolterAppointment />
      <SiteFooter />
    </div>
  );
}
