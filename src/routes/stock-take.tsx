import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ChevronRight, PackageCheck } from "lucide-react";
import { SiteHeader } from "@/components/hospital/SiteHeader";
import { SiteFooter } from "@/components/hospital/SiteFooter";

export const Route = createFileRoute("/stock-take")({
  head: () => ({
    meta: [
      { title: "Consumable Stock Take — RSU Harapan" },
      {
        name: "description",
        content:
          "Record counted quantities of hospital consumables, compare against system stock and flag variance or low stock.",
      },
      { property: "og:title", content: "Consumable Stock Take — RSU Harapan" },
      {
        property: "og:description",
        content: "Count consumables per store, track variance and low-stock items.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StockPage,
});

type Item = {
  code: string;
  name: string;
  store: string;
  unit: string;
  system: number;
  reorder: number;
};

const items: Item[] = [
  {
    code: "CNS-1001",
    name: "Nitrile examination gloves (M)",
    store: "Central Store",
    unit: "box",
    system: 120,
    reorder: 40,
  },
  {
    code: "CNS-1014",
    name: "Surgical mask, 3-ply",
    store: "Central Store",
    unit: "box",
    system: 86,
    reorder: 30,
  },
  {
    code: "CNS-1032",
    name: "IV cannula 20G",
    store: "Emergency",
    unit: "pcs",
    system: 240,
    reorder: 100,
  },
  {
    code: "CNS-1048",
    name: "Infusion set, macro drip",
    store: "Emergency",
    unit: "pcs",
    system: 95,
    reorder: 60,
  },
  {
    code: "CNS-1077",
    name: "Sterile gauze 10x10 cm",
    store: "Surgery",
    unit: "pack",
    system: 150,
    reorder: 50,
  },
  {
    code: "CNS-1090",
    name: "ECG electrode, disposable",
    store: "Cardiology",
    unit: "pack",
    system: 42,
    reorder: 25,
  },
  {
    code: "CNS-1103",
    name: "Ultrasound gel 250 mL",
    store: "Cardiology",
    unit: "bottle",
    system: 28,
    reorder: 15,
  },
  {
    code: "CNS-1128",
    name: "Syringe 5 mL",
    store: "Pharmacy",
    unit: "pcs",
    system: 380,
    reorder: 150,
  },
];

const stores = ["All Stores", "Central Store", "Emergency", "Surgery", "Cardiology", "Pharmacy"];

function StockPage() {
  const [store, setStore] = useState("All Stores");
  const [counts, setCounts] = useState<Record<string, string>>({});

  const list = useMemo(
    () => items.filter((i) => store === "All Stores" || i.store === store),
    [store],
  );

  const rows = list.map((i) => {
    const raw = counts[i.code];
    const counted = raw === undefined || raw === "" ? null : Number(raw);
    const variance = counted === null ? null : counted - i.system;
    const low = counted !== null ? counted <= i.reorder : i.system <= i.reorder;
    return { ...i, counted, variance, low };
  });

  const countedRows = rows.filter((r) => r.counted !== null);
  const totalVariance = countedRows.reduce((sum, r) => sum + (r.variance ?? 0), 0);
  const lowCount = rows.filter((r) => r.low).length;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-[1200px] px-5 py-16 text-center">
          <nav className="flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground">
            <Link to="/" className="hover:text-primary">
              Home
            </Link>
            <ChevronRight className="h-4 w-4" />
            <span className="text-heading">Consumable Stock Take</span>
          </nav>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-extrabold leading-tight sm:text-5xl">
            Consumable Stock Take
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground">
            Enter counted quantities per item. Variance against system stock and reorder alerts
            update instantly.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-5 py-12">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-background p-5">
            <p className="eyebrow text-muted-foreground">Items counted</p>
            <p className="mt-2 text-2xl font-extrabold text-heading">
              {countedRows.length} / {rows.length}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-background p-5">
            <p className="eyebrow text-muted-foreground">Net variance</p>
            <p
              className={`mt-2 text-2xl font-extrabold ${
                totalVariance === 0
                  ? "text-heading"
                  : totalVariance > 0
                    ? "text-success"
                    : "text-destructive"
              }`}
            >
              {totalVariance > 0 ? "+" : ""}
              {totalVariance}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-background p-5">
            <p className="eyebrow text-muted-foreground">At or below reorder</p>
            <p className="mt-2 text-2xl font-extrabold text-warning">{lowCount}</p>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {stores.map((s) => (
            <button
              key={s}
              onClick={() => setStore(s)}
              className={`rounded-lg border px-6 py-3 text-sm transition-colors ${
                store === s
                  ? "border-primary bg-accent font-semibold text-primary"
                  : "border-border bg-background text-foreground hover:border-primary/40"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="mt-8 overflow-hidden rounded-xl border border-border bg-background">
          <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
            <p className="text-sm font-semibold text-heading">Stock sheet</p>
            <button
              onClick={() => setCounts({})}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:border-primary hover:text-primary"
            >
              Clear counts
            </button>
          </div>

          <div className="divide-y divide-border">
            {rows.map((r) => (
              <div
                key={r.code}
                className="flex flex-wrap items-center justify-between gap-4 px-4 py-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-heading">{r.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.code} • {r.store} • system {r.system} {r.unit} • reorder {r.reorder}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {r.low ? (
                    <span className="flex items-center gap-1.5 rounded-md bg-warning-soft px-2.5 py-1 text-xs font-semibold text-warning">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Low
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 rounded-md bg-success-soft px-2.5 py-1 text-xs font-semibold text-success">
                      <PackageCheck className="h-3.5 w-3.5" />
                      OK
                    </span>
                  )}

                  <span
                    className={`w-20 text-right text-sm font-semibold ${
                      r.variance === null
                        ? "text-muted-foreground"
                        : r.variance === 0
                          ? "text-heading"
                          : r.variance > 0
                            ? "text-success"
                            : "text-destructive"
                    }`}
                  >
                    {r.variance === null ? "—" : `${r.variance > 0 ? "+" : ""}${r.variance}`}
                  </span>

                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    placeholder="count"
                    value={counts[r.code] ?? ""}
                    onChange={(e) => setCounts((c) => ({ ...c, [r.code]: e.target.value }))}
                    className="w-24 rounded-md border border-border bg-background px-3 py-2 text-right text-sm font-semibold text-heading outline-none focus:border-primary placeholder:font-normal placeholder:text-muted-foreground"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          — Counts are held in this session only. Enable a database to submit and archive stock take
          sheets.
        </p>
      </section>

      <SiteFooter />
    </div>
  );
}
