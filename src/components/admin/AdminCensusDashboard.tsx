import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Building2,
  CalendarCheck,
  XCircle,
  ClipboardList,
  Search,
  Filter,
  Calendar,
  RefreshCw,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Download,
  AlertCircle,
  RotateCcw,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useFacility } from "@/context/FacilityContext";
import {
  CensusRecord,
  CensusFilterState,
  NiclProcedureKey,
  NICL_PROCEDURE_OPTIONS,
  subscribeToCensusData,
  filterCensusRecords,
  aggregateCensusByFacility,
} from "@/services/censusService";

type DatePreset = "all" | "today" | "7days" | "30days" | "thisMonth" | "custom";

export function AdminCensusDashboard() {
  const navigate = useNavigate();
  const { isAdmin, currentUser, userRole } = useFacility();

  // Data states
  const [allRecords, setAllRecords] = useState<CensusRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState<number>(0);

  // Filters state
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedProcedure, setSelectedProcedure] = useState<NiclProcedureKey>("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // Table sorting
  const [sortBy, setSortBy] = useState<"total" | "scheduled" | "rejected" | "name">("total");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Subscribe to real-time updates across all 5 NICL collections
  useEffect(() => {
    if (!isAdmin || !currentUser) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    const unsubscribe = subscribeToCensusData(
      isAdmin,
      (records) => {
        setAllRecords(records);
        setIsLoading(false);
      },
      (err) => {
        console.error("Census subscription error:", err);
        setErrorMessage(
          err.message || "Failed to load census data. Please check your admin permissions.",
        );
        setIsLoading(false);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [isAdmin, currentUser, refreshKey]);

  // Date preset handler
  const handleDatePresetChange = useCallback((preset: DatePreset) => {
    setDatePreset(preset);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const formatYMD = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (preset === "all") {
      setStartDate("");
      setEndDate("");
    } else if (preset === "today") {
      const todayStr = formatYMD(now);
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === "7days") {
      const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      setStartDate(formatYMD(past));
      setEndDate(formatYMD(now));
    } else if (preset === "30days") {
      const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      setStartDate(formatYMD(past));
      setEndDate(formatYMD(now));
    } else if (preset === "thisMonth") {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(formatYMD(firstDay));
      setEndDate(formatYMD(now));
    }
  }, []);

  const handleResetFilters = useCallback(() => {
    setSearchQuery("");
    setSelectedProcedure("all");
    setDatePreset("all");
    setStartDate("");
    setEndDate("");
  }, []);

  const isFiltered = Boolean(
    searchQuery.trim() || selectedProcedure !== "all" || startDate || endDate,
  );

  // Compute filtered records and aggregated stats
  const { aggregatedData } = useMemo(() => {
    const filters: CensusFilterState = {
      searchQuery,
      procedure: selectedProcedure,
      startDate,
      endDate,
    };

    const filtered = filterCensusRecords(allRecords, filters);
    const aggregated = aggregateCensusByFacility(filtered, {
      sortBy,
      sortDirection,
    });

    return {
      filteredRecords: filtered,
      aggregatedData: aggregated,
    };
  }, [allRecords, searchQuery, selectedProcedure, startDate, endDate, sortBy, sortDirection]);

  // CSV Export
  const handleExportCSV = useCallback(() => {
    if (aggregatedData.rows.length === 0) return;

    const headers = [
      "Facility Name",
      "Facility ID",
      "Category",
      "Total Requests",
      "Scheduled Requests",
      "Rejected Requests",
      "Scheduled Rate (%)",
      "Rejected Rate (%)",
    ];

    const rows = aggregatedData.rows.map((r) => [
      `"${r.facilityName.replace(/"/g, '""')}"`,
      `"${r.facilityId}"`,
      `"${r.category || (r.isLegacyUnassigned ? "Legacy" : "General")}"`,
      r.totalRequests,
      r.scheduledRequests,
      r.rejectedRequests,
      `${r.scheduledRatePercent}%`,
      `${r.rejectedRatePercent}%`,
    ]);

    // Summary row
    rows.push([
      `"TOTAL (All Filtered Facilities)"`,
      `""`,
      `"${aggregatedData.summary.facilitiesRepresentedCount} facilities"`,
      aggregatedData.summary.totalRequests,
      aggregatedData.summary.totalScheduled,
      aggregatedData.summary.totalRejected,
      `${aggregatedData.summary.scheduledRatePercent}%`,
      `${aggregatedData.summary.rejectedRatePercent}%`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const dateStamp = new Date().toISOString().split("T")[0];
    link.setAttribute("download", `hospitalhub_census_${selectedProcedure}_${dateStamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [aggregatedData, selectedProcedure]);

  const toggleSort = (column: "total" | "scheduled" | "rejected" | "name") => {
    if (sortBy === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortDirection(column === "name" ? "asc" : "desc");
    }
  };

  // Auth Guard
  if (!isAdmin || userRole !== "admin") {
    return (
      <section className="mx-auto max-w-[1200px] px-5 py-16 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4">
          <ShieldCheck className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-bold text-heading">Administrator Access Required</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          The Health Facility Census is strictly reserved for authenticated administrators.
        </p>
        <button
          onClick={() => navigate({ to: "/" })}
          className="mt-6 rounded-lg bg-primary px-6 py-2.5 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
        >
          Return to Home
        </button>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-[1200px] px-5 pt-4 pb-12 space-y-6">
      {/* Portal Header matching Echocardiogram Request Portal 1 to 1 */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-2xl font-bold text-heading">Health Facility Census</h2>
            <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-400">
              Admin
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Non-Invasive Cardiovascular Laboratory • Hospital Sultan Ismail
          </p>
        </div>

        {/* Action Buttons styled matching HospitalHub buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={isLoading || aggregatedData.rows.length === 0}
            className="flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
            title="Export Census to CSV"
          >
            <Download className="h-4 w-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-destructive">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-bold">Failed to load census data</h4>
            <p className="text-xs mt-1 text-destructive/90">{errorMessage}</p>
          </div>
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            className="rounded-lg bg-destructive px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            Retry
          </button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Requests */}
        <div className="rounded-xl border border-border bg-background p-4 sm:p-5 shadow-xs transition-colors hover:border-primary/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Total Requests
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ClipboardList className="h-4 w-4" />
            </div>
          </div>
          {isLoading ? (
            <div className="mt-3 space-y-2">
              <div className="h-8 w-24 bg-muted animate-pulse rounded-lg" />
              <div className="h-3 w-32 bg-muted/60 animate-pulse rounded" />
            </div>
          ) : errorMessage ? (
            <div className="mt-3 text-sm font-medium text-muted-foreground">Unavailable</div>
          ) : (
            <div className="mt-2">
              <div className="font-mono text-2xl sm:text-3xl font-extrabold text-heading">
                {aggregatedData.summary.totalRequests.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Across 5 NICL procedures</p>
            </div>
          )}
        </div>

        {/* Card 2: Total Scheduled */}
        <div className="rounded-xl border border-border bg-background p-4 sm:p-5 shadow-xs transition-colors hover:border-emerald-500/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
              Total Scheduled
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <CalendarCheck className="h-4 w-4" />
            </div>
          </div>
          {isLoading ? (
            <div className="mt-3 space-y-2">
              <div className="h-8 w-24 bg-muted animate-pulse rounded-lg" />
              <div className="h-3 w-32 bg-muted/60 animate-pulse rounded" />
            </div>
          ) : errorMessage ? (
            <div className="mt-3 text-sm font-medium text-muted-foreground">Unavailable</div>
          ) : (
            <div className="mt-2">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-2xl sm:text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
                  {aggregatedData.summary.totalScheduled.toLocaleString()}
                </span>
                <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-emerald-600 text-white font-mono">
                  {aggregatedData.summary.scheduledRatePercent}%
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Status: &ldquo;Scheduled&rdquo;</p>
            </div>
          )}
        </div>

        {/* Card 3: Total Rejected */}
        <div className="rounded-xl border border-border bg-background p-4 sm:p-5 shadow-xs transition-colors hover:border-destructive/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-destructive uppercase tracking-wider">
              Total Rejected
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/15 text-destructive">
              <XCircle className="h-4 w-4" />
            </div>
          </div>
          {isLoading ? (
            <div className="mt-3 space-y-2">
              <div className="h-8 w-24 bg-muted animate-pulse rounded-lg" />
              <div className="h-3 w-32 bg-muted/60 animate-pulse rounded" />
            </div>
          ) : errorMessage ? (
            <div className="mt-3 text-sm font-medium text-muted-foreground">Unavailable</div>
          ) : (
            <div className="mt-2">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-2xl sm:text-3xl font-extrabold text-destructive">
                  {aggregatedData.summary.totalRejected.toLocaleString()}
                </span>
                <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-destructive text-white font-mono">
                  {aggregatedData.summary.rejectedRatePercent}%
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Status: &ldquo;Rejected&rdquo;</p>
            </div>
          )}
        </div>

        {/* Card 4: Facilities Represented */}
        <div className="rounded-xl border border-border bg-background p-4 sm:p-5 shadow-xs transition-colors hover:border-primary/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Facilities Represented
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface border border-border text-foreground">
              <Building2 className="h-4 w-4 text-primary" />
            </div>
          </div>
          {isLoading ? (
            <div className="mt-3 space-y-2">
              <div className="h-8 w-24 bg-muted animate-pulse rounded-lg" />
              <div className="h-3 w-32 bg-muted/60 animate-pulse rounded" />
            </div>
          ) : errorMessage ? (
            <div className="mt-3 text-sm font-medium text-muted-foreground">Unavailable</div>
          ) : (
            <div className="mt-2">
              <div className="font-mono text-2xl sm:text-3xl font-extrabold text-heading">
                {aggregatedData.summary.facilitiesRepresentedCount.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Active referring facilities</p>
            </div>
          )}
        </div>
      </div>

      {/* Filter & Search Bar matching Echocardiogram Tracker */}
      <div className="rounded-xl border border-border bg-background p-4 space-y-3.5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Facility Search Input */}
          <div className="relative min-w-[260px] flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by health facility name or canonical ID..."
              className="w-full rounded-lg border border-border bg-surface pl-9 pr-3 py-2 text-sm text-foreground outline-none focus:border-primary placeholder:text-muted-foreground"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>

          {/* Procedure Filter Select */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Procedure:</span>
            <select
              value={selectedProcedure}
              onChange={(e) => setSelectedProcedure(e.target.value as NiclProcedureKey)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-foreground outline-none focus:border-primary cursor-pointer"
            >
              {NICL_PROCEDURE_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Date Filter & Presets */}
        <div className="pt-3 border-t border-border/60 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-muted-foreground mr-1 flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-primary" />
              Submission Date:
            </span>
            <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface p-1">
              {(
                [
                  { id: "all", label: "All Time" },
                  { id: "today", label: "Today" },
                  { id: "7days", label: "Last 7 Days" },
                  { id: "30days", label: "Last 30 Days" },
                  { id: "thisMonth", label: "This Month" },
                  { id: "custom", label: "Custom" },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleDatePresetChange(p.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                    datePreset === p.id
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground hover:bg-background/60"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Date Inputs */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <label htmlFor="start-date" className="text-muted-foreground text-xs font-medium">
                From:
              </label>
              <input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => {
                  setDatePreset("custom");
                  setStartDate(e.target.value);
                }}
                className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs text-foreground outline-none focus:border-primary"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label htmlFor="end-date" className="text-muted-foreground text-xs font-medium">
                To:
              </label>
              <input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => {
                  setDatePreset("custom");
                  setEndDate(e.target.value);
                }}
                className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs text-foreground outline-none focus:border-primary"
              />
            </div>

            {isFiltered && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" />
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Date Filter Context Note */}
        <div className="text-[11px] text-muted-foreground flex items-center gap-1">
          <span>
            * Date filter is evaluated using the request&apos;s authoritative submission timestamp
            (submittedAt / createdAt).
          </span>
        </div>
      </div>

      {/* Facilities Breakdown Table Container matching HospitalHub Table Style */}
      <div className="rounded-xl border border-border bg-background overflow-hidden shadow-xs">
        {/* Table Subheader */}
        <div className="p-4 border-b border-border bg-surface/50 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-heading text-sm sm:text-base">Facility Breakdown</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Showing {aggregatedData.rows.length}{" "}
              {aggregatedData.rows.length === 1 ? "facility" : "facilities"} with requests matching
              criteria
            </p>
          </div>

          <div className="text-xs text-muted-foreground font-medium">
            Sorted by:{" "}
            <span className="font-bold text-heading uppercase">
              {sortBy} requests ({sortDirection})
            </span>
          </div>
        </div>

        {/* Loading State */}
        {isLoading ? (
          <div className="p-12 text-center space-y-3">
            <RefreshCw className="h-8 w-8 animate-spin text-primary mx-auto" />
            <p className="text-sm font-bold text-heading">Loading health facility census data...</p>
            <p className="text-xs text-muted-foreground">
              Aggregating records across all 5 NICL cardiovascular & respiratory modules
            </p>
          </div>
        ) : errorMessage ? (
          /* Error State */
          <div className="p-12 text-center space-y-3">
            <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
            <h4 className="text-base font-bold text-heading">Error loading census records</h4>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">{errorMessage}</p>
            <button
              onClick={() => setRefreshKey((k) => k + 1)}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Retry Loading
            </button>
          </div>
        ) : aggregatedData.rows.length === 0 ? (
          /* Empty State */
          <div className="p-12 text-center space-y-3 text-muted-foreground">
            <ClipboardList className="h-10 w-10 text-muted-foreground/40 mx-auto" />
            <h4 className="text-base font-bold text-heading">No requests found</h4>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              There are no appointment records matching the selected procedure, date range, or
              facility search query.
            </p>
            {isFiltered && (
              <button
                onClick={handleResetFilters}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-xs font-semibold text-foreground hover:bg-accent transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset Filters
              </button>
            )}
          </div>
        ) : (
          /* Table View */
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  <th
                    scope="col"
                    onClick={() => toggleSort("name")}
                    className="py-3 px-4 sm:px-6 cursor-pointer hover:text-foreground transition-colors select-none"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Health Facility</span>
                      {sortBy === "name" ? (
                        sortDirection === "asc" ? (
                          <ChevronUp className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 text-primary" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3 text-muted-foreground/60" />
                      )}
                    </div>
                  </th>
                  <th
                    scope="col"
                    onClick={() => toggleSort("total")}
                    className="py-3 px-4 text-right cursor-pointer hover:text-foreground transition-colors select-none"
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Total Requests</span>
                      {sortBy === "total" ? (
                        sortDirection === "asc" ? (
                          <ChevronUp className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 text-primary" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3 text-muted-foreground/60" />
                      )}
                    </div>
                  </th>
                  <th
                    scope="col"
                    onClick={() => toggleSort("scheduled")}
                    className="py-3 px-4 text-right cursor-pointer hover:text-foreground transition-colors select-none"
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span className="text-emerald-600 dark:text-emerald-400">Scheduled</span>
                      {sortBy === "scheduled" ? (
                        sortDirection === "asc" ? (
                          <ChevronUp className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 text-emerald-600" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3 text-muted-foreground/60" />
                      )}
                    </div>
                  </th>
                  <th
                    scope="col"
                    onClick={() => toggleSort("rejected")}
                    className="py-3 px-4 text-right cursor-pointer hover:text-foreground transition-colors select-none"
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span className="text-destructive">Rejected</span>
                      {sortBy === "rejected" ? (
                        sortDirection === "asc" ? (
                          <ChevronUp className="h-3.5 w-3.5 text-destructive" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 text-destructive" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3 text-muted-foreground/60" />
                      )}
                    </div>
                  </th>
                  <th scope="col" className="py-3 px-4 sm:px-6 text-right">
                    <span>Performance</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 font-medium">
                {aggregatedData.rows.map((row) => {
                  const isLegacy = row.isLegacyUnassigned;

                  return (
                    <tr
                      key={row.facilityId}
                      className={`transition-colors hover:bg-surface/50 ${
                        isLegacy ? "bg-amber-500/5" : ""
                      }`}
                    >
                      {/* Facility Name & Category */}
                      <td className="py-3.5 px-4 sm:px-6">
                        <div className="flex items-start gap-2.5">
                          <Building2
                            className={`h-4 w-4 shrink-0 mt-0.5 ${
                              isLegacy ? "text-amber-500" : "text-primary"
                            }`}
                          />
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-heading text-sm">
                                {row.facilityName}
                              </span>
                              {isLegacy ? (
                                <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                                  <AlertTriangle className="h-2.5 w-2.5" />
                                  Unassigned / legacy records
                                </span>
                              ) : row.category ? (
                                <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-surface border border-border text-muted-foreground">
                                  {row.category}
                                </span>
                              ) : null}
                            </div>
                            {!isLegacy && (
                              <p className="font-mono text-[11px] text-muted-foreground mt-0.5">
                                {row.facilityId}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Total Requests */}
                      <td className="py-3.5 px-4 text-right">
                        <span className="font-mono font-bold text-base text-heading">
                          {row.totalRequests}
                        </span>
                      </td>

                      {/* Scheduled Requests */}
                      <td className="py-3.5 px-4 text-right">
                        <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-bold font-mono bg-emerald-600 text-white shadow-xs">
                          {row.scheduledRequests}
                        </span>
                      </td>

                      {/* Rejected Requests */}
                      <td className="py-3.5 px-4 text-right">
                        {row.rejectedRequests > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-bold font-mono bg-destructive text-white shadow-xs">
                            {row.rejectedRequests}
                          </span>
                        ) : (
                          <span className="font-mono text-muted-foreground">0</span>
                        )}
                      </td>

                      {/* Rate Bar & Percentage */}
                      <td className="py-3.5 px-4 sm:px-6 text-right">
                        <div className="flex items-center justify-end gap-2.5">
                          <div className="w-20 bg-surface rounded-full h-2 overflow-hidden flex border border-border/60">
                            <div
                              style={{ width: `${row.scheduledRatePercent}%` }}
                              className="bg-emerald-500 h-full transition-all"
                              title={`Scheduled: ${row.scheduledRatePercent}%`}
                            />
                            <div
                              style={{ width: `${row.rejectedRatePercent}%` }}
                              className="bg-destructive h-full transition-all"
                              title={`Rejected: ${row.rejectedRatePercent}%`}
                            />
                          </div>
                          <span className="font-mono text-xs font-semibold text-muted-foreground w-12 text-right">
                            {row.scheduledRatePercent}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Grand Total Footer */}
              <tfoot>
                <tr className="border-t-2 border-border bg-surface font-bold text-heading text-sm">
                  <td className="py-3.5 px-4 sm:px-6">
                    Total ({aggregatedData.summary.facilitiesRepresentedCount} Facilities
                    Represented)
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-base text-heading">
                    {aggregatedData.summary.totalRequests.toLocaleString()}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-base text-emerald-600 dark:text-emerald-400">
                    {aggregatedData.summary.totalScheduled.toLocaleString()}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-base text-destructive">
                    {aggregatedData.summary.totalRejected.toLocaleString()}
                  </td>
                  <td className="py-3.5 px-4 sm:px-6 text-right font-mono text-xs text-muted-foreground">
                    {aggregatedData.summary.scheduledRatePercent}% Scheduled
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Privacy and Security Guarantee Box */}
      <div className="rounded-xl border border-border bg-surface/50 p-4 text-xs text-muted-foreground flex items-start gap-3">
        <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-heading">Administrative Privacy & Integrity Assurance</p>
          <p className="leading-relaxed">
            This dashboard aggregates operational referral volumes across the 5 NICL collections
            (Echocardiogram, Exercise Stress Test, 24H Holter, 24H Ambulatory Blood Pressure, and
            Lung Function). In compliance with healthcare security directives, patient identifiers
            (MRN, patient name, and clinical indications) are completely excluded from the Census
            aggregation layer. Access is strictly authorized for verified Administrators.
          </p>
        </div>
      </div>
    </section>
  );
}
