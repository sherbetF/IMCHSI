import { describe, it, expect, vi } from "vitest";
import {
  resolveFacilityDisplay,
  extractSubmissionTimestamp,
  filterCensusRecords,
  aggregateCensusByFacility,
  subscribeToCensusData,
  fetchCensusData,
  CensusRecord,
  CensusFilterState,
  UNASSIGNED_FACILITY_ID,
  UNASSIGNED_FACILITY_LABEL,
} from "../../src/services/censusService";

describe("Census Service - Facility Resolution & Registry", () => {
  it("resolves canonical facilityId from MOH trusted registry", () => {
    const res1 = resolveFacilityDisplay("hospital_kota_tinggi", "Hospital Kota Tinggi");
    expect(res1.canonicalId).toBe("hospital_kota_tinggi");
    expect(res1.displayName).toBe("Hospital Kota Tinggi");
    expect(res1.category).toBe("Hospital");
    expect(res1.isLegacy).toBe(false);

    const res2 = resolveFacilityDisplay("kk_masai", "Klinik Kesihatan Masai");
    expect(res2.canonicalId).toBe("kk_masai");
    expect(res2.displayName).toBe("KK Masai");
    expect(res2.category).toBe("Klinik Kesihatan");
    expect(res2.isLegacy).toBe(false);
  });

  it("handles missing, null, undefined, and empty facility IDs as unassigned legacy records", () => {
    const nullRes = resolveFacilityDisplay(null, null);
    expect(nullRes.canonicalId).toBe(UNASSIGNED_FACILITY_ID);
    expect(nullRes.displayName).toBe(UNASSIGNED_FACILITY_LABEL);
    expect(nullRes.isLegacy).toBe(true);

    const undefRes = resolveFacilityDisplay(undefined, "Old Hospital Name");
    expect(undefRes.canonicalId).toBe(UNASSIGNED_FACILITY_ID);
    expect(undefRes.displayName).toBe(UNASSIGNED_FACILITY_LABEL);
    expect(undefRes.isLegacy).toBe(true);

    const emptyRes = resolveFacilityDisplay("   ", "");
    expect(emptyRes.canonicalId).toBe(UNASSIGNED_FACILITY_ID);
    expect(emptyRes.displayName).toBe(UNASSIGNED_FACILITY_LABEL);
    expect(emptyRes.isLegacy).toBe(true);

    const unassignedStr = resolveFacilityDisplay("unassigned", "Some Clinic");
    expect(unassignedStr.canonicalId).toBe(UNASSIGNED_FACILITY_ID);
    expect(unassignedStr.displayName).toBe(UNASSIGNED_FACILITY_LABEL);
    expect(unassignedStr.isLegacy).toBe(true);
  });

  it("preserves non-registry custom facilities cleanly with fallback name", () => {
    const custom = resolveFacilityDisplay("external_clinic_johor", "External Clinic Johor");
    expect(custom.canonicalId).toBe("external_clinic_johor");
    expect(custom.displayName).toBe("External Clinic Johor");
    expect(custom.isLegacy).toBe(false);
  });
});

describe("Census Service - Submission Timestamp Extraction", () => {
  it("extracts timestamp from Firestore Timestamp with seconds", () => {
    const record = {
      submittedAt: { seconds: 1761500000 },
      createdAt: "27/10/2026 10:00",
    };
    const ts = extractSubmissionTimestamp(record);
    expect(ts).toBe(1761500000 * 1000);
  });

  it("extracts timestamp from Firestore Timestamp with toMillis()", () => {
    const record = {
      submittedAt: { toMillis: () => 1761500123456 },
      createdAt: "27/10/2026 10:00",
    };
    const ts = extractSubmissionTimestamp(record);
    expect(ts).toBe(1761500123456);
  });

  it("falls back to createdAt date string when submittedAt is missing or null", () => {
    const record = {
      submittedAt: null,
      createdAt: "27/10/2026 14:30",
    };
    const ts = extractSubmissionTimestamp(record);
    expect(ts).toBeGreaterThan(0);
    const dateObj = new Date(ts);
    expect(dateObj.getFullYear()).toBe(2026);
    expect(dateObj.getDate()).toBe(27);
  });

  it("returns 0 if both submittedAt and createdAt are empty", () => {
    expect(extractSubmissionTimestamp({})).toBe(0);
  });
});

describe("Census Service - Filtering & Synthetic Data Aggregation", () => {
  const syntheticRecords: CensusRecord[] = [
    // Hospital Kota Tinggi - Echo
    {
      id: "echo_1",
      facilityId: "hospital_kota_tinggi",
      rawFacilityId: "hospital_kota_tinggi",
      procedureKey: "echo",
      procedureLabel: "Transthoracic Echocardiogram (Echo)",
      status: "Scheduled",
      createdAt: "10/10/2026 09:00",
      submittedAtMs: new Date(2026, 9, 10, 9, 0).getTime(),
    },
    {
      id: "echo_2",
      facilityId: "hospital_kota_tinggi",
      rawFacilityId: "hospital_kota_tinggi",
      procedureKey: "echo",
      procedureLabel: "Transthoracic Echocardiogram (Echo)",
      status: "Rejected",
      createdAt: "12/10/2026 10:00",
      submittedAtMs: new Date(2026, 9, 12, 10, 0).getTime(),
    },
    {
      id: "echo_3",
      facilityId: "hospital_kota_tinggi",
      rawFacilityId: "hospital_kota_tinggi",
      procedureKey: "echo",
      procedureLabel: "Transthoracic Echocardiogram (Echo)",
      status: "Pending Confirmation",
      createdAt: "15/10/2026 11:00",
      submittedAtMs: new Date(2026, 9, 15, 11, 0).getTime(),
    },
    // Hospital Kota Tinggi - Stress Test
    {
      id: "stress_1",
      facilityId: "hospital_kota_tinggi",
      rawFacilityId: "hospital_kota_tinggi",
      procedureKey: "stress",
      procedureLabel: "Exercise Stress Test (Treadmill)",
      status: "Scheduled",
      createdAt: "18/10/2026 14:00",
      submittedAtMs: new Date(2026, 9, 18, 14, 0).getTime(),
    },
    // KK Masai - Holter
    {
      id: "holter_1",
      facilityId: "kk_masai",
      rawFacilityId: "kk_masai",
      procedureKey: "holter",
      procedureLabel: "24-Hour Holter Monitoring",
      status: "Scheduled",
      createdAt: "14/10/2026 08:30",
      submittedAtMs: new Date(2026, 9, 14, 8, 30).getTime(),
    },
    // KK Masai - Blood Pressure
    {
      id: "bp_1",
      facilityId: "kk_masai",
      rawFacilityId: "kk_masai",
      procedureKey: "bp",
      procedureLabel: "24-Hour Ambulatory Blood Pressure (ABPM)",
      status: "Rejected",
      createdAt: "20/10/2026 16:00",
      submittedAtMs: new Date(2026, 9, 20, 16, 0).getTime(),
    },
    // KK Pasir Gudang - Lung Function
    {
      id: "lft_1",
      facilityId: "kk_pasir_gudang",
      rawFacilityId: "kk_pasir_gudang",
      procedureKey: "lft",
      procedureLabel: "Lung Function / Spirometry",
      status: "Under Review",
      createdAt: "22/10/2026 10:15",
      submittedAtMs: new Date(2026, 9, 22, 10, 15).getTime(),
    },
    // Legacy / Unassigned record (missing facilityId)
    {
      id: "echo_legacy_1",
      facilityId: UNASSIGNED_FACILITY_ID,
      rawFacilityId: null,
      facilityNameFromDoc: null,
      procedureKey: "echo",
      procedureLabel: "Transthoracic Echocardiogram (Echo)",
      status: "Scheduled",
      createdAt: "01/10/2026 12:00",
      submittedAtMs: new Date(2026, 9, 1, 12, 0).getTime(),
    },
    {
      id: "stress_legacy_2",
      facilityId: UNASSIGNED_FACILITY_ID,
      rawFacilityId: "",
      facilityNameFromDoc: "Old Clinic",
      procedureKey: "stress",
      procedureLabel: "Exercise Stress Test (Treadmill)",
      status: "Rejected",
      createdAt: "05/10/2026 15:00",
      submittedAtMs: new Date(2026, 9, 5, 15, 0).getTime(),
    },
  ];

  it("aggregates total requests, scheduled, rejected, and facilities represented accurately", () => {
    const { rows, summary } = aggregateCensusByFacility(syntheticRecords);

    // Total records: 9
    expect(summary.totalRequests).toBe(9);
    // Scheduled count: echo_1, stress_1, holter_1, echo_legacy_1 = 4
    expect(summary.totalScheduled).toBe(4);
    // Rejected count: echo_2, bp_1, stress_legacy_2 = 3
    expect(summary.totalRejected).toBe(3);
    // Facilities represented: Hospital Kota Tinggi, KK Masai, KK Pasir Gudang, Unassigned = 4
    expect(summary.facilitiesRepresentedCount).toBe(4);

    // Hospital Kota Tinggi breakdown: 4 total (2 scheduled, 1 rejected, 1 pending)
    const hkt = rows.find((r) => r.facilityId === "hospital_kota_tinggi");
    expect(hkt).toBeDefined();
    expect(hkt?.facilityName).toBe("Hospital Kota Tinggi");
    expect(hkt?.totalRequests).toBe(4);
    expect(hkt?.scheduledRequests).toBe(2);
    expect(hkt?.rejectedRequests).toBe(1);

    // KK Masai breakdown: 2 total (1 scheduled, 1 rejected)
    const masai = rows.find((r) => r.facilityId === "kk_masai");
    expect(masai).toBeDefined();
    expect(masai?.facilityName).toBe("KK Masai");
    expect(masai?.totalRequests).toBe(2);
    expect(masai?.scheduledRequests).toBe(1);
    expect(masai?.rejectedRequests).toBe(1);

    // Legacy unassigned group: 2 total (1 scheduled, 1 rejected)
    const legacy = rows.find((r) => r.facilityId === UNASSIGNED_FACILITY_ID);
    expect(legacy).toBeDefined();
    expect(legacy?.facilityName).toBe(UNASSIGNED_FACILITY_LABEL);
    expect(legacy?.isLegacyUnassigned).toBe(true);
    expect(legacy?.totalRequests).toBe(2);
    expect(legacy?.scheduledRequests).toBe(1);
    expect(legacy?.rejectedRequests).toBe(1);
  });

  it("sorts table by total requests descending by default", () => {
    const { rows } = aggregateCensusByFacility(syntheticRecords);
    expect(rows[0]?.facilityId).toBe("hospital_kota_tinggi"); // 4 requests
    expect(rows[0]?.totalRequests).toBeGreaterThanOrEqual(rows[1]?.totalRequests ?? 0);
  });

  it("filters accurately by procedure", () => {
    const echoFilters: CensusFilterState = {
      searchQuery: "",
      procedure: "echo",
      startDate: "",
      endDate: "",
    };
    const echoFiltered = filterCensusRecords(syntheticRecords, echoFilters);
    expect(echoFiltered.length).toBe(4); // 3 for HKT, 1 legacy

    const { summary } = aggregateCensusByFacility(echoFiltered);
    expect(summary.totalRequests).toBe(4);
    expect(summary.totalScheduled).toBe(2);
    expect(summary.totalRejected).toBe(1);
  });

  it("filters accurately by date range", () => {
    // Range from 2026-10-10 to 2026-10-15
    const dateFilters: CensusFilterState = {
      searchQuery: "",
      procedure: "all",
      startDate: "2026-10-10",
      endDate: "2026-10-15",
    };
    const dateFiltered = filterCensusRecords(syntheticRecords, dateFilters);
    // Should include echo_1 (10/10), echo_2 (12/10), holter_1 (14/10), echo_3 (15/10)
    expect(dateFiltered.length).toBe(4);

    const { summary } = aggregateCensusByFacility(dateFiltered);
    expect(summary.totalRequests).toBe(4);
    expect(summary.facilitiesRepresentedCount).toBe(2); // HKT and KK Masai
  });

  it("filters accurately by facility search", () => {
    const searchFilters: CensusFilterState = {
      searchQuery: "masai",
      procedure: "all",
      startDate: "",
      endDate: "",
    };
    const searchFiltered = filterCensusRecords(syntheticRecords, searchFilters);
    expect(searchFiltered.length).toBe(2);

    const { rows, summary } = aggregateCensusByFacility(searchFiltered);
    expect(summary.totalRequests).toBe(2);
    expect(rows.length).toBe(1);
    expect(rows[0]?.facilityName).toBe("KK Masai");
  });
});

describe("Census Service - Authorization & Security Checks", () => {
  it("blocks non-admin users from subscribing to census data", () => {
    const onError = vi.fn();
    const onData = vi.fn();

    // Not admin
    const unsub = subscribeToCensusData(false, onData, onError);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Unauthorized"),
      }),
    );
    expect(onData).not.toHaveBeenCalled();
    unsub();
  });

  it("blocks non-admin users from fetching census data", async () => {
    await expect(fetchCensusData(false)).rejects.toThrow(/Unauthorized/);
  });

  it("guarantees no patient PII fields exist in aggregated census output", () => {
    const syntheticRecords: CensusRecord[] = [
      {
        id: "echo_1",
        facilityId: "hospital_kota_tinggi",
        procedureKey: "echo",
        procedureLabel: "Echo",
        status: "Scheduled",
        createdAt: "10/10/2026",
        submittedAtMs: 1761500000000,
      },
    ];

    const { rows } = aggregateCensusByFacility(syntheticRecords);
    const row = rows[0];
    expect(row).not.toHaveProperty("patientName");
    expect(row).not.toHaveProperty("mrn");
    expect(row).not.toHaveProperty("clinicalIndication");
    expect(row).not.toHaveProperty("contactNumber");
    expect(row).not.toHaveProperty("email");
  });
});
