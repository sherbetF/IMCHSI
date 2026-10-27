
import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import {
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";

import {
  createRealRulesTestEnvironment,
  seedSyntheticUserProfiles,
  NAMED_DATABASE_ID,
} from "./testEnvironment";

import { SYNTHETIC_IDENTITIES } from "../fixtures/syntheticIdentities";

describe("Account Status Firestore Security", () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await createRealRulesTestEnvironment();
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

  it("denies direct account activation by an administrator", async () => {
    const db = testEnv
      .authenticatedContext(SYNTHETIC_IDENTITIES.ADMIN_ACTIVE.uid)
      .firestore({ databaseId: NAMED_DATABASE_ID } as any);

    await assertFails(
      db.collection("users")
        .doc(SYNTHETIC_IDENTITIES.FACILITY_A_INACTIVE.uid)
        .update({
          active: true,
          updatedAt: new Date().toISOString(),
        })
    );
  });

  it("denies direct account deactivation by an administrator", async () => {
    const db = testEnv
      .authenticatedContext(SYNTHETIC_IDENTITIES.ADMIN_ACTIVE.uid)
      .firestore({ databaseId: NAMED_DATABASE_ID } as any);

    await assertFails(
      db.collection("users")
        .doc(SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE.uid)
        .update({
          active: false,
          updatedAt: new Date().toISOString(),
        })
    );
  });

  it("denies a facility changing its own account status", async () => {
    const db = testEnv
      .authenticatedContext(SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE.uid)
      .firestore({ databaseId: NAMED_DATABASE_ID } as any);

    await assertFails(
      db.collection("users")
        .doc(SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE.uid)
        .update({ active: false })
    );
  });

  it("denies a paramedic changing account status", async () => {
    const db = testEnv
      .authenticatedContext(SYNTHETIC_IDENTITIES.PARAMEDIC_ACTIVE.uid)
      .firestore({ databaseId: NAMED_DATABASE_ID } as any);

    await assertFails(
      db.collection("users")
        .doc(SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE.uid)
        .update({ active: false })
    );
  });

  it("allows a facility to acknowledge first login", async () => {
    const db = testEnv
      .authenticatedContext(SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE.uid)
      .firestore({ databaseId: NAMED_DATABASE_ID } as any);

    await assertSucceeds(
      db.collection("users")
        .doc(SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE.uid)
        .update({
          firstLoginAcknowledgedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
    );
  });

  it("denies a facility changing its role", async () => {
    const db = testEnv
      .authenticatedContext(SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE.uid)
      .firestore({ databaseId: NAMED_DATABASE_ID } as any);

    await assertFails(
      db.collection("users")
        .doc(SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE.uid)
        .update({ role: "admin" })
    );
  });

  it("denies a facility changing its facilityId", async () => {
    const db = testEnv
      .authenticatedContext(SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE.uid)
      .firestore({ databaseId: NAMED_DATABASE_ID } as any);

    await assertFails(
      db.collection("users")
        .doc(SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE.uid)
        .update({ facilityId: "TEST_FACILITY_B" })
    );
  });
});
