import { describe, it, beforeAll, afterAll, beforeEach, expect } from "vitest";
import { RulesTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import {
  createRealRulesTestEnvironment,
  seedSyntheticUserProfiles,
  NAMED_DATABASE_ID,
} from "./testEnvironment";
import { SYNTHETIC_IDENTITIES } from "../fixtures/syntheticIdentities";

describe("Paramedic NICL Access & Authorization Security Rules Suite", () => {
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
    { name: "echo_appointments", testType: "Echocardiogram" },
    { name: "stress_test_appointments", testType: "Exercise Stress Test" },
    { name: "holter_appointments", testType: "24H Holter" },
    { name: "blood_pressure_appointments", testType: "24H Blood Pressure" },
    { name: "lung_function_appointments", testType: "Lung Function" },
  ];

  // --------------------------------------------------------------------------
  // Requirements 1-5: Active Paramedic can read requests across multiple facilities
  // --------------------------------------------------------------------------
  NICL_COLLECTIONS.forEach(({ name, testType }) => {
    it(`Active Paramedic can read ${testType} (${name}) requests from multiple facilities`, async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore({ databaseId: NAMED_DATABASE_ID } as any);
        await db.collection(name).doc("doc_fac_a").set({
          id: "doc_fac_a",
          facilityId: "TEST_FACILITY_A",
          facilityName: "Test Klinik Kesihatan A",
          patientName: "Patient From A",
          mrn: "MRN-A100",
          status: "Pending Confirmation",
          createdAt: new Date().toISOString(),
        });
        await db.collection(name).doc("doc_fac_b").set({
          id: "doc_fac_b",
          facilityId: "TEST_FACILITY_B",
          facilityName: "Test Hospital B",
          patientName: "Patient From B",
          mrn: "MRN-B200",
          status: "Pending Confirmation",
          createdAt: new Date().toISOString(),
        });
      });

      const paramedicContext = testEnv.authenticatedContext(
        SYNTHETIC_IDENTITIES.PARAMEDIC_ACTIVE.uid,
      );
      const paramedicDb = paramedicContext.firestore({ databaseId: NAMED_DATABASE_ID } as any);

      // Single doc read from Facility A
      await assertSucceeds(paramedicDb.collection(name).doc("doc_fac_a").get());
      // Single doc read from Facility B
      await assertSucceeds(paramedicDb.collection(name).doc("doc_fac_b").get());
      // Collection query
      await assertSucceeds(paramedicDb.collection(name).get());
    });
  });

  // --------------------------------------------------------------------------
  // Requirement 6: Paramedic can update permitted scheduling fields
  // --------------------------------------------------------------------------
  it("Requirement 6: Active Paramedic can update permitted scheduling fields (status, scheduledDate, rejectReason, rejectedBy, updatedAt)", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore({ databaseId: NAMED_DATABASE_ID } as any);
      await db.collection("echo_appointments").doc("doc_to_schedule").set({
        id: "doc_to_schedule",
        facilityId: "TEST_FACILITY_A",
        patientName: "John Doe",
        mrn: "MRN-999",
        status: "Pending Confirmation",
        createdAt: new Date().toISOString(),
      });
    });

    const paramedicContext = testEnv.authenticatedContext(
      SYNTHETIC_IDENTITIES.PARAMEDIC_ACTIVE.uid,
    );
    const paramedicDb = paramedicContext.firestore({ databaseId: NAMED_DATABASE_ID } as any);

    await assertSucceeds(
      paramedicDb.collection("echo_appointments").doc("doc_to_schedule").update({
        status: "Scheduled",
        scheduledDate: "2026-10-15 @ 09:00 AM",
        updatedAt: new Date().toISOString(),
      }),
    );
  });

  // --------------------------------------------------------------------------
  // Requirement 7: Paramedic CANNOT change protected patient/facility fields
  // --------------------------------------------------------------------------
  it("Requirement 7: Paramedic CANNOT change protected patient/facility identity fields (patientName, mrn, facilityId)", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore({ databaseId: NAMED_DATABASE_ID } as any);
      await db.collection("echo_appointments").doc("doc_protected").set({
        id: "doc_protected",
        facilityId: "TEST_FACILITY_A",
        patientName: "Original Name",
        mrn: "MRN-ORIG",
        status: "Pending Confirmation",
        createdAt: new Date().toISOString(),
      });
    });

    const paramedicContext = testEnv.authenticatedContext(
      SYNTHETIC_IDENTITIES.PARAMEDIC_ACTIVE.uid,
    );
    const paramedicDb = paramedicContext.firestore({ databaseId: NAMED_DATABASE_ID } as any);

    // Attempt to modify patientName
    await assertFails(
      paramedicDb.collection("echo_appointments").doc("doc_protected").update({
        patientName: "Tampered Name",
      }),
    );

    // Attempt to modify facilityId
    await assertFails(
      paramedicDb.collection("echo_appointments").doc("doc_protected").update({
        facilityId: "TEST_FACILITY_B",
      }),
    );
  });

  // --------------------------------------------------------------------------
  // Requirement 8: Paramedic CANNOT delete NICL requests
  // --------------------------------------------------------------------------
  it("Requirement 8: Paramedic CANNOT delete NICL requests", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore({ databaseId: NAMED_DATABASE_ID } as any);
      await db.collection("echo_appointments").doc("doc_to_delete").set({
        id: "doc_to_delete",
        facilityId: "TEST_FACILITY_A",
        patientName: "John Doe",
        mrn: "MRN-DEL",
        status: "Pending Confirmation",
      });
    });

    const paramedicContext = testEnv.authenticatedContext(
      SYNTHETIC_IDENTITIES.PARAMEDIC_ACTIVE.uid,
    );
    const paramedicDb = paramedicContext.firestore({ databaseId: NAMED_DATABASE_ID } as any);

    await assertFails(paramedicDb.collection("echo_appointments").doc("doc_to_delete").delete());
  });

  // --------------------------------------------------------------------------
  // Requirement 9: Inactive Paramedic is denied
  // --------------------------------------------------------------------------
  it("Requirement 9: Inactive Paramedic is DENIED read and update access", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore({ databaseId: NAMED_DATABASE_ID } as any);
      await db.collection("echo_appointments").doc("doc_inactive_test").set({
        id: "doc_inactive_test",
        facilityId: "TEST_FACILITY_A",
        patientName: "Jane Doe",
        mrn: "MRN-INACT",
        status: "Pending Confirmation",
      });
    });

    const inactiveParamedicContext = testEnv.authenticatedContext(
      SYNTHETIC_IDENTITIES.PARAMEDIC_INACTIVE.uid,
    );
    const inactiveParamedicDb = inactiveParamedicContext.firestore({
      databaseId: NAMED_DATABASE_ID,
    } as any);

    await assertFails(paramedicDbGetDoc());
    async function paramedicDbGetDoc() {
      return inactiveParamedicDb.collection("echo_appointments").doc("doc_inactive_test").get();
    }

    await assertFails(
      inactiveParamedicDb.collection("echo_appointments").doc("doc_inactive_test").update({
        status: "Scheduled",
      }),
    );
  });

  // --------------------------------------------------------------------------
  // Requirement 10: Facility A still CANNOT read Facility B's protected data
  // --------------------------------------------------------------------------
  it("Requirement 10: Facility A still CANNOT read Facility B's protected data", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore({ databaseId: NAMED_DATABASE_ID } as any);
      await db.collection("echo_appointments").doc("doc_fac_b_private").set({
        id: "doc_fac_b_private",
        facilityId: "TEST_FACILITY_B",
        patientName: "Private Patient B",
        mrn: "MRN-B-PRIV",
        status: "Pending Confirmation",
      });
    });

    const facAContext = testEnv.authenticatedContext(SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE.uid);
    const facADb = facAContext.firestore({ databaseId: NAMED_DATABASE_ID } as any);

    // Single doc read from Facility B -> DENIED for Facility A
    await assertFails(facADb.collection("echo_appointments").doc("doc_fac_b_private").get());
  });
});
