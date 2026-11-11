import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Verification test for storage.maintenance.rules vs storage.production.rules
 * Ensures:
 * 1. Maintenance rules deny all direct client uploads, overwrites, and deletes (allow write: if false)
 * 2. Authorized read rules are preserved exactly and not broadened
 * 3. Identifies cross-service read dependencies on (default) database
 */
describe("Phase 2B — Storage Maintenance Rules Verification", () => {
  const prodRulesPath = path.resolve(__dirname, "../../storage.production.rules");
  const maintRulesPath = path.resolve(__dirname, "../../storage.maintenance.rules");

  const prodRules = fs.readFileSync(prodRulesPath, "utf-8");
  const maintRules = fs.readFileSync(maintRulesPath, "utf-8");

  it("loads both storage.production.rules and storage.maintenance.rules", () => {
    expect(prodRules).toBeTruthy();
    expect(maintRules).toBeTruthy();
    expect(maintRules).toContain("service firebase.storage");
  });

  it("strictly denies all client writes in storage.maintenance.rules", () => {
    // Check facility reports
    const facilityBlock = maintRules.substring(
      maintRules.indexOf("match /facilities/{facilityId}/reports/{reportId}/{fileName}"),
      maintRules.indexOf("match /facilities/{facilityId}/reports/{reportId}/archive/"),
    );
    expect(facilityBlock).toContain("allow write: if false;");
    expect(facilityBlock).not.toContain("allow create: if isSignedIn()");

    // Check outsource reports
    const outsourceBlock = maintRules.substring(
      maintRules.indexOf("match /outsource/{facilityId}/reports/{reportId}/{fileName}"),
      maintRules.indexOf("match /outsource/{facilityId}/reports/{reportId}/archive/"),
    );
    expect(outsourceBlock).toContain("allow write: if false;");
    expect(outsourceBlock).not.toContain("allow create: if isSignedIn()");

    // Check rheumatology attachments
    const rheumBlock = maintRules.substring(
      maintRules.indexOf("match /rheumatology/{facilityId}/{referralId}/{attachmentId}/{fileName}"),
    );
    expect(rheumBlock).toContain("allow write: if false;");
    expect(rheumBlock).not.toContain("allow create: if isSignedIn()");
    expect(rheumBlock).not.toContain("allow delete: if isSignedIn()");
  });

  it("preserves exact authorized read conditions and does not broaden them", () => {
    expect(maintRules).toContain(
      "allow read: if isSignedIn() && (isAdmin() || isParamedicNurse() || isFacilityUser(facilityId));",
    );
    expect(maintRules).toContain(
      "allow read: if isSignedIn() && (isAdmin() || isFacilityUser(facilityId) || isAssignedOutsourceProvider(reportId, facilityId));",
    );
    expect(maintRules).toContain(
      "allow read: if isSignedIn() && (\n        isRheumAdmin() ||\n        isRheumDoctor() ||\n        (isRheumFacilityUser(facilityId) &&\n         rheumReferralExists(referralId) &&\n         getRheumReferral(referralId).data.facilityId == facilityId)\n      );",
    );

    // Ensure no unauthenticated or wildcard reads are allowed
    expect(maintRules).not.toContain("allow read: if true;");
    expect(maintRules).not.toContain("allow read: if isSignedIn();");
  });

  it("identifies cross-service read dependencies on (default) database", () => {
    // Both production and maintenance rules depend on (default) for role lookups
    expect(maintRules).toContain("/databases/(default)/documents/users/");
    expect(maintRules).toContain("/databases/(default)/documents/outsource_appointments/");
    expect(maintRules).toContain("/databases/(default)/documents/rheumatology_appointments/");
  });
});
