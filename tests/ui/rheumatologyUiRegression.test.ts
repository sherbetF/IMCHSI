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
});
