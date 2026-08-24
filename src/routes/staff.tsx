import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/hospital/SiteHeader";
import { EchoAppointment } from "@/components/hospital/EchoAppointment";
import { SiteFooter } from "@/components/hospital/SiteFooter";

export const Route = createFileRoute("/staff")({
  head: () => ({
    meta: [
      { title: "Echocardiogram Appointment Request — Hospital Sultan Ismail" },
      {
        name: "description",
        content:
          "Request an echocardiogram appointment for clinical cardiac evaluation, TTE, TEE, or stress echo.",
      },
      {
        property: "og:title",
        content: "Echocardiogram Appointment Request — Hospital Sultan Ismail",
      },
      {
        property: "og:description",
        content:
          "Request an echocardiogram appointment for clinical cardiac evaluation at Hospital Sultan Ismail.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StaffPage,
});

function StaffPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <EchoAppointment />
      <SiteFooter />
    </div>
  );
}
