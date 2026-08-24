import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/hospital/SiteHeader";
import { StressTestAppointment } from "@/components/hospital/StressTestAppointment";
import { SiteFooter } from "@/components/hospital/SiteFooter";

export const Route = createFileRoute("/stress-test")({
  head: () => ({
    meta: [
      { title: "Exercise Stress Test Appointment Request — Hospital Sultan Ismail" },
      {
        name: "description",
        content:
          "Request an Exercise Stress Test (Treadmill) appointment for clinical cardiac evaluation.",
      },
      {
        property: "og:title",
        content: "Exercise Stress Test Appointment Request — Hospital Sultan Ismail",
      },
      {
        property: "og:description",
        content:
          "Request an Exercise Stress Test appointment for clinical cardiac evaluation at Hospital Sultan Ismail.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StressTestPage,
});

function StressTestPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <StressTestAppointment />
      <SiteFooter />
    </div>
  );
}
