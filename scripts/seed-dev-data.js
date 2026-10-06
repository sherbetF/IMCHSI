/**
 * Development-Only Database Seeding Script
 *
 * CRITICAL SAFETY SAFEGUARDS:
 * 1. This script is strictly for local emulator / isolated development environments.
 * 2. It will NEVER run automatically from the React frontend or production build.
 * 3. It will ABORT execution unless `ALLOW_DEV_SEED=true` is explicitly passed in the environment.
 * 4. It only creates clearly synthetic, fictional test fixtures.
 *
 * Usage:
 *   ALLOW_DEV_SEED=true GOOGLE_APPLICATION_CREDENTIALS=service-account.json node scripts/seed-dev-data.js
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";

async function seedDevData() {
  if (process.env.ALLOW_DEV_SEED !== "true") {
    console.error(
      "SAFETY ERROR: Dev seeding requires explicit environment confirmation: ALLOW_DEV_SEED=true",
    );
    console.error("Seeding aborted to prevent accidental writes to production databases.");
    process.exit(1);
  }

  let app;
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath && fs.existsSync(credPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(credPath, "utf-8"));
    app = initializeApp({ credential: cert(serviceAccount) });
  } else {
    app = initializeApp();
  }

  const db = getFirestore(app);
  console.log("Connected to Firestore. Verifying environment before dev seeding...");

  // Clearly fictional synthetic dev fixture
  const devFixtures = [
    {
      collection: "echo_appointments",
      data: {
        id: "ECHO-DEV-0001",
        facilityId: "hospital_sultan_ismail",
        facilityName: "Hospital Sultan Ismail",
        facilityCategory: "Hospital",
        patientName: "Dev Test Patient",
        mrn: "DEV-MRN-9999",
        contactNumber: "+60 12-000 0000",
        email: "dev.test@simulator.local",
        procedureType: "Transthoracic Echocardiogram (TTE)",
        urgency: "Routine",
        referringDoctor: "Dr. Dev Simulator (Internal Medicine)",
        department: "General Medicine",
        clinicalIndication: "Synthetic Test Indication",
        diagnosis: "Synthetic Test Diagnosis",
        status: "Pending Confirmation",
        createdAt: new Date().toISOString(),
      },
    },
  ];

  for (const item of devFixtures) {
    await db.collection(item.collection).doc(item.data.id).set(item.data, { merge: true });
    console.log(`[DEV SEEDED] Document ${item.data.id} in ${item.collection}`);
  }

  console.log("\nDev seeding completed successfully.");
}

seedDevData().catch((err) => {
  console.error("Dev seed failed:", err);
  process.exit(1);
});
