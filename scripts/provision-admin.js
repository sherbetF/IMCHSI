/**
 * Trusted Administrator Provisioning Script
 *
 * IMPORTANT: This script is intended to be executed ONLY in a secure, trusted
 * server/backend environment with GCP/Firebase service account credentials.
 * It must NEVER be bundled into the React frontend.
 *
 * PROVISIONING IS CREATE-ONLY.
 * It will ABORT if an account already exists for the specified admin email.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=service-account.json node scripts/provision-admin.js [admin-email]
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import { getSecurePasswordInput } from "./prompt-helper.js";

async function provisionAdministrator() {
  const email = process.argv[2] || "admin@auth.local";

  // Load service account or initialize with default application credentials
  let app;
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath && fs.existsSync(credPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(credPath, "utf-8"));
    app = initializeApp({ credential: cert(serviceAccount) });
  } else {
    app = initializeApp();
  }

  const auth = getAuth(app);
  const db = getFirestore(app);

  // 1. Check if Auth user already exists
  let existingUser = null;
  try {
    existingUser = await auth.getUserByEmail(email);
  } catch (err) {
    if (err.code !== "auth/user-not-found") {
      throw err;
    }
  }

  if (existingUser) {
    const userDocRef = db.collection("users").doc(existingUser.uid);
    const userDocSnap = await userDocRef.get();

    if (!userDocSnap.exists) {
      console.error(
        `[INCONSISTENCY DETECTED] Admin Auth account for ${email} exists (UID: ${existingUser.uid}), but trusted users/${existingUser.uid} profile is missing. Provisioning aborted. Manual administrative review required.`,
      );
      process.exit(1);
    }

    console.log(
      `\n[PROVISIONING ABORTED] Administrator account ${email} already exists (UID: ${existingUser.uid}).`,
    );
    console.log(
      `Provisioning is CREATE-ONLY and does NOT overwrite passwords or profiles of existing accounts.\n`,
    );
    process.exit(0);
  }

  // 2. Prompt for password ONLY when creating a NEW admin account
  console.log(`\nProvisioning NEW Administrator Account: ${email}`);
  const password = await getSecurePasswordInput("ADMIN_PASSWORD", "Admin Password");

  // 3. Create new Auth user
  let newUserRecord;
  try {
    newUserRecord = await auth.createUser({
      email,
      password,
      emailVerified: true,
    });
    console.log(`Created new Firebase Auth user for ${email} (UID: ${newUserRecord.uid})`);
  } catch (err) {
    console.error(`Failed to create Auth user for ${email}:`, err.message || err);
    process.exit(1);
  }

  // 4. Create trusted Firestore authorization profile
  let newlyCreatedAuthUid = newUserRecord.uid;
  try {
    const userDocRef = db.collection("users").doc(newlyCreatedAuthUid);
    await userDocRef.set({
      role: "admin",
      active: true,
      email: email,
      username: "admin",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(
      `Failed to create Firestore profile for admin ${email}. Initiating rollback of newly created Auth user...`,
      err,
    );
    try {
      await auth.deleteUser(newlyCreatedAuthUid);
      console.log(`[ROLLBACK SUCCESSFUL] Deleted newly created Auth user ${newlyCreatedAuthUid}.`);
    } catch (rollbackErr) {
      console.error(
        `[ROLLBACK FAILED] Could not delete Auth user ${newlyCreatedAuthUid}:`,
        rollbackErr,
      );
    }
    process.exit(1);
  }

  console.log(
    `\n✓ Successfully provisioned trusted admin authorization profile in users/${newlyCreatedAuthUid}`,
  );
  console.log(`- Email: ${email}`);
  console.log(`- UID: ${newlyCreatedAuthUid}`);
  console.log(`- Role: admin`);
  console.log(`- Active: true\n`);
}

provisionAdministrator().catch((err) => {
  console.error("Error provisioning administrator:", err.message || err);
  process.exit(1);
});
