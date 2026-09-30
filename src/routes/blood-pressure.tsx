import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/hospital/SiteHeader";
import { BloodPressureAppointment } from "@/components/hospital/BloodPressureAppointment";
import { SiteFooter } from "@/components/hospital/SiteFooter";

export const Route = createFileRoute("/blood-pressure")({
  head: () => ({
    meta: [
      { title: "24 Hours Blood Pressure Monitoring Appointment Request — Hospital Sultan Ismail" },
      {
        name: "description",
        content:
          "Request a 24 Hours Ambulatory Blood Pressure Monitoring (ABPM) appointment for hypertension evaluation at Hospital Sultan Ismail.",
      },
      {
        property: "og:title",
        content: "24 Hours Blood Pressure Monitoring Appointment Request — Hospital Sultan Ismail",
      },
      {
        property: "og:description",
        content:
          "Request a 24 Hours Ambulatory Blood Pressure Monitoring (ABPM) appointment for continuous blood pressure assessment at Hospital Sultan Ismail.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BloodPressurePage,
});

function BloodPressurePage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <BloodPressureAppointment />
      <SiteFooter />
    </div>
  );
}
