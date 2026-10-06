/**
 * READ-ONLY Diagnostic Script: Facility Account Investigation
 *
 * This script diagnoses why password reset operations fail with NOT_FOUND.
 * It is strictly READ-ONLY.
 *
 * Usage:
 *   node scripts/diagnose-facility-account.js <facilityId>
 */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { 
  getAllCanonicalFacilities
} from "./lib/facility-account-admin.js";

const TARGET_PROJECT_ID = "outsource-f1e0f";
const TARGET_DATABASE_ID = "ai-studio-hospitalhubdesig-7f7a6729-a1d2-48e8-ba86-ae6c290d754c";

function getExpectedFacilityAuthEmail(facilityId) {
  return `facility_${facilityId}@auth.local`;
}

async function diagnose() {
  const facilityId = process.argv[2];
  if (!facilityId) {
    console.error("Usage: node scripts/diagnose-facility-account.js <facilityId>");
    process.exit(1);
  }

  console.log(`==================================================`);
  console.log(`   DIAGNOSTIC: FACILITY ACCOUNT ("${facilityId}")`);
  console.log(`==================================================`);

  // Initialize Admin SDK with explicit project ID
  let app, auth, db;
  try {
    app = initializeApp({
      credential: applicationDefault(),
      projectId: TARGET_PROJECT_ID,
    });
    auth = getAuth(app);
    // Explicitly target named database
    db = getFirestore(app, TARGET_DATABASE_ID);
  } catch (err) {
    console.error("Operation: Initialization");
    console.error("Error Code: INITIALIZATION_FAILED");
    console.error("Safe Message:", err.message);
    process.exit(1);
  }

  // 1. Project Validation
  const projectId = app.options.projectId;
  console.log(`Firebase Admin Project ID: ${projectId}`);
  if (projectId !== TARGET_PROJECT_ID) {
    console.error("Operation: Project Validation");
    console.error(`Error Code: PROJECT_MISMATCH (Expected ${TARGET_PROJECT_ID}, got ${projectId})`);
    process.exit(1);
  }


  // 2. Canonical Registry Validation
  console.log(`Querying Firestore Database: ${db.databaseId}`);
  const canonicalFacilities = getAllCanonicalFacilities();
  const found = canonicalFacilities.find((f) => f.facilityId === facilityId);
  console.log(`Canonical facility found: ${found ? "YES" : "NO"}`);
  if (found) {
    console.log(`  - facilityId: ${found.facilityId}`);
    console.log(`  - facilityName: ${found.facilityName}`);
    console.log(`  - category: ${found.category}`);
  }

  // 3. Find Trusted Profile
  console.log(`\nSearching for trusted profile in users/{uid}...`);
  let matchingProfiles = [];
  try {
    const snapshot = await db
      .collection("users")
      .where("role", "==", "facility")
      .where("facilityId", "==", facilityId)
      .get();
    
    snapshot.forEach((doc) => {
      matchingProfiles.push({ uid: doc.id, ...doc.data() });
    });
    
    console.log(`Matching profile count: ${matchingProfiles.length}`);
    matchingProfiles.forEach((p) => {
      console.log(`  - UID: ${p.uid}`);
      console.log(`    role: ${p.role}`);
      console.log(`    facilityId: ${p.facilityId}`);
      console.log(`    facilityName: ${p.facilityName}`);
      console.log(`    active: ${p.active}`);
    });
  } catch (err) {
    console.error("Operation: Firestore Read (users/{uid})");
    console.error("Error Code:", err.code || "UNKNOWN");
    console.error("Safe Message:", err.message);
  }

  // 4. Auth Checks
  const expectedEmail = getExpectedFacilityAuthEmail(facilityId);
  console.log(`\nExpected auth email: ${expectedEmail}`);

  let authUid = null;
  for (const profile of matchingProfiles) {
    console.log(`\n--- Inspecting Trusted Profile UID: ${profile.uid} ---`);
    try {
      const user = await auth.getUser(profile.uid);
      authUid = user.uid;
      console.log(`AUTH_USER_FOUND`);
      console.log(`  - uid: ${user.uid}`);
      console.log(`  - email: ${user.email}`);
      console.log(`  - disabled: ${user.disabled}`);
    } catch (err) {
      console.error("Operation: Auth getUser(uid)");
      console.error("Error Code:", err.code || "UNKNOWN");
      console.error("Safe Message:", err.message);
    }
  }

  // 5. Email Auth Check
  let authEmailUid = null;
  try {
    const userByEmail = await auth.getUserByEmail(expectedEmail);
    authEmailUid = userByEmail.uid;
    console.log(`\nAUTH_EMAIL_FOUND`);
    console.log(`  - uid: ${userByEmail.uid}`);
    console.log(`  - email: ${userByEmail.email}`);
    console.log(`  - disabled: ${userByEmail.disabled}`);
  } catch (err) {
    console.error("Operation: Auth getUserByEmail(email)");
    console.error("Error Code:", err.code || "UNKNOWN");
    console.error("Safe Message:", err.message);
  }

  // 6. Relationship Comparison
  console.log(`\n==================================================`);
  console.log(`   RELATIONSHIP DIAGNOSTIC`);
  console.log(`==================================================`);
  
  if (matchingProfiles.length > 1) {
    console.log("Result: PROFILE_CONFLICT");
  } else if (matchingProfiles.length === 0 && !authEmailUid) {
    console.log("Result: NOT_FOUND (Both Profile and Auth missing)");
  } else if (matchingProfiles.length === 1 && !authEmailUid) {
    console.log("Result: AUTH_EXISTS_PROFILE_MISSING");
  } else if (matchingProfiles.length === 0 && authEmailUid) {
    console.log("Result: PROFILE_EXISTS_AUTH_MISSING");
  } else if (matchingProfiles.length === 1 && authEmailUid) {
    if (matchingProfiles[0].uid === authEmailUid) {
      console.log("Result: HEALTHY_MATCH");
    } else {
      console.log("Result: PROFILE_UID_AUTH_UID_MISMATCH");
    }
  } else {
    console.log("Result: UNKNOWN");
  }
}

diagnose().catch((err) => {
  console.error("Diagnostic script failed:", err);
  process.exit(1);
});
