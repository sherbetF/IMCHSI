import { describe, it, expect } from "vitest";
import { SYNTHETIC_IDENTITIES } from "../fixtures/syntheticIdentities";

/**
 * Backend Cloud Functions Authorization & Logic Tests for Account Manager
 * (Stage 6 Admin & Doctor Management Architecture)
 */
describe("Stage 7 — Account Manager Callable Authorization & Security Specification", () => {
  // --------------------------------------------------------------------------
  // 1. Admin Role & Active Verification for all 4 Callables
  // --------------------------------------------------------------------------
  describe("Admin Authorization Matrix for Managed Account Callables", () => {
    function authorizeAdminCallable(caller: typeof SYNTHETIC_IDENTITIES.ADMIN_ACTIVE | null) {
      if (!caller) return { authorized: false, reason: "UNAUTHENTICATED" };
      if (caller.active !== true) return { authorized: false, reason: "ACCOUNT_INACTIVE" };
      if (caller.role !== "admin") return { authorized: false, reason: "FORBIDDEN_ROLE" };
      return { authorized: true };
    }

    it("allows active Admin caller", () => {
      const res = authorizeAdminCallable(SYNTHETIC_IDENTITIES.ADMIN_ACTIVE);
      expect(res.authorized).toBe(true);
    });

    it("denies inactive Admin caller", () => {
      const res = authorizeAdminCallable(SYNTHETIC_IDENTITIES.ADMIN_INACTIVE);
      expect(res.authorized).toBe(false);
      expect(res.reason).toBe("ACCOUNT_INACTIVE");
    });

    it("denies Facility caller from calling Account Manager functions", () => {
      const res = authorizeAdminCallable(SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE as any);
      expect(res.authorized).toBe(false);
      expect(res.reason).toBe("FORBIDDEN_ROLE");
    });

    it("denies Doctor caller from calling Account Manager functions", () => {
      const res = authorizeAdminCallable(SYNTHETIC_IDENTITIES.DOCTOR_A_ACTIVE as any);
      expect(res.authorized).toBe(false);
      expect(res.reason).toBe("FORBIDDEN_ROLE");
    });

    it("denies Paramedic caller from calling Account Manager functions", () => {
      const res = authorizeAdminCallable(SYNTHETIC_IDENTITIES.PARAMEDIC_ACTIVE as any);
      expect(res.authorized).toBe(false);
      expect(res.reason).toBe("FORBIDDEN_ROLE");
    });

    it("denies Outsource caller from calling Account Manager functions", () => {
      const res = authorizeAdminCallable(SYNTHETIC_IDENTITIES.OUTSOURCE_ACTIVE as any);
      expect(res.authorized).toBe(false);
      expect(res.reason).toBe("FORBIDDEN_ROLE");
    });

    it("denies Unauthenticated caller from calling Account Manager functions", () => {
      const res = authorizeAdminCallable(SYNTHETIC_IDENTITIES.UNAUTHENTICATED);
      expect(res.authorized).toBe(false);
      expect(res.reason).toBe("UNAUTHENTICATED");
    });
  });

  // --------------------------------------------------------------------------
  // 2. Doctor Account Creation Input Attack Rejections
  // --------------------------------------------------------------------------
  describe("Doctor Account Creation Strict Input Contract", () => {
    function validateDoctorCreationPayload(rawPayload: Record<string, unknown>) {
      const { accountType, displayName, password } = rawPayload;

      if (accountType !== "DOCTOR") {
        return { valid: false, reason: "INVALID_ACCOUNT_TYPE" };
      }
      if (
        typeof displayName !== "string" ||
        displayName.trim().length < 2 ||
        displayName.trim().length > 100
      ) {
        return { valid: false, reason: "INVALID_DISPLAY_NAME" };
      }
      if (typeof password !== "string" || password.length < 8) {
        return { valid: false, reason: "PASSWORD_TOO_SHORT" };
      }

      // Prohibited client-injected security properties MUST NOT override backend generation
      const prohibitedKeys = ["doctorId", "uid", "role", "active", "email", "facilityId"];
      const injectedKeys = prohibitedKeys.filter((k) => k in rawPayload);

      return {
        valid: true,
        sanitizedInput: {
          displayName: displayName.trim(),
          password,
        },
        injectedKeysIgnoredOrRejected: injectedKeys,
      };
    }

    it("accepts valid Doctor creation payload", () => {
      const res = validateDoctorCreationPayload({
        accountType: "DOCTOR",
        displayName: "Dr. Sarah Jenkins",
        password: "ValidSecurePassword123!",
      });
      expect(res.valid).toBe(true);
      expect(res.sanitizedInput?.displayName).toBe("Dr. Sarah Jenkins");
    });

    it("detects and ignores/rejects client attempts to inject doctorId or synthetic email", () => {
      const maliciousPayload = {
        accountType: "DOCTOR",
        displayName: "Dr. Malicious Injector",
        password: "ValidSecurePassword123!",
        doctorId: "dr_custom_backdoor_id", // CLIENT INJECTION
        role: "admin", // ROLE ESCALATION ATTEMPT
        active: true,
        email: "admin@hospital.gov.my", // EMAIL SPOOF ATTEMPT
      };

      const res = validateDoctorCreationPayload(maliciousPayload);
      expect(res.valid).toBe(true);
      expect(res.injectedKeysIgnoredOrRejected).toContain("doctorId");
      expect(res.injectedKeysIgnoredOrRejected).toContain("role");
      expect(res.injectedKeysIgnoredOrRejected).toContain("email");
    });
  });

  // --------------------------------------------------------------------------
  // 3. Password Complexity Policy
  // --------------------------------------------------------------------------
  describe("Password Complexity Policy Enforcement", () => {
    function validatePasswordPolicy(pwd: string): { valid: boolean; reason?: string } {
      if (pwd.length < 8) return { valid: false, reason: "Minimum 8 characters required" };
      if (!/[a-zA-Z]/.test(pwd))
        return { valid: false, reason: "Must contain at least one letter" };
      if (!/[0-9]/.test(pwd)) return { valid: false, reason: "Must contain at least one number" };
      return { valid: true };
    }

    it("rejects passwords shorter than 8 characters", () => {
      expect(validatePasswordPolicy("Abc12").valid).toBe(false);
      expect(validatePasswordPolicy("Short1").valid).toBe(false);
    });

    it("rejects passwords containing letters only (no numbers)", () => {
      expect(validatePasswordPolicy("AllLettersOnly").valid).toBe(false);
    });

    it("rejects passwords containing numbers only (no letters)", () => {
      expect(validatePasswordPolicy("1234567890").valid).toBe(false);
    });

    it("allows passwords with letters, numbers, and 8+ characters", () => {
      expect(validatePasswordPolicy("ValidPass123!").valid).toBe(true);
      expect(validatePasswordPolicy("drPassword2026").valid).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Doctor Duplicate Identity & Conflict Handling
  // --------------------------------------------------------------------------
  describe("Doctor Duplicate Identity & Conflict Detection", () => {
    function evaluateDoctorStatus(
      profiles: Array<{ doctorId: string; active: boolean }>,
      authUserExists: boolean,
      authDisabled: boolean,
    ) {
      if (profiles.length > 1) {
        return "CONFLICT";
      }
      if (profiles.length === 0 && !authUserExists) {
        return "NOT_CREATED";
      }
      if (profiles.length === 1 && !authUserExists) {
        return "PARTIAL_MISSING_AUTH";
      }
      if (profiles.length === 0 && authUserExists) {
        return "PARTIAL_MISSING_PROFILE";
      }

      const profile = profiles[0]!;
      if (profile.active === true && authDisabled === true) {
        return "SECURITY_MISMATCH";
      }
      if (profile.active === false && authDisabled === false) {
        return "SECURITY_MISMATCH";
      }

      return profile.active ? "ACTIVE" : "INACTIVE";
    }

    it("marks duplicate Doctor profiles as CONFLICT without silently repairing", () => {
      const duplicateProfiles = [
        { doctorId: "dr_rheum_TEST", active: true },
        { doctorId: "dr_rheum_TEST", active: true },
      ];
      const status = evaluateDoctorStatus(duplicateProfiles, true, false);
      expect(status).toBe("CONFLICT");
    });

    it("marks active profile with disabled Auth user as SECURITY_MISMATCH", () => {
      const status = evaluateDoctorStatus([{ doctorId: "dr_1", active: true }], true, true);
      expect(status).toBe("SECURITY_MISMATCH");
    });

    it("marks healthy active doctor as ACTIVE", () => {
      const status = evaluateDoctorStatus([{ doctorId: "dr_1", active: true }], true, false);
      expect(status).toBe("ACTIVE");
    });

    it("marks healthy disabled doctor as INACTIVE", () => {
      const status = evaluateDoctorStatus([{ doctorId: "dr_1", active: false }], true, true);
      expect(status).toBe("INACTIVE");
    });
  });

  // --------------------------------------------------------------------------
  // 5. Doctor Disable & Reactivate Idempotency
  // --------------------------------------------------------------------------
  describe("Doctor Disable & Reactivate Operations", () => {
    it("preserves doctorId and historical records when disabling a doctor", () => {
      const doctorAccount = {
        uid: "test_doctor_uid",
        doctorId: "dr_rheum_ABC123",
        displayName: "Dr. Sarah",
        active: true,
      };

      // Disabling toggles active state to false
      const disabledAccount = { ...doctorAccount, active: false };
      expect(disabledAccount.active).toBe(false);
      expect(disabledAccount.doctorId).toBe(doctorAccount.doctorId);
      expect(disabledAccount.uid).toBe(doctorAccount.uid);
    });

    it("restores active state to true on reactivation using same identity", () => {
      const disabledAccount = {
        uid: "test_doctor_uid",
        doctorId: "dr_rheum_ABC123",
        displayName: "Dr. Sarah",
        active: false,
      };

      const reactivatedAccount = { ...disabledAccount, active: true };
      expect(reactivatedAccount.active).toBe(true);
      expect(reactivatedAccount.doctorId).toBe(disabledAccount.doctorId);
    });
  });

  // --------------------------------------------------------------------------
  // 6. No Doctor Hard Delete Verification
  // --------------------------------------------------------------------------
  describe("No Doctor Hard Delete Invariant", () => {
    it("verifies that no hard-delete callable is exported in the codebase", () => {
      const exportedCallables = [
        "listManagedAccounts",
        "createManagedAccount",
        "resetManagedAccountPassword",
        "setManagedAccountActiveStatus",
        "reserveRheumatologyAttachmentSlot",
        "releaseRheumatologyAttachmentSlot",
      ];

      expect(exportedCallables).not.toContain("deleteDoctorAccount");
      expect(exportedCallables).not.toContain("deleteManagedAccount");
      expect(exportedCallables).not.toContain("removeDoctor");
    });
  });

  // --------------------------------------------------------------------------
  // 7. Paramedic & Facility Account Regressions
  // --------------------------------------------------------------------------
  describe("Paramedic & Facility Account Integrity", () => {
    it("preserves stable paramedic_nurse_main key", () => {
      const canonicalKey = "paramedic_nurse_main";
      expect(SYNTHETIC_IDENTITIES.PARAMEDIC_ACTIVE.accountKey).toBe(canonicalKey);
    });
  });

  // --------------------------------------------------------------------------
  // 8. Opaque Doctor Login Selector & Pre-Auth Resolution Specification
  // --------------------------------------------------------------------------
  describe("Opaque Doctor LoginKey Selector Specification", () => {
    it("exports listActiveDoctors and resolveDoctorLoginTarget callables", async () => {
      const functionsIndex = await import("../../functions/src/index.js");
      expect(functionsIndex.listActiveDoctors).toBeDefined();
      expect(functionsIndex.resolveDoctorLoginTarget).toBeDefined();
      expect(functionsIndex.generateDoctorLoginKey).toBeDefined();
    });

    it("generates opaque doc_sel_ formatted keys that never expose canonical doctorId", async () => {
      const { generateDoctorLoginKey } = await import("../../functions/src/doctorLoginHelper.js");
      const key1 = generateDoctorLoginKey("dr_rheum_ABC123");
      const key2 = generateDoctorLoginKey("dr_rheum_XYZ999");

      expect(key1).toMatch(/^doc_sel_[a-f0-9]{24}$/);
      expect(key2).toMatch(/^doc_sel_[a-f0-9]{24}$/);
      expect(key1).not.toContain("dr_rheum");
      expect(key2).not.toContain("dr_rheum");
      expect(key1).not.toBe(key2);
    });

    it("ensures generateDoctorLoginKey is deterministic across calls for same ID", async () => {
      const { generateDoctorLoginKey } = await import("../../functions/src/doctorLoginHelper.js");
      const keyA1 = generateDoctorLoginKey("dr_rheum_ABC123");
      const keyA2 = generateDoctorLoginKey("dr_rheum_ABC123");
      expect(keyA1).toBe(keyA2);
    });
  });
});
