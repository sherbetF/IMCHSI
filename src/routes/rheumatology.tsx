import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/hospital/SiteHeader";
import { RheumatologyAppointment } from "@/components/hospital/RheumatologyAppointment";
import { SiteFooter } from "@/components/hospital/SiteFooter";

export const Route = createFileRoute("/rheumatology")({
  head: () => ({
    meta: [
      { title: "Rheumatology Appointment Request — Hospital Sultan Ismail" },
      {
        name: "description",
        content:
          "Request a specialist rheumatology appointment for clinical rheumatology evaluation, autoimmune disorders, and arthritis at Hospital Sultan Ismail.",
      },
      {
        property: "og:title",
        content: "Rheumatology Appointment Request — Hospital Sultan Ismail",
      },
      {
        property: "og:description",
        content:
          "Request a specialist rheumatology appointment for clinical rheumatology evaluation at Hospital Sultan Ismail.",
      },
      {
        property: "og:type",
        content: "website",
      },
      {
        name: "twitter:card",
        content: "summary_large_image",
      },
    ],
  }),
  component: RheumatologyPage,
});

function RheumatologyPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <RheumatologyAppointment />
      <SiteFooter />
    </div>
  );
}
