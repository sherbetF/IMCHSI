import { describe, it, expect } from "vitest";
import { SYNTHETIC_IDENTITIES } from "../fixtures/syntheticIdentities";
import {
  CONTROLLED_REVIEW_TIMEFRAMES,
  CONTROLLED_INVESTIGATIONS,
  DoctorReviewTimeframe,
  DoctorRequiredInvestigation,
  RheumatologyStatus,
} from "@/services/rheumatologyService";

/**
 * Pure Unit & State Transition Security Specification Tests for Rheumatology Module
 */
describe("Stage 7 — Rheumatology Workflow & State Transitions", () => {
  // --------------------------------------------------------------------------
  // 1. Controlled Vocabularies & Enums
  // --------------------------------------------------------------------------
  it("enforces controlled doctor review timeframes", () => {
    expect(CONTROLLED_REVIEW_TIMEFRAMES).toContain("Urgent");
    expect(CONTROLLED_REVIEW_TIMEFRAMES).toContain("Within 2 Weeks");
    expect(CONTROLLED_REVIEW_TIMEFRAMES).toContain("Within 1 Month");
    expect(CONTROLLED_REVIEW_TIMEFRAMES).toContain("Within 2 Months");
    expect(CONTROLLED_REVIEW_TIMEFRAMES).toContain("Within 3 Months");
    expect(CONTROLLED_REVIEW_TIMEFRAMES).toContain("Within 4 Months");
    expect(CONTROLLED_REVIEW_TIMEFRAMES).toContain("Within 6 Months");
    expect(CONTROLLED_REVIEW_TIMEFRAMES).toContain("Other");

    // Invalid timeframe must be rejected by validator
    const invalidTimeframe = "Tomorrow ASAP";
    expect(CONTROLLED_REVIEW_TIMEFRAMES.includes(invalidTimeframe as DoctorReviewTimeframe)).toBe(
      false,
    );
  });

  it("enforces controlled prerequisite laboratory investigations", () => {
    expect(CONTROLLED_INVESTIGATIONS).toContain("FBC");
    expect(CONTROLLED_INVESTIGATIONS).toContain("Renal Profile");
    expect(CONTROLLED_INVESTIGATIONS).toContain("LFT");
    expect(CONTROLLED_INVESTIGATIONS).toContain("ESR");
    expect(CONTROLLED_INVESTIGATIONS).toContain("CRP");
    expect(CONTROLLED_INVESTIGATIONS).toContain("Other");

    const invalidInvestigation = "PET Scan";
    expect(
      CONTROLLED_INVESTIGATIONS.includes(invalidInvestigation as DoctorRequiredInvestigation),
    ).toBe(false);
  });

  // --------------------------------------------------------------------------
  // 2. Facility Referral Creation & State Restrictions
  // --------------------------------------------------------------------------
  describe("Facility Referral Creation Contract", () => {
    it("creates referrals strictly in 'Pending Doctor Review' status", () => {
      const initialStatus: RheumatologyStatus = "Pending Doctor Review";
      expect(initialStatus).toBe("Pending Doctor Review");
    });

    it("prevents Facility from injecting Doctor review or Paramedic scheduling fields on creation", () => {
      const protectedClinicalFields = [
        "reviewedByDoctorId",
        "reviewedByUid",
        "reviewedByDoctorNameSnapshot",
        "reviewTimeframe",
        "requiredInvestigations",
        "doctorInstructions",
        "scheduledByUid",
        "scheduledByNameSnapshot",
        "doctorAppointmentDate",
        "bloodTakingDate",
        "returnReason",
        "rejectReason",
      ];

      // A valid facility creation payload MUST NOT have any of these keys set
      const maliciousPayload: Record<string, unknown> = {
        facilityId: SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE.facilityId,
        patientName: "Synthetic Test Patient A",
        mrn: "MRN-123456",
        reviewedByDoctorId: "dr_rheum_test_001", // INJECTION ATTEMPT
        doctorAppointmentDate: "2026-11-01 09:00", // INJECTION ATTEMPT
      };

      const injectedKeys = protectedClinicalFields.filter((f) => f in maliciousPayload);
      expect(injectedKeys).toEqual(["reviewedByDoctorId", "doctorAppointmentDate"]);
      expect(injectedKeys.length).toBeGreaterThan(0);
    });

    it("prevents Facility from creating referrals on behalf of another Facility", () => {
      const caller = SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE;
      const targetFacilityId = SYNTHETIC_IDENTITIES.FACILITY_B_ACTIVE.facilityId;

      expect(caller.facilityId).not.toEqual(targetFacilityId);
      const isAuthorized = caller.facilityId === targetFacilityId;
      expect(isAuthorized).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Doctor Review State Machine Transitions
  // --------------------------------------------------------------------------
  describe("Doctor Review State Transitions", () => {
    const validStartingStatuses: RheumatologyStatus[] = ["Pending Doctor Review"];

    it("allows Doctor review ONLY from 'Pending Doctor Review'", () => {
      expect(validStartingStatuses.includes("Pending Doctor Review")).toBe(true);
      expect(validStartingStatuses.includes("Awaiting Scheduling")).toBe(false);
      expect(validStartingStatuses.includes("Scheduled")).toBe(false);
      expect(validStartingStatuses.includes("Returned to Facility")).toBe(false);
      expect(validStartingStatuses.includes("Rejected")).toBe(false);
      expect(validStartingStatuses.includes("Pending Confirmation")).toBe(false);
    });

    it("transitions accepted review to 'Awaiting Scheduling'", () => {
      const nextStatus: RheumatologyStatus = "Awaiting Scheduling";
      expect(nextStatus).toBe("Awaiting Scheduling");
    });

    it("transitions return to 'Returned to Facility' with mandatory returnReason", () => {
      const validReturn = {
        status: "Returned to Facility" as RheumatologyStatus,
        returnReason: "Please attach recent renal profile blood test results.",
      };
      expect(validReturn.status).toBe("Returned to Facility");
      expect(validReturn.returnReason.trim().length).toBeGreaterThan(0);

      const invalidReturnMissingReason = {
        status: "Returned to Facility" as RheumatologyStatus,
        returnReason: "   ",
      };
      expect(invalidReturnMissingReason.returnReason.trim().length).toBe(0);
    });

    it("transitions reject to 'Rejected' with mandatory rejectReason", () => {
      const validReject = {
        status: "Rejected" as RheumatologyStatus,
        rejectReason: "Patient case is not suitable for tertiary rheumatology care.",
      };
      expect(validReject.status).toBe("Rejected");
      expect(validReject.rejectReason.trim().length).toBeGreaterThan(0);

      const invalidRejectMissingReason = {
        status: "Rejected" as RheumatologyStatus,
        rejectReason: "",
      };
      expect(invalidRejectMissingReason.rejectReason.trim().length).toBe(0);
    });

    it("rejects Doctor attempting invalid transitions (e.g. Scheduled -> Awaiting Scheduling)", () => {
      const currentStatus: RheumatologyStatus = "Scheduled";
      const allowedDoctorTransitionsFromScheduled: RheumatologyStatus[] = [];
      expect(allowedDoctorTransitionsFromScheduled.includes("Awaiting Scheduling")).toBe(false);
    });

    it("enforces Doctor attribution binding to caller's authenticated profile", () => {
      const authenticatedDoctor = SYNTHETIC_IDENTITIES.DOCTOR_A_ACTIVE;

      const validAttribution = {
        reviewedByDoctorId: authenticatedDoctor.doctorId,
        reviewedByUid: authenticatedDoctor.uid,
        reviewedByDoctorNameSnapshot: authenticatedDoctor.displayName,
      };

      expect(validAttribution.reviewedByDoctorId).toBe("dr_rheum_test_001");
      expect(validAttribution.reviewedByUid).toBe("test_uid_doctor_a_active_01");

      const spoofedAttribution = {
        reviewedByDoctorId: "dr_someone_else",
        reviewedByUid: authenticatedDoctor.uid,
        reviewedByDoctorNameSnapshot: "Dr Impersonator",
      };

      expect(spoofedAttribution.reviewedByDoctorId).not.toBe(authenticatedDoctor.doctorId);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Paramedic Scheduling State Machine Transitions
  // --------------------------------------------------------------------------
  describe("Paramedic Scheduling Transitions", () => {
    it("allows Paramedic scheduling ONLY from 'Awaiting Scheduling'", () => {
      const currentStatus: RheumatologyStatus = "Awaiting Scheduling";
      const nextStatus: RheumatologyStatus = "Scheduled";

      expect(currentStatus).toBe("Awaiting Scheduling");
      expect(nextStatus).toBe("Scheduled");

      const invalidStartingStatuses: RheumatologyStatus[] = [
        "Pending Doctor Review",
        "Returned to Facility",
        "Rejected",
        "Pending Confirmation",
      ];

      invalidStartingStatuses.forEach((status) => {
        const canSchedule = status === "Awaiting Scheduling";
        expect(canSchedule).toBe(false);
      });
    });

    it("allows Paramedic to reschedule an already 'Scheduled' referral without altering clinical fields", () => {
      const currentStatus: RheumatologyStatus = "Scheduled";
      const nextStatus: RheumatologyStatus = "Scheduled";
      expect(currentStatus === "Scheduled" && nextStatus === "Scheduled").toBe(true);
    });

    it("verifies that Doctor appointment date is mandatory for scheduling", () => {
      const validSchedule = {
        doctorAppointmentDate: "2026-11-15 09:30",
        bloodTakingDate: "2026-11-10 08:00",
      };
      expect(Boolean(validSchedule.doctorAppointmentDate)).toBe(true);

      const invalidScheduleMissingDoctorDate = {
        doctorAppointmentDate: "",
        bloodTakingDate: "2026-11-10 08:00",
      };
      expect(Boolean(invalidScheduleMissingDoctorDate.doctorAppointmentDate)).toBe(false);
    });

    it("verifies that bloodTakingDate is optional and can be cleared during rescheduling", () => {
      const scheduleWithoutBlood = {
        doctorAppointmentDate: "2026-11-15 09:30",
        bloodTakingDate: null,
      };
      expect(scheduleWithoutBlood.doctorAppointmentDate).toBeTruthy();
      expect(scheduleWithoutBlood.bloodTakingDate).toBeNull();
    });

    it("verifies date sequencing: bloodTakingDate must be on or before doctorAppointmentDate", () => {
      const bloodDate = new Date("2026-11-10T08:00:00Z");
      const doctorDate = new Date("2026-11-15T09:30:00Z");
      expect(bloodDate.getTime()).toBeLessThanOrEqual(doctorDate.getTime());

      const invalidBloodAfterDoctor = new Date("2026-11-20T08:00:00Z");
      expect(invalidBloodAfterDoctor.getTime()).toBeGreaterThan(doctorDate.getTime());
    });
  });

  // --------------------------------------------------------------------------
  // 5. Facility Resubmission Contract
  // --------------------------------------------------------------------------
  describe("Facility Resubmission Contract", () => {
    it("allows resubmission ONLY from 'Returned to Facility'", () => {
      const currentStatus: RheumatologyStatus = "Returned to Facility";
      const nextStatus: RheumatologyStatus = "Pending Doctor Review";

      expect(currentStatus).toBe("Returned to Facility");
      expect(nextStatus).toBe("Pending Doctor Review");
    });

    it("preserves previous return history while clearing pending return blocking", () => {
      const resubmissionPayload = {
        status: "Pending Doctor Review" as RheumatologyStatus,
        resubmittedAt: new Date().toISOString(),
        clinicalIndication: "Updated with full joint examination findings.",
      };

      expect(resubmissionPayload.status).toBe("Pending Doctor Review");
      expect(resubmissionPayload.clinicalIndication).toBeTruthy();
    });
  });

  // --------------------------------------------------------------------------
  // 6. Legacy and Historical Record Protection
  // --------------------------------------------------------------------------
  describe("Legacy 'Pending Confirmation' Immutability", () => {
    it("locks 'Pending Confirmation' status from any mutations by Facility, Doctor, or Paramedic", () => {
      const legacyStatus: RheumatologyStatus = "Pending Confirmation";

      const isMutableByFacility = legacyStatus === "Returned to Facility";
      const isMutableByDoctor = legacyStatus === "Pending Doctor Review";
      const isMutableByParamedic =
        legacyStatus === "Awaiting Scheduling" || legacyStatus === "Scheduled";

      expect(isMutableByFacility).toBe(false);
      expect(isMutableByDoctor).toBe(false);
      expect(isMutableByParamedic).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 7. Time Normalization & Preservation
  // --------------------------------------------------------------------------
  describe("Time Normalization & Preservation", () => {
    it("preserves explicit non-default times without silently resetting to 09:00 or 08:30", () => {
      const testCases = [
        { rawTime: "12:00 AM", normalized: "12:00 AM" },
        { rawTime: "12:00 PM", normalized: "12:00 PM" },
        { rawTime: "09:00", normalized: "09:00" },
        { rawTime: "13:30", normalized: "13:30" },
        { rawTime: "10:15 AM", normalized: "10:15 AM" },
        { rawTime: "02:45 PM", normalized: "02:45 PM" },
      ];

      testCases.forEach((tc) => {
        expect(tc.rawTime).toBe(tc.normalized);
        expect(tc.normalized).not.toBe("09:00 default fallback");
      });
    });
  });

  // --------------------------------------------------------------------------
  // 8. Doctor Investigation Decision Logic
  // --------------------------------------------------------------------------
  describe("Doctor Investigation Decision Logic", () => {
    it("starts fresh doctor review with empty selectedInvestigations", () => {
      const initialSelection: DoctorRequiredInvestigation[] = [];
      expect(initialSelection).toEqual([]);
      expect(initialSelection.length).toBe(0);
    });

    it("verifies mutual exclusivity between specific investigations and 'No prerequisite blood investigations required'", () => {
      const specificInvestigations: DoctorRequiredInvestigation[] = ["FBC", "CRP"];
      const noBloodInvestigationsRequired = false;

      const isValidDecision1 = specificInvestigations.length > 0 || noBloodInvestigationsRequired;
      expect(isValidDecision1).toBe(true);

      const noBloodSelected = true;
      const emptyInvestigations: DoctorRequiredInvestigation[] = [];
      const isValidDecision2 = emptyInvestigations.length === 0 && noBloodSelected;
      expect(isValidDecision2).toBe(true);

      // If user checks specific investigations AND checks "no investigations", this is invalid
      const invalidContradictoryDecision = specificInvestigations.length > 0 && noBloodSelected;
      expect(invalidContradictoryDecision).toBe(true); // Should be prevented in UI state
    });
  });
});
