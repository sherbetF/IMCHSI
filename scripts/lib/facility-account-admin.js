/**
 * Trusted Facility Account Admin Library
 *
 * Provides core backend functions using Firebase Admin SDK for managing
 * facility authentication accounts and trusted Firestore authorization profiles.
 *
 * Backend-only. Never import into frontend code.
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import crypto from "crypto";
import { FACILITIES_DATA } from "../../src/data/facilities.ts";

const TARGET_DATABASE_ID =
  "ai-studio-hospitalhubdesig-7f7a6729-a1d2-48e8-ba86-ae6c290d754c";

let cachedApp = null;
let cachedAuth = null;
let cachedDb = null;

export function initializeAdminApp() {
  if (cachedApp && cachedAuth && cachedDb) {
    return { app: cachedApp, auth: cachedAuth, db: cachedDb };
  }

  const apps = getApps();
  if (apps.length > 0) {
    cachedApp = apps[0];
    cachedAuth = getAuth(cachedApp);
    cachedDb = getFirestore(cachedApp, TARGET_DATABASE_ID);
    return { app: cachedApp, auth: cachedAuth, db: cachedDb };
  }

  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath && fs.existsSync(credPath)) {
    try {
      const serviceAccount = JSON.parse(fs.readFileSync(credPath, "utf-8"));
      cachedApp = initializeApp({ credential: cert(serviceAccount) });
    } catch (err) {
      console.error(
        "Failed to parse GOOGLE_APPLICATION_CREDENTIALS service account file:",
        err.message,
      );
      throw new Error("Firebase Admin credentials are not configured or invalid.");
    }
  } else {
    // Attempt default application credentials (e.g. GCP environment or emulator)
    try {
      cachedApp = initializeApp();
    } catch (err) {
      throw new Error(
        "Firebase Admin credentials are not configured. Please set GOOGLE_APPLICATION_CREDENTIALS environment variable or configure application default credentials.",
      );
    }
  }

  cachedAuth = getAuth(cachedApp);
  cachedDb = getFirestore(cachedApp, TARGET_DATABASE_ID);
  return { app: cachedApp, auth: cachedAuth, db: cachedDb };
}

export function normalizeFacilityId(id) {
  if (!id) return "";
  return id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Returns all canonical facilities flattened from FACILITIES_DATA (84 facilities).
 */
export function getAllCanonicalFacilities() {
  const list = [];
  for (const group of FACILITIES_DATA) {
    for (const item of group.items) {
      list.push({
        facilityId: item.facilityId,
        facilityName: item.facilityName,
        category: group.category,
      });
    }
  }
  return list;
}

/**
 * Generates a cryptographically secure random password.
 */
export function generateSecurePassword(length = 16) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=";
  let password = "";
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    password += chars[bytes[i] % chars.length];
  }
  return password;
}

/**
 * Validates password strength (minimum 12 characters).
 */
export function validatePasswordStrength(password) {
  if (!password || typeof password !== "string" || password.length < 12) {
    throw new Error("Password must be at least 12 characters long.");
  }
}

/**
 * Checks the account status of a given facilityId.
 * Distinguishes states A, B, C, D, E.
 */
export async function getFacilityAccountStatus(facilityId) {
  const { auth, db } = initializeAdminApp();
  const email = `facility_${facilityId}@auth.local`;

  let authUser = null;
  let authExists = false;
  try {
    authUser = await auth.getUserByEmail(email);
    authExists = true;
  } catch (err) {
    if (err.code !== "auth/user-not-found") {
      throw err;
    }
  }

  let profileExists = false;
  let profileData = null;
  let userUid = authUser ? authUser.uid : null;

  if (authUser) {
    const userDocSnap = await db.collection("users").doc(authUser.uid).get();
    if (userDocSnap.exists) {
      profileExists = true;
      profileData = userDocSnap.data();
    }
  } else {
    // Check if any user document in users collection has this facilityId
    const usersQuery = await db.collection("users").where("facilityId", "==", facilityId).get();
    if (!usersQuery.empty) {
      profileExists = true;
      const doc = usersQuery.docs[0];
      userUid = doc.id;
      profileData = doc.data();
    }
  }

  // Determine state
  let state = "NOT_CREATED";
  let details = "Account does not exist.";

  if (!authExists && !profileExists) {
    state = "NOT_CREATED";
    details = "No Auth account and no trusted profile.";
  } else if (authExists && profileExists) {
    // Validate role and facilityId match
    if (profileData.role !== "facility") {
      state = "SECURITY_MISMATCH";
      details = `Security Mismatch: Role is "${profileData.role}", expected "facility".`;
    } else if (profileData.facilityId !== facilityId) {
      state = "SECURITY_MISMATCH";
      details = `Security Mismatch: Profile facilityId "${profileData.facilityId}" does not match target "${facilityId}".`;
    } else {
      state = profileData.active === false ? "EXISTS_INACTIVE" : "EXISTS_ACTIVE";

      details =
        profileData.active === false
          ? "Account exists and is inactive."
          : "Account exists and is active.";
    }
  } else if (authExists && !profileExists) {
    state = "PARTIAL_MISSING_PROFILE";
    details = `INCONSISTENCY: Auth account exists (${email}, UID: ${authUser.uid}) but trusted users/{uid} profile is missing. Manual review required.`;
  } else if (!authExists && profileExists) {
    state = "PARTIAL_MISSING_AUTH";
    details = `INCONSISTENCY: Trusted profile exists (UID: ${userUid}) but Firebase Auth account ${email} is missing. Manual review required.`;
  }

  return {
    facilityId,
    email,
    state,
    details,
    authExists,
    profileExists,
    uid: userUid,
    authMetadata: authUser ? authUser.metadata : null,
    profileData,
  };
}

/**
 * Provisions a new facility account (Create-Only with rollback).
 */
export async function provisionFacilityAccount(facilityId, facilityName, category, password) {
  validatePasswordStrength(password);
  const { auth, db } = initializeAdminApp();
  const email = `facility_${facilityId}@auth.local`;

  // 1. Verify does not already exist
  const status = await getFacilityAccountStatus(facilityId);
  if (status.state !== "NOT_CREATED") {
    throw new Error(
      `Cannot provision facility "${facilityId}": Account is in state "${status.state}". (${status.details})`,
    );
  }

  // 2. Create Firebase Auth user
  let newUserRecord;
  try {
    newUserRecord = await auth.createUser({
      email,
      password,
      emailVerified: true,
    });
  } catch (err) {
    throw new Error(`Failed to create Firebase Auth user: ${err.message || err}`);
  }

  const newlyCreatedAuthUid = newUserRecord.uid;

  // 3. Create Firestore profiles with rollback
  try {
    const userDocRef = db.collection("users").doc(newlyCreatedAuthUid);
    await userDocRef.set({
      role: "facility",
      facilityId: facilityId,
      facilityName: facilityName,
      category: category,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const facDocRef = db.collection("facilities").doc(facilityId);
    await facDocRef.set(
      {
        facilityId: facilityId,
        facilityName: facilityName,
        category: category,
        status: "Active",
        uid: newlyCreatedAuthUid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  } catch (err) {
    // Rollback Auth user
    try {
      await auth.deleteUser(newlyCreatedAuthUid);
    } catch (rollbackErr) {
      console.error(
        `[ROLLBACK FAILED] Could not delete Auth user ${newlyCreatedAuthUid}:`,
        rollbackErr,
      );
    }
    throw new Error(
      `Failed to create Firestore profile: ${err.message || err}. Newly created Auth account was rolled back.`,
    );
  }

  return {
    facilityId,
    facilityName,
    email,
    uid: newlyCreatedAuthUid,
    status: "ACTIVE",
  };
}

/**
 * Resets the password of an existing facility.
 */
export async function resetFacilityPassword(facilityId, newPassword) {
  validatePasswordStrength(newPassword);
  const { auth, db } = initializeAdminApp();
  const status = await getFacilityAccountStatus(facilityId);

  if (status.state !== "EXISTS_ACTIVE" && status.state !== "EXISTS_INACTIVE") {
    throw new Error(
      `Cannot reset password for facility "${facilityId}": Account status is "${status.state}". (${status.details})`,
    );
  }

  const uid = status.uid;
  const profile = status.profileData;

  if (profile.role !== "facility" || profile.facilityId !== facilityId) {
    throw new Error(
      `Security Mismatch: Account role or facilityId does not match expected target. Aborting.`,
    );
  }

  // Update password
  await auth.updateUser(uid, { password: newPassword });

  // Update profile timestamp
  const userDocRef = db.collection("users").doc(uid);
  await userDocRef.set(
    {
      updatedAt: new Date().toISOString(),
      passwordResetAt: new Date().toISOString(),
    },
    { merge: true },
  );

  return {
    facilityId,
    uid,
    email: status.email,
  };
}

/**
 * Sets active/inactive status for a facility account.
 */
export async function setFacilityActiveStatus(facilityId, active) {
  const { db } = initializeAdminApp();
  const status = await getFacilityAccountStatus(facilityId);

  if (status.state !== "EXISTS_ACTIVE" && status.state !== "EXISTS_INACTIVE") {
    throw new Error(
      `Cannot update active status for facility "${facilityId}": Account status is "${status.state}". (${status.details})`,
    );
  }

  const uid = status.uid;
  const profile = status.profileData;

  if (profile.role !== "facility" || profile.facilityId !== facilityId) {
    throw new Error(`Security Mismatch: Account role or facilityId does not match. Aborting.`);
  }

  const userDocRef = db.collection("users").doc(uid);
  await userDocRef.set(
    {
      active: active,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );

  const facDocRef = db.collection("facilities").doc(facilityId);
  await facDocRef.set(
    {
      status: active ? "Active" : "Inactive",
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );

  return {
    facilityId,
    uid,
    active,
  };
}

/**
 * Inspects safe account metadata for a facility.
 */
export async function inspectFacilityAccount(facilityId) {
  const status = await getFacilityAccountStatus(facilityId);
  return status;
}
