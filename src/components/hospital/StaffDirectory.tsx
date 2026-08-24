import { useMemo, useState } from "react";
import {
  Activity,
  BadgeCheck,
  ChevronLeft,
  Clock,
  DoorOpen,
  Mail,
  MapPin,
  Phone,
  Search,
} from "lucide-react";
import { categories, staff, type Staff } from "@/data/staff";

const statusTone: Record<Staff["status"], string> = {
  "On Duty": "bg-success-soft text-success",
  "Off Duty": "bg-secondary text-muted-foreground",
  "On Leave": "bg-warning-soft text-warning",
};

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 last:border-b-0">
      <span className="flex items-center gap-2.5 text-sm text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="text-right text-sm font-semibold text-heading">{value}</span>
    </div>
  );
}

export function StaffDirectory() {
  const [category, setCategory] = useState<string>("All Staff");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(staff[0]!.id);

  const list = useMemo(
    () =>
      staff.filter((s) => {
        const matchCat = category === "All Staff" || s.category === category;
        const q = query.trim().toLowerCase();
        const matchQuery =
          !q ||
          s.name.toLowerCase().includes(q) ||
          s.unit.toLowerCase().includes(q) ||
          s.role.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q);
        return matchCat && matchQuery;
      }),
    [category, query],
  );

  const selected = staff.find((s) => s.id === selectedId)!;

  return (
    <section id="directory" className="mx-auto max-w-[1200px] px-5 py-12">
      <div className="flex flex-wrap justify-center gap-3">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`rounded-lg border px-6 py-3 text-sm transition-colors ${
              category === c
                ? "border-primary bg-accent font-semibold text-primary"
                : "border-border bg-background text-foreground hover:border-primary/40"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <div className="overflow-hidden rounded-xl border border-border bg-background">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, unit, role or staff ID"
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              {list.length} records
            </span>
          </div>

          <div className="divide-y divide-border">
            {list.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                className={`flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition-colors hover:bg-surface ${
                  s.id === selectedId ? "bg-surface" : ""
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-heading">
                    {s.name}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {s.id} • {s.role} • {s.unit}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold ${statusTone[s.status]}`}
                >
                  {s.status}
                </span>
              </button>
            ))}
            {list.length === 0 && (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                No staff match this filter.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-background p-5">
          <button
            onClick={() => setSelectedId(list[0]?.id ?? staff[0]!.id)}
            className="flex items-center gap-1.5 text-sm font-semibold text-primary"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to {category} list
          </button>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {selected.id} • Shift {selected.shift}
            </p>
            <span
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${statusTone[selected.status]}`}
            >
              {selected.status}
            </span>
          </div>

          <h2 className="mt-3 text-xl font-bold">{selected.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {selected.role} — {selected.unit}
          </p>

          <div className="mt-5 rounded-lg border border-border">
            <Row
              icon={<Activity className="h-4 w-4 text-destructive" />}
              label="Unit"
              value={selected.unit}
            />
            <Row
              icon={<Clock className="h-4 w-4 text-primary" />}
              label="Shift"
              value={selected.shift}
            />
            <Row
              icon={<BadgeCheck className="h-4 w-4 text-success" />}
              label="License"
              value={selected.license}
            />
            <Row
              icon={<DoorOpen className="h-4 w-4 text-warning" />}
              label="Station"
              value={selected.room}
            />
            <Row
              icon={<MapPin className="h-4 w-4 text-primary" />}
              label="Joined"
              value={selected.joined}
            />
            <Row
              icon={<Phone className="h-4 w-4 text-muted-foreground" />}
              label="Phone"
              value={selected.phone}
            />
            <Row
              icon={<Mail className="h-4 w-4 text-muted-foreground" />}
              label="Email"
              value={selected.email}
            />
          </div>

          <div className="mt-5 rounded-lg bg-accent p-4">
            <p className="text-sm font-semibold text-primary">Duty Note</p>
            <p className="mt-1 text-sm text-foreground">
              Confirm handover with the unit head before any shift change is recorded.
            </p>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            — Record last updated: {selected.joined} • 06.15 WIB
          </p>
        </div>
      </div>
    </section>
  );
}
