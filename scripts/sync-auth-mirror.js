/**
 * Trusted Backend Synchronization Script:
 * Synchronize Authorization Mirrors from Primary Named Firestore DB to (default) DB Mirror
 *
 * Mirrors all Firestore documents depended on by Firebase Storage Security Rules:
 * 1. users/{uid} -> copies only existing trusted fields:
 *    - role
 *    - active
 *    - facilityId
 *    - accountKey
 *    - outsourceProviderId
 *    - providerId
 *    - doctorId
 * 2. outsource_appointments/{reportId} -> copies only existing trusted fields:
 *    - facilityId
 *    - outsourceProviderId
 *    - providerId
 *    - status
 * 3. rheumatology_appointments/{referralId} -> copies only existing trusted fields:
 *    - facilityId
 *    - status
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=service-account.json node scripts/sync-auth-mirror.js
 * Or with emulators:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/sync-auth-mirror.js
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";

const TARGET_DATABASE_ID = "ai-studio-hospitalhubdesig-7f7a6729-a1d2-48e8-ba86-ae6c290d754c";

export function buildUserMirrorPayload(data) {
  const payload = {};
  if (!data || typeof data !== "object") return payload;

  if (
    Object.prototype.hasOwnProperty.call(data, "role") &&
    typeof data.role === "string" &&
    data.role.trim().length > 0
  ) {
    payload.role = data.role.trim();
  }
  if (Object.prototype.hasOwnProperty.call(data, "active") && typeof data.active === "boolean") {
    payload.active = data.active;
  }
  if (
    Object.prototype.hasOwnProperty.call(data, "facilityId") &&
    typeof data.facilityId === "string" &&
    data.facilityId.trim().length > 0
  ) {
    payload.facilityId = data.facilityId.trim();
  }
  if (
    Object.prototype.hasOwnProperty.call(data, "accountKey") &&
    typeof data.accountKey === "string" &&
    data.accountKey.trim().length > 0
  ) {
    payload.accountKey = data.accountKey.trim();
  }
  if (
    Object.prototype.hasOwnProperty.call(data, "outsourceProviderId") &&
    typeof data.outsourceProviderId === "string" &&
    data.outsourceProviderId.trim().length > 0
  ) {
    payload.outsourceProviderId = data.outsourceProviderId.trim();
  }
  if (
    Object.prototype.hasOwnProperty.call(data, "providerId") &&
    typeof data.providerId === "string" &&
    data.providerId.trim().length > 0
  ) {
    payload.providerId = data.providerId.trim();
  }
  if (
    Object.prototype.hasOwnProperty.call(data, "doctorId") &&
    typeof data.doctorId === "string" &&
    data.doctorId.trim().length > 0
  ) {
    payload.doctorId = data.doctorId.trim();
  }

  return payload;
}

export function buildOutsourceMirrorPayload(data) {
  const payload = {};
  if (!data || typeof data !== "object") return payload;

  if (
    Object.prototype.hasOwnProperty.call(data, "facilityId") &&
    typeof data.facilityId === "string" &&
    data.facilityId.trim().length > 0
  ) {
    payload.facilityId = data.facilityId.trim();
  }
  if (
    Object.prototype.hasOwnProperty.call(data, "outsourceProviderId") &&
    typeof data.outsourceProviderId === "string" &&
    data.outsourceProviderId.trim().length > 0
  ) {
    payload.outsourceProviderId = data.outsourceProviderId.trim();
  }
  if (
    Object.prototype.hasOwnProperty.call(data, "providerId") &&
    typeof data.providerId === "string" &&
    data.providerId.trim().length > 0
  ) {
    payload.providerId = data.providerId.trim();
  }
  if (
    Object.prototype.hasOwnProperty.call(data, "status") &&
    typeof data.status === "string" &&
    data.status.trim().length > 0
  ) {
    payload.status = data.status.trim();
  }

  return payload;
}

export function buildRheumatologyMirrorPayload(data) {
  const payload = {};
  if (!data || typeof data !== "object") return payload;

  if (
    Object.prototype.hasOwnProperty.call(data, "facilityId") &&
    typeof data.facilityId === "string" &&
    data.facilityId.trim().length > 0
  ) {
    payload.facilityId = data.facilityId.trim();
  }
  if (
    Object.prototype.hasOwnProperty.call(data, "status") &&
    typeof data.status === "string" &&
    data.status.trim().length > 0
  ) {
    payload.status = data.status.trim();
  }

  return payload;
}

async function main() {
  if (process.env.HOSPITALHUB_WRITE_FREEZE === "true") {
    throw new Error(
      "[WRITE FREEZE ACTIVE] scripts/sync-auth-mirror.js is blocked during database write freeze.",
    );
  }
  if (
    process.env.HOSPITALHUB_PRIMARY_DB === "(default)" ||
    process.env.HOSPITALHUB_DISABLE_MIRROR_WRITES === "true"
  ) {
    throw new Error(
      "[MIRROR RETIRED] Stripped authorization mirror sync is disabled to protect full documents in (default). Use managed Firestore export/import and scripts/verify-migration-parity.js.",
    );
  }

  console.log("==================================================================");
  console.log("HospitalHub Authorization Mirror Synchronization");
  console.log("==================================================================");
  console.log(`Source (Primary Named Database): ${TARGET_DATABASE_ID}`);
  console.log(`Target (Default Mirror DB):      (default)`);
  console.log("==================================================================\n");

  let app;
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath && fs.existsSync(credPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(credPath, "utf-8"));
    app = initializeApp({ credential: cert(serviceAccount) });
  } else if (getApps().length > 0) {
    app = getApps()[0];
  } else {
    app = initializeApp();
  }

  const namedDb = getFirestore(app, TARGET_DATABASE_ID);
  const defaultDb = getFirestore(app);

  const TARGET_PARAMEDIC_UID = "aIV1KRR5jUgFjShudWhktAGS2Wm2";

  // 1. Synchronize users collection
  console.log("1. Fetching all user profiles from primary named Firestore database...");
  const usersSnap = await namedDb.collection("users").get();
  console.log(`Found ${usersSnap.docs.length} user documents in primary database.\n`);

  let syncedCount = 0;
  let activeCount = 0;
  let inactiveCount = 0;
  const roleBreakdown = {};

  for (const docSnap of usersSnap.docs) {
    const uid = docSnap.id;
    const data = docSnap.data();

    const mirrorPayload = buildUserMirrorPayload(data);
    await defaultDb.collection("users").doc(uid).set(mirrorPayload, { merge: true });
    syncedCount++;

    const role = mirrorPayload.role || "unknown";
    roleBreakdown[role] = (roleBreakdown[role] || 0) + 1;
    if (mirrorPayload.active === true) activeCount++;
    else inactiveCount++;
  }

  // 2. Synchronize outsource_appointments collection
  console.log("2. Synchronizing outsource_appointments authorization mirror...");
  const outsourceSnap = await namedDb.collection("outsource_appointments").get();
  let outsourceSynced = 0;
  for (const docSnap of outsourceSnap.docs) {
    const mirrorPayload = buildOutsourceMirrorPayload(docSnap.data());
    await defaultDb.collection("outsource_appointments").doc(docSnap.id).set(mirrorPayload, {
      merge: true,
    });
    outsourceSynced++;
  }
  console.log(`Synced ${outsourceSynced} outsource_appointments documents.\n`);

  // 3. Synchronize rheumatology_appointments collection
  console.log("3. Synchronizing rheumatology_appointments authorization mirror...");
  const rheumSnap = await namedDb.collection("rheumatology_appointments").get();
  let rheumSynced = 0;
  for (const docSnap of rheumSnap.docs) {
    const mirrorPayload = buildRheumatologyMirrorPayload(docSnap.data());
    await defaultDb.collection("rheumatology_appointments").doc(docSnap.id).set(mirrorPayload, {
      merge: true,
    });
    rheumSynced++;
  }
  console.log(`Synced ${rheumSynced} rheumatology_appointments documents.\n`);

  // 4. Verify paramedic_nurse account (UID: aIV1KRR5jUgFjShudWhktAGS2Wm2) in (default)
  console.log(`4. Verifying paramedic_nurse mirror in (default): users/${TARGET_PARAMEDIC_UID}...`);
  const verifySnap = await defaultDb.collection("users").doc(TARGET_PARAMEDIC_UID).get();
  if (!verifySnap.exists) {
    throw new Error(
      `VERIFICATION FAILED: Document users/${TARGET_PARAMEDIC_UID} does not exist in (default) database after synchronization.`,
    );
  }
  const verifiedData = verifySnap.data() || {};
  if (verifiedData.active !== true || verifiedData.role !== "paramedic_nurse") {
    throw new Error(
      `VERIFICATION FAILED: Document users/${TARGET_PARAMEDIC_UID} in (default) has unexpected data: ${JSON.stringify(verifiedData)}`,
    );
  }

  console.log("==================================================================");
  console.log("Synchronization & Verification Completed Successfully");
  console.log("==================================================================");
  console.log(`Total User Profiles Synced:       ${syncedCount}`);
  console.log(`Active User Profiles:             ${activeCount}`);
  console.log(`Inactive User Profiles:           ${inactiveCount}`);
  console.log(`Outsource Appointments Synced:    ${outsourceSynced}`);
  console.log(`Rheumatology Referrals Synced:    ${rheumSynced}`);
  console.log("\nRole Breakdown in (default) Authorization Mirror:");
  for (const [r, count] of Object.entries(roleBreakdown)) {
    console.log(` - ${r}: ${count}`);
  }
  console.log(
    `\nVerified in (default) database -> /databases/(default)/documents/users/${TARGET_PARAMEDIC_UID}:`,
  );
  console.log(JSON.stringify({ id: verifySnap.id, ...verifiedData }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("Migration failed:", err.message || err);
    process.exit(1);
  });
}
