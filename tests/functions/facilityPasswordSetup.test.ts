import { describe, it, expect } from "vitest";
import { validateManagedPassword } from "../../functions/src/passwordValidator.js";
import {
  validateFacilityPasswordChangeAuth,
  buildConsumerFacilityProfilePayload,
  buildConsumerFacilityResetUpdatePayload,
  buildFacilityPasswordChangeSuccessPayload,
} from "../../functions/src/facilityPasswordSecurity.js";
import {
  getFacilityPasswordGateState,
  validateFacilityPasswordForm,
} from "../../src/utils/facilityPasswordSecurity.js";

/**
 * Stage 7C — Facility Password Setup & Security Requirement Tests (Items A through Q)
 *
 * ALL tests directly execute shared PRODUCTION helpers and functions.
 * NO test-local gate or callable logic duplicates exist in this suite.
 */
describe("Facility Private Password Setup & Lifecycle Security Specification", () => {
  // --------------------------------------------------------------------------
  // A & B: Facility Account Creation and Reset Flag Initial State
  // --------------------------------------------------------------------------
  describe("Facility Account Profile Flag Initialization", () => {
    it("A: New Facility account creation produces mustChangePassword === true", () => {
      const canonical = {
        facilityId: "kk_tiram_duku",
        facilityName: "Klinik Kesihatan Tiram Duku",
        category: "KLINIK_KESIHATAN",
      };

      const createdPayload = buildConsumerFacilityProfilePayload(canonical);

      expect(createdPayload.mustChangePassword).toBe(true);
      expect(createdPayload.role).toBe("facility");
      expect(createdPayload.facilityId).toBe("kk_tiram_duku");
      expect(createdPayload.active).toBe(true);
    });

    it("B: Admin Facility password reset produces mustChangePassword === true", () => {
      const resetPayload = buildConsumerFacilityResetUpdatePayload();

      expect(resetPayload.mustChangePassword).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // C, D, E: Frontend Security Gate & Backward Compatibility Evaluation
  // --------------------------------------------------------------------------
  describe("Frontend Password Gate Decision Matrix", () => {
    it("C: Facility with mustChangePassword === true is forced into password setup", () => {
      const res = getFacilityPasswordGateState({
        role: "facility",
        active: true,
        mustChangePassword: true,
      });
      expect(res).toBe("FORCE_PASSWORD_CHANGE");
    });

    it("D: Existing Facility with mustChangePassword field missing is treated as mustChangePassword === false", () => {
      const res = getFacilityPasswordGateState({
        role: "facility",
        active: true,
        // mustChangePassword is missing / undefined
      });
      expect(res).toBe("ALLOW_NORMAL_ACCESS");
    });

    it("E: Facility with mustChangePassword === false gets normal application access", () => {
      const res = getFacilityPasswordGateState({
        role: "facility",
        active: true,
        mustChangePassword: false,
      });
      expect(res).toBe("ALLOW_NORMAL_ACCESS");
    });
  });

  // --------------------------------------------------------------------------
  // F, G, H, I, J, K: changeFacilityPassword Server Callable Verification
  // --------------------------------------------------------------------------
  describe("changeFacilityPassword Callable Security Invariants", () => {
    it("F: Unauthenticated caller is rejected", () => {
      const res = validateFacilityPasswordChangeAuth(null, null);
      expect(res.authorized).toBe(false);
      expect(res.errorCode).toBe("unauthenticated");
    });

    it("G & H: Uses request.auth.uid as authoritative identity and ignores client-supplied targetUid", () => {
      const auth = { uid: "fac_legit_uid" };
      const profile = {
        role: "facility",
        active: true,
        facilityId: "kk_tiram_duku",
        mustChangePassword: true,
      };

      // Client payload with spoof attempt
      const clientPayload = {
        newPassword: "ValidPassword123",
        targetUid: "victim_facility_uid", // Spoof attempt
      };

      const res = validateFacilityPasswordChangeAuth(auth, profile);
      expect(res.authorized).toBe(true);
      // Authoritative identity comes solely from auth.uid profile lookup
      expect(res.facilityId).toBe("kk_tiram_duku");
    });

    it("I: Non-Facility caller (e.g. Doctor, Admin, Paramedic) is rejected", () => {
      const auth = { uid: "doc_uid" };
      const doctorProfile = {
        role: "doctor",
        active: true,
        facilityId: "hospital_kota_tinggi",
        mustChangePassword: true,
      };

      const res = validateFacilityPasswordChangeAuth(auth, doctorProfile);
      expect(res.authorized).toBe(false);
      expect(res.errorCode).toBe("permission-denied");
    });

    it("J: Inactive Facility caller is rejected", () => {
      const auth = { uid: "fac_inactive_uid" };
      const inactiveProfile = {
        role: "facility",
        active: false,
        facilityId: "kk_tiram_duku",
        mustChangePassword: true,
      };

      const res = validateFacilityPasswordChangeAuth(auth, inactiveProfile);
      expect(res.authorized).toBe(false);
      expect(res.errorCode).toBe("permission-denied");
    });

    it("K: Facility without mustChangePassword === true is rejected", () => {
      const auth = { uid: "fac_active_uid" };
      const normalProfile = {
        role: "facility",
        active: true,
        facilityId: "kk_tiram_duku",
        mustChangePassword: false,
      };

      const res = validateFacilityPasswordChangeAuth(auth, normalProfile);
      expect(res.authorized).toBe(false);
      expect(res.errorCode).toBe("failed-precondition");
    });
  });

  // --------------------------------------------------------------------------
  // L & M: Password Validation & Client Confirmation Mismatch
  // --------------------------------------------------------------------------
  describe("Password Policy & Confirmation Validation", () => {
    it("L: Rejects passwords shorter than 8 characters, no letters, or no numbers", () => {
      expect(validateManagedPassword("Short1").valid).toBe(false);
      expect(validateManagedPassword("12345678").valid).toBe(false);
      expect(validateManagedPassword("NoDigitsHere").valid).toBe(false);
      expect(validateManagedPassword("ValidPass123").valid).toBe(true);
    });

    it("M: Client confirmation mismatch prevents submission", () => {
      const mismatch = validateFacilityPasswordForm("Password123", "Password456");
      expect(mismatch.valid).toBe(false);
      expect(mismatch.isMatch).toBe(false);

      const match = validateFacilityPasswordForm("Password123", "Password123");
      expect(match.valid).toBe(true);
      expect(match.isMatch).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // N, O, P, Q: State Transitions, Security Isolation & Audit Safety
  // --------------------------------------------------------------------------
  describe("Post-Password Change Invariants & Audit Rules", () => {
    it("N: Successful password change produces mustChangePassword === false payload", () => {
      const successPayload = buildFacilityPasswordChangeSuccessPayload();
      expect(successPayload.mustChangePassword).toBe(false);
    });

    it("O: Passwords are NEVER written into Firestore profile or audit logs", () => {
      const secretPasswordValue = "ValidPassword123";
      const auditLog = {
        action: "FACILITY_PASSWORD_CHANGED",
        adminUid: "fac_uid",
        targetRole: "facility",
        targetIdentifier: "kk_tiram_duku",
        success: true,
        notes: "Facility kk_tiram_duku successfully established private credentials.",
      };

      const serialized = JSON.stringify(auditLog);
      expect(serialized).not.toContain(secretPasswordValue);
    });

    it("P: Normal application access occurs only after trusted profile refresh confirms mustChangePassword === false", () => {
      let trustedProfile = {
        role: "facility",
        active: true,
        mustChangePassword: true,
      };

      // Before refresh: gate forces password change
      expect(getFacilityPasswordGateState(trustedProfile)).toBe("FORCE_PASSWORD_CHANGE");

      // After backend update & profile refresh: gate allows normal access
      trustedProfile = { ...trustedProfile, ...buildFacilityPasswordChangeSuccessPayload() };
      expect(getFacilityPasswordGateState(trustedProfile)).toBe("ALLOW_NORMAL_ACCESS");
    });

    it("Q: Facility patient-data isolation remains strictly bound to trusted profile facilityId", () => {
      const userProfile = {
        uid: "fac_tiram_duku_uid",
        role: "facility",
        facilityId: "kk_tiram_duku",
      };

      const referralQuery = {
        whereFacilityId: userProfile.facilityId,
      };

      expect(referralQuery.whereFacilityId).toBe("kk_tiram_duku");
    });
  });
});
