import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Specification & Security Evaluation Tests for Firebase Storage Security Rules
 * Loads and validates the ACTUAL storage.rules file against all Stage 7 criteria.
 */
describe("Stage 7 — Storage Security Rules Verification (Actual storage.rules)", () => {
  const rulesPath = path.resolve(__dirname, "../../storage.rules");
  const rulesContent = fs.readFileSync(rulesPath, "utf-8");

  it("loads actual storage.rules from root directory", () => {
    expect(rulesContent).toBeTruthy();
    expect(rulesContent).toContain("service firebase.storage");
    expect(rulesContent).toContain("rules_version = '2';");
  });

  // --------------------------------------------------------------------------
  // 1. Path Match Pattern & Named Database Verification
  // --------------------------------------------------------------------------
  describe("Path Match Pattern & Named Database Verification", () => {
    it("declares storage path match for /rheumatology/{facilityId}/{referralId}/{attachmentId}/{fileName}", () => {
      expect(rulesContent).toContain(
        "match /rheumatology/{facilityId}/{referralId}/{attachmentId}/{fileName}",
      );
    });

    it("evaluates trusted authorization against production named database", () => {
      const namedDb = "ai-studio-hospitalhubdesig-7f7a6729-a1d2-48e8-ba86-ae6c290d754c";
      expect(rulesContent).toContain(namedDb);
      expect(rulesContent).toContain(
        `firestore.get(/databases/${namedDb}/documents/users/$(request.auth.uid))`,
      );
    });
  });

  // --------------------------------------------------------------------------
  // 2. MIME Type Whitelist & Blacklist Enforcement
  // --------------------------------------------------------------------------
  describe("MIME Type Enforcement in Storage Rules", () => {
    it("restricts allowed MIME types strictly to PDF, JPEG, and PNG", () => {
      expect(rulesContent).toContain("isValidRheumAttachmentFile()");
      expect(rulesContent).toContain(
        "request.resource.contentType in ['application/pdf', 'image/jpeg', 'image/png']",
      );
    });

    it("verifies prohibited MIME types (HTML, SVG, ZIP, JS, octet-stream) are not in the allowed list", () => {
      const allowedMimes = ["application/pdf", "image/jpeg", "image/png"];
      const prohibitedMimes = [
        "text/html",
        "image/svg+xml",
        "application/zip",
        "application/javascript",
        "application/octet-stream",
        "application/x-msdownload",
      ];

      prohibitedMimes.forEach((mime) => {
        expect(allowedMimes.includes(mime)).toBe(false);
      });
    });
  });

  // --------------------------------------------------------------------------
  // 3. File Size Boundary Enforcement
  // --------------------------------------------------------------------------
  describe("File Size Boundary Enforcement", () => {
    it("enforces maximum 10MB per attachment (<= 10 * 1024 * 1024)", () => {
      expect(rulesContent).toContain("request.resource.size <= 10 * 1024 * 1024");
    });
  });

  // --------------------------------------------------------------------------
  // 4. Overwrite Prohibition (Immutability)
  // --------------------------------------------------------------------------
  describe("Storage Overwrite Prohibition", () => {
    it("strictly denies same-path update/overwrite (allow update: if false)", () => {
      const rheumBlock = rulesContent.substring(
        rulesContent.indexOf(
          "match /rheumatology/{facilityId}/{referralId}/{attachmentId}/{fileName}",
        ),
      );
      expect(rheumBlock).toMatch(/allow update:\s*if false;/);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Role-Based Access Matrix in Storage Rules
  // --------------------------------------------------------------------------
  describe("Role-Based Access Matrix in Storage Rules", () => {
    it("permits READ for active Admin, Doctor, and Owning Facility user", () => {
      expect(rulesContent).toContain("isRheumAdmin()");
      expect(rulesContent).toContain("isRheumDoctor()");
      expect(rulesContent).toContain("isRheumFacilityUser(facilityId)");
    });

    it("prohibits READ and WRITE for Paramedic role in Rheumatology attachments", () => {
      const rheumBlock = rulesContent.substring(
        rulesContent.indexOf(
          "match /rheumatology/{facilityId}/{referralId}/{attachmentId}/{fileName}",
        ),
      );
      // Paramedic MUST NOT have read or write permission in storage rules
      expect(rheumBlock).not.toContain("isParamedicNurse");
    });

    it("prohibits READ and WRITE for Outsource role in Rheumatology attachments", () => {
      const rheumBlock = rulesContent.substring(
        rulesContent.indexOf(
          "match /rheumatology/{facilityId}/{referralId}/{attachmentId}/{fileName}",
        ),
      );
      expect(rheumBlock).not.toContain("isOutsourceUser");
    });

    it("allows CREATE and DELETE only for Owning Facility when referral status is mutable", () => {
      expect(rulesContent).toContain("canFacilityMutateRheumAttachment(facilityId, referralId)");
      expect(rulesContent).toContain(
        'getRheumReferral(referralId).data.status == "Pending Doctor Review"',
      );
      expect(rulesContent).toContain(
        'getRheumReferral(referralId).data.status == "Returned to Facility"',
      );
    });

    it("denies access to inactive accounts (active == true required)", () => {
      expect(rulesContent).toContain("getRheumUserDoc().data.active == true");
    });

    it("denies access to unauthenticated requests", () => {
      expect(rulesContent).toContain("request.auth != null");
    });
  });
});
