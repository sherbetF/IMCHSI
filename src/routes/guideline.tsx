import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ChevronRight,
  Clock,
  MapPin,
  AlertCircle,
  HeartPulse,
  Activity,
  CalendarHeart,
  Info,
  Construction,
} from "lucide-react";
import { SiteHeader } from "@/components/hospital/SiteHeader";
import { SiteFooter } from "@/components/hospital/SiteFooter";

export const Route = createFileRoute("/guideline")({
  head: () => ({
    meta: [
      { title: "Lab Operational Guidelines — Hospital Sultan Ismail" },
      {
        name: "description",
        content:
          "Operational guidelines, referral requirements, and patient preparation for Echocardiogram, Exercise Stress Test, and 24H Holter Monitoring at Hospital Sultan Ismail.",
      },
      {
        property: "og:title",
        content: "Lab Operational Guidelines — Hospital Sultan Ismail",
      },
      {
        property: "og:description",
        content:
          "Operational guidelines and preparation criteria for Non-Invasive Cardiovascular Laboratory at Hospital Sultan Ismail.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GuidelinePage,
});

function GuidelinePage() {
  return (
    <div className="min-h-screen bg-background relative">
      <SiteHeader />

      {/* Under Development Notice Overlay */}
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
        <div className="max-w-md w-full rounded-2xl border border-primary/20 bg-surface p-8 shadow-2xl text-center space-y-5 animate-in zoom-in-95">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Info className="h-8 w-8" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
              <Construction className="h-3.5 w-3.5" /> Under Development
            </div>
            <h2 className="text-xl font-bold text-heading mt-2">Operational Guidelines</h2>
          </div>
          <div className="rounded-xl border border-border/80 bg-background/60 p-4 text-sm font-medium text-foreground leading-relaxed">
            This site is still under development . If you have any inquiries , please contact MA
            Shafiq IMC :)
          </div>
          <div className="pt-2">
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-xl bg-primary px-6 py-2.5 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
            >
              Return to Home
            </Link>
          </div>
        </div>
      </div>

      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-[1200px] px-5 py-14 text-center">
          <nav className="flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground">
            <Link to="/" className="hover:text-primary">
              Home
            </Link>
            <ChevronRight className="h-4 w-4" />
            <span className="text-heading">Operational Guidelines</span>
          </nav>
          <h1 className="mx-auto mt-6 max-w-3xl text-3xl font-extrabold leading-tight sm:text-4xl">
            Non-Invasive Cardiovascular Laboratory Guidelines
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm text-muted-foreground">
            Clinical protocols, referral criteria, patient preparation guidelines, and unit
            operating hours for Hospital Sultan Ismail.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] space-y-8 px-5 py-12">
        {/* General Operating Information */}
        <div className="rounded-2xl border border-border bg-background p-6 shadow-sm">
          <div className="flex items-center gap-3 border-b border-border pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-heading">
                General Operating Hours &amp; Urgency Protocol
              </h2>
              <p className="text-xs text-muted-foreground">
                Non-Invasive Cardiovascular Unit • Level 2
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="space-y-2 rounded-xl border border-border/80 bg-surface p-4">
              <p className="flex items-center gap-2 text-xs font-bold text-heading">
                <Clock className="h-4 w-4 text-primary" /> Service Schedule
              </p>
              <ul className="list-inside list-disc space-y-1.5 text-xs text-muted-foreground">
                <li>
                  <strong className="text-foreground">Monday – Friday:</strong> 08:00 AM – 05:00 PM
                </li>
                <li>
                  <strong className="text-foreground">Lunch Break:</strong> 01:00 PM – 02:00 PM{" "}
                  (Fri: 12:15 PM – 02:45 PM)
                </li>
                <li className="font-semibold text-amber-600 dark:text-amber-400">
                  <strong className="text-amber-600 dark:text-amber-400">
                    Weekends &amp; Public Holidays:
                  </strong>{" "}
                  Closed
                </li>
              </ul>
            </div>

            <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <p className="flex items-center gap-2 text-xs font-bold text-amber-700 dark:text-amber-300">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" /> Urgent /
                Inpatient Referrals
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                For urgent inpatient evaluations or STAT requests, submit the online request portal
                AND perform a direct verbal telephone call to the lab extension:
              </p>
              <p className="font-mono text-xs font-bold text-amber-700 dark:text-amber-300">
                General Line: +60 7-356 5000 (Ext. 2215 / 2225)
              </p>
            </div>
          </div>
        </div>

        {/* Diagnostic Testing Guidelines Grid */}
        <div className="grid gap-6 md:grid-cols-3">
          {/* Echocardiogram */}
          <div className="flex flex-col space-y-4 rounded-2xl border border-border bg-background p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <CalendarHeart className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-heading">Echocardiogram (TTE)</h3>
                <p className="text-xs text-muted-foreground">Room 15 • Ext. 2225</p>
              </div>
            </div>

            <div className="flex-1 space-y-3 text-xs text-muted-foreground">
              <div className="space-y-1">
                <p className="font-bold text-foreground">Standard Modality:</p>
                <p>Transthoracic Echocardiogram (TTE) standard adult cardiac evaluation.</p>
              </div>
              <div className="space-y-1">
                <p className="font-bold text-foreground">Patient Prep:</p>
                <p>
                  No fasting required. Patient should bring previous cardiac records or ECG if
                  available.
                </p>
              </div>
              <div className="space-y-1">
                <p className="font-bold text-foreground">Requirements:</p>
                <p>
                  Completed referral form with clear clinical indication &amp; relevant clinical
                  history.
                </p>
              </div>
            </div>

            <Link
              to="/staff"
              className="mt-auto flex items-center justify-center gap-2 rounded-xl bg-primary/10 px-4 py-2.5 text-xs font-bold text-primary transition-colors hover:bg-primary/20"
            >
              Request Echo Appointment <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Exercise Stress Test */}
          <div className="flex flex-col space-y-4 rounded-2xl border border-border bg-background p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-heading">Exercise Stress Test</h3>
                <p className="text-xs text-muted-foreground">Room 16 • Ext. 2215</p>
              </div>
            </div>

            <div className="flex-1 space-y-3 text-xs text-muted-foreground">
              <div className="space-y-1">
                <p className="font-bold text-foreground">Standard Modality:</p>
                <p>Treadmill Stress Test (Bruce Protocol) for ischaemia evaluation.</p>
              </div>
              <div className="space-y-1">
                <p className="font-bold text-foreground">Patient Prep:</p>
                <p>
                  Wear sports shoes &amp; trousers. Light meal 2h prior. Avoid caffeine &amp;
                  smoking.
                </p>
              </div>
              <div className="space-y-1">
                <p className="font-bold text-amber-600 dark:text-amber-400">Mandatory Form:</p>
                <p className="text-amber-600 dark:text-amber-400">
                  Ensure patient is provided with EST form and has signed the consent form.
                </p>
              </div>
            </div>

            <Link
              to="/stress-test"
              className="mt-auto flex items-center justify-center gap-2 rounded-xl bg-primary/10 px-4 py-2.5 text-xs font-bold text-primary transition-colors hover:bg-primary/20"
            >
              Request Stress Test <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          {/* 24H Holter Monitoring */}
          <div className="flex flex-col space-y-4 rounded-2xl border border-border bg-background p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <HeartPulse className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-heading">24H Holter Monitoring</h3>
                <p className="text-xs text-muted-foreground">Room 14 • Ext. 2218</p>
              </div>
            </div>

            <div className="flex-1 space-y-3 text-xs text-muted-foreground">
              <div className="space-y-1">
                <p className="font-bold text-foreground">Standard Modality:</p>
                <p>24-Hour ambulatory continuous ECG recording for arrhythmia evaluation.</p>
              </div>
              <div className="space-y-1">
                <p className="font-bold text-foreground">Patient Prep:</p>
                <p>Shower before appointment. The recorder device must be kept completely dry.</p>
              </div>
              <div className="space-y-1">
                <p className="font-bold text-foreground">Patient Diary:</p>
                <p>
                  Patient must maintain activity/symptom log and return unit punctually at 24 hours.
                </p>
              </div>
            </div>

            <Link
              to="/holter"
              className="mt-auto flex items-center justify-center gap-2 rounded-xl bg-primary/10 px-4 py-2.5 text-xs font-bold text-primary transition-colors hover:bg-primary/20"
            >
              Request Holter Appointment <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* Contact & Location Reference Card */}
        <div className="space-y-4 rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <h3 className="flex items-center gap-2 text-base font-bold text-heading">
            <MapPin className="h-5 w-5 text-primary" /> Unit Location &amp; Direct Extensions
          </h3>
          <div className="grid gap-4 text-xs sm:grid-cols-2 md:grid-cols-4">
            <div className="space-y-1 rounded-xl border border-border/80 bg-background p-3.5">
              <p className="font-bold text-heading">Internal Medicine Clinic</p>
              <p className="text-muted-foreground">Room 21, Level 2</p>
              <p className="font-mono font-semibold text-primary">Ext. 2214</p>
            </div>
            <div className="space-y-1 rounded-xl border border-border/80 bg-background p-3.5">
              <p className="font-bold text-heading">Echo Room</p>
              <p className="text-muted-foreground">Room 15, Level 2</p>
              <p className="font-mono font-semibold text-primary">Ext. 2225</p>
            </div>
            <div className="space-y-1 rounded-xl border border-border/80 bg-background p-3.5">
              <p className="font-bold text-heading">Stress Test Room</p>
              <p className="text-muted-foreground">Room 16, Level 2</p>
              <p className="font-mono font-semibold text-primary">Ext. 2215</p>
            </div>
            <div className="space-y-1 rounded-xl border border-border/80 bg-background p-3.5">
              <p className="font-bold text-heading">Holter Room</p>
              <p className="text-muted-foreground">Room 14, Level 2</p>
              <p className="font-mono font-semibold text-primary">Ext. 2218</p>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
