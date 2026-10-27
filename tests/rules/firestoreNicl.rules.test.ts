import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// Structural checks complement, but do not replace, Firestore Emulator authorization tests.
const rules = fs.readFileSync(path.resolve(process.cwd(), "firestore.rules"), "utf8");
const section = (start: string, end: string) => {
  const a = rules.indexOf(`function ${start}(`);
  const b = rules.indexOf(`function ${end}(`, a + 1);
  expect(a).toBeGreaterThanOrEqual(0);
  expect(b).toBeGreaterThan(a);
  return rules.slice(a, b);
};

describe("NICL compact rules structural regression", () => {
  it("binds all five procedures to creation authorization", () => {
    const entries = [
      ["echo_appointments", "Transthoracic Echocardiogram (TTE)"],
      ["stress_test_appointments", "Exercise Stress Test (Treadmill)"],
      ["holter_appointments", "24 Hours Holter Monitoring"],
      ["blood_pressure_appointments", "24 Hours Ambulatory Blood Pressure Monitoring (ABPM)"],
      ["lung_function_appointments", "Lung Function Test / Spirometry"],
    ];
    for (const [collection, procedure] of entries) {
      expect(rules).toContain(`match /${collection}/{docId}`);
      expect(rules).toContain(`canCreateNiclRecord(request.resource.data, "${procedure}", docId)`);
    }
  });
  it("checks mandatory clinical fields and trusted server timestamp", () => {
    const common = section("niclCommonFields", "niclFacilityCreate");
    expect(common).toContain("d.keys().hasAll(niclRequiredKeys())");
    expect(common).toContain("d.submittedAt == request.time");
    expect(common).toContain("niclText(d.createdAt,64)");
    const required = section("niclRequiredKeys", "niclFacilityKeys");
    for (const field of ["submittedAt", "patientName", "mrn", "clinicalIndication", "diagnosis", "createdAt"]) expect(required).toContain(`'${field}'`);
  });
  it("limits facility creation to its identity and pending status", () => {
    const facility = section("niclFacilityCreate", "niclAdminCreate");
    expect(facility).toContain("d.keys().hasOnly(niclFacilityKeys())");
    expect(facility).toContain("d.status == 'Pending Confirmation'");
    expect(facility).toContain("d.facilityId == userFacilityId()");
    expect(facility).toContain("isTrustedFacilityMetadata(d)");
    const keys = section("niclFacilityKeys", "niclAdminKeys");
    for (const field of ["scheduledDate", "updatedAt", "rejectReason", "rejectedBy", "resultFile"]) expect(keys).not.toContain(`'${field}'`);
  });
  it("limits admin statuses and validates scheduled date", () => {
    const admin = section("niclAdminCreate", "canCreateNiclRecord");
    expect(admin).toContain("d.keys().hasOnly(niclAdminKeys())");
    expect(admin).toContain("d.status in ['Pending Confirmation','Scheduled','Confirmed']");
    expect(admin).toContain("niclText(d.scheduledDate,100)");
    expect(admin).toContain("isTrustedAdminFacilityMetadata(d)");
  });
  it("requires role authorization and shared clinical validation", () => {
    const create = section("canCreateNiclRecord", "canCreateRheumRecord");
    expect(create).toContain("(isFacilityUser() || isAdmin())");
    expect(create).toContain("niclCommonFields(d,procedure,docId)");
    expect(create).toContain("niclFacilityCreate(d)");
    expect(create).toContain("niclAdminCreate(d)");
  });
  it("preserves unrelated modules and scheduling helper", () => {
    for (const symbol of ["function canParamedicNurseUpdateRecord", "match /outsource_appointments/{docId}", "match /rheumatology_appointments/{docId}"]) expect(rules).toContain(symbol);
  });
});
