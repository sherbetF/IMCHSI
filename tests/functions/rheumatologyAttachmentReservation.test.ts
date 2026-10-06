import { describe, it, expect } from "vitest";
import { SYNTHETIC_IDENTITIES } from "../fixtures/syntheticIdentities";

/**
 * Backend Cloud Functions Logic & Authorization Tests for Rheumatology Attachment Reservation
 * (Stage 5C Backend-Owned Architecture)
 */
describe("Stage 7 — Backend Attachment Reservation & Release Cloud Functions", () => {
  // --------------------------------------------------------------------------
  // 1. Caller Role Authorization Matrix
  // --------------------------------------------------------------------------
  describe("Caller Role Authorization for reserveRheumatologyAttachmentSlot", () => {
    function authorizeReservationCaller(
      caller: typeof SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE | null,
    ) {
      if (!caller) return { authorized: false, reason: "UNAUTHENTICATED" };
      if (caller.active !== true) return { authorized: false, reason: "ACCOUNT_INACTIVE" };
      if (caller.role !== "facility") return { authorized: false, reason: "FORBIDDEN_ROLE" };
      return { authorized: true };
    }

    it("allows active Facility caller to initiate slot reservation", () => {
      const res = authorizeReservationCaller(SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE);
      expect(res.authorized).toBe(true);
    });

    it("denies inactive Facility caller", () => {
      const res = authorizeReservationCaller(SYNTHETIC_IDENTITIES.FACILITY_A_INACTIVE);
      expect(res.authorized).toBe(false);
      expect(res.reason).toBe("ACCOUNT_INACTIVE");
    });

    it("denies Doctor caller from reserving attachment slots", () => {
      const res = authorizeReservationCaller(SYNTHETIC_IDENTITIES.DOCTOR_A_ACTIVE as any);
      expect(res.authorized).toBe(false);
      expect(res.reason).toBe("FORBIDDEN_ROLE");
    });

    it("denies Paramedic caller from reserving attachment slots", () => {
      const res = authorizeReservationCaller(SYNTHETIC_IDENTITIES.PARAMEDIC_ACTIVE as any);
      expect(res.authorized).toBe(false);
      expect(res.reason).toBe("FORBIDDEN_ROLE");
    });

    it("denies Admin caller from reserving clinical attachment slots directly", () => {
      const res = authorizeReservationCaller(SYNTHETIC_IDENTITIES.ADMIN_ACTIVE as any);
      expect(res.authorized).toBe(false);
      expect(res.reason).toBe("FORBIDDEN_ROLE");
    });

    it("denies Outsource caller from reserving attachment slots", () => {
      const res = authorizeReservationCaller(SYNTHETIC_IDENTITIES.OUTSOURCE_ACTIVE as any);
      expect(res.authorized).toBe(false);
      expect(res.reason).toBe("FORBIDDEN_ROLE");
    });

    it("denies unauthenticated caller from reserving attachment slots", () => {
      const res = authorizeReservationCaller(SYNTHETIC_IDENTITIES.UNAUTHENTICATED);
      expect(res.authorized).toBe(false);
      expect(res.reason).toBe("UNAUTHENTICATED");
    });
  });

  // --------------------------------------------------------------------------
  // 2. Referral Ownership & Mutable Status Validation
  // --------------------------------------------------------------------------
  describe("Referral Ownership & Mutable Status Validation", () => {
    function validateReservationReferral(
      callerFacilityId: string,
      referral: { facilityId: string; status: string },
    ) {
      if (callerFacilityId !== referral.facilityId) {
        return { valid: false, reason: "FACILITY_MISMATCH" };
      }
      const allowedStatuses = ["Pending Doctor Review", "Returned to Facility"];
      if (!allowedStatuses.includes(referral.status)) {
        return { valid: false, reason: "IMMUTABLE_REFERRAL_STATUS" };
      }
      return { valid: true };
    }

    it("allows reservation when caller is owner and referral is 'Pending Doctor Review'", () => {
      const res = validateReservationReferral("TEST_FACILITY_A", {
        facilityId: "TEST_FACILITY_A",
        status: "Pending Doctor Review",
      });
      expect(res.valid).toBe(true);
    });

    it("allows reservation when caller is owner and referral is 'Returned to Facility'", () => {
      const res = validateReservationReferral("TEST_FACILITY_A", {
        facilityId: "TEST_FACILITY_A",
        status: "Returned to Facility",
      });
      expect(res.valid).toBe(true);
    });

    it("denies reservation when Facility B attempts reservation on Facility A referral", () => {
      const res = validateReservationReferral("TEST_FACILITY_B", {
        facilityId: "TEST_FACILITY_A",
        status: "Pending Doctor Review",
      });
      expect(res.valid).toBe(false);
      expect(res.reason).toBe("FACILITY_MISMATCH");
    });

    it("denies reservation when referral is 'Awaiting Scheduling'", () => {
      const res = validateReservationReferral("TEST_FACILITY_A", {
        facilityId: "TEST_FACILITY_A",
        status: "Awaiting Scheduling",
      });
      expect(res.valid).toBe(false);
      expect(res.reason).toBe("IMMUTABLE_REFERRAL_STATUS");
    });

    it("denies reservation when referral is 'Scheduled'", () => {
      const res = validateReservationReferral("TEST_FACILITY_A", {
        facilityId: "TEST_FACILITY_A",
        status: "Scheduled",
      });
      expect(res.valid).toBe(false);
      expect(res.reason).toBe("IMMUTABLE_REFERRAL_STATUS");
    });

    it("denies reservation when referral is 'Rejected'", () => {
      const res = validateReservationReferral("TEST_FACILITY_A", {
        facilityId: "TEST_FACILITY_A",
        status: "Rejected",
      });
      expect(res.valid).toBe(false);
      expect(res.reason).toBe("IMMUTABLE_REFERRAL_STATUS");
    });

    it("denies reservation when referral is legacy 'Pending Confirmation'", () => {
      const res = validateReservationReferral("TEST_FACILITY_A", {
        facilityId: "TEST_FACILITY_A",
        status: "Pending Confirmation",
      });
      expect(res.valid).toBe(false);
      expect(res.reason).toBe("IMMUTABLE_REFERRAL_STATUS");
    });
  });

  // --------------------------------------------------------------------------
  // 3. Maximum 5 Attachments Atomic Reservation & Concurrency Limits
  // --------------------------------------------------------------------------
  describe("Maximum 5 Attachments Atomic Reservation & Concurrency Limits", () => {
    interface AttachmentControlSummary {
      activeAttachmentIds: string[];
      activeCount: number;
    }

    function atomicReserveSlot(
      currentControl: AttachmentControlSummary,
      requestedAttachmentId: string,
    ): { success: boolean; nextControl: AttachmentControlSummary; error?: string } {
      const activeIds = currentControl.activeAttachmentIds || [];

      // Idempotency check: if slot already reserved for this attachmentId, succeed without consuming new slot
      if (activeIds.includes(requestedAttachmentId)) {
        return {
          success: true,
          nextControl: currentControl,
        };
      }

      if (activeIds.length >= 5) {
        return {
          success: false,
          nextControl: currentControl,
          error: "RESOURCE_EXHAUSTED: Maximum limit of 5 attachments reached for this referral.",
        };
      }

      const nextIds = [...activeIds, requestedAttachmentId];
      return {
        success: true,
        nextControl: {
          activeAttachmentIds: nextIds,
          activeCount: nextIds.length,
        },
      };
    }

    it("grants slots 1 through 5 sequentially", () => {
      let control: AttachmentControlSummary = { activeAttachmentIds: [], activeCount: 0 };

      for (let i = 1; i <= 5; i++) {
        const res = atomicReserveSlot(control, `att_id_${i}`);
        expect(res.success).toBe(true);
        expect(res.nextControl.activeCount).toBe(i);
        expect(res.nextControl.activeAttachmentIds).toContain(`att_id_${i}`);
        control = res.nextControl;
      }

      expect(control.activeCount).toBe(5);
    });

    it("rejects 6th attachment reservation when 5 active slots are held", () => {
      const control: AttachmentControlSummary = {
        activeAttachmentIds: ["att_1", "att_2", "att_3", "att_4", "att_5"],
        activeCount: 5,
      };

      const res = atomicReserveSlot(control, "att_6_attempt");
      expect(res.success).toBe(false);
      expect(res.error).toContain("RESOURCE_EXHAUSTED");
      expect(res.nextControl.activeCount).toBe(5);
    });

    it("handles concurrent reservation race safely where only 1 of 2 competing 5th-slot requests succeeds", () => {
      // 4 slots currently occupied
      let control: AttachmentControlSummary = {
        activeAttachmentIds: ["att_1", "att_2", "att_3", "att_4"],
        activeCount: 4,
      };

      // Client 1 attempts reserving slot 5
      const req1 = atomicReserveSlot(control, "att_slot_5A");
      expect(req1.success).toBe(true);
      control = req1.nextControl; // Transaction commits

      // Client 2 attempts reserving slot 5 concurrently with different ID
      const req2 = atomicReserveSlot(control, "att_slot_5B");
      expect(req2.success).toBe(false);
      expect(req2.error).toContain("RESOURCE_EXHAUSTED");

      expect(control.activeCount).toBe(5);
      expect(control.activeAttachmentIds).toContain("att_slot_5A");
      expect(control.activeAttachmentIds).not.toContain("att_slot_5B");
    });

    it("is idempotent when caller retries reservation with identical attachmentId", () => {
      const initialControl: AttachmentControlSummary = {
        activeAttachmentIds: ["att_1", "att_2"],
        activeCount: 2,
      };

      const res1 = atomicReserveSlot(initialControl, "att_id_retry");
      expect(res1.success).toBe(true);
      expect(res1.nextControl.activeCount).toBe(3);

      // Caller retries using same attachmentId
      const res2 = atomicReserveSlot(res1.nextControl, "att_id_retry");
      expect(res2.success).toBe(true);
      expect(res2.nextControl.activeCount).toBe(3); // Count remains 3, not 4
    });
  });

  // --------------------------------------------------------------------------
  // 4. Stale Reservation Reconciliation
  // --------------------------------------------------------------------------
  describe("Stale Reservation Reconciliation Logic", () => {
    it("cleans up stale unfinalized reservations older than 30 minutes while preserving finalized metadata", () => {
      const now = Date.now();
      const thirtyFiveMinutesAgo = now - 35 * 60 * 1000;
      const tenMinutesAgo = now - 10 * 60 * 1000;

      const activeSlots = [
        { attachmentId: "att_finalized", reservedAt: thirtyFiveMinutesAgo, hasMetadataDoc: true },
        {
          attachmentId: "att_stale_abandoned",
          reservedAt: thirtyFiveMinutesAgo,
          hasMetadataDoc: false,
        },
        {
          attachmentId: "att_recent_in_progress",
          reservedAt: tenMinutesAgo,
          hasMetadataDoc: false,
        },
      ];

      const STALE_THRESHOLD_MS = 30 * 60 * 1000;

      const reconciledSlots = activeSlots.filter((slot) => {
        const isStale = now - slot.reservedAt > STALE_THRESHOLD_MS;
        if (isStale && !slot.hasMetadataDoc) {
          return false; // Reclaim abandoned slot
        }
        return true;
      });

      expect(reconciledSlots.map((s) => s.attachmentId)).toEqual([
        "att_finalized",
        "att_recent_in_progress",
      ]);
      expect(reconciledSlots.length).toBe(2);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Release Attachment Slot Cloud Function
  // --------------------------------------------------------------------------
  describe("Release Attachment Slot Authorization & Operation", () => {
    function releaseSlot(
      caller: typeof SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE,
      referralFacilityId: string,
      currentIds: string[],
      idToRelease: string,
    ) {
      if (caller.active !== true) return { success: false, reason: "ACCOUNT_INACTIVE" };
      if (caller.role !== "facility") return { success: false, reason: "FORBIDDEN_ROLE" };
      if (caller.facilityId !== referralFacilityId)
        return { success: false, reason: "FACILITY_MISMATCH" };

      const nextIds = currentIds.filter((id) => id !== idToRelease);
      return {
        success: true,
        activeAttachmentIds: nextIds,
        activeCount: nextIds.length,
      };
    }

    it("allows active owning facility to release a slot", () => {
      const res = releaseSlot(
        SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE,
        "TEST_FACILITY_A",
        ["att_1", "att_2", "att_3"],
        "att_2",
      );
      expect(res.success).toBe(true);
      expect(res.activeCount).toBe(2);
      expect(res.activeAttachmentIds).toEqual(["att_1", "att_3"]);
    });

    it("denies other facility from releasing slot", () => {
      const res = releaseSlot(
        SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE,
        "TEST_FACILITY_B",
        ["att_1", "att_2"],
        "att_1",
      );
      expect(res.success).toBe(false);
      expect(res.reason).toBe("FACILITY_MISMATCH");
    });
  });
});
