/**
 * Trusted Legacy Base64 Medical Report Migration Script
 *
 * This script searches Firestore collections for legacy appointment and outsource
 * report documents that contain embedded Base64/dataUrl payloads, decodes them,
 * uploads them securely to Firebase Storage, and updates the Firestore metadata.
 *
 * CRITICAL SAFEGUARDS:
 * 1. Must be executed in a trusted backend environment with Google Cloud / Firebase credentials.
 * 2. Idempotent: Skips documents that already have a valid storagePath.
 * 3. Fail-safe: Preserves legacy dataUrl in Firestore unless Storage upload and Firestore update succeed.
 * 4. Require trustworthy facilityId: Never assigns "general" or fallback facilities. Missing facilityId records are skipped for manual review.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=service-account.json node scripts/migrate-reports-to-storage.js
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import fs from "fs";

const COLLECTIONS_TO_MIGRATE = [
  "outsource_appointments",
  "outsource_reports",
  "echo_appointments",
  "stress_test_appointments",
  "holter_appointments",
  "blood_pressure_appointments",
  "lung_function_appointments",
  "rheumatology_appointments",
];

function decodeDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
    return null;
  }
  const parts = dataUrl.split(",");
  if (parts.length < 2) return null;

  const header = parts[0];
  const base64Data = parts[1];
  const mimeMatch = header.match(/data:(.*?);/);
  const mimeType = mimeMatch ? mimeMatch[1] : "application/pdf";
  const buffer = Buffer.from(base64Data, "base64");

  return { buffer, mimeType };
}

async function runMigration() {
  console.log("Starting medical report file migration to Firebase Storage...\n");

  let app;
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath && fs.existsSync(credPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(credPath, "utf-8"));
    app = initializeApp({ credential: cert(serviceAccount) });
  } else {
    app = initializeApp();
  }

  const db = getFirestore(app);
  const bucket = getStorage(app).bucket();

  let totalInspected = 0;
  let alreadyMigrated = 0;
  let successfullyMigrated = 0;
  let skippedMissingFacility = 0;
  let skippedInvalidFile = 0;
  let totalFailed = 0;

  for (const colName of COLLECTIONS_TO_MIGRATE) {
    console.log(`Checking collection: ${colName}...`);
    const snapshot = await db.collection(colName).get();

    for (const docSnap of snapshot.docs) {
      totalInspected++;
      const data = docSnap.data();
      const docId = docSnap.id;

      // Check resultFile or attachedReport for legacy file data
      const targetFileObj = data.resultFile || data.attachedReport;
      const dataUrl = targetFileObj?.dataUrl || targetFileObj?.fileData;

      if (!dataUrl) {
        continue;
      }

      if (targetFileObj.storagePath) {
        console.log(`- Document ${docId} already has storagePath. Skipping.`);
        alreadyMigrated++;
        continue;
      }

      // REQUIRE TRUSTWORTHY facilityId
      if (typeof data.facilityId !== "string" || !data.facilityId.trim()) {
        console.warn(`Skipping report ${docId}: missing valid facilityId; manual review required.`);
        skippedMissingFacility++;
        continue;
      }

      const facilityId = data.facilityId.trim();

      try {
        const decoded = decodeDataUrl(dataUrl);
        if (!decoded) {
          console.warn(`Skipping report ${docId}: invalid legacy dataUrl format.`);
          skippedInvalidFile++;
          continue;
        }

        const rawFileName = targetFileObj.fileName || `report_${docId}.pdf`;
        const sanitizedFileName = rawFileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const isOutsource = colName.startsWith("outsource");
        const rootPrefix = isOutsource ? "outsource" : "facilities";
        const storagePath = `${rootPrefix}/${facilityId}/reports/${docId}/${sanitizedFileName}`;

        console.log(
          `- Uploading document ${docId} file to ${storagePath} (${decoded.buffer.length} bytes)...`,
        );

        const file = bucket.file(storagePath);
        await file.save(decoded.buffer, {
          metadata: {
            contentType: decoded.mimeType,
            metadata: {
              facilityId,
              reportId: docId,
              migratedFromBase64: "true",
            },
          },
        });

        // Update Firestore document with storage metadata and remove legacy Base64 only after successful upload
        const updatedResultFile = {
          storagePath,
          fileName: rawFileName,
          contentType: decoded.mimeType,
          fileSize: decoded.buffer.length,
          uploadedAt: targetFileObj.uploadedAt || new Date().toISOString(),
          summaryNotes: targetFileObj.summaryNotes || "Migrated to Firebase Storage",
        };

        const updatePayload = {
          resultFile: updatedResultFile,
          updatedAt: new Date().toISOString(),
        };

        if (data.attachedReport) {
          updatePayload.attachedReport = {
            storagePath,
            fileName: rawFileName,
            fileSize: decoded.buffer.length,
            fileType: decoded.mimeType,
            uploadedAt: targetFileObj.uploadedAt || new Date().toISOString(),
          };
        }

        await docSnap.ref.update(updatePayload);
        console.log(`  ✓ Successfully migrated document ${docId} and updated Firestore metadata.`);
        successfullyMigrated++;
      } catch (err) {
        console.error(`  ✗ Error migrating document ${docId}:`, err);
        totalFailed++;
      }
    }
  }

  console.log("\n=================================");
  console.log("Migration Summary:");
  console.log(`- Total Inspected:            ${totalInspected}`);
  console.log(`- Already Migrated:           ${alreadyMigrated}`);
  console.log(`- Successfully Migrated:      ${successfullyMigrated}`);
  console.log(`- Skipped (Missing facilityId): ${skippedMissingFacility}`);
  console.log(`- Skipped (Invalid file):     ${skippedInvalidFile}`);
  console.log(`- Failed:                     ${totalFailed}`);
  console.log("=================================\n");
}

runMigration().catch((err) => {
  console.error("Migration failed with fatal error:", err);
  process.exit(1);
});
