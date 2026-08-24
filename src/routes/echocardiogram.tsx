import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Info, Construction } from "lucide-react";
import { SiteHeader } from "@/components/hospital/SiteHeader";
import { SiteFooter } from "@/components/hospital/SiteFooter";

export const Route = createFileRoute("/echocardiogram")({
  head: () => ({
    meta: [
      { title: "Diastolic Dysfunction Calculator — Hospital Sultan Ismail" },
      {
        name: "description",
        content:
          "Grade LV diastolic function and estimate left atrial pressure from e', E/e', TR velocity, E/A, LAVi, LARS and IVRT.",
      },
      {
        property: "og:title",
        content: "Diastolic Dysfunction Calculator — Hospital Sultan Ismail",
      },
      {
        property: "og:description",
        content:
          "LV diastolic function grading and LAP estimation from echocardiographic Doppler measurements.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EchoPage,
});

type Field = { key: string; label: string; unit: string; hint: string; step?: string };

const primaryFields: Field[] = [
  { key: "septalE", label: "Septal e' velocity", unit: "cm/s", hint: "Abnormal ≤ 6", step: "0.1" },
  {
    key: "lateralE",
    label: "Lateral e' velocity",
    unit: "cm/s",
    hint: "Abnormal ≤ 7",
    step: "0.1",
  },
  { key: "septalEe", label: "Septal E/e'", unit: "", hint: "Abnormal ≥ 15", step: "0.1" },
  { key: "lateralEe", label: "Lateral E/e'", unit: "", hint: "Abnormal ≥ 13", step: "0.1" },
  { key: "trv", label: "TR velocity", unit: "m/s", hint: "Abnormal ≥ 2.8", step: "0.1" },
  { key: "pasp", label: "PASP", unit: "mmHg", hint: "Abnormal ≥ 35", step: "1" },
  { key: "ea", label: "Mitral E/A ratio", unit: "", hint: "Branch point 0.8 and 2.0", step: "0.1" },
];

const secondaryFields: Field[] = [
  { key: "sd", label: "Pulmonary vein S/D ratio", unit: "", hint: "Abnormal ≤ 0.67", step: "0.01" },
  {
    key: "lars",
    label: "LA reservoir strain (LARS)",
    unit: "%",
    hint: "Abnormal ≤ 18",
    step: "0.1",
  },
  {
    key: "lavi",
    label: "LA volume index (LAVi)",
    unit: "mL/m²",
    hint: "Abnormal > 34",
    step: "0.1",
  },
  { key: "ivrt", label: "IVRT", unit: "ms", hint: "Alternative: abnormal ≤ 70", step: "1" },
];

const defaults: Record<string, string> = {
  septalE: "5.5",
  lateralE: "6.5",
  septalEe: "16",
  lateralEe: "14",
  trv: "2.6",
  pasp: "30",
  ea: "1.4",
  sd: "0.9",
  lars: "22",
  lavi: "38",
  ivrt: "80",
};

const caveats = [
  "MAC, MR, MS",
  "Atrial fibrillation",
  "LVAD",
  "Non-cardiac PH",
  "HTX",
  "Pericardial constriction",
];

const fmt = (v: number | null, digits = 1) =>
  v === null || !isFinite(v) ? "—" : v.toFixed(digits);

function InputRow({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 px-4 py-3">
      <span className="min-w-0">
        <span className="block text-sm text-foreground">{field.label}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{field.hint}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <input
          type="number"
          step={field.step ?? "0.1"}
          min="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-24 rounded-md border border-border bg-background px-3 py-2 text-right text-sm font-semibold text-heading outline-none focus:border-primary"
        />
        <span className="w-14 text-xs text-muted-foreground">{field.unit}</span>
      </span>
    </label>
  );
}

function CriterionRow({
  label,
  detail,
  state,
}: {
  label: string;
  detail: string;
  state: boolean | null;
}) {
  const tone =
    state === null
      ? "bg-secondary text-muted-foreground"
      : state
        ? "bg-warning-soft text-warning"
        : "bg-success-soft text-success";
  const text = state === null ? "No data" : state ? "Abnormal" : "Normal";
  return (
    <div className="border-b border-border px-4 py-4 last:border-b-0">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-foreground">{label}</span>
        <span className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold ${tone}`}>
          {text}
        </span>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function EchoPage() {
  const [values, setValues] = useState<Record<string, string>>(defaults);

  const result = useMemo(() => {
    const num = (k: string) => {
      const n = parseFloat(values[k] ?? "");
      return isFinite(n) ? n : null;
    };

    const septalE = num("septalE");
    const lateralE = num("lateralE");
    const septalEe = num("septalEe");
    const lateralEe = num("lateralEe");
    const trv = num("trv");
    const pasp = num("pasp");
    const ea = num("ea");
    const sd = num("sd");
    const lars = num("lars");
    const lavi = num("lavi");
    const ivrt = num("ivrt");

    const avgE = septalE !== null && lateralE !== null ? (septalE + lateralE) / 2 : null;
    const avgEe = septalEe !== null && lateralEe !== null ? (septalEe + lateralEe) / 2 : null;

    const c1data = septalE !== null || lateralE !== null;
    const c1 = c1data
      ? (septalE !== null && septalE <= 6) ||
        (lateralE !== null && lateralE <= 7) ||
        (avgE !== null && avgE <= 6.5)
      : null;

    const c2data = septalEe !== null || lateralEe !== null;
    const c2 = c2data
      ? (septalEe !== null && septalEe >= 15) ||
        (lateralEe !== null && lateralEe >= 13) ||
        (avgEe !== null && avgEe >= 14)
      : null;

    const c3data = trv !== null || pasp !== null;
    const c3 = c3data ? (trv !== null && trv >= 2.8) || (pasp !== null && pasp >= 35) : null;

    const supplemental: string[] = [];
    if (sd !== null && sd <= 0.67) supplemental.push("Pulmonary vein S/D ≤ 0.67");
    if (lars !== null && lars <= 18) supplemental.push("LARS ≤ 18%");
    if (lavi !== null && lavi > 34) supplemental.push("LAVi > 34 mL/m²");
    const primarySupplementalAvailable = sd !== null || lars !== null || lavi !== null;
    const ivrtAbnormal = ivrt !== null && ivrt <= 70;
    if (!primarySupplementalAvailable && ivrtAbnormal) supplemental.push("IVRT ≤ 70 ms");

    if (c1 === null || c2 === null || c3 === null) {
      return {
        avgE,
        avgEe,
        c1,
        c2,
        c3,
        supplemental,
        pathway: "Enter e' velocities, E/e' and TR velocity or PASP to run the algorithm.",
        lap: "Indeterminate",
        grade: "Insufficient data",
        tone: "bg-secondary text-muted-foreground",
        note: "All three primary variables are required before diastolic function can be graded.",
      };
    }

    const abnormalCount = [c1, c2, c3].filter(Boolean).length;

    const viaSupplemental = () => {
      const increased = supplemental.length >= 1;
      if (increased) {
        if (ea === null)
          return {
            lap: "Increased LAP",
            grade: "Enter E/A to separate grade 2 from grade 3",
            tone: "bg-warning-soft text-destructive",
          };
        return ea < 2
          ? {
              lap: "Increased LAP",
              grade: "Grade 2 (mild/moderate ↑ LAP)",
              tone: "bg-warning-soft text-warning",
            }
          : {
              lap: "Increased LAP",
              grade: "Grade 3 (marked ↑ LAP)",
              tone: "bg-warning-soft text-destructive",
            };
      }
      return {
        lap: "Normal LAP",
        grade:
          ea !== null && ea <= 0.8 ? "Grade 1 (impaired relaxation)" : "Normal diastolic function",
        tone: "bg-success-soft text-success",
      };
    };

    // All normal
    if (abnormalCount === 0) {
      return {
        avgE,
        avgEe,
        c1,
        c2,
        c3,
        supplemental,
        pathway: "All three primary variables normal.",
        lap: "Normal LAP",
        grade: "Normal diastolic function",
        tone: "bg-success-soft text-success",
        note: "No further supplemental variables required.",
      };
    }

    // 3 of the above
    if (abnormalCount === 3) {
      const grade =
        ea === null
          ? {
              lap: "Increased LAP",
              grade: "Enter E/A to separate grade 2 from grade 3",
              tone: "bg-warning-soft text-destructive",
            }
          : ea < 2
            ? {
                lap: "Increased LAP",
                grade: "Grade 2 (mild/moderate ↑ LAP)",
                tone: "bg-warning-soft text-warning",
              }
            : {
                lap: "Increased LAP",
                grade: "Grade 3 (marked ↑ LAP)",
                tone: "bg-warning-soft text-destructive",
              };
      return {
        avgE,
        avgEe,
        c1,
        c2,
        c3,
        supplemental,
        pathway: "All three primary variables abnormal → increased LAP.",
        ...grade,
        note: "Grade separated by mitral E/A (< 2 vs ≥ 2).",
      };
    }

    // Reduced e' only
    if (abnormalCount === 1 && c1) {
      if (ea === null) {
        return {
          avgE,
          avgEe,
          c1,
          c2,
          c3,
          supplemental,
          pathway: "Reduced e' only → E/A required.",
          lap: "Indeterminate",
          grade: "Enter mitral E/A ratio",
          tone: "bg-secondary text-muted-foreground",
          note: "E/A ≤ 0.8 indicates grade 1 with normal LAP; E/A > 0.8 needs supplemental variables.",
        };
      }
      if (ea <= 0.8) {
        return {
          avgE,
          avgEe,
          c1,
          c2,
          c3,
          supplemental,
          pathway: "Reduced e' only, E/A ≤ 0.8 → normal LAP.",
          lap: "Normal LAP",
          grade: "Grade 1 (impaired relaxation)",
          tone: "bg-success-soft text-success",
          note: "If symptomatic, consider diastolic exercise echo.",
        };
      }
      const g = viaSupplemental();
      return {
        avgE,
        avgEe,
        c1,
        c2,
        c3,
        supplemental,
        pathway: "Reduced e' only, E/A > 0.8 → supplemental variables.",
        ...g,
        note:
          supplemental.length >= 1
            ? `Supplemental abnormal: ${supplemental.join(", ")}.`
            : "No supplemental variable abnormal; if none available or reliable, use supplemental methods.",
      };
    }

    // TR/PASP only, E/e' only, or any 2 abnormal
    const g = viaSupplemental();
    const pathway =
      abnormalCount === 2
        ? "Two primary variables abnormal → supplemental variables."
        : c2
          ? "Increased E/e' only → supplemental variables."
          : "Increased TR/PASP only → supplemental variables.";
    return {
      avgE,
      avgEe,
      c1,
      c2,
      c3,
      supplemental,
      pathway,
      ...g,
      note:
        supplemental.length >= 1
          ? `Supplemental abnormal: ${supplemental.join(", ")}.`
          : "No supplemental variable abnormal; if none available or reliable, use supplemental methods.",
    };
  }, [values]);

  return (
    <div className="min-h-screen bg-background relative">
      <SiteHeader />

      {/* Under Development Notice Overlay */}
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
        <div className="max-w-md w-full rounded-2xl border border-primary/20 bg-surface p-8 shadow-2xl text-center space-y-5 animate-in zoom-in-95">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Info className="h-8 w-8" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
              <Construction className="h-3.5 w-3.5" /> Under Development
            </div>
            <h2 className="text-xl font-bold text-heading mt-2">Echo Calculator</h2>
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
        <div className="mx-auto max-w-[1200px] px-5 py-16 text-center">
          <nav className="flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground">
            <Link to="/" className="hover:text-primary">
              Home
            </Link>
            <ChevronRight className="h-4 w-4" />
            <span className="text-heading">Diastolic Dysfunction Calculator</span>
          </nav>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-extrabold leading-tight sm:text-5xl">
            LV Diastolic Function Grading &amp; LAP Estimation
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground">
            Enter Doppler and strain measurements to grade left ventricular diastolic dysfunction
            and estimate left atrial pressure using the stepwise algorithm.
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1200px] gap-6 px-5 py-12 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-6">
          <div className="overflow-hidden rounded-xl border border-border bg-background">
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-semibold text-heading">Step 1 — Primary variables</p>
            </div>
            <div className="divide-y divide-border">
              {primaryFields.map((f) => (
                <InputRow
                  key={f.key}
                  field={f}
                  value={values[f.key] ?? ""}
                  onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
                />
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-background">
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-semibold text-heading">Step 2 — Supplemental variables</p>
            </div>
            <div className="divide-y divide-border">
              {secondaryFields.map((f) => (
                <InputRow
                  key={f.key}
                  field={f}
                  value={values[f.key] ?? ""}
                  onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
                />
              ))}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
              <button
                onClick={() => setValues(defaults)}
                className="rounded-lg border border-border px-4 py-2 text-sm text-foreground transition-colors hover:border-primary hover:text-primary"
              >
                Reset to sample
              </button>
              <button
                onClick={() =>
                  setValues(
                    Object.fromEntries(
                      [...primaryFields, ...secondaryFields].map((f) => [f.key, ""]),
                    ),
                  )
                }
                className="rounded-lg border border-border px-4 py-2 text-sm text-foreground transition-colors hover:border-primary hover:text-primary"
              >
                Clear all
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-background p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">Interpretation</p>
              <span className={`rounded-md px-3 py-1.5 text-xs font-semibold ${result.tone}`}>
                {result.lap}
              </span>
            </div>
            <p className="mt-4 text-2xl font-extrabold leading-snug text-heading">{result.grade}</p>
            <p className="mt-2 text-sm text-muted-foreground">{result.pathway}</p>
            <div className="mt-4 rounded-lg bg-accent p-4">
              <p className="text-sm font-semibold text-primary">Algorithm note</p>
              <p className="mt-1 text-sm text-foreground">{result.note}</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-background">
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-semibold text-heading">Primary criteria</p>
            </div>
            <CriterionRow
              label="1. Reduced e' velocity"
              detail={`Septal ≤ 6 or lateral ≤ 7 or average ≤ 6.5 cm/s • average ${fmt(result.avgE)} cm/s`}
              state={result.c1}
            />
            <CriterionRow
              label="2. Increased E/e'"
              detail={`Septal ≥ 15 or lateral ≥ 13 or average ≥ 14 • average ${fmt(result.avgEe)}`}
              state={result.c2}
            />
            <CriterionRow
              label="3. Increased TR velocity / PASP"
              detail="TR velocity ≥ 2.8 m/s or PASP ≥ 35 mmHg"
              state={result.c3}
            />
          </div>

          <div className="rounded-xl border border-border bg-background p-5">
            <p className="text-sm font-semibold text-heading">Algorithm does not apply in</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {caveats.map((c) => (
                <span
                  key={c}
                  className="rounded-md bg-warning-soft px-2.5 py-1 text-xs font-semibold text-warning"
                >
                  {c}
                </span>
              ))}
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Grade 1 with symptoms warrants diastolic exercise echo. Where supplemental variables
              are unavailable or unreliable, fall back on supplemental methods and clinical context.
            </p>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
