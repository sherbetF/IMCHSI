import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Specification & Security Evaluation Tests for Medical Report Storage Security Rules
 * Validates actual storage.rules file against Issue No. 2 criteria:
 * - Direct client overwrite prohibition (resource == null on create, allow update: if false)
 * - Permanent deletion prohibition for all client accounts (allow delete: if false)
 * - Outsource provider assignment check via isAssignedOutsourceProvider(reportId)
 * - Direct client write/delete prohibition on archived versions
 * - MIME type and file size boundaries (20MB limit, PDF and images allowed)
 */
describe("Issue No. 2 — Medical Report Storage Security Rules Specification Verification", () => {
  const rulesPath = path.resolve(__dirname, "../../storage.rules");
  const rulesContent = fs.readFileSync(rulesPath, "utf-8");

  it("loads actual storage.rules from root directory", () => {
    expect(rulesContent).toBeTruthy();
    expect(rulesContent).toContain("service firebase.storage");
    expect(rulesContent).toContain("rules_version = '2';");
  });

  // --------------------------------------------------------------------------
  // 1. Helper Functions (isAssignedOutsourceProvider)
  // --------------------------------------------------------------------------
  describe("1. Outsource Helper Functions in storage.rules", () => {
    it("defines isAssignedOutsourceProvider checking outsource_appointments document and facilityId match", () => {
      expect(rulesContent).toContain("function isAssignedOutsourceProvider(reportId, facilityId)");
      expect(rulesContent).toContain("getOutsourceAppt(reportId).data.facilityId == facilityId");
      expect(rulesContent).toContain("getOutsourceAppt(reportId).data.outsourceProviderId");
      expect(rulesContent).toContain("getOutsourceAppt(reportId).data.providerId");
    });
  });

  // --------------------------------------------------------------------------
  // 2. Facility Medical Diagnostic Report Rules (/facilities/{facilityId}/reports/{reportId}/{fileName})
  // --------------------------------------------------------------------------
  describe("2. Facility Diagnostic Report Rules", () => {
    it("matches facility report storage path", () => {
      expect(rulesContent).toContain(
        "match /facilities/{facilityId}/reports/{reportId}/{fileName}",
      );
    });

    it("requires authentication and limits READ to Admin or owning Facility user", () => {
      const block = rulesContent.substring(
        rulesContent.indexOf("match /facilities/{facilityId}/reports/{reportId}/{fileName}"),
        rulesContent.indexOf(
          "match /facilities/{facilityId}/reports/{reportId}/archive/{archiveId}/{fileName}",
        ),
      );
      expect(block).toContain(
        "allow read: if isSignedIn() && (isAdmin() || isFacilityUser(facilityId));",
      );
    });

    it("prohibits direct client-side overwriting on CREATE by requiring resource == null", () => {
      const block = rulesContent.substring(
        rulesContent.indexOf("match /facilities/{facilityId}/reports/{reportId}/{fileName}"),
        rulesContent.indexOf(
          "match /facilities/{facilityId}/reports/{reportId}/archive/{archiveId}/{fileName}",
        ),
      );
      expect(block).toContain("resource == null");
    });

    it("strictly denies direct client-side UPDATE/overwrite (allow update: if false;)", () => {
      const block = rulesContent.substring(
        rulesContent.indexOf("match /facilities/{facilityId}/reports/{reportId}/{fileName}"),
        rulesContent.indexOf(
          "match /facilities/{facilityId}/reports/{reportId}/archive/{archiveId}/{fileName}",
        ),
      );
      expect(block).toMatch(/allow update:\s*if false;/);
    });

    it("strictly denies direct client-side DELETE for all client accounts (allow delete: if false;)", () => {
      const block = rulesContent.substring(
        rulesContent.indexOf("match /facilities/{facilityId}/reports/{reportId}/{fileName}"),
        rulesContent.indexOf(
          "match /facilities/{facilityId}/reports/{reportId}/archive/{archiveId}/{fileName}",
        ),
      );
      expect(block).toMatch(/allow delete:\s*if false;/);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Outsource Diagnostic Report Rules (/outsource/{facilityId}/reports/{reportId}/{fileName})
  // --------------------------------------------------------------------------
  describe("3. Outsource Report Storage Rules", () => {
    it("matches outsource report storage path", () => {
      expect(rulesContent).toContain("match /outsource/{facilityId}/reports/{reportId}/{fileName}");
    });

    it("permits READ for Owning Facility, Admin, or assigned Outsource provider", () => {
      const block = rulesContent.substring(
        rulesContent.indexOf("match /outsource/{facilityId}/reports/{reportId}/{fileName}"),
        rulesContent.indexOf(
          "match /outsource/{facilityId}/reports/{reportId}/archive/{archiveId}/{fileName}",
        ),
      );
      expect(block).toContain(
        "allow read: if isSignedIn() && (isAdmin() || isFacilityUser(facilityId) || isAssignedOutsourceProvider(reportId, facilityId));",
      );
    });

    it("restricts CREATE to assigned Outsource providers or Admins ONLY for new files (resource == null)", () => {
      const block = rulesContent.substring(
        rulesContent.indexOf("match /outsource/{facilityId}/reports/{reportId}/{fileName}"),
        rulesContent.indexOf(
          "match /outsource/{facilityId}/reports/{reportId}/archive/{archiveId}/{fileName}",
        ),
      );
      const createLine = block.substring(block.indexOf("allow create:"));
      expect(createLine).toContain("resource == null");
      expect(createLine).toContain(
        "(isAdmin() || isAssignedOutsourceProvider(reportId, facilityId))",
      );
      expect(createLine).not.toContain("isFacilityUser");
    });

    it("strictly denies direct client-side UPDATE on outsource reports (allow update: if false;)", () => {
      const block = rulesContent.substring(
        rulesContent.indexOf("match /outsource/{facilityId}/reports/{reportId}/{fileName}"),
        rulesContent.indexOf(
          "match /outsource/{facilityId}/reports/{reportId}/archive/{archiveId}/{fileName}",
        ),
      );
      expect(block).toMatch(/allow update:\s*if false;/);
    });

    it("strictly denies direct client-side DELETION of outsource reports for all client accounts", () => {
      const block = rulesContent.substring(
        rulesContent.indexOf("match /outsource/{facilityId}/reports/{reportId}/{fileName}"),
        rulesContent.indexOf(
          "match /outsource/{facilityId}/reports/{reportId}/archive/{archiveId}/{fileName}",
        ),
      );
      expect(block).toMatch(/allow delete:\s*if false;/);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Protected Report Archive Rules
  // --------------------------------------------------------------------------
  describe("4. Protected Report Version Archive Rules", () => {
    it("matches facility archive path and strictly denies direct client mutations", () => {
      expect(rulesContent).toContain(
        "match /facilities/{facilityId}/reports/{reportId}/archive/{archiveId}/{fileName}",
      );
      const facilityArchiveBlock = rulesContent.substring(
        rulesContent.indexOf(
          "match /facilities/{facilityId}/reports/{reportId}/archive/{archiveId}/{fileName}",
        ),
        rulesContent.indexOf("match /outsource/{facilityId}/reports/{reportId}/{fileName}"),
      );
      expect(facilityArchiveBlock).toContain("allow create, update, delete: if false;");
    });

    it("matches outsource archive path and strictly denies direct client mutations", () => {
      expect(rulesContent).toContain(
        "match /outsource/{facilityId}/reports/{reportId}/archive/{archiveId}/{fileName}",
      );
      const outsourceArchiveBlock = rulesContent.substring(
        rulesContent.indexOf(
          "match /outsource/{facilityId}/reports/{reportId}/archive/{archiveId}/{fileName}",
        ),
        rulesContent.indexOf("// -------------------------------------------------------------"),
      );
      expect(outsourceArchiveBlock).toContain("allow create, update, delete: if false;");
    });
  });

  // --------------------------------------------------------------------------
  // 5. File Validation Parameters
  // --------------------------------------------------------------------------
  describe("5. File Size & MIME Type Constraints", () => {
    it("enforces maximum 20MB file size boundary for diagnostic reports", () => {
      expect(rulesContent).toContain("request.resource.size <= 20 * 1024 * 1024");
    });

    it("restricts MIME types to PDF and standard images (PNG, JPEG, WebP)", () => {
      expect(rulesContent).toContain("request.resource.contentType.matches('application/pdf')");
      expect(rulesContent).toContain(
        "request.resource.contentType.matches('image/(png|jpeg|jpg|webp)')",
      );
    });
  });
});
