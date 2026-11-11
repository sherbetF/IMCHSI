/**
 * STRICTLY READ-ONLY Firestore Migration Parity & Target Inventory Verifier
 *
 * Compares the authoritative source named database:
 *   ai-studio-hospitalhubdesig-7f7a6729-a1d2-48e8-ba86-ae6c290d754c
 * against the target database:
 *   (default)
 *
 * Verifies:
 *   - All 15 top-level HospitalHub collections
 *   - All document IDs (both missing target docs AND extra target docs in (default))
 *   - All document fields and nested values recursively (catches stripped mirror payloads)
 *   - Native Firestore Timestamp instances (exact seconds + nanoseconds parity)
 *   - All rheumatology_appointments/{id}/attachments subcollection documents
 *   - All rheumatology_appointments/{id}/attachment_control subcollection documents
 *   - Critical paramedic_nurse account (UID: aIV1KRR5jUgFjShudWhktAGS2Wm2)
 *
 * SAFETY GUARANTEE:
 *   This script is strictly READ-ONLY. It never modifies either database.
 *
 * Usage:
 *   Full Parity Check:
 *     GOOGLE_APPLICATION_CREDENTIALS=service-account.json node scripts/verify-migration-parity.js
 *   Read-Only Target Inventory & Extra Document Check:
 *     GOOGLE_APPLICATION_CREDENTIALS=service-account.json node scripts/verify-migration-parity.js --inventory-target
 *   Frozen Source Baseline Document Count (Read-Only):
 *     GOOGLE_APPLICATION_CREDENTIALS=service-account.json node scripts/verify-migration-parity.js --snapshot-source-count
 *   Offline Static & Logic Self-Test (No Live DB Connection):
 *     node scripts/verify-migration-parity.js --self-test
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import fs from "fs";
import { fileURLToPath } from "url";

export const PROJECT_ID = "outsource-f1e0f";
export const SOURCE_DATABASE_ID =
  process.env.HOSPITALHUB_SOURCE_DB ||
  "ai-studio-hospitalhubdesig-7f7a6729-a1d2-48e8-ba86-ae6c290d754c";
export const TARGET_DATABASE_ID = "(default)";
export const CRITICAL_PARAMEDIC_UID = "aIV1KRR5jUgFjShudWhktAGS2Wm2";

export const TOP_LEVEL_COLLECTIONS = [
  "users",
  "facilities",
  "admin_config",
  "echo_appointments",
  "stress_test_appointments",
  "holter_appointments",
  "blood_pressure_appointments",
  "lung_function_appointments",
  "outsource_appointments",
  "outsource_reports",
  "diagnostic_results",
  "rheumatology_appointments",
  "admin_audit_logs",
  "report_operations",
  "report_audit_logs",
];

export const RHEUMATOLOGY_SUBCOLLECTIONS = ["attachments", "attachment_control"];

/**
 * Detects whether a value is a native Firestore Timestamp (or duck-typed Admin Timestamp).
 */
export function isFirestoreTimestamp(val) {
  if (!val || typeof val !== "object") return false;
  if (val instanceof Timestamp) return true;
  return (
    typeof val.seconds === "number" &&
    typeof val.nanoseconds === "number" &&
    typeof val.toMillis === "function"
  );
}

/**
 * Recursively compares two Firestore document values, enforcing strict type and
 * native Timestamp (seconds + nanoseconds) equality.
 */
export function compareFirestoreValues(sourceVal, targetVal, fieldPath = "") {
  const diffs = [];

  if (isFirestoreTimestamp(sourceVal) || isFirestoreTimestamp(targetVal)) {
    if (!isFirestoreTimestamp(sourceVal)) {
      diffs.push(
        `${fieldPath}: source is non-Timestamp (${typeof sourceVal}), target is Timestamp(${targetVal.seconds}, ${targetVal.nanoseconds})`,
      );
      return diffs;
    }
    if (!isFirestoreTimestamp(targetVal)) {
      diffs.push(
        `${fieldPath}: source is Timestamp(${sourceVal.seconds}, ${sourceVal.nanoseconds}), target is non-Timestamp (${typeof targetVal}: ${JSON.stringify(targetVal)})`,
      );
      return diffs;
    }
    if (
      sourceVal.seconds !== targetVal.seconds ||
      sourceVal.nanoseconds !== targetVal.nanoseconds
    ) {
      diffs.push(
        `${fieldPath}: Timestamp mismatch — source=(${sourceVal.seconds}s, ${sourceVal.nanoseconds}ns) vs target=(${targetVal.seconds}s, ${targetVal.nanoseconds}ns)`,
      );
    }
    return diffs;
  }

  if (sourceVal === targetVal) {
    return diffs;
  }

  if (
    sourceVal === null ||
    targetVal === null ||
    typeof sourceVal !== "object" ||
    typeof targetVal !== "object"
  ) {
    diffs.push(
      `${fieldPath}: value mismatch — source=${JSON.stringify(sourceVal)} vs target=${JSON.stringify(targetVal)}`,
    );
    return diffs;
  }

  if (Array.isArray(sourceVal) || Array.isArray(targetVal)) {
    if (!Array.isArray(sourceVal) || !Array.isArray(targetVal)) {
      diffs.push(
        `${fieldPath}: array type mismatch — source isArray=${Array.isArray(sourceVal)} vs target isArray=${Array.isArray(targetVal)}`,
      );
      return diffs;
    }
    if (sourceVal.length !== targetVal.length) {
      diffs.push(
        `${fieldPath}: array length mismatch — source length=${sourceVal.length} vs target length=${targetVal.length}`,
      );
    }
    const maxLen = Math.max(sourceVal.length, targetVal.length);
    for (let i = 0; i < maxLen; i++) {
      diffs.push(...compareFirestoreValues(sourceVal[i], targetVal[i], `${fieldPath}[${i}]`));
    }
    return diffs;
  }

  const sourceKeys = Object.keys(sourceVal).sort();
  const targetKeys = Object.keys(targetVal).sort();
  const allKeys = Array.from(new Set([...sourceKeys, ...targetKeys])).sort();

  for (const key of allKeys) {
    const subPath = fieldPath ? `${fieldPath}.${key}` : key;
    const inSource = Object.prototype.hasOwnProperty.call(sourceVal, key);
    const inTarget = Object.prototype.hasOwnProperty.call(targetVal, key);

    if (inSource && !inTarget) {
      diffs.push(
        `${subPath}: missing in target (default) [source value=${JSON.stringify(sourceVal[key])}]`,
      );
    } else if (!inSource && inTarget) {
      diffs.push(
        `${subPath}: extra field in target (default) [target value=${JSON.stringify(targetVal[key])}]`,
      );
    } else {
      diffs.push(...compareFirestoreValues(sourceVal[key], targetVal[key], subPath));
    }
  }

  return diffs;
}

/**
 * Reads all documents in a collection into a Map<docId, data>.
 */
async function readCollectionMap(db, collectionPath) {
  const snap = await db.collection(collectionPath).get();
  const docMap = new Map();
  for (const docSnap of snap.docs) {
    docMap.set(docSnap.id, docSnap.data());
  }
  return docMap;
}

/**
 * Compares two document Maps (source vs target) for a given collection path.
 */
export function compareDocumentMaps(collectionPath, sourceMap, targetMap) {
  const missingInTarget = [];
  const extraInTarget = [];
  const fieldMismatches = [];

  for (const [docId, sourceData] of sourceMap.entries()) {
    if (!targetMap.has(docId)) {
      missingInTarget.push(`${collectionPath}/${docId}`);
      continue;
    }
    const targetData = targetMap.get(docId);
    const docDiffs = compareFirestoreValues(sourceData, targetData, "");
    if (docDiffs.length > 0) {
      fieldMismatches.push({
        docPath: `${collectionPath}/${docId}`,
        sourceFieldCount: Object.keys(sourceData || {}).length,
        targetFieldCount: Object.keys(targetData || {}).length,
        diffs: docDiffs,
      });
    }
  }

  for (const docId of targetMap.keys()) {
    if (!sourceMap.has(docId)) {
      extraInTarget.push(`${collectionPath}/${docId}`);
    }
  }

  return {
    collectionPath,
    sourceCount: sourceMap.size,
    targetCount: targetMap.size,
    missingInTarget,
    extraInTarget,
    fieldMismatches,
    passed:
      sourceMap.size === targetMap.size &&
      missingInTarget.length === 0 &&
      extraInTarget.length === 0 &&
      fieldMismatches.length === 0,
  };
}

/**
 * Performs a read-only inventory of existing documents in (default) and identifies
 * any extra documents in (default) that are absent from the source named database.
 */
export async function runTargetInventory(sourceDb, targetDb) {
  const collectionInventories = [];
  const allExtraTargetDocs = [];
  let totalTargetTopLevelDocs = 0;
  let totalTargetSubcollectionDocs = 0;

  for (const colName of TOP_LEVEL_COLLECTIONS) {
    const [sourceMap, targetMap] = await Promise.all([
      readCollectionMap(sourceDb, colName),
      readCollectionMap(targetDb, colName),
    ]);

    totalTargetTopLevelDocs += targetMap.size;
    const extraDocIds = [];
    for (const docId of targetMap.keys()) {
      if (!sourceMap.has(docId)) {
        extraDocIds.push(docId);
        allExtraTargetDocs.push(`${colName}/${docId}`);
      }
    }

    collectionInventories.push({
      collection: colName,
      sourceCount: sourceMap.size,
      targetCount: targetMap.size,
      targetDocIds: Array.from(targetMap.keys()),
      extraInTargetCount: extraDocIds.length,
      extraInTargetPaths: extraDocIds.map((id) => `${colName}/${id}`),
    });

    if (colName === "rheumatology_appointments") {
      const allReferralIds = new Set([...sourceMap.keys(), ...targetMap.keys()]);
      for (const referralId of allReferralIds) {
        for (const subCol of RHEUMATOLOGY_SUBCOLLECTIONS) {
          const subPath = `rheumatology_appointments/${referralId}/${subCol}`;
          const [subSourceMap, subTargetMap] = await Promise.all([
            readCollectionMap(sourceDb, subPath),
            readCollectionMap(targetDb, subPath),
          ]);
          totalTargetSubcollectionDocs += subTargetMap.size;
          for (const subDocId of subTargetMap.keys()) {
            if (!subSourceMap.has(subDocId)) {
              allExtraTargetDocs.push(`${subPath}/${subDocId}`);
            }
          }
        }
      }
    }
  }

  return {
    totalTargetTopLevelDocs,
    totalTargetSubcollectionDocs,
    allExtraTargetDocs,
    collectionInventories,
  };
}

/**
 * Executes a strictly read-only baseline document count on the source database.
 * Computes exact counts across all 15 top-level collections and all nested subcollections
 * to establish the frozen baseline N_frozen prior to managed export.
 */
export async function runSourceCountSnapshot(sourceDb) {
  const collectionCounts = [];
  let totalTopLevelDocs = 0;
  let totalSubcollectionDocs = 0;

  for (const colName of TOP_LEVEL_COLLECTIONS) {
    const sourceMap = await readCollectionMap(sourceDb, colName);
    const count = sourceMap.size;
    totalTopLevelDocs += count;

    let subcolCount = 0;
    const subcolDetails = [];

    if (colName === "rheumatology_appointments") {
      const referralIds = Array.from(sourceMap.keys()).sort();
      for (const referralId of referralIds) {
        for (const subCol of RHEUMATOLOGY_SUBCOLLECTIONS) {
          const subPath = `rheumatology_appointments/${referralId}/${subCol}`;
          const subMap = await readCollectionMap(sourceDb, subPath);
          if (subMap.size > 0) {
            subcolCount += subMap.size;
            subcolDetails.push({ path: subPath, count: subMap.size });
          }
        }
      }
      totalSubcollectionDocs += subcolCount;
    }

    collectionCounts.push({
      collection: colName,
      count,
      subcolCount,
      subcolDetails,
    });
  }

  const grandTotal = totalTopLevelDocs + totalSubcollectionDocs;

  return {
    sourceDatabaseId: SOURCE_DATABASE_ID,
    timestamp: new Date().toISOString(),
    totalTopLevelDocs,
    totalSubcollectionDocs,
    grandTotal,
    collectionCounts,
  };
}

/**
 * Executes full read-only parity verification across all 15 top-level collections
 * and all nested rheumatology subcollections.
 */
export async function verifyDatabaseParity(sourceDb, targetDb, options = {}) {
  const requireCriticalParamedic = options.requireCriticalParamedic !== false;
  const collectionResults = [];
  const subcollectionResults = [];
  const allMissingInTarget = [];
  const allExtraInTarget = [];
  const allFieldMismatches = [];

  for (const colName of TOP_LEVEL_COLLECTIONS) {
    const [sourceMap, targetMap] = await Promise.all([
      readCollectionMap(sourceDb, colName),
      readCollectionMap(targetDb, colName),
    ]);

    const comparison = compareDocumentMaps(colName, sourceMap, targetMap);
    collectionResults.push(comparison);
    allMissingInTarget.push(...comparison.missingInTarget);
    allExtraInTarget.push(...comparison.extraInTarget);
    allFieldMismatches.push(...comparison.fieldMismatches);

    if (colName === "rheumatology_appointments") {
      const allReferralIds = Array.from(new Set([...sourceMap.keys(), ...targetMap.keys()])).sort();

      for (const referralId of allReferralIds) {
        for (const subCol of RHEUMATOLOGY_SUBCOLLECTIONS) {
          const subPath = `rheumatology_appointments/${referralId}/${subCol}`;
          const [subSourceMap, subTargetMap] = await Promise.all([
            readCollectionMap(sourceDb, subPath),
            readCollectionMap(targetDb, subPath),
          ]);

          const subComparison = compareDocumentMaps(subPath, subSourceMap, subTargetMap);
          subcollectionResults.push(subComparison);
          allMissingInTarget.push(...subComparison.missingInTarget);
          allExtraInTarget.push(...subComparison.extraInTarget);
          allFieldMismatches.push(...subComparison.fieldMismatches);
        }
      }
    }
  }

  // Verify critical paramedic_nurse account if present in source or required
  let criticalUserPassed = true;
  let criticalUserDetails = "Not required in self-test";
  if (requireCriticalParamedic) {
    const usersColResult = collectionResults.find((c) => c.collectionPath === "users");
    const [sourceUsers, targetUsers] = await Promise.all([
      readCollectionMap(sourceDb, "users"),
      readCollectionMap(targetDb, "users"),
    ]);
    const sourceParamedic = sourceUsers.get(CRITICAL_PARAMEDIC_UID);
    const targetParamedic = targetUsers.get(CRITICAL_PARAMEDIC_UID);

    if (!sourceParamedic || !targetParamedic) {
      criticalUserPassed = false;
      criticalUserDetails = `users/${CRITICAL_PARAMEDIC_UID} missing (inSource=${Boolean(sourceParamedic)}, inTarget=${Boolean(targetParamedic)})`;
    } else {
      const diffs = compareFirestoreValues(sourceParamedic, targetParamedic, "");
      if (
        diffs.length > 0 ||
        targetParamedic.role !== "paramedic_nurse" ||
        targetParamedic.active !== true
      ) {
        criticalUserPassed = false;
        criticalUserDetails = `users/${CRITICAL_PARAMEDIC_UID} mismatch: ${diffs.join("; ")}`;
      } else {
        criticalUserPassed = Boolean(usersColResult);
        criticalUserDetails = `Verified users/${CRITICAL_PARAMEDIC_UID} (role=${targetParamedic.role}, active=${targetParamedic.active}, fields=${Object.keys(targetParamedic).length})`;
      }
    }
  }

  const passed =
    allMissingInTarget.length === 0 &&
    allExtraInTarget.length === 0 &&
    allFieldMismatches.length === 0 &&
    criticalUserPassed;

  return {
    passed,
    collectionResults,
    subcollectionResults,
    allMissingInTarget,
    allExtraInTarget,
    allFieldMismatches,
    criticalUserPassed,
    criticalUserDetails,
  };
}

/**
 * Self-test mode: runs offline unit tests of the parity verifier and scans its own
 * source file to guarantee zero Firestore write methods exist.
 */
async function runSelfTest() {
  console.log("==================================================================");
  console.log("VERIFY-MIGRATION-PARITY: OFFLINE SELF-TEST & READ-ONLY SAFETY CHECK");
  console.log("==================================================================");

  // 1. Static source scan to guarantee zero write operations exist in this file
  const selfPath = fileURLToPath(import.meta.url);
  const selfSource = fs.readFileSync(selfPath, "utf-8");
  const forbiddenWritePatterns = [
    { name: "Firestore .set()", regex: /\.\s*set\s*\(/ },
    { name: "Firestore .update()", regex: /\.\s*update\s*\(/ },
    { name: "Firestore .add()", regex: /\.\s*add\s*\(/ },
    { name: "Firestore .delete()", regex: /\.\s*delete\s*\(/ },
    { name: "Firestore .batch()", regex: /\.\s*batch\s*\(/ },
    { name: "Firestore .runTransaction()", regex: /\.\s*runTransaction\s*\(/ },
  ];

  // Strip comments and string literals before scanning for method calls
  const codeWithoutStringsOrComments = selfSource
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*/g, "")
    .replace(/`(?:\\[\s\S]|[^\\`])*`/g, '""')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, '""')
    .replace(/docMap\.set\(/g, "docMap_put(");

  for (const pattern of forbiddenWritePatterns) {
    if (pattern.regex.test(codeWithoutStringsOrComments)) {
      throw new Error(`READ-ONLY VIOLATION: Found forbidden pattern ${pattern.name}`);
    }
  }
  console.log("✓ Static Read-Only Safety Check: 0 Firestore write methods present.");
  console.log(`✓ Configured Top-Level Collections: ${TOP_LEVEL_COLLECTIONS.length}`);
  if (TOP_LEVEL_COLLECTIONS.length !== 15) {
    throw new Error(
      `Expected exactly 15 top-level collections, got ${TOP_LEVEL_COLLECTIONS.length}`,
    );
  }

  // Helper to build an in-memory mock Firestore DB for self-testing
  function createMockDb(initialData = {}) {
    return {
      collection(colPath) {
        const docsObj = initialData[colPath] || {};
        return {
          async get() {
            return {
              docs: Object.entries(docsObj).map(([id, data]) => ({
                id,
                data: () => data,
              })),
            };
          },
        };
      },
    };
  }

  const ts1 = new Timestamp(1710000000, 123456000);
  const ts1Clone = new Timestamp(1710000000, 123456000);
  const tsNanoMismatch = new Timestamp(1710000000, 999999000);

  const baseDataset = {
    users: {
      [CRITICAL_PARAMEDIC_UID]: {
        role: "paramedic_nurse",
        active: true,
        accountKey: "paramedic_nurse_main",
        displayName: "Paramedic Staff",
        email: "staff_paramedic_nurse@auth.local",
        createdAt: ts1,
      },
    },
    rheumatology_appointments: {
      "RHEUM-001": {
        facilityId: "hospital_kota_tinggi",
        patientName: "Test Patient",
        status: "Pending Doctor Review",
        createdAt: ts1,
      },
    },
    "rheumatology_appointments/RHEUM-001/attachments": {
      "ATT-01": {
        fileName: "referral.pdf",
        uploadedAt: ts1,
      },
    },
    "rheumatology_appointments/RHEUM-001/attachment_control": {
      quota: {
        activeCount: 1,
        updatedAt: ts1,
      },
    },
  };

  const matchingTargetDataset = {
    users: {
      [CRITICAL_PARAMEDIC_UID]: {
        role: "paramedic_nurse",
        active: true,
        accountKey: "paramedic_nurse_main",
        displayName: "Paramedic Staff",
        email: "staff_paramedic_nurse@auth.local",
        createdAt: ts1Clone,
      },
    },
    rheumatology_appointments: {
      "RHEUM-001": {
        facilityId: "hospital_kota_tinggi",
        patientName: "Test Patient",
        status: "Pending Doctor Review",
        createdAt: ts1Clone,
      },
    },
    "rheumatology_appointments/RHEUM-001/attachments": {
      "ATT-01": {
        fileName: "referral.pdf",
        uploadedAt: ts1Clone,
      },
    },
    "rheumatology_appointments/RHEUM-001/attachment_control": {
      quota: {
        activeCount: 1,
        updatedAt: ts1Clone,
      },
    },
  };

  // Test 1: Exact match passes
  const passReport = await verifyDatabaseParity(
    createMockDb(baseDataset),
    createMockDb(matchingTargetDataset),
  );
  if (!passReport.passed) {
    throw new Error(
      `Self-test 1 failed: expected exact dataset to pass, got ${JSON.stringify(passReport)}`,
    );
  }
  console.log(
    "✓ Self-Test 1 Passed: Exact 15-collection + subcollection + Timestamp parity passes.",
  );

  // Test 2: Stripped mirror document in (default) is caught
  const strippedTargetDataset = {
    ...matchingTargetDataset,
    users: {
      [CRITICAL_PARAMEDIC_UID]: {
        role: "paramedic_nurse",
        active: true,
        accountKey: "paramedic_nurse_main",
        // displayName, email, createdAt intentionally stripped
      },
    },
  };
  const strippedReport = await verifyDatabaseParity(
    createMockDb(baseDataset),
    createMockDb(strippedTargetDataset),
  );
  if (strippedReport.passed || strippedReport.allFieldMismatches.length === 0) {
    throw new Error("Self-test 2 failed: stripped mirror document was not detected!");
  }
  console.log(
    "✓ Self-Test 2 Passed: Stripped mirror payload missing full profile fields is caught.",
  );

  // Test 3: Extra target document in (default) is caught
  const extraTargetDataset = {
    ...matchingTargetDataset,
    users: {
      ...matchingTargetDataset.users,
      "STALE-MIRROR-UID-999": { role: "facility", active: false },
    },
  };
  const extraReport = await verifyDatabaseParity(
    createMockDb(baseDataset),
    createMockDb(extraTargetDataset),
  );
  if (extraReport.passed || !extraReport.allExtraInTarget.includes("users/STALE-MIRROR-UID-999")) {
    throw new Error("Self-test 3 failed: extra target document in (default) was not detected!");
  }
  console.log("✓ Self-Test 3 Passed: Extra target document in (default) is caught.");

  // Test 4: Timestamp nanosecond mismatch is caught
  const nanoMismatchDataset = {
    ...matchingTargetDataset,
    "rheumatology_appointments/RHEUM-001/attachments": {
      "ATT-01": {
        fileName: "referral.pdf",
        uploadedAt: tsNanoMismatch,
      },
    },
  };
  const nanoReport = await verifyDatabaseParity(
    createMockDb(baseDataset),
    createMockDb(nanoMismatchDataset),
  );
  if (nanoReport.passed || nanoReport.allFieldMismatches.length === 0) {
    throw new Error(
      "Self-test 4 failed: Timestamp nanosecond mismatch in subcollection was not detected!",
    );
  }
  console.log(
    "✓ Self-Test 4 Passed: Native Timestamp nanosecond mismatch in subcollection is caught.",
  );

  // Test 5: Snapshot source count baseline
  const snapshotReport = await runSourceCountSnapshot(createMockDb(baseDataset));
  if (
    snapshotReport.totalTopLevelDocs !== 2 ||
    snapshotReport.totalSubcollectionDocs !== 2 ||
    snapshotReport.grandTotal !== 4
  ) {
    throw new Error(
      `Self-test 5 failed: expected 2 top-level, 2 subcol, 4 total, got ${snapshotReport.grandTotal} (top: ${snapshotReport.totalTopLevelDocs}, sub: ${snapshotReport.totalSubcollectionDocs})`,
    );
  }
  console.log("✓ Self-Test 5 Passed: Frozen source baseline document count matches exact totals.");

  console.log("==================================================================");
  console.log("ALL SELF-TESTS PASSED (0 WRITE OPERATIONS, 100% PARITY LOGIC VERIFIED)");
  console.log("==================================================================");
}

async function main() {
  if (process.argv.includes("--self-test") || process.argv.includes("--static-check")) {
    await runSelfTest();
    return;
  }

  const isInventoryOnly = process.argv.includes("--inventory-target");
  const isSnapshotSource = process.argv.includes("--snapshot-source-count");

  console.log("==================================================================");
  console.log(
    isSnapshotSource
      ? "HOSPITALHUB FROZEN SOURCE DATABASE SNAPSHOT DOCUMENT COUNT"
      : isInventoryOnly
        ? "HOSPITALHUB TARGET (default) DATABASE READ-ONLY INVENTORY"
        : "HOSPITALHUB FIRESTORE MIGRATION PARITY VERIFICATION (READ-ONLY)",
  );
  console.log("==================================================================");
  console.log(`Firebase Project:        ${PROJECT_ID}`);
  console.log(`Source Named Database:   ${SOURCE_DATABASE_ID}`);
  console.log(`Target Default Database: ${TARGET_DATABASE_ID}`);
  console.log(
    `Mode:                    ${
      isSnapshotSource
        ? "FROZEN SOURCE SNAPSHOT COUNT"
        : isInventoryOnly
          ? "TARGET INVENTORY"
          : "FULL PARITY CHECK"
    }`,
  );
  console.log("==================================================================\n");

  let app;
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath && fs.existsSync(credPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(credPath, "utf-8"));
    app = initializeApp({ credential: cert(serviceAccount), projectId: PROJECT_ID });
  } else if (getApps().length > 0) {
    app = getApps()[0];
  } else {
    app = initializeApp({ projectId: PROJECT_ID });
  }

  const sourceDb = getFirestore(app, SOURCE_DATABASE_ID);
  const targetDb = getFirestore(app);

  if (isSnapshotSource) {
    const snapshot = await runSourceCountSnapshot(sourceDb);
    console.log("Collection Breakdown (Source Named DB):");
    for (const item of snapshot.collectionCounts) {
      const subInfo = item.subcolCount > 0 ? ` (+ ${item.subcolCount} subcollection docs)` : "";
      console.log(
        `  - ${item.collection.padEnd(28)} : ${String(item.count).padStart(5)}${subInfo}`,
      );
      if (item.subcolDetails && item.subcolDetails.length > 0) {
        for (const sub of item.subcolDetails) {
          console.log(`      * ${sub.path.padEnd(50)} : ${sub.count}`);
        }
      }
    }
    console.log("------------------------------------------------------------------");
    console.log(
      `Total Top-Level Documents:       ${String(snapshot.totalTopLevelDocs).padStart(5)}`,
    );
    console.log(
      `Total Subcollection Documents:   ${String(snapshot.totalSubcollectionDocs).padStart(5)}`,
    );
    console.log(`GRAND TOTAL (BASELINE N_frozen): ${String(snapshot.grandTotal).padStart(5)}`);
    console.log("==================================================================");
    console.log(`[FROZEN SOURCE BASELINE] TOTAL_DOCUMENTS: ${snapshot.grandTotal}`);
    console.log("==================================================================");
    process.exit(0);
  }

  if (isInventoryOnly) {
    const inventory = await runTargetInventory(sourceDb, targetDb);
    console.log("Collection Inventory Summary (Source vs Target (default)):");
    for (const item of inventory.collectionInventories) {
      console.log(
        `  - ${item.collection.padEnd(28)} | Source: ${String(item.sourceCount).padStart(5)} | Target (default): ${String(item.targetCount).padStart(5)} | Extra in Target: ${item.extraInTargetCount}`,
      );
    }
    console.log(`\nTotal Target Top-Level Docs:      ${inventory.totalTargetTopLevelDocs}`);
    console.log(`Total Target Subcollection Docs:  ${inventory.totalTargetSubcollectionDocs}`);
    console.log(`Extra Target Docs Absent in Src:  ${inventory.allExtraTargetDocs.length}`);

    if (inventory.allExtraTargetDocs.length > 0) {
      console.log("\nExtra Target Documents in (default) Absent from Source Named DB:");
      for (const docPath of inventory.allExtraTargetDocs) {
        console.log(`  ! ${docPath}`);
      }
      process.exit(2);
    }
    return;
  }

  const report = await verifyDatabaseParity(sourceDb, targetDb);

  console.log("1. Top-Level Collection Parity (15 Collections):");
  for (const col of report.collectionResults) {
    const statusIcon = col.passed ? "✓ PASS" : "✗ FAIL";
    console.log(
      `  ${statusIcon} | ${col.collectionPath.padEnd(28)} | Source: ${String(col.sourceCount).padStart(5)} | Target: ${String(col.targetCount).padStart(5)} | Missing: ${col.missingInTarget.length} | Extra: ${col.extraInTarget.length} | Field Mismatches: ${col.fieldMismatches.length}`,
    );
  }

  console.log(
    `\n2. Rheumatology Nested Subcollections Checked: ${report.subcollectionResults.length}`,
  );
  const failedSubs = report.subcollectionResults.filter((s) => !s.passed);
  if (failedSubs.length === 0) {
    console.log(
      "  ✓ PASS | All rheumatology attachments and attachment_control subcollections match.",
    );
  } else {
    for (const sub of failedSubs) {
      console.log(
        `  ✗ FAIL | ${sub.collectionPath} | Source: ${sub.sourceCount} | Target: ${sub.targetCount} | Missing: ${sub.missingInTarget.length} | Extra: ${sub.extraInTarget.length} | Field Mismatches: ${sub.fieldMismatches.length}`,
      );
    }
  }

  console.log(`\n3. Critical Account Check (${CRITICAL_PARAMEDIC_UID}):`);
  console.log(
    `  ${report.criticalUserPassed ? "✓ PASS" : "✗ FAIL"} | ${report.criticalUserDetails}`,
  );

  if (report.allMissingInTarget.length > 0) {
    console.error(
      `\n❌ Missing Documents in Target (default) (${report.allMissingInTarget.length}):`,
    );
    report.allMissingInTarget.slice(0, 50).forEach((p) => console.error(`  - ${p}`));
  }

  if (report.allExtraInTarget.length > 0) {
    console.error(
      `\n❌ Extra Documents in Target (default) Absent from Source (${report.allExtraInTarget.length}):`,
    );
    report.allExtraInTarget.slice(0, 50).forEach((p) => console.error(`  - ${p}`));
  }

  if (report.allFieldMismatches.length > 0) {
    console.error(
      `\n❌ Document Field / Timestamp Mismatches (${report.allFieldMismatches.length}):`,
    );
    report.allFieldMismatches.slice(0, 25).forEach((m) => {
      console.error(
        `  - ${m.docPath} (sourceFields=${m.sourceFieldCount}, targetFields=${m.targetFieldCount}):`,
      );
      m.diffs.slice(0, 10).forEach((d) => console.error(`      * ${d}`));
    });
  }

  console.log("\n==================================================================");
  if (report.passed) {
    console.log("✓ MIGRATION PARITY VERIFICATION PASSED (100% EXACT MATCH)");
    console.log("==================================================================");
    process.exit(0);
  } else {
    console.error("✗ MIGRATION PARITY VERIFICATION FAILED — DO NOT CUT OVER");
    console.log("==================================================================");
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("Verification script error:", err);
    process.exit(1);
  });
}
