import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { SYNTHETIC_IDENTITIES } from "../fixtures/syntheticIdentities";

/**
 * Specification & Security Evaluation Tests for Firestore Security Rules
 * Loads and validates the ACTUAL firestore.rules file against all Stage 7 criteria.
 */
describe("Stage 7 — Firestore Security Rules Verification (Actual firestore.rules)", () => {
  const rulesPath = path.resolve(__dirname, "../../firestore.rules");
  const rulesContent = fs.readFileSync(rulesPath, "utf-8");

  it("loads actual firestore.rules from root directory", () => {
    expect(rulesContent).toBeTruthy();
    expect(rulesContent).toContain("service cloud.firestore");
    expect(rulesContent).toContain("rules_version = '2';");
  });

  // --------------------------------------------------------------------------
  // 1. Core Structure & Subcollections
  // --------------------------------------------------------------------------
  describe("Subcollection Architecture & Catch-All", () => {
    it("contains default-deny catch-all rule", () => {
      expect(rulesContent).toMatch(
        /match\s*\/\{document=\*\*\}[^}]*allow read,\s*write:\s*if false;/,
      );
    });

    it("declares match block for /rheumatology_appointments/{docId}", () => {
      expect(rulesContent).toContain("match /rheumatology_appointments/{docId}");
    });

    it("declares attachments subcollection /attachments/{attachmentId}", () => {
      expect(rulesContent).toContain("match /attachments/{attachmentId}");
    });

    it("declares attachment_control subcollection with browser write & read forbidden (Stage 5C)", () => {
      expect(rulesContent).toContain("match /attachment_control/{controlId}");
      expect(rulesContent).toMatch(
        /match \/attachment_control\/\{controlId\}\s*\{\s*allow read,\s*write:\s*if false;\s*\}/,
      );
    });
  });

  // --------------------------------------------------------------------------
  // 2. Parent Referral Mutation & Deletion Rules
  // --------------------------------------------------------------------------
  describe("Parent Referral Authorization Invariants", () => {
    it("prohibits client deletion of parent rheumatology referrals (allow delete: if false)", () => {
      expect(rulesContent).toMatch(
        /match \/rheumatology_appointments\/\{docId\}[^}]*allow delete:\s*if false;/s,
      );
    });

    it("enforces canCreateRheumRecord constraints on referral creation", () => {
      expect(rulesContent).toContain("canCreateRheumRecord(request.resource.data)");
      expect(rulesContent).toContain('incoming.status == "Pending Doctor Review"');
      expect(rulesContent).toContain("incoming.facilityId == userFacilityId()");
    });

    it("enforces strict field allowlist on creation to prevent clinical injection", () => {
      const functionBody = rulesContent.substring(
        rulesContent.indexOf("function canCreateRheumRecord(incoming)"),
        rulesContent.indexOf("function isRheumFacilityUpdate"),
      );
      expect(functionBody).toContain("incoming.keys().hasOnly");
      expect(functionBody).toContain("'referringDoctor'");
      expect(functionBody).toContain("'clinicalIndication'");
      expect(functionBody).toContain("'diagnosis'");
      // Ensure protected doctor/paramedic review fields are NOT permitted in creation allowlist
      expect(functionBody).not.toContain("'reviewedByDoctorId'");
      expect(functionBody).not.toContain("'scheduledByUid'");
      expect(functionBody).not.toContain("'doctorAppointmentDate'");
    });
  });

  // --------------------------------------------------------------------------
  // 3. Role-Based Transition Functions
  // --------------------------------------------------------------------------
  describe("Role-Based Transition Functions in firestore.rules", () => {
    it("enforces isRheumFacilityUpdate: only allowed from 'Returned to Facility' to 'Pending Doctor Review'", () => {
      expect(rulesContent).toContain("isRheumFacilityUpdate(resource.data, request.resource.data)");
      expect(rulesContent).toContain('existing.status == "Returned to Facility"');
      expect(rulesContent).toContain('incoming.status == "Pending Doctor Review"');
      expect(rulesContent).toContain("existing.facilityId == userFacilityId()");
    });

    it("enforces isRheumDoctorUpdate: requires Doctor role, matching Doctor profile, and valid clinical status", () => {
      expect(rulesContent).toContain("isRheumDoctorUpdate(resource.data, request.resource.data)");
      expect(rulesContent).toContain("isDoctor()");
      expect(rulesContent).toContain("incoming.reviewedByUid == request.auth.uid");
      expect(rulesContent).toContain('existing.status == "Pending Doctor Review"');
      expect(rulesContent).toContain('incoming.status == "Awaiting Scheduling"');
      expect(rulesContent).toContain('incoming.status == "Returned to Facility"');
      expect(rulesContent).toContain('incoming.status == "Rejected"');
    });

    it("enforces isRheumParamedicUpdate: requires Paramedic role and Awaiting Scheduling -> Scheduled or Reschedule", () => {
      expect(rulesContent).toContain(
        "isRheumParamedicUpdate(resource.data, request.resource.data)",
      );
      expect(rulesContent).toContain("isParamedicNurse()");
      expect(rulesContent).toContain("incoming.scheduledByUid == request.auth.uid");
      expect(rulesContent).toContain(
        'existing.status == "Awaiting Scheduling" && incoming.status == "Scheduled"',
      );
      expect(rulesContent).toContain(
        'existing.status == "Scheduled" && incoming.status == "Scheduled"',
      );
    });
  });

  // --------------------------------------------------------------------------
  // 4. Attachment Metadata Security Rules
  // --------------------------------------------------------------------------
  describe("Clinical Attachment Metadata Security Rules", () => {
    it("restricts attachment metadata READ to Admin, Doctor, and Owning Facility only (Paramedic & Outsource denied)", () => {
      const attachmentsSection = rulesContent.substring(
        rulesContent.indexOf("match /rheumatology_appointments/{docId}"),
      );
      const attachmentBlock = attachmentsSection.substring(
        attachmentsSection.indexOf("match /attachments/{attachmentId}"),
        attachmentsSection.indexOf("match /attachment_control/{controlId}"),
      );

      const attachmentReadRule = attachmentBlock.substring(
        attachmentBlock.indexOf("allow read: if"),
        attachmentBlock.indexOf("allow create: if"),
      );

      expect(attachmentReadRule).toContain("isAdmin()");
      expect(attachmentReadRule).toContain("isDoctor()");
      expect(attachmentReadRule).toContain("isFacilityUser()");
      // Paramedic must NOT be granted attachment read in rules
      expect(attachmentReadRule).not.toContain("isParamedicNurse()");
      expect(attachmentReadRule).not.toContain("isOutsourceUser()");
    });

    it("verifies metadata CREATE requires owning facility, mutable parent status, and backend slot reservation", () => {
      expect(rulesContent).toContain(
        "exists(/databases/$(database)/documents/rheumatology_appointments/$(docId)/attachment_control/summary)",
      );
      expect(rulesContent).toContain("activeAttachmentIds.hasAny([attachmentId])");
      expect(rulesContent).toContain(
        "contentType in ['application/pdf', 'image/jpeg', 'image/png']",
      );
      expect(rulesContent).toContain("size <= 10 * 1024 * 1024");
      expect(rulesContent).toContain("uploadedAt == request.time");
    });

    it("strictly forbids metadata UPDATE (allow update: if false)", () => {
      const attachmentBlock = rulesContent.substring(
        rulesContent.indexOf("match /attachments/{attachmentId}"),
        rulesContent.indexOf("match /attachment_control/{controlId}"),
      );
      expect(attachmentBlock).toMatch(/allow update:\s*if false;/);
    });

    it("allows metadata DELETE only for Owning Facility on own uploads during mutable referral status", () => {
      expect(rulesContent).toContain("resource.data.uploadedByUid == request.auth.uid");
      expect(rulesContent).toContain(
        "get(/databases/$(database)/documents/rheumatology_appointments/$(docId)).data.facilityId == userFacilityId()",
      );
    });
  });

  // --------------------------------------------------------------------------
  // 5. Account Profiles (users/{uid}) Security Rules
  // --------------------------------------------------------------------------
  describe("User Authorization Profiles Security Rules", () => {
    it("prohibits public client creation of users/{uid} (backend-only provisioning)", () => {
      const userProfileMatch = rulesContent.substring(
        rulesContent.indexOf("match /users/{uid}"),
        rulesContent.indexOf("match /facilities/{facilityId}"),
      );
      expect(userProfileMatch).toMatch(/allow create:\s*if false;/);
      expect(userProfileMatch).toMatch(/allow delete:\s*if false;/);
    });

    it("allows user profile update only for active status by Admin or login timestamp acknowledgment", () => {
      expect(rulesContent).toContain(
        "affectedKeys().hasOnly(['active', 'updatedAt', 'disabledAt', 'reactivatedAt'])",
      );
      expect(rulesContent).toContain(
        "affectedKeys().hasOnly(['firstLoginAcknowledgedAt', 'firstLoginAt', 'updatedAt'])",
      );
    });
  });
});
