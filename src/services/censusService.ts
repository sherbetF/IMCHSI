import { collection, query, onSnapshot, getDocs, Unsubscribe, Timestamp } from "firebase/firestore";
import { db, auth, handleFirestoreError, OperationType } from "@/lib/firebase";
import { parseDateToTimestamp } from "@/utils/dateUtils";
import { FACILITIES_DATA, FacilityGroup } from "@/data/facilities";

export type NiclProcedureKey = "all" | "echo" | "stress" | "holter" | "bp" | "lft";

export interface ProcedureOption {
  key: NiclProcedureKey;
  label: string;
  collectionName?: string;
  shortLabel: string;
}

export const NICL_PROCEDURE_OPTIONS: ProcedureOption[] = [
  { key: "all", label: "All NICL Procedures", shortLabel: "All Procedures" },
  {
    key: "echo",
    label: "Transthoracic Echocardiogram (Echo)",
    collectionName: "echo_appointments",
    shortLabel: "Echo",
  },
  {
    key: "stress",
    label: "Exercise Stress Test (Treadmill)",
    collectionName: "stress_test_appointments",
    shortLabel: "Stress Test",
  },
  {
    key: "holter",
    label: "24-Hour Holter Monitoring",
    collectionName: "holter_appointments",
    shortLabel: "Holter",
  },
  {
    key: "bp",
    label: "24-Hour Ambulatory Blood Pressure (ABPM)",
    collectionName: "blood_pressure_appointments",
    shortLabel: "Blood Pressure",
  },
  {
    key: "lft",
    label: "Lung Function / Spirometry",
    collectionName: "lung_function_appointments",
    shortLabel: "Lung Function",
  },
];

export const NICL_COLLECTIONS = [
  { key: "echo" as const, name: "echo_appointments", label: "Transthoracic Echocardiogram (Echo)" },
  {
    key: "stress" as const,
    name: "stress_test_appointments",
    label: "Exercise Stress Test (Treadmill)",
  },
  { key: "holter" as const, name: "holter_appointments", label: "24-Hour Holter Monitoring" },
  {
    key: "bp" as const,
    name: "blood_pressure_appointments",
    label: "24-Hour Ambulatory Blood Pressure (ABPM)",
  },
  { key: "lft" as const, name: "lung_function_appointments", label: "Lung Function / Spirometry" },
];

/**
 * Sanitized, aggregated appointment record.
 * STRICT SECURITY INVARIANT:
 * Patient names, MRNs, phone numbers, emails, and clinical indications
 * are strictly omitted to prevent any PII or clinical exposure on the Census dashboard.
 */
export interface CensusRecord {
  id: string;
  facilityId: string; // Canonical facilityId or "__unassigned_legacy__"
  rawFacilityId?: string | null;
  facilityNameFromDoc?: string | null;
  procedureKey: "echo" | "stress" | "holter" | "bp" | "lft";
  procedureLabel: string;
  status: string;
  createdAt: string;
  submittedAtMs: number;
}

export interface FacilityCensusRow {
  facilityId: string;
  facilityName: string;
  category?: string;
  isLegacyUnassigned: boolean;
  totalRequests: number;
  scheduledRequests: number;
  rejectedRequests: number;
  otherRequests: number;
  scheduledRatePercent: number;
  rejectedRatePercent: number;
}

export interface CensusSummary {
  totalRequests: number;
  totalScheduled: number;
  totalRejected: number;
  facilitiesRepresentedCount: number;
  scheduledRatePercent: number;
  rejectedRatePercent: number;
}

export interface CensusFilterState {
  searchQuery: string;
  procedure: NiclProcedureKey;
  startDate: string; // YYYY-MM-DD or ""
  endDate: string; // YYYY-MM-DD or ""
}

export const UNASSIGNED_FACILITY_ID = "__unassigned_legacy__";
export const UNASSIGNED_FACILITY_LABEL = "Unassigned / legacy records";

// Trusted Facility Registry Lookup Map (populated from facilities.ts)
export const TRUSTED_FACILITY_REGISTRY = new Map<
  string,
  { facilityId: string; facilityName: string; category: string }
>();

// Populate canonical lookup map
FACILITIES_DATA.forEach((group: FacilityGroup) => {
  group.items.forEach((item) => {
    TRUSTED_FACILITY_REGISTRY.set(item.facilityId.toLowerCase(), {
      facilityId: item.facilityId,
      facilityName: item.facilityName,
      category: group.category,
    });
  });
});

/**
 * Safely extracts milliseconds timestamp from a request record.
 * Uses submittedAt (Firestore Timestamp / FieldValue) when present,
 * falling back to createdAt (string) for legacy requests.
 */
export function extractSubmissionTimestamp(record: Record<string, unknown>): number {
  if (!record) return 0;

  // 1. Check submittedAt
  const submittedAt = record["submittedAt"];
  if (submittedAt && typeof submittedAt === "object") {
    const tsObj = submittedAt as { toMillis?: () => number; seconds?: number; toDate?: () => Date };
    if (typeof tsObj.toMillis === "function") {
      try {
        return tsObj.toMillis();
      } catch {
        // Fallback
      }
    }
    if (typeof tsObj.seconds === "number") {
      return tsObj.seconds * 1000;
    }
    if (typeof tsObj.toDate === "function") {
      try {
        return tsObj.toDate().getTime();
      } catch {
        // Fallback
      }
    }
  }

  // 2. Fall back to createdAt string (e.g. "27/10/2026 14:30", "2026-10-27", ISO)
  const createdAt = record["createdAt"];
  if (typeof createdAt === "string" && createdAt.trim()) {
    return parseDateToTimestamp(createdAt);
  }

  return 0;
}

/**
 * Resolves the canonical facility display name from the trusted registry.
 * If facility ID is missing, classifies as Unassigned / legacy records.
 */
export function resolveFacilityDisplay(
  rawFacilityId?: string | null,
  facilityNameFromDoc?: string | null,
): {
  canonicalId: string;
  displayName: string;
  category?: string;
  isLegacy: boolean;
} {
  const trimmedId = typeof rawFacilityId === "string" ? rawFacilityId.trim() : "";

  if (
    !trimmedId ||
    trimmedId.toLowerCase() === "unassigned" ||
    trimmedId.toLowerCase() === "unknown" ||
    trimmedId.toLowerCase() === "null" ||
    trimmedId.toLowerCase() === "undefined"
  ) {
    return {
      canonicalId: UNASSIGNED_FACILITY_ID,
      displayName: UNASSIGNED_FACILITY_LABEL,
      category: "Legacy",
      isLegacy: true,
    };
  }

  const trusted = TRUSTED_FACILITY_REGISTRY.get(trimmedId.toLowerCase());
  if (trusted) {
    return {
      canonicalId: trusted.facilityId,
      displayName: trusted.facilityName,
      category: trusted.category,
      isLegacy: false,
    };
  }

  // Fallback: If not in MOH registry, use doc's facilityName if non-empty, else trimmedId
  const fallbackName =
    typeof facilityNameFromDoc === "string" && facilityNameFromDoc.trim()
      ? facilityNameFromDoc.trim()
      : trimmedId;

  return {
    canonicalId: trimmedId,
    displayName: fallbackName,
    isLegacy: false,
  };
}

/**
 * Filters a raw list of census records based on the user's active filter criteria.
 */
export function filterCensusRecords(
  records: CensusRecord[],
  filters: CensusFilterState,
): CensusRecord[] {
  const { searchQuery, procedure, startDate, endDate } = filters;
  const trimmedSearch = searchQuery.trim().toLowerCase();

  // Compute date bounds in local time
  let startMs: number | null = null;
  if (startDate) {
    const [y, m, d] = startDate.split("-").map(Number);
    if (y && m && d) {
      startMs = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
    }
  }

  let endMs: number | null = null;
  if (endDate) {
    const [y, m, d] = endDate.split("-").map(Number);
    if (y && m && d) {
      endMs = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
    }
  }

  return records.filter((rec) => {
    // 1. Procedure filter
    if (procedure !== "all" && rec.procedureKey !== procedure) {
      return false;
    }

    // 2. Date range filter
    if (startMs !== null && rec.submittedAtMs > 0 && rec.submittedAtMs < startMs) {
      return false;
    }
    if (endMs !== null && rec.submittedAtMs > 0 && rec.submittedAtMs > endMs) {
      return false;
    }
    // If date filters are set but record has 0 timestamp, exclude unless both are empty
    if ((startMs !== null || endMs !== null) && rec.submittedAtMs === 0) {
      return false;
    }

    // 3. Search query filter (search facility name, facility ID, or procedure)
    if (trimmedSearch) {
      const facilityResolved = resolveFacilityDisplay(rec.rawFacilityId, rec.facilityNameFromDoc);
      const matchesName = facilityResolved.displayName.toLowerCase().includes(trimmedSearch);
      const matchesId = facilityResolved.canonicalId.toLowerCase().includes(trimmedSearch);
      if (!matchesName && !matchesId) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Aggregates a filtered list of census records by health facility.
 * Groups using canonical facilityId and trusted MOH registry names.
 * Calculates total requests, scheduled requests, and rejected requests.
 * Sorts highest total requests first by default.
 */
export function aggregateCensusByFacility(
  records: CensusRecord[],
  options?: {
    sortBy?: "total" | "scheduled" | "rejected" | "name";
    sortDirection?: "asc" | "desc";
  },
): {
  rows: FacilityCensusRow[];
  summary: CensusSummary;
} {
  const facilityGroups = new Map<string, FacilityCensusRow>();

  for (const rec of records) {
    const resolved = resolveFacilityDisplay(rec.rawFacilityId, rec.facilityNameFromDoc);
    const key = resolved.canonicalId;

    let group = facilityGroups.get(key);
    if (!group) {
      group = {
        facilityId: key,
        facilityName: resolved.displayName,
        category: resolved.category,
        isLegacyUnassigned: resolved.isLegacy,
        totalRequests: 0,
        scheduledRequests: 0,
        rejectedRequests: 0,
        otherRequests: 0,
        scheduledRatePercent: 0,
        rejectedRatePercent: 0,
      };
      facilityGroups.set(key, group);
    }

    group.totalRequests += 1;

    // Strict status values matching existing codebase
    if (rec.status === "Scheduled") {
      group.scheduledRequests += 1;
    } else if (rec.status === "Rejected") {
      group.rejectedRequests += 1;
    } else {
      group.otherRequests += 1;
    }
  }

  // Calculate percentages for each facility
  const rows: FacilityCensusRow[] = Array.from(facilityGroups.values()).map((row) => {
    const schedRate = row.totalRequests > 0 ? (row.scheduledRequests / row.totalRequests) * 100 : 0;
    const rejRate = row.totalRequests > 0 ? (row.rejectedRequests / row.totalRequests) * 100 : 0;
    return {
      ...row,
      scheduledRatePercent: Math.round(schedRate * 10) / 10,
      rejectedRatePercent: Math.round(rejRate * 10) / 10,
    };
  });

  // Default sorting: Total requests highest first
  const sortBy = options?.sortBy || "total";
  const direction = options?.sortDirection || "desc";
  const multiplier = direction === "desc" ? -1 : 1;

  rows.sort((a, b) => {
    // If legacy records, usually keep at bottom unless sorted specifically
    if (sortBy === "total") {
      if (b.totalRequests !== a.totalRequests) {
        return (b.totalRequests - a.totalRequests) * (direction === "desc" ? 1 : -1);
      }
      return a.facilityName.localeCompare(b.facilityName);
    }
    if (sortBy === "scheduled") {
      if (b.scheduledRequests !== a.scheduledRequests) {
        return (b.scheduledRequests - a.scheduledRequests) * (direction === "desc" ? 1 : -1);
      }
      return a.facilityName.localeCompare(b.facilityName);
    }
    if (sortBy === "rejected") {
      if (b.rejectedRequests !== a.rejectedRequests) {
        return (b.rejectedRequests - a.rejectedRequests) * (direction === "desc" ? 1 : -1);
      }
      return a.facilityName.localeCompare(b.facilityName);
    }
    if (sortBy === "name") {
      return a.facilityName.localeCompare(b.facilityName) * multiplier;
    }
    return 0;
  });

  // Calculate summary cards metrics
  const totalRequests = rows.reduce((acc, r) => acc + r.totalRequests, 0);
  const totalScheduled = rows.reduce((acc, r) => acc + r.scheduledRequests, 0);
  const totalRejected = rows.reduce((acc, r) => acc + r.rejectedRequests, 0);
  const facilitiesRepresentedCount = rows.filter((r) => r.totalRequests > 0).length;

  const scheduledRatePercent =
    totalRequests > 0 ? Math.round((totalScheduled / totalRequests) * 1000) / 10 : 0;
  const rejectedRatePercent =
    totalRequests > 0 ? Math.round((totalRejected / totalRequests) * 1000) / 10 : 0;

  const summary: CensusSummary = {
    totalRequests,
    totalScheduled,
    totalRejected,
    facilitiesRepresentedCount,
    scheduledRatePercent,
    rejectedRatePercent,
  };

  return { rows, summary };
}

/**
 * Real-time subscription to all 5 NICL collections for active Administrators.
 * Strictly verifies admin role and authentication before querying.
 */
export function subscribeToCensusData(
  isAdmin: boolean,
  onData: (records: CensusRecord[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  // CRITICAL SECURITY ENFORCEMENT:
  // Must be an active, authenticated Admin.
  if (!auth.currentUser || !isAdmin) {
    onError(new Error("Unauthorized: Census is restricted to active system administrators only."));
    return () => {};
  }

  const collectionsData: Record<string, CensusRecord[]> = {
    echo: [],
    stress: [],
    holter: [],
    bp: [],
    lft: [],
  };

  let isCleanedUp = false;

  const broadcast = () => {
    if (isCleanedUp) return;
    const allRecords: CensusRecord[] = [
      ...collectionsData.echo,
      ...collectionsData.stress,
      ...collectionsData.holter,
      ...collectionsData.bp,
      ...collectionsData.lft,
    ];
    onData(allRecords);
  };

  const unsubscribes: Unsubscribe[] = [];

  NICL_COLLECTIONS.forEach(({ key, name, label }) => {
    try {
      const colRef = collection(db, name);
      const q = query(colRef);

      const unsub = onSnapshot(
        q,
        (snapshot) => {
          if (isCleanedUp) return;
          const records: CensusRecord[] = [];

          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const rawFacilityId = (data["facilityId"] as string) || null;
            const facilityNameFromDoc = (data["facilityName"] as string) || null;
            const status = (data["status"] as string) || "Pending Confirmation";
            const createdAt = (data["createdAt"] as string) || "";
            const submittedAtMs = extractSubmissionTimestamp(data);

            const resolved = resolveFacilityDisplay(rawFacilityId, facilityNameFromDoc);

            // Sanitized record: Patient identifiers are completely excluded
            records.push({
              id: `${key}_${docSnap.id}`,
              facilityId: resolved.canonicalId,
              rawFacilityId,
              facilityNameFromDoc,
              procedureKey: key,
              procedureLabel: label,
              status,
              createdAt,
              submittedAtMs,
            });
          });

          collectionsData[key] = records;
          broadcast();
        },
        (error) => {
          if (isCleanedUp) return;
          try {
            handleFirestoreError(error, OperationType.GET, name);
          } catch (wrapped) {
            console.error(`Census query error for ${name}:`, wrapped);
          }
          onError(error instanceof Error ? error : new Error(String(error)));
        },
      );

      unsubscribes.push(unsub);
    } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  });

  return () => {
    isCleanedUp = true;
    unsubscribes.forEach((unsub) => {
      try {
        unsub();
      } catch {
        // Safe unsubscribe
      }
    });
  };
}

/**
 * On-demand one-time fetch of all 5 NICL collections for active Administrators.
 */
export async function fetchCensusData(isAdmin: boolean): Promise<CensusRecord[]> {
  if (!auth.currentUser || !isAdmin) {
    throw new Error("Unauthorized: Census is restricted to active system administrators only.");
  }

  const allRecords: CensusRecord[] = [];

  const promises = NICL_COLLECTIONS.map(async ({ key, name, label }) => {
    try {
      const colRef = collection(db, name);
      const snap = await getDocs(colRef);

      snap.forEach((docSnap) => {
        const data = docSnap.data();
        const rawFacilityId = (data["facilityId"] as string) || null;
        const facilityNameFromDoc = (data["facilityName"] as string) || null;
        const status = (data["status"] as string) || "Pending Confirmation";
        const createdAt = (data["createdAt"] as string) || "";
        const submittedAtMs = extractSubmissionTimestamp(data);

        const resolved = resolveFacilityDisplay(rawFacilityId, facilityNameFromDoc);

        allRecords.push({
          id: `${key}_${docSnap.id}`,
          facilityId: resolved.canonicalId,
          rawFacilityId,
          facilityNameFromDoc,
          procedureKey: key,
          procedureLabel: label,
          status,
          createdAt,
          submittedAtMs,
        });
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, name);
    }
  });

  await Promise.all(promises);
  return allRecords;
}
