/**
 * Trusted Database Migration & Audit Script: Canonical facilityId Enforcement
 *
 * Supports:
 *   --dry-run (default) : Scans and classifies all records without writing to Firestore.
 *   --apply             : Applies unambiguous migrations (Category B) to Firestore in safe batches.
 *
 * Usage:
 *   node scripts/migrate-facility-ids.js --dry-run
 *   node scripts/migrate-facility-ids.js --apply
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

async function runMigrationAudit() {
  const isApply = process.argv.includes("--apply");
  const mode = isApply ? "APPLY" : "DRY-RUN";

  console.log(`==================================================`);
  console.log(`   FACILITY ID MIGRATION AUDIT (${mode} MODE)`);
  console.log(`==================================================`);
  console.log(`Firebase Project:   ${TARGET_PROJECT_ID}`);
  console.log(`Firestore Database: ${TARGET_DATABASE_ID}`);
  console.log(`Mode:               ${mode}`);
  console.log(`==================================================`);

  if (!isApply) {
    console.log(`\nDRY-RUN — NO FIRESTORE DATA WILL BE MODIFIED\n`);
  } else {
    console.log("\n⚠️  [OPERATOR WARNING]: Ensure a Firestore backup/export has been created");
    console.log("    and verified before applying updates to production.\n");
  }

  // 1. LOAD & VALIDATE COMPLETE CONFIGURED STATIC REGISTRY (84 facilities)
  console.log("Loading and validating configured static facility registry...");
  const configuredFacilities = getAllCanonicalFacilities();

  const staticIds = new Set();
  const staticNamesToIds = new Map();
  let staticMalformed = false;

  configuredFacilities.forEach((f) => {
    const id = (f.facilityId || "").trim();
    const name = (f.facilityName || "").trim();

    if (!id || !name) {
      console.error(
        `❌ Static Registry Error: Malformed facility entry. ID: "${id}", Name: "${name}"`,
      );
      staticMalformed = true;
      return;
    }

    if (staticIds.has(id)) {
      console.error(`❌ Static Registry Error: Duplicate canonical facilityId detected: "${id}"`);
      staticMalformed = true;
    }
    staticIds.add(id);

    const normName = name.toLowerCase().replace(/\s+/g, " ").trim();
    if (!staticNamesToIds.has(normName)) {
      staticNamesToIds.set(normName, new Set());
    }
    staticNamesToIds.get(normName).add(id);
  });

  // Verify duplicate names mapping to different IDs
  staticNamesToIds.forEach((idSet, normName) => {
    if (idSet.size > 1) {
      console.error(
        `❌ Static Registry Error: Duplicate normalized facilityName "${normName}" maps to multiple IDs: ${Array.from(idSet).join(", ")}`,
      );
      staticMalformed = true;
    }
  });

  if (staticMalformed) {
    console.error(
      "❌ Static registry validation failed. Migration aborted to prevent data corruption.",
    );
    process.exit(1);
  }

  console.log(
    `✓ Configured static registry verified: ${configuredFacilities.length} safe canonical facilities loaded.`,
  );

  // Initialize Firebase Admin SDK
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

  // Explicitly select the target named Firestore database ID (fail-closed, no default fallback)
  if (!TARGET_DATABASE_ID || TARGET_DATABASE_ID === "(default)") {
    console.error("❌ Fatal Configuration Error: Named database selection is required.");
    process.exit(1);
  }

  const db = getFirestore(app, TARGET_DATABASE_ID);

  // 2. LOAD LIVE TRUSTED PROFILES FOR ACCOUNT STATUS CHECK (role == "facility")
  console.log(
    "Loading live trusted facility profiles from 'users' collection to verify login status...",
  );
  let usersSnapshot;
  try {
    usersSnapshot = await db.collection("users").where("role", "==", "facility").get();
  } catch (err) {
    console.error(
      `\n❌ Failed to query trusted users collection on named database '${TARGET_DATABASE_ID}':`,
      err.message,
    );
    process.exit(1);
  }

  // Account mappings: facilityId -> profiles list
  const idToProfiles = new Map();
  usersSnapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const uid = docSnap.id;
    const facId = (data.facilityId || "").trim();
    const facName = (data.facilityName || "").trim();
    const active = data.active;
    const role = data.role;

    if (!facId) return;

    const profiles = idToProfiles.get(facId) || [];
    profiles.push({ uid, facilityName: facName, active: active === true, role });
    idToProfiles.set(facId, profiles);
  });

  // Map every canonical facility ID to its corresponding dynamic account status
  const facilityAccountStatuses = new Map(); // facilityId -> ACCOUNT_STATUS
  staticIds.forEach((facId) => {
    const profiles = idToProfiles.get(facId) || [];
    if (profiles.length === 0) {
      facilityAccountStatuses.set(facId, "ACCOUNT_MISSING");
    } else if (profiles.length > 1) {
      facilityAccountStatuses.set(facId, "ACCOUNT_CONFLICT");
    } else {
      const profile = profiles[0];
      if (profile.role !== "facility" || !profile.facilityName) {
        facilityAccountStatuses.set(facId, "ACCOUNT_MALFORMED");
      } else if (profile.active === true) {
        facilityAccountStatuses.set(facId, "ACCOUNT_ACTIVE");
      } else {
        facilityAccountStatuses.set(facId, "ACCOUNT_INACTIVE");
      }
    }
  });

  // Prepare normalized name mappings for exact name lookups
  const normNameToConfigured = new Map(); // normalizedName -> configured facility
  configuredFacilities.forEach((f) => {
    const normName = f.facilityName.toLowerCase().replace(/\s+/g, " ").trim();
    normNameToConfigured.set(normName, f);
  });

  // 3. Load and validate optional manual migration map if present
  let manualMap = {};
  const manualMapPath = path.join(__dirname, "facility-migration-map.json");
  if (fs.existsSync(manualMapPath)) {
    try {
      const rawManualMap = JSON.parse(fs.readFileSync(manualMapPath, "utf-8"));
      for (const [key, destId] of Object.entries(rawManualMap)) {
        if (!staticIds.has(destId)) {
          console.error(
            `❌ [INVALID MANUAL MAPPING]: Destination facilityId '${destId}' for '${key}' does NOT exist in canonical static registry!`,
          );
          process.exit(1);
        }
        manualMap[key.toLowerCase().replace(/\s+/g, " ").trim()] = destId;
      }
      console.log(
        `Validated and loaded ${Object.keys(manualMap).length} entries from facility-migration-map.json`,
      );
    } catch (err) {
      console.error("Failed to parse or validate facility-migration-map.json:", err.message);
      process.exit(1);
    }
  }

  // 4. AUDIT AND MIGRATION PIPELINE
  let grandTotalScanned = 0;
  let categoryCounts = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, conflict: 0 };
  const unresolvedRecords = [];
  const batchUpdates = [];
  const readyCategoryBByFacility = new Map(); // facilityId -> { facilityName, count, accountStatus }

  for (const colName of COLLECTIONS) {
    let snapshot;
    try {
      snapshot = await db.collection(colName).get();
    } catch (err) {
      console.warn(`Could not query collection ${colName}:`, err.message);
      continue;
    }

    console.log(`\nAuditing collection: ${colName} (${snapshot.size} documents)`);

    let colStats = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, conflict: 0 };

    for (const docSnap of snapshot.docs) {
      grandTotalScanned++;
      const data = docSnap.data();
      const rawName = (data.facilityName || "").trim();
      const rawId = (data.facilityId || "").trim();

      // Safe normalization: case differences, leading/trailing whitespace, collapse repeated whitespace
      const normalizedName = rawName.toLowerCase().replace(/\s+/g, " ").trim();

      // Determine expected canonical ID from manual map or canonical registry matches
      let expectedId = "";
      let configuredFac = null;

      if (manualMap[normalizedName]) {
        expectedId = manualMap[normalizedName];
        configuredFac = configuredFacilities.find((f) => f.facilityId === expectedId);
      } else if (normNameToConfigured.has(normalizedName)) {
        configuredFac = normNameToConfigured.get(normalizedName);
        expectedId = configuredFac.facilityId;
      }

      const accountStatus = expectedId
        ? facilityAccountStatuses.get(expectedId) || "ACCOUNT_MISSING"
        : "ACCOUNT_MISSING";

      // Classify the historical record
      if (rawId && staticIds.has(rawId)) {
        if (expectedId && rawId !== expectedId) {
          // Category C: facilityId exists but conflicts with canonical name resolution
          categoryCounts.C++;
          colStats.C++;
          unresolvedRecords.push({
            collection: colName,
            id: docSnap.id,
            facilityName: rawName,
            facilityId: rawId,
            reason: `CONFLICT: existing facilityId '${rawId}' conflicts with canonical expected ID '${expectedId}' derived from facilityName.`,
          });
        } else {
          // Category A: Already correct
          categoryCounts.A++;
          colStats.A++;
        }
      } else if (!rawId) {
        if (!expectedId) {
          // Category E: Unresolved / Not configured
          categoryCounts.E++;
          colStats.E++;
          unresolvedRecords.push({
            collection: colName,
            id: docSnap.id,
            facilityName: rawName || "(missing)",
            facilityId: "(missing)",
            reason: `UNRESOLVED: facilityName '${rawName}' is not configured in canonical static registry.`,
          });
        } else if (expectedId === "kd_tiram_duku" || accountStatus === "ACCOUNT_CONFLICT") {
          // Exclude conflict/review records from auto migration
          categoryCounts.conflict++;
          colStats.conflict++;
          unresolvedRecords.push({
            collection: colName,
            id: docSnap.id,
            facilityName: rawName,
            facilityId: "(missing)",
            reason: `CONFLICT: Expected ID '${expectedId}' has login account conflicts in users collection.`,
          });
        } else {
          // Category B: Safe missing facility ID
          categoryCounts.B++;
          colStats.B++;

          const entry = readyCategoryBByFacility.get(expectedId) || {
            facilityName: configuredFac.facilityName,
            count: 0,
            accountStatus: accountStatus,
          };
          entry.count++;
          readyCategoryBByFacility.set(expectedId, entry);

          if (isApply) {
            batchUpdates.push({
              ref: docSnap.ref,
              data: {
                facilityId: expectedId,
              },
            });
          }
        }
      } else {
        // Category F: Orphaned (ID points outside canonical registry)
        categoryCounts.F++;
        colStats.F++;
        unresolvedRecords.push({
          collection: colName,
          id: docSnap.id,
          facilityName: rawName,
          facilityId: rawId,
          reason: `ORPHANED: existing facilityId '${rawId}' is not found in the canonical static registry.`,
        });
      }
    }

    console.log(
      `  Stats -> A (Correct): ${colStats.A}, B (Migratable): ${colStats.B}, C (Mismatch): ${colStats.C}, D (Ambiguous): ${colStats.D}, E (Unresolved): ${colStats.E}, F (Orphaned): ${colStats.F}, Conflict: ${colStats.conflict}`,
    );
  }

  // 5. PRINT SUMMARY
  console.log(`\n==================================================`);
  console.log(`   MIGRATION AUDIT SUMMARY`);
  console.log(`==================================================`);
  console.log(`Total documents scanned: ${grandTotalScanned}`);
  console.log(`  [Category A] Already Correct          : ${categoryCounts.A}`);
  console.log(`  [Category B] Safe / Migratable        : ${categoryCounts.B}`);
  console.log(`  [Category C] Mismatch / Conflict      : ${categoryCounts.C}`);
  console.log(`  [Category D] Ambiguous                : ${categoryCounts.D}`);
  console.log(`  [Category E] Unresolved / Not Config. : ${categoryCounts.E}`);
  console.log(`  [Category F] Orphaned                 : ${categoryCounts.F}`);
  console.log(`  [Conflicts] Account conflicts         : ${categoryCounts.conflict}`);

  if (unresolvedRecords.length > 0) {
    console.log(`\n--- Unresolved / Review Records (${unresolvedRecords.length}) ---`);
    unresolvedRecords.slice(0, 25).forEach((r) => {
      console.log(
        `  [${r.collection}] Doc ${r.id} | Name: "${r.facilityName}" | ID: "${r.facilityId}" | Reason: ${r.reason}`,
      );
    });
    if (unresolvedRecords.length > 25) {
      console.log(`  ... and ${unresolvedRecords.length - 25} more unresolved records.`);
    }
  }

  console.log(`\n==================================================`);
  console.log(`   SAFE MIGRATIONS BY FACILITY (CATEGORY B)`);
  console.log(`==================================================`);
  if (readyCategoryBByFacility.size === 0) {
    console.log("No Category B records found for safe migration.");
  } else {
    readyCategoryBByFacility.forEach((info, facId) => {
      console.log(`${info.facilityName}`);
      console.log(`  facilityId:     ${facId}`);
      console.log(`  records:        ${info.count}`);
      console.log(`  account status: ${info.accountStatus}`);
      console.log(`--------------------------------------------------`);
    });
  }

  if (isApply && batchUpdates.length > 0) {
    console.log(`\nExecuting batch updates for ${batchUpdates.length} Category B records...`);
    const BATCH_LIMIT = 400;
    for (let i = 0; i < batchUpdates.length; i += BATCH_LIMIT) {
      const chunk = batchUpdates.slice(i, i + BATCH_LIMIT);
      const batch = db.batch();
      chunk.forEach((item) => {
        batch.update(item.ref, item.data);
      });
      await batch.commit();
      console.log(`Committed batch ${Math.floor(i / BATCH_LIMIT) + 1} (${chunk.length} updates).`);
    }
    console.log("\nApply migration completed successfully.");
  } else if (isApply) {
    console.log("\nNo Category B records require migration.");
  } else {
    console.log("\nThis was a DRY-RUN (default). No changes were written to Firestore.");
    console.log(
      "To apply safe unambiguous migrations, run: node scripts/migrate-facility-ids.js --apply",
    );
  }
}

runMigrationAudit().catch((err) => {
  console.error("Migration audit failed:", err);
  process.exit(1);
});
