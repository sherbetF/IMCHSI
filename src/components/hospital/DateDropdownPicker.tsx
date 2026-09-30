import React, { useEffect, useState } from "react";
import { CalendarCheck } from "lucide-react";

interface DateDropdownPickerProps {
  value: string; // Formatted as "DD/MM/YYYY"
  onChange: (val: string) => void;
  required?: boolean;
}

const pad = (n: number | string) => String(n).padStart(2, "0");

const MONTHS = [
  { value: "01", name: "01 - Jan" },
  { value: "02", name: "02 - Feb" },
  { value: "03", name: "03 - Mar" },
  { value: "04", name: "04 - Apr" },
  { value: "05", name: "05 - May" },
  { value: "06", name: "06 - Jun" },
  { value: "07", name: "07 - Jul" },
  { value: "08", name: "08 - Aug" },
  { value: "09", name: "09 - Sep" },
  { value: "10", name: "10 - Oct" },
  { value: "11", name: "11 - Nov" },
  { value: "12", name: "12 - Dec" },
];

export function DateDropdownPicker({ value, onChange, required }: DateDropdownPickerProps) {
  // Parse incoming value "DD/MM/YYYY" or "YYYY-MM-DD"
  const parseInitial = () => {
    if (!value || value === "----------") {
      const today = new Date();
      return {
        d: pad(today.getDate()),
        m: pad(today.getMonth() + 1),
        y: String(today.getFullYear()),
      };
    }
    if (value.includes("/")) {
      const [dd, mm, yyyy] = value.split("/");
      return { d: pad(dd || "01"), m: pad(mm || "01"), y: yyyy || "2026" };
    }
    if (value.includes("-")) {
      const [yyyy, mm, dd] = value.split("-");
      return { d: pad(dd || "01"), m: pad(mm || "01"), y: yyyy || "2026" };
    }
    return { d: "01", m: "01", y: "2026" };
  };

  const initial = parseInitial();
  const [day, setDay] = useState(initial.d);
  const [month, setMonth] = useState(initial.m);
  const [year, setYear] = useState(initial.y);

  // Sync internal state when external value changes
  useEffect(() => {
    if (value && value !== "----------") {
      let d = "";
      let m = "";
      let y = "";
      if (value.includes("/")) {
        const parts = value.split("/");
        d = pad(parts[0]);
        m = pad(parts[1]);
        y = parts[2];
      } else if (value.includes("-")) {
        const parts = value.split("-");
        y = parts[0];
        m = pad(parts[1]);
        d = pad(parts[2]);
      }
      if (d && m && y) {
        setDay(d);
        setMonth(m);
        setYear(y);
      }
    }
  }, [value]);

  // Determine number of days in selected month & year
  const daysInMonth = React.useMemo(() => {
    const yNum = parseInt(year, 10) || 2026;
    const mNum = parseInt(month, 10) || 1;
    return new Date(yNum, mNum, 0).getDate();
  }, [year, month]);

  // Adjust day if selected day exceeds daysInMonth
  useEffect(() => {
    const dNum = parseInt(day, 10);
    if (dNum > daysInMonth) {
      const safeDay = pad(daysInMonth);
      setDay(safeDay);
      onChange(`${safeDay}/${month}/${year}`);
    }
  }, [daysInMonth, day, month, year, onChange]);

  const handleDayChange = (newDay: string) => {
    setDay(newDay);
    onChange(`${newDay}/${month}/${year}`);
  };

  const handleMonthChange = (newMonth: string) => {
    setMonth(newMonth);
    const yNum = parseInt(year, 10) || 2026;
    const mNum = parseInt(newMonth, 10) || 1;
    const maxDays = new Date(yNum, mNum, 0).getDate();
    let safeDay = day;
    if (parseInt(day, 10) > maxDays) {
      safeDay = pad(maxDays);
      setDay(safeDay);
    }
    onChange(`${safeDay}/${newMonth}/${year}`);
  };

  const handleYearChange = (newYear: string) => {
    setYear(newYear);
    const yNum = parseInt(newYear, 10) || 2026;
    const mNum = parseInt(month, 10) || 1;
    const maxDays = new Date(yNum, mNum, 0).getDate();
    let safeDay = day;
    if (parseInt(day, 10) > maxDays) {
      safeDay = pad(maxDays);
      setDay(safeDay);
    }
    onChange(`${safeDay}/${month}/${newYear}`);
  };

  const years = ["2026", "2027", "2028", "2029", "2030"];
  const days = Array.from({ length: daysInMonth }, (_, i) => pad(i + 1));

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {/* Day Dropdown (DD) */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
            Day (DD)
          </label>
          <select
            value={day}
            required={required}
            onChange={(e) => handleDayChange(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold outline-none focus:border-primary shadow-xs"
          >
            {days.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        {/* Month Dropdown (MM) */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
            Month (MM)
          </label>
          <select
            value={month}
            required={required}
            onChange={(e) => handleMonthChange(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface px-2.5 py-2 text-sm font-semibold outline-none focus:border-primary shadow-xs"
          >
            {MONTHS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        {/* Year Dropdown (YYYY) */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
            Year (YYYY)
          </label>
          <select
            value={year}
            required={required}
            onChange={(e) => handleYearChange(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold outline-none focus:border-primary shadow-xs"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Selected Date Confirmation Tag */}
      <div className="flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-xs font-bold text-primary font-mono">
        <CalendarCheck className="h-3.5 w-3.5 shrink-0" />
        <span>
          Selected Date: <strong className="underline">{`${day}/${month}/${year}`}</strong>{" "}
          (dd/mm/yyyy)
        </span>
      </div>
    </div>
  );
}
