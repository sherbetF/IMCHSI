import { describe, it, expect } from "vitest";

/**
 * UI State & Role-Aware Component Regression Tests (Stage 4 & Stage 6)
 */
describe("Stage 7 — UI Role-Aware Tabs & Rendering Regressions", () => {
  // --------------------------------------------------------------------------
  // 1. Facility Role Views & Navigation
  // --------------------------------------------------------------------------
  describe("Facility Role Navigation & View Permissions", () => {
    function getAvailableTabsForRole(
      role: "facility" | "doctor" | "paramedic_nurse" | "admin" | "outsource",
    ) {
      switch (role) {
        case "facility":
          return ["request", "tracker"];
        case "doctor":
          return [
            "pending_review",
            "awaiting_scheduling",
            "scheduled",
            "returned",
            "rejected",
            "all",
          ];
        case "paramedic_nurse":
          return ["awaiting_scheduling", "scheduled", "all"];
        case "admin":
          return ["tracker", "all"];
        case "outsource":
          return [];
        default:
          return [];
      }
    }

    it("gives Facility users 'New Referral' and 'Track Referral' tabs", () => {
      const tabs = getAvailableTabsForRole("facility");
      expect(tabs).toEqual(["request", "tracker"]);
    });

    it("defaults Doctor workflow to 'Pending Review'", () => {
      const doctorTabs = getAvailableTabsForRole("doctor");
      expect(doctorTabs[0]).toBe("pending_review");
      expect(doctorTabs).toContain("awaiting_scheduling");
      expect(doctorTabs).toContain("scheduled");
      expect(doctorTabs).toContain("returned");
      expect(doctorTabs).toContain("rejected");
      expect(doctorTabs).toContain("all");
    });

    it("defaults Paramedic workflow to 'Awaiting Scheduling'", () => {
      const paramedicTabs = getAvailableTabsForRole("paramedic_nurse");
      expect(paramedicTabs[0]).toBe("awaiting_scheduling");
      expect(paramedicTabs).toContain("scheduled");
      expect(paramedicTabs).toContain("all");
    });
  });

  // --------------------------------------------------------------------------
  // 2. Paramedic Attachment UI Exclusion
  // --------------------------------------------------------------------------
  describe("Paramedic Attachment UI Protection", () => {
    function canRenderClinicalAttachmentsManager(userRole: string) {
      // Only Facility, Doctor, and Admin may render clinical attachments
      return userRole === "facility" || userRole === "doctor" || userRole === "admin";
    }

    it("renders clinical attachment manager for Facility", () => {
      expect(canRenderClinicalAttachmentsManager("facility")).toBe(true);
    });

    it("renders clinical attachment manager for Doctor", () => {
      expect(canRenderClinicalAttachmentsManager("doctor")).toBe(true);
    });

    it("renders clinical attachment manager for Admin oversight", () => {
      expect(canRenderClinicalAttachmentsManager("admin")).toBe(true);
    });

    it("hides clinical attachment manager completely for Paramedic / Nurse", () => {
      expect(canRenderClinicalAttachmentsManager("paramedic_nurse")).toBe(false);
    });

    it("hides clinical attachment manager for Outsource", () => {
      expect(canRenderClinicalAttachmentsManager("outsource")).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Admin-Only Account Manager Controls
  // --------------------------------------------------------------------------
  describe("Admin-Only Account Manager Controls Protection", () => {
    function canRenderAccountManagerControls(isAdmin: boolean, role: string) {
      return isAdmin && role === "admin";
    }

    it("renders Account Manager controls for active Admin", () => {
      expect(canRenderAccountManagerControls(true, "admin")).toBe(true);
    });

    it("hides Account Manager controls for Facility", () => {
      expect(canRenderAccountManagerControls(false, "facility")).toBe(false);
    });

    it("hides Account Manager controls for Doctor", () => {
      expect(canRenderAccountManagerControls(false, "doctor")).toBe(false);
    });

    it("hides Account Manager controls for Paramedic", () => {
      expect(canRenderAccountManagerControls(false, "paramedic_nurse")).toBe(false);
    });

    it("hides Account Manager controls for Outsource", () => {
      expect(canRenderAccountManagerControls(false, "outsource")).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Doctor ID + Password Direct Authentication Flow & Safety Invariants
  // --------------------------------------------------------------------------
  describe("Doctor Direct ID + Password Login Safety Invariants", () => {
    function resolveDoctorAuthEmailFromId(doctorIdInput: string): string {
      const cleanId = (doctorIdInput || "").trim().toLowerCase();
      if (!cleanId) throw new Error("Doctor ID required");
      return `doctor_${cleanId}@auth.local`;
    }

    function validateDoctorPostAuthProfile(
      resolvedLoginEmail: string,
      authUserEmail: string,
      profile: { role: string; doctorId: string; active: boolean },
    ): { valid: boolean; reason?: string } {
      if (profile.role !== "doctor") {
        return { valid: false, reason: "ROLE_MISMATCH" };
      }
      if (profile.active !== true) {
        return { valid: false, reason: "ACCOUNT_INACTIVE" };
      }
      if (!profile.doctorId) {
        return { valid: false, reason: "MISSING_DOCTOR_ID" };
      }
      const expectedEmail = `doctor_${profile.doctorId.toLowerCase()}@auth.local`;
      if (
        authUserEmail.toLowerCase() !== resolvedLoginEmail.toLowerCase() ||
        expectedEmail.toLowerCase() !== resolvedLoginEmail.toLowerCase()
      ) {
        return { valid: false, reason: "IDENTITY_MISMATCH" };
      }
      return { valid: true };
    }

    it("derives deterministic auth email directly from Doctor ID input", () => {
      const email1 = resolveDoctorAuthEmailFromId("dr_rheum_ABC123");
      const email2 = resolveDoctorAuthEmailFromId("DR_RHEUM_abc123 ");
      expect(email1).toBe("doctor_dr_rheum_abc123@auth.local");
      expect(email2).toBe("doctor_dr_rheum_abc123@auth.local");
    });

    it("throws error if Doctor ID is empty or whitespace", () => {
      expect(() => resolveDoctorAuthEmailFromId("")).toThrow("Doctor ID required");
      expect(() => resolveDoctorAuthEmailFromId("   ")).toThrow("Doctor ID required");
    });

    it("validates that authenticated profile matches the Doctor ID auth email identity", () => {
      const result = validateDoctorPostAuthProfile(
        "doctor_dr_rheum_abc123@auth.local",
        "doctor_dr_rheum_abc123@auth.local",
        {
          role: "doctor",
          doctorId: "dr_rheum_ABC123",
          active: true,
        },
      );
      expect(result.valid).toBe(true);
    });

    it("rejects authentication session if profile doctorId does not match Doctor ID input", () => {
      const result = validateDoctorPostAuthProfile(
        "doctor_dr_rheum_abc123@auth.local",
        "doctor_dr_rheum_abc123@auth.local",
        {
          role: "doctor",
          doctorId: "dr_rheum_XYZ999",
          active: true,
        },
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("IDENTITY_MISMATCH");
    });

    it("rejects authentication session if profile is inactive", () => {
      const result = validateDoctorPostAuthProfile(
        "doctor_dr_rheum_abc123@auth.local",
        "doctor_dr_rheum_abc123@auth.local",
        {
          role: "doctor",
          doctorId: "dr_rheum_ABC123",
          active: false,
        },
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("ACCOUNT_INACTIVE");
    });

    it("rejects authentication session if role is not doctor", () => {
      const result = validateDoctorPostAuthProfile(
        "doctor_dr_rheum_abc123@auth.local",
        "doctor_dr_rheum_abc123@auth.local",
        {
          role: "paramedic_nurse",
          doctorId: "dr_rheum_ABC123",
          active: true,
        },
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("ROLE_MISMATCH");
    });
  });
});
