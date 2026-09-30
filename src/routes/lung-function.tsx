import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/hospital/SiteHeader";
import { LungFunctionAppointment } from "@/components/hospital/LungFunctionAppointment";
import { SiteFooter } from "@/components/hospital/SiteFooter";

export const Route = createFileRoute("/lung-function")({
  head: () => ({
    meta: [
      { title: "Lung Function Test / Spirometry Appointment Request — Hospital Sultan Ismail" },
      {
        name: "description",
        content:
          "Request a Lung Function Test / Spirometry appointment for pulmonary airflow and respiratory evaluation at Hospital Sultan Ismail.",
      },
      {
        property: "og:title",
        content: "Lung Function Test / Spirometry Appointment Request — Hospital Sultan Ismail",
      },
      {
        property: "og:description",
        content:
          "Request a Lung Function Test / Spirometry appointment for pulmonary airflow and respiratory evaluation at Hospital Sultan Ismail.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LungFunctionPage,
});

function LungFunctionPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <LungFunctionAppointment />
      <SiteFooter />
    </div>
  );
}
