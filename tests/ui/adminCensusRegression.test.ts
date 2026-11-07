import { describe, it, expect } from "vitest";
import {
  aggregateCensusByFacility,
  filterCensusRecords,
  CensusRecord,
  CensusFilterState,
  UNASSIGNED_FACILITY_ID,
  UNASSIGNED_FACILITY_LABEL,
} from "../../src/services/censusService";

describe("Admin Census UI & Role-Aware Navigation Regression Tests", () => {
  // 1. Navigation items for various roles
  function getFilteredNavItems(isAdmin: boolean) {
    const baseNav = [
      { label: "Home", to: "/" },
      { label: "NICL Procedure", to: "/" },
      { label: "Outsource", to: "/outsource" },
      { label: "Rheumatology", to: "/rheumatology" },
    ];
    return [
      ...baseNav,
      ...(isAdmin
        ? [
            { label: "Account Manager", to: "/admin-facilities" },
            { label: "Census", to: "/admin-census" },
          ]
        : []),
    ];
  }

  it("includes Census button beside Account Manager for Admin users in navigation", () => {
    const adminNav = getFilteredNavItems(true);
    const accountManagerIndex = adminNav.findIndex((item) => item.label === "Account Manager");
    const censusIndex = adminNav.findIndex((item) => item.label === "Census");

    expect(accountManagerIndex).toBeGreaterThan(-1);
    expect(censusIndex).toBeGreaterThan(-1);
    // Census is right beside Account Manager
    expect(censusIndex).toBe(accountManagerIndex + 1);
    expect(adminNav[censusIndex]?.to).toBe("/admin-census");
    expect(adminNav[accountManagerIndex]?.to).toBe("/admin-facilities");
  });

  it("strictly hides both Account Manager and Census for non-admin users", () => {
    const nonAdminNav = getFilteredNavItems(false);
    expect(nonAdminNav.some((item) => item.label === "Census")).toBe(false);
    expect(nonAdminNav.some((item) => item.label === "Account Manager")).toBe(false);
  });

  // 2. Census Route authorization evaluation
  function evaluateCensusRouteAccess(user: { role: string | null; active: boolean } | null): {
    canAccess: boolean;
    state: "loading" | "access_restricted" | "authorized";
  } {
    if (!user) {
      return { canAccess: false, state: "access_restricted" };
    }
    if (user.role === null) {
      return { canAccess: false, state: "loading" };
    }
    if (user.role === "admin" && user.active === true) {
      return { canAccess: true, state: "authorized" };
    }
    return { canAccess: false, state: "access_restricted" };
  }

  it("authorizes only active Admin profiles to view Census", () => {
    expect(evaluateCensusRouteAccess({ role: "admin", active: true }).canAccess).toBe(true);
    expect(evaluateCensusRouteAccess({ role: "admin", active: false }).canAccess).toBe(false);
    expect(evaluateCensusRouteAccess({ role: "facility", active: true }).canAccess).toBe(false);
    expect(evaluateCensusRouteAccess({ role: "paramedic_nurse", active: true }).canAccess).toBe(
      false,
    );
    expect(evaluateCensusRouteAccess({ role: "doctor", active: true }).canAccess).toBe(false);
    expect(evaluateCensusRouteAccess({ role: "outsource", active: true }).canAccess).toBe(false);
    expect(evaluateCensusRouteAccess(null).canAccess).toBe(false);
  });

  // 3. UI Counting & Aggregation Invariants
  it("computes accurate percentage rates without division by zero on empty data", () => {
    const { summary, rows } = aggregateCensusByFacility([]);
    expect(summary.totalRequests).toBe(0);
    expect(summary.totalScheduled).toBe(0);
    expect(summary.totalRejected).toBe(0);
    expect(summary.scheduledRatePercent).toBe(0);
    expect(summary.rejectedRatePercent).toBe(0);
    expect(summary.facilitiesRepresentedCount).toBe(0);
    expect(rows).toEqual([]);
  });

  it("correctly identifies unassigned legacy records and separates them from canonical facilities", () => {
    const records: CensusRecord[] = [
      {
        id: "1",
        facilityId: "hospital_kota_tinggi",
        rawFacilityId: "hospital_kota_tinggi",
        procedureKey: "echo",
        procedureLabel: "Echo",
        status: "Scheduled",
        createdAt: "20/10/2026",
        submittedAtMs: 1761000000000,
      },
      {
        id: "2",
        facilityId: UNASSIGNED_FACILITY_ID,
        rawFacilityId: null,
        procedureKey: "stress",
        procedureLabel: "Stress Test",
        status: "Rejected",
        createdAt: "21/10/2026",
        submittedAtMs: 1761086400000,
      },
    ];

    const { rows, summary } = aggregateCensusByFacility(records);
    expect(rows.length).toBe(2);

    const legacyRow = rows.find((r) => r.isLegacyUnassigned);
    expect(legacyRow).toBeDefined();
    expect(legacyRow?.facilityName).toBe(UNASSIGNED_FACILITY_LABEL);
    expect(legacyRow?.totalRequests).toBe(1);
    expect(legacyRow?.rejectedRequests).toBe(1);

    const normalRow = rows.find((r) => !r.isLegacyUnassigned);
    expect(normalRow).toBeDefined();
    expect(normalRow?.facilityName).toBe("Hospital Kota Tinggi");
    expect(normalRow?.totalRequests).toBe(1);
    expect(normalRow?.scheduledRequests).toBe(1);

    expect(summary.totalRequests).toBe(2);
    expect(summary.facilitiesRepresentedCount).toBe(2);
  });
});
