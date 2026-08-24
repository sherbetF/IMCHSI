import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CalendarHeart, Activity, HeartPulse } from "lucide-react";
import { SiteHeader } from "@/components/hospital/SiteHeader";
import { SiteFooter } from "@/components/hospital/SiteFooter";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hospital Sultan Ismail — Internal Medicine Clinic" },
      {
        name: "description",
        content:
          "Internal hub for Hospital Sultan Ismail: Non-Invasive Cardiovascular Laboratory, Echocardiogram, Exercise Stress Test, and 24 Hours Holter Monitoring.",
      },
      { property: "og:title", content: "Hospital Sultan Ismail — Internal Medicine Clinic" },
      {
        property: "og:description",
        content:
          "Cardiovascular laboratory appointment request modules (Echocardiogram, Exercise Stress Test, 24H Holter Monitoring) and clinical tools.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const primaryModules = [
  {
    to: "/echo" as const,
    icon: CalendarHeart,
    label: "Module 01",
    title: "Echocardiogram",
    desc: "Request a Transthoracic Echocardiogram (TTE) appointment for clinical cardiac evaluation.",
    meta: "Appointment Booking",
  },
  {
    to: "/stress-test" as const,
    icon: Activity,
    label: "Module 02",
    title: "Exercise Stress Test",
    desc: "Request an Exercise Stress Treadmill Test (Bruce Protocol) appointment for ischaemia evaluation.",
    meta: "Appointment Booking",
  },
  {
    to: "/holter" as const,
    icon: HeartPulse,
    label: "Module 03",
    title: "24 Hours Holter Monitoring",
    desc: "Request a 24-Hour continuous ambulatory ECG monitoring appointment for arrhythmia evaluation.",
    meta: "Appointment Booking",
  },
];

function Index() {
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#appointment-portals") {
      setTimeout(() => {
        const el = document.getElementById("appointment-portals");
        if (el) {
          el.scrollIntoView({ behavior: "smooth" });
        }
      }, 150);
    }
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-[1200px] px-5 py-16 text-center">
          <p className="eyebrow text-muted-foreground">INTERNAL MEDICINE CLINIC</p>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-extrabold leading-tight sm:text-5xl">
            Non-Invasive Cardiovascular Laboratory
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground">
            Select an appointment request portal or clinical tool below. All modules are for
            internal clinical and administrative use at Hospital Sultan Ismail.
          </p>
        </div>
      </section>

      <section id="appointment-portals" className="mx-auto max-w-[1200px] px-5 py-12 scroll-mt-6">
        <div>
          <h2 className="text-xl font-bold text-heading">Lab Appointment Request Portals</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Submit referral and appointment booking requests for non-invasive cardiac diagnostic
            tests.
          </p>

          <div className="mt-6 grid gap-6 md:grid-cols-3">
            {primaryModules.map((s) => (
              <Link
                key={s.to}
                to={s.to}
                className="group flex flex-col rounded-xl border border-border bg-background p-6 transition-colors hover:border-primary shadow-sm"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-md border border-border bg-accent text-accent-foreground">
                  <s.icon className="h-5 w-5 text-primary" />
                </span>
                <p className="eyebrow mt-5 text-muted-foreground">{s.label}</p>
                <h3 className="mt-2 text-lg font-bold text-heading">{s.title}</h3>
                <p className="mt-2 flex-1 text-sm text-muted-foreground">{s.desc}</p>
                <span className="mt-5 flex items-center justify-between border-t border-border pt-4 text-sm font-semibold text-primary">
                  {s.meta}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
