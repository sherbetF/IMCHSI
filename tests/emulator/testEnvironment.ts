import * as fs from "node:fs";
import * as path from "node:path";
import * as net from "node:net";
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import { SYNTHETIC_IDENTITIES } from "../fixtures/syntheticIdentities";

export const TEST_PROJECT_ID = "hospitalhub-security-test";
export const NAMED_DATABASE_ID = "ai-studio-hospitalhubdesig-7f7a6729-a1d2-48e8-ba86-ae6c290d754c";

// ----------------------------------------------------------------------------
// PRODUCTION SAFETY GUARD
// ----------------------------------------------------------------------------
export function verifyProductionSafetyGuard(projectId: string) {
  const isProductionProjectId = projectId === "outsource-f1e0f";
  const isEmulatorConfigured = Boolean(
    process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_STORAGE_EMULATOR_HOST,
  );

  if (isProductionProjectId && !isEmulatorConfigured) {
    throw new Error(
      "SAFETY VIOLATION: Refusing to run security tests against production Firebase project 'outsource-f1e0f' without emulator host environment variables.",
    );
  }
}

/**
 * Checks if a real Firestore emulator is actively responding
 */
export async function isFirestoreEmulatorLive(): Promise<boolean> {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  if (!host) {
    return false;
  }
  try {
    const res = await fetch(`http://${host}/emulator/v1/projects`);
    return res.status === 200 || res.status === 404;
  } catch {
    return false;
  }
}

/**
 * Creates the official RulesTestEnvironment using actual firestore.rules and storage.rules
 * Strictly initializes against the running emulators and fails if emulators are not reachable.
 */
export async function createRealRulesTestEnvironment(): Promise<RulesTestEnvironment> {
  verifyProductionSafetyGuard(TEST_PROJECT_ID);

  const firestoreRulesPath = path.resolve(__dirname, "../../firestore.rules");
  const storageRulesPath = path.resolve(__dirname, "../../storage.rules");

  const firestoreRules = fs.readFileSync(firestoreRulesPath, "utf-8");
  const storageRules = fs.readFileSync(storageRulesPath, "utf-8");

  const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST
    ? process.env.FIRESTORE_EMULATOR_HOST.split(":")[0] || "127.0.0.1"
    : "127.0.0.1";
  const firestorePort = process.env.FIRESTORE_EMULATOR_HOST
    ? parseInt(process.env.FIRESTORE_EMULATOR_HOST.split(":")[1] || "8080", 10)
    : 8080;

  const storageHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST
    ? process.env.FIREBASE_STORAGE_EMULATOR_HOST.split(":")[0] || "127.0.0.1"
    : "127.0.0.1";
  const storagePort = process.env.FIREBASE_STORAGE_EMULATOR_HOST
    ? parseInt(process.env.FIREBASE_STORAGE_EMULATOR_HOST.split(":")[1] || "9199", 10)
    : 9199;

  return await initializeTestEnvironment({
    projectId: TEST_PROJECT_ID,
    firestore: {
      rules: firestoreRules,
      host: firestoreHost,
      port: firestorePort,
    },
    storage: {
      rules: storageRules,
      host: storageHost,
      port: storagePort,
    },
  });
}

/**
 * Seeds synthetic user authorization profiles into the test environment with rules disabled
 */
export async function seedSyntheticUserProfiles(testEnv: RulesTestEnvironment) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const dbNamed = context.firestore({ databaseId: NAMED_DATABASE_ID } as any);
    const dbDefault = context.firestore();

    const profiles = [
      SYNTHETIC_IDENTITIES.ADMIN_ACTIVE,
      SYNTHETIC_IDENTITIES.ADMIN_INACTIVE,
      SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE,
      SYNTHETIC_IDENTITIES.FACILITY_A_INACTIVE,
      SYNTHETIC_IDENTITIES.FACILITY_B_ACTIVE,
      SYNTHETIC_IDENTITIES.DOCTOR_A_ACTIVE,
      SYNTHETIC_IDENTITIES.DOCTOR_A_INACTIVE,
      SYNTHETIC_IDENTITIES.PARAMEDIC_ACTIVE,
      SYNTHETIC_IDENTITIES.PARAMEDIC_INACTIVE,
      SYNTHETIC_IDENTITIES.OUTSOURCE_ACTIVE,
      SYNTHETIC_IDENTITIES.UNKNOWN_ROLE,
    ];

    for (const p of profiles) {
      if (!p) continue;
      const docData: Record<string, unknown> = {
        role: p.role,
        active: p.active,
      };
      if (p.facilityId) docData.facilityId = p.facilityId;
      if (p.facilityName) docData.facilityName = p.facilityName;
      if (p.category) docData.category = p.category;
      if (p.doctorId) docData.doctorId = p.doctorId;
      if (p.displayName) docData.displayName = p.displayName;
      if (p.accountKey) docData.accountKey = p.accountKey;

      await dbNamed.collection("users").doc(p.uid).set(docData);
      await dbDefault.collection("users").doc(p.uid).set(docData);
    }
  });
}
