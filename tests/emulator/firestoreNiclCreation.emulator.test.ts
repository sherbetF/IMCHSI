import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import { RulesTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { serverTimestamp } from "firebase/firestore";
import {
  createRealRulesTestEnvironment,
  seedSyntheticUserProfiles,
  NAMED_DATABASE_ID,
} from "./testEnvironment";
import { SYNTHETIC_IDENTITIES } from "../fixtures/syntheticIdentities";

/**
 * HospitalHub Version 48 â€” Real Firebase Emulator NICL Creation Security Suite
 * Evaluates firestore.rules against:
 * 1. Strict trusted facility metadata validation:
 *    - Rejects forged facilityName
 *    - Rejects forged facilityCategory
 *    - Rejects forged metadata when user profile lacks metadata fields
 *    - Accepts valid metadata from canonical facility registry
 *    - Rejects mismatched facilityId
 * 2. Administrator creation validation & workflows
 * 3. Server-verified creation timestamp integrity
 * 4. All 5 NICL appointment collections
 */
describe("HospitalHub Version 48 â€” NICL Creation Security Verification Suite", () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await createRealRulesTestEnvironment();
    await seedSyntheticUserProfiles(testEnv);
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seedSyntheticUserProfiles(testEnv);
  });

  const NICL_COLLECTIONS = [
    { name: "echo_appointments", procedure: "Transthoracic Echocardiogram (TTE)", prefix: "ECHO" },
    {
      name: "stress_test_appointments",
      procedure: "Exercise Stress Test (Treadmill)",
      prefix: "EST",
    },
    { name: "holter_appointments", procedure: "24 Hours Holter Monitoring", prefix: "HOLTER" },
    {
      name: "blood_pressure_appointments",
      procedure: "24 Hours Ambulatory Blood Pressure Monitoring (ABPM)",
      prefix: "ABPM",
    },
    {
      name: "lung_function_appointments",
      procedure: "Lung Function Test / Spirometry",
      prefix: "LFT",
    },
  ];

  function getValidAppointmentPayload(id: string, facilityId: string, procedureType: string) {
    return {
      id,
      facilityId,
      facilityName: "Test Klinik Kesihatan A",
      facilityCategory: "Klinik Kesihatan",
      patientName: "Ahmad Bin Abdullah",
      mrn: "MRN-123456",
      contactNumber: "012-3456789",
      email: "ahmad@example.com",
      procedureType,
      urgency: "Routine" as const,
      referringDoctor: "Dr. Siti Aminah",
      clinicalIndication: "Exertional dyspnea and atypical chest discomfort for 3 weeks",
      diagnosis: "Suspected Coronary Artery Disease",
      status: "Pending Confirmation",
      createdAt: "2026-10-08 10:30:00",
      submittedAt: serverTimestamp(),
    };
  }

  // --------------------------------------------------------------------------
  // 1. Allowed Scenarios Across All 5 Collections
  // --------------------------------------------------------------------------
  NICL_COLLECTIONS.forEach(({ name, procedure, prefix }) => {
    it(`[ALLOWED] Facility A creates valid ${name} for its own facility with serverTimestamp`, async () => {
      const facAContext = testEnv.authenticatedContext(SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE.uid);
      const facADb = facAContext.firestore({ databaseId: NAMED_DATABASE_ID } as any);

      const docId = `${prefix}-2026-0001`;
      const payload = getValidAppointmentPayload(docId, "TEST_FACILITY_A", procedure);

      await assertSucceeds(facADb.collection(name).doc(docId).set(payload));
    });

    it(`[ALLOWED] Facility A creates ${name} with valid optional fields (department, duplicateJustification)`, async () => {
      const facAContext = testEnv.authenticatedContext(SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE.uid);
      const facADb = facAContext.firestore({ databaseId: NAMED_DATABASE_ID } as any);

      const docId = `${prefix}-2026-0002`;
      const payload = {
        ...getValidAppointmentPayload(docId, "TEST_FACILITY_A", procedure),
        department: "Outpatient Medical Department",
        duplicateJustification: "Clinical reassessment after therapy failure within 6 months",
      };

      await assertSucceeds(facADb.collection(name).doc(docId).set(payload));
    });

    it(`[ALLOWED] Accept valid metadata from canonical facilities/{facilityId} registry in ${name}`, async () => {
      // Seed canonical registry record
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore({ databaseId: NAMED_DATABASE_ID } as any);
        await db.collection("facilities").doc("TEST_FACILITY_A").set({
          facilityId: "TEST_FACILITY_A",
          facilityName: "Canonical Klinik A",
          category: "Klinik Kesihatan",
          status: "Active",
        });
      });

      const facAContext = testEnv.authenticatedContext(SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE.uid);
      const facADb = facAContext.firestore({ databaseId: NAMED_DATABASE_ID } as any);

      const docId = `${prefix}-2026-CANONICAL-TEST`;
      const payload = {
        ...getValidAppointmentPayload(docId, "TEST_FACILITY_A", procedure),
        facilityName: "Canonical Klinik A",
        facilityCategory: "Klinik Kesihatan",
      };

      await assertSucceeds(facADb.collection(name).doc(docId).set(payload));
    });

    it(`[ALLOWED] Administrator creates appointment in ${name} for any facility with Pending Confirmation`, async () => {
      const adminContext = testEnv.authenticatedContext(SYNTHETIC_IDENTITIES.ADMIN_ACTIVE.uid);
      const adminDb = adminContext.firestore({ databaseId: NAMED_DATABASE_ID } as any);

      const docId = `${prefix}-2026-ADMIN-0001`;
      const payload = getValidAppointmentPayload(docId, "TEST_FACILITY_B", procedure);

      await assertSucceeds(adminDb.collection(name).doc(docId).set(payload));
    });

    it(`[ALLOWED] Administrator creates appointment in ${name} directly with Scheduled status and scheduledDate`, async () => {
      const adminContext = testEnv.authenticatedContext(SYNTHETIC_IDENTITIES.ADMIN_ACTIVE.uid);
      const adminDb = adminContext.firestore({ databaseId: NAMED_DATABASE_ID } as any);

      const docId = `${prefix}-2026-ADMIN-SCHED`;
      const payload = {
        ...getValidAppointmentPayload(docId, "TEST_FACILITY_A", procedure),
        status: "Scheduled",
        scheduledDate: "15/10/2026 @ 09:30 AM",
      };

      await assertSucceeds(adminDb.collection(name).doc(docId).set(payload));
    });
  });

  // --------------------------------------------------------------------------
  // 2. Strict Facility Metadata Validation Tests (Version 48)
  // --------------------------------------------------------------------------
  NICL_COLLECTIONS.forEach(({ name, procedure, prefix }) => {
    it(`[DENIED] Facility A attempts to forge facilityName in ${name}`, async () => {
      const facAContext = testEnv.authenticatedContext(SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE.uid);
      const facADb = facAContext.firestore({ databaseId: NAMED_DATABASE_ID } as any);

      const docId = `${prefix}-2026-FORGED-NAME`;
      const payload = {
        ...getValidAppointmentPayload(docId, "TEST_FACILITY_A", procedure),
        facilityName: "Hospital Sultan Ismail Cardiothoracic Unit", // Forged
      };

      await assertFails(facADb.collection(name).doc(docId).set(payload));
    });

    it(`[DENIED] Facility A attempts to forge facilityCategory in ${name}`, async () => {
      const facAContext = testEnv.authenticatedContext(SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE.uid);
      const facADb = facAContext.firestore({ databaseId: NAMED_DATABASE_ID } as any);

      const docId = `${prefix}-2026-FORGED-CAT`;
      const payload = {
        ...getValidAppointmentPayload(docId, "TEST_FACILITY_A", procedure),
        facilityCategory: "Hospital", // Forged from Klinik Kesihatan
      };

      await assertFails(facADb.collection(name).doc(docId).set(payload));
    });

    it(`[DENIED] Reject forged metadata when user profile lacks metadata fields in ${name}`, async () => {
      // Seed bare user profile lacking facilityName and category
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore({ databaseId: NAMED_DATABASE_ID } as any);
        await db.collection("users").doc("user_bare_profile").set({
          role: "facility",
          facilityId: "FACILITY_BARE",
          active: true,
          // facilityName & category missing!
        });
      });

      const bareContext = testEnv.authenticatedContext("user_bare_profile");
      const bareDb = bareContext.firestore({ databaseId: NAMED_DATABASE_ID } as any);

      const docId = `${prefix}-2026-BARE-PROFILE`;
      const payload = {
        ...getValidAppointmentPayload(docId, "FACILITY_BARE", procedure),
        facilityName: "Any Arbitrary Name",
        facilityCategory: "Klinik Desa",
      };

      // Must NOT silently permit arbitrary values! Must fail!
      await assertFails(bareDb.collection(name).doc(docId).set(payload));
    });

    it(`[DENIED] Facility A CANNOT spoof/create appointment for Facility B in ${name} (mismatched facilityId)`, async () => {
      const facAContext = testEnv.authenticatedContext(SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE.uid);
      const facADb = facAContext.firestore({ databaseId: NAMED_DATABASE_ID } as any);

      const docId = `${prefix}-2026-MISMATCH-FAC`;
      const payload = getValidAppointmentPayload(docId, "TEST_FACILITY_B", procedure);

      await assertFails(facADb.collection(name).doc(docId).set(payload));
    });
  });

  // --------------------------------------------------------------------------
  // 3. Creation Timestamp & Administrator Validation Tests
  // --------------------------------------------------------------------------
  NICL_COLLECTIONS.forEach(({ name, procedure, prefix }) => {
    it(`[DENIED] Creation in ${name} with forged client timestamp instead of serverTimestamp`, async () => {
      const facAContext = testEnv.authenticatedContext(SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE.uid);
      const facADb = facAContext.firestore({ databaseId: NAMED_DATABASE_ID } as any);

      const docId = `${prefix}-2026-FORGED-TS`;
      const payload = {
        ...getValidAppointmentPayload(docId, "TEST_FACILITY_A", procedure),
        submittedAt: "2020-01-01T00:00:00.000Z", // Forged client date
      };

      await assertFails(facADb.collection(name).doc(docId).set(payload));
    });

    it(`[DENIED] Administrator creates appointment in ${name} with unauthorized status "Rejected"`, async () => {
      const adminContext = testEnv.authenticatedContext(SYNTHETIC_IDENTITIES.ADMIN_ACTIVE.uid);
      const adminDb = adminContext.firestore({ databaseId: NAMED_DATABASE_ID } as any);

      const docId = `${prefix}-2026-ADMIN-BAD-STATUS`;
      const payload = {
        ...getValidAppointmentPayload(docId, "TEST_FACILITY_A", procedure),
        status: "Rejected",
      };

      await assertFails(adminDb.collection(name).doc(docId).set(payload));
    });

    it(`[DENIED] Administrator creates appointment in ${name} with malformed scheduledDate`, async () => {
      const adminContext = testEnv.authenticatedContext(SYNTHETIC_IDENTITIES.ADMIN_ACTIVE.uid);
      const adminDb = adminContext.firestore({ databaseId: NAMED_DATABASE_ID } as any);
      const docId = `${prefix}-2026-ADMIN-INVALID-DATE`;
      const payload = {
        ...getValidAppointmentPayload(docId, "TEST_FACILITY_A", procedure),
        status: "Scheduled",
        scheduledDate: "invalid-date",
      };
      
      await assertFails(adminDb.collection(name).doc(docId).set(payload));
    });

    it(`[DENIED] Administrator creates appointment in ${name} with status "Scheduled" but missing scheduledDate`, async () => {
      const adminContext = testEnv.authenticatedContext(SYNTHETIC_IDENTITIES.ADMIN_ACTIVE.uid);
      const adminDb = adminContext.firestore({ databaseId: NAMED_DATABASE_ID } as any);

      const docId = `${prefix}-2026-ADMIN-NO-DATE`;
      const payload = {
        ...getValidAppointmentPayload(docId, "TEST_FACILITY_A", procedure),
        status: "Scheduled",
      };

      await assertFails(adminDb.collection(name).doc(docId).set(payload));
    });
  });
});
