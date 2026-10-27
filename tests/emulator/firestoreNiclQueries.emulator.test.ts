
import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import {
  RulesTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import {
  createRealRulesTestEnvironment,
  seedSyntheticUserProfiles,
  NAMED_DATABASE_ID,
} from "./testEnvironment";
import { SYNTHETIC_IDENTITIES } from "../fixtures/syntheticIdentities";

describe("Stage 10 - NICL Collection Query Security", () => {
  let testEnv: RulesTestEnvironment;

  const collections = [
    "echo_appointments",
    "stress_test_appointments",
    "holter_appointments",
    "blood_pressure_appointments",
    "lung_function_appointments",
  ];

  beforeAll(async () => {
    testEnv = await createRealRulesTestEnvironment();
  });

  afterAll(async () => {
    if (testEnv) await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seedSyntheticUserProfiles(testEnv);
  });

  function dbFor(identity: { uid: string } | null) {
    const context = identity
      ? testEnv.authenticatedContext(identity.uid)
      : testEnv.unauthenticatedContext();

    return context.firestore({ databaseId: NAMED_DATABASE_ID } as any);
  }

  async function seedAppointments(collectionName: string) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore({
        databaseId: NAMED_DATABASE_ID,
      } as any);

      await db.collection(collectionName).doc("synthetic_a").set({
        id: "synthetic_a",
        facilityId: "TEST_FACILITY_A",
        patientName: "Synthetic Patient A",
        mrn: "TEST-A-001",
        status: "Pending Confirmation",
      });

      await db.collection(collectionName).doc("synthetic_b").set({
        id: "synthetic_b",
        facilityId: "TEST_FACILITY_B",
        patientName: "Synthetic Patient B",
        mrn: "TEST-B-001",
        status: "Pending Confirmation",
      });
    });
  }

  for (const collectionName of collections) {
    it(`${collectionName}: Facility A can query its own appointments`, async () => {
      await seedAppointments(collectionName);

      const db = dbFor(SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE);

      await assertSucceeds(
        db.collection(collectionName)
          .where("facilityId", "==", "TEST_FACILITY_A")
          .get()
      );
    });

    it(`${collectionName}: Facility A cannot query Facility B`, async () => {
      await seedAppointments(collectionName);

      const db = dbFor(SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE);

      await assertFails(
        db.collection(collectionName)
          .where("facilityId", "==", "TEST_FACILITY_B")
          .get()
      );
    });

    it(`${collectionName}: Facility A cannot run unrestricted query`, async () => {
      await seedAppointments(collectionName);

      const db = dbFor(SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE);

      await assertFails(db.collection(collectionName).get());
    });

    it(`${collectionName}: Inactive facility cannot query appointments`, async () => {
      await seedAppointments(collectionName);

      const db = dbFor(SYNTHETIC_IDENTITIES.FACILITY_A_INACTIVE);

      await assertFails(
        db.collection(collectionName)
          .where("facilityId", "==", "TEST_FACILITY_A")
          .get()
      );
    });

    it(`${collectionName}: Unauthenticated user cannot query appointments`, async () => {
      await seedAppointments(collectionName);

      const db = dbFor(null);

      await assertFails(db.collection(collectionName).get());
    });

    it(`${collectionName}: Paramedic can query all appointments`, async () => {
      await seedAppointments(collectionName);

      const db = dbFor(SYNTHETIC_IDENTITIES.PARAMEDIC_ACTIVE);

      await assertSucceeds(db.collection(collectionName).get());
    });

    it(`${collectionName}: Admin can query all appointments`, async () => {
      await seedAppointments(collectionName);

      const db = dbFor(SYNTHETIC_IDENTITIES.ADMIN_ACTIVE);

      await assertSucceeds(db.collection(collectionName).get());
    });
  }
});
