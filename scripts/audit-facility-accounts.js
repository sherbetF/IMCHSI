/**
 * Trusted Database READ-ONLY Facility-Account Audit Script
 *
 * Usage:
 *   node scripts/audit-facility-accounts.js
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getAllCanonicalFacilities } from "./lib/facility-account-admin.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET_PROJECT_ID = "outsource-f1e0f";
const TARGET_DATABASE_ID = "ai-studio-hospitalhubdesig-7f7a6729-a1d2-48e8-ba86-ae6c290d754c";

const COLLECTIONS = [
  "echo_appointments",
  "stress_test_appointments",
  "holter_appointments",
  "blood_pressure_appointments",
  "lung_function_appointments",
  "outsource_appointments",
  "rheumatology_appointments",
  "outsource_reports",
];

async function runAudit() {
  console.log(`==================================================`);
  console.log(`   FACILITY-ACCOUNT REGISTRY AUDIT (READ-ONLY)`);
  console.log(`==================================================`);
  console.log(`Firebase Project:   ${TARGET_PROJECT_ID}`);
  console.log(`Firestore Database: ${TARGET_DATABASE_ID}`);
  console.log(`AUDIT ONLY — NO FIRESTORE OR AUTH DATA WILL BE MODIFIED`);
  console.log(`==================================================\n`);

  let app;
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath && fs.existsSync(credPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(credPath, "utf-8"));
    app = initializeApp({
      credential: cert(serviceAccount),
      projectId: TARGET_PROJECT_ID,
    });
  } else {
    try {
      app = initializeApp({
        projectId: TARGET_PROJECT_ID,
      });
    } catch {
      console.log("Running in offline/simulation mode or default credentials missing.");
      console.log("Please supply GOOGLE_APPLICATION_CREDENTIALS if connecting to live Firestore.");
      return;
    }
  }

  const db = getFirestore(app, TARGET_DATABASE_ID);

  // 1. Load static configured facilities list
  const configuredFacilities = getAllCanonicalFacilities();
  const configuredNormNames = new Set(
    configuredFacilities.map((f) => f.facilityName.toLowerCase().replace(/\s+/g, " ").trim()),
  );

  // 2. Load live trusted profiles from Firestore
  let usersSnapshot;
  try {
    usersSnapshot = await db.collection("users").where("role", "==", "facility").get();
  } catch (err) {
    console.error(
      `❌ Failed to query users collection on named database '${TARGET_DATABASE_ID}':`,
      err.message,
    );
    process.exit(1);
  }

  // 3. Build Unified Canonical In-Memory Registry
  const allLoadedProfiles = [];
  const malformedProfiles = [];
  const duplicateIdsMap = new Map(); // facilityId -> list of profiles
  const duplicateNamesToIds = new Map(); // normalizedName -> Set of facilityIds
  const normNameToProfiles = new Map(); // normalizedName -> list of profiles

  usersSnapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const uid = docSnap.id;
    const facId = (data.facilityId || "").trim();
    const facName = (data.facilityName || "").trim();
    const role = data.role;
    const active = data.active;

    const profileEntry = {
      uid,
      facilityId: facId,
      facilityName: facName,
      role,
      active: active === true,
    };

    allLoadedProfiles.push(profileEntry);

    // Classification step 1: Malformed check
    if (role !== "facility" || !facId || !facName) {
      let reason = "Malformed";
      if (role !== "facility") reason = `Invalid role: '${role}', expected 'facility'`;
      else if (!facId) reason = "Missing facilityId";
      else if (!facName) reason = "Missing facilityName";

      malformedProfiles.push({ uid, reason, data: profileEntry });
      return;
    }

    // Populate helper maps for duplicate and matching checks
    const idList = duplicateIdsMap.get(facId) || [];
    idList.push(profileEntry);
    duplicateIdsMap.set(facId, idList);

    const normName = facName.toLowerCase().replace(/\s+/g, " ").trim();
    if (!duplicateNamesToIds.has(normName)) {
      duplicateNamesToIds.set(normName, new Set());
    }
    duplicateNamesToIds.get(normName).add(facId);

    const normList = normNameToProfiles.get(normName) || [];
    normList.push(profileEntry);
    normNameToProfiles.set(normName, normList);
  });

  // Extract duplicate IDs
  const duplicateIds = new Set();
  duplicateIdsMap.forEach((profiles, id) => {
    if (profiles.length > 1) {
      duplicateIds.add(id);
    }
  });

  // Extract duplicate conflicting names (maps to multiple IDs)
  const conflictingNames = new Set();
  duplicateNamesToIds.forEach((idSet, normName) => {
    if (idSet.size > 1) {
      conflictingNames.add(normName);
    }
  });

  // Classify clean profiles and conflicting profiles
  const validActiveAccounts = [];
  const validInactiveAccounts = [];
  const conflictingAccounts = [];

  allLoadedProfiles.forEach((p) => {
    // Skip if already in malformed profiles
    if (malformedProfiles.some((m) => m.uid === p.uid)) return;

    const normName = p.facilityName.toLowerCase().replace(/\s+/g, " ").trim();
    const hasConflict = duplicateIds.has(p.facilityId) || conflictingNames.has(normName);

    if (hasConflict) {
      conflictingAccounts.push(p);
    } else {
      if (p.active) {
        validActiveAccounts.push(p);
      } else {
        validInactiveAccounts.push(p);
      }
    }
  });

  // Recalculate Missing Configured Accounts (no valid/conflicting profile matching configured ID)
  const loadedFacilityIds = new Set(allLoadedProfiles.map((p) => p.facilityId).filter(Boolean));
  const missingAccounts = configuredFacilities.filter((f) => !loadedFacilityIds.has(f.facilityId));

  // 4. Historical Appointments Scanning and Consistency Classification
  const unresolvedCounts = new Map(); // normalizedName -> { rawName, count }

  for (const colName of COLLECTIONS) {
    let snapshot;
    try {
      snapshot = await db.collection(colName).get();
    } catch (err) {
      continue;
    }

    snapshot.docs.forEach((docSnap) => {
      const data = docSnap.data();
      const rawId = (data.facilityId || "").trim();
      const rawName = (data.facilityName || "").trim();

      // Only evaluate historical records that do not contain a valid matching canonical ID
      if (!rawId || !loadedFacilityIds.has(rawId)) {
        const normName = rawName.toLowerCase().replace(/\s+/g, " ").trim();
        const existing = unresolvedCounts.get(normName) || { rawName, count: 0 };
        existing.count++;
        unresolvedCounts.set(normName, existing);
      }
    });
  }

  // Print Report Sections
  console.log(`==================================================`);
  console.log(`1. REGISTRY METRICS AND AUDIT TOTALS`);
  console.log(`==================================================`);
  console.log(`Total configured facilities (static registry)     : ${configuredFacilities.length}`);
  console.log(`Total trusted facility profiles loaded (live DB)  : ${allLoadedProfiles.length}`);
  console.log(`--------------------------------------------------`);
  console.log(`Unique valid active accounts without conflicts    : ${validActiveAccounts.length}`);
  console.log(
    `Unique valid inactive accounts without conflicts  : ${validInactiveAccounts.length}`,
  );
  console.log(`Conflicting accounts (duplicate ID / name mapping): ${conflictingAccounts.length}`);
  console.log(`Malformed profiles                                : ${malformedProfiles.length}`);
  console.log(`--------------------------------------------------`);
  console.log(`Missing configured accounts (need provisioning)   : ${missingAccounts.length}`);
  console.log(`==================================================`);

  // Verify internal consistency
  const sumOfCategories =
    validActiveAccounts.length +
    validInactiveAccounts.length +
    conflictingAccounts.length +
    malformedProfiles.length;
  if (sumOfCategories !== allLoadedProfiles.length) {
    console.warn(
      `⚠️ Warning: Sum of category metrics (${sumOfCategories}) does not equal total profiles (${allLoadedProfiles.length})!`,
    );
  } else {
    console.log(`✓ Consistency Verification: Registry totals are perfectly consistent.`);
  }

  console.log(`\n==================================================`);
  console.log(`2. VALID ACTIVE ACCOUNTS`);
  console.log(`==================================================`);
  validActiveAccounts.forEach((p) => {
    console.log(`  - ${p.facilityName} (${p.facilityId}) | UID: ${p.uid}`);
  });

  console.log(`\n==================================================`);
  console.log(`3. VALID INACTIVE ACCOUNTS`);
  console.log(`==================================================`);
  validInactiveAccounts.forEach((p) => {
    console.log(`  - ${p.facilityName} (${p.facilityId}) | UID: ${p.uid}`);
  });

  console.log(`\n==================================================`);
  console.log(`4. MISSING CONFIGURED ACCOUNTS`);
  console.log(`==================================================`);
  missingAccounts.forEach((f) => {
    console.log(
      `  - [${f.category}] Name: "${f.facilityName}" | Canonical ID: "${f.facilityId}" | Status: MISSING ACCOUNT`,
    );
  });

  console.log(`\n==================================================`);
  console.log(`5. DUPLICATE FACILITY ID CONFLICTS`);
  console.log(`==================================================`);
  let duplicateCount = 0;
  duplicateIdsMap.forEach((profiles, id) => {
    if (profiles.length > 1) {
      duplicateCount++;
      console.log(`  ⚠️ Duplicate facilityId detected for ID: "${id}"`);
      profiles.forEach((p) => {
        console.log(
          `    - Profile Name: "${p.facilityName}" | UID: ${p.uid} | Active: ${p.active}`,
        );
      });
    }
  });
  if (duplicateCount === 0) {
    console.log("No duplicate facilityId conflicts detected.");
  }

  console.log(`\n==================================================`);
  console.log(`6. DUPLICATE/CONFLICTING FACILITY NAMES`);
  console.log(`==================================================`);
  let confNameCount = 0;
  duplicateNamesToIds.forEach((idSet, normName) => {
    if (idSet.size > 1) {
      confNameCount++;
      console.log(`  ⚠️ Conflicting facility name maps to multiple IDs: "${normName}"`);
      console.log(`    Associated facilityIds: ${Array.from(idSet).join(", ")}`);
      const matched = allLoadedProfiles.filter(
        (p) => p.facilityName.toLowerCase().replace(/\s+/g, " ").trim() === normName,
      );
      matched.forEach((p) => {
        console.log(
          `    - Profile UID: ${p.uid} | facilityId: "${p.facilityId}" | Active: ${p.active}`,
        );
      });
    }
  });
  if (confNameCount === 0) {
    console.log("No duplicate conflicting facility name mappings detected.");
  }

  console.log(`\n==================================================`);
  console.log(`7. MALFORMED PROFILES`);
  console.log(`==================================================`);
  if (malformedProfiles.length === 0) {
    console.log("No malformed profiles discovered.");
  } else {
    malformedProfiles.forEach((p) => {
      console.log(`  - Profile UID: ${p.uid} | Reason: ${p.reason}`);
    });
  }

  console.log(`\n==================================================`);
  console.log(`8. HISTORICAL RECORD UNRESOLVED CLASSIFICATION`);
  console.log(`==================================================`);
  console.log(
    `Total unresolved unique facility names in historical records: ${unresolvedCounts.size}`,
  );

  const sortedUnresolved = Array.from(unresolvedCounts.values()).sort((a, b) => b.count - a.count);

  sortedUnresolved.forEach((item) => {
    const normName = item.rawName.toLowerCase().replace(/\s+/g, " ").trim();
    const isConfigured = configuredNormNames.has(normName);

    // Lookup in the SAME loaded profiles registry
    const matches = normNameToProfiles.get(normName) || [];

    let classification = "MISSING_ACCOUNT";
    let statusText = "MISSING";
    let extraDetails = "";

    if (matches.length === 1) {
      const matchedProfile = matches[0];
      if (duplicateIds.has(matchedProfile.facilityId)) {
        classification = "CONFLICT";
        statusText = "CONFLICT (Duplicate IDs)";
      } else {
        classification = "READY";
        statusText = `FOUND (facilityId: "${matchedProfile.facilityId}", Active: ${matchedProfile.active})`;
      }
    } else if (matches.length > 1) {
      classification = "CONFLICT";
      statusText = "CONFLICT (Multiple matching profiles)";
    } else {
      if (!isConfigured) {
        classification = "NOT_CONFIGURED";
        statusText = "NOT CONFIGURED IN STATIC REGISTRY";
      }
    }

    console.log(`  - Name: "${item.rawName}"`);
    console.log(`    Unresolved historical records: ${item.count}`);
    console.log(`    Classification:                ${classification}`);
    console.log(`    Trusted facility account:      ${statusText}`);
  });

  console.log(`\n==================================================`);
  console.log(`   END OF AUDIT`);
  console.log(`==================================================`);
}

runAudit().catch((err) => {
  console.error("Audit tool failed:", err);
  process.exit(1);
});
