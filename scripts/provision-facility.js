/**
 * Trusted Facility Provisioning Script
 *
 * Uses shared backend library scripts/lib/facility-account-admin.js.
 * PROVISIONING IS CREATE-ONLY.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=service-account.json node scripts/provision-facility.js <facilityId> <facilityName> [category]
 */

import {
  normalizeFacilityId,
  getFacilityAccountStatus,
  provisionFacilityAccount,
  getAllCanonicalFacilities,
} from "./lib/facility-account-admin.js";
import { getSecurePasswordInput } from "./prompt-helper.js";

async function main() {
  const rawFacilityId = process.argv[2];
  const facilityName = process.argv[3];
  const category = process.argv[4] || "Klinik Kesihatan";

  if (!rawFacilityId || !facilityName) {
    console.error(
      "Usage: node scripts/provision-facility.js <facilityId> <facilityName> [category]",
    );
    console.error(
      'Example: node scripts/provision-facility.js kk_masai "Klinik Kesihatan Masai" "Klinik Kesihatan"',
    );
    process.exit(1);
  }

  const facilityId = normalizeFacilityId(rawFacilityId);

  // Validate facilityId against explicit canonical registry
  const canonicalFacilities = getAllCanonicalFacilities();
  const existsInRegistry = canonicalFacilities.some((f) => f.facilityId === facilityId);
  if (!existsInRegistry) {
    console.error(
      `❌ [PROVISIONING FAILED]: facilityId '${facilityId}' does not exist in the explicit canonical facility registry!`,
    );
    console.error(`Please use an immutable canonical facilityId from src/data/facilities.ts.`);
    process.exit(1);
  }

  // Check status first
  try {
    const status = await getFacilityAccountStatus(facilityId);

    if (status.state === "EXISTS_ACTIVE" || status.state === "EXISTS_INACTIVE") {
      console.log(
        `\n[PROVISIONING ABORTED] Facility authentication account already exists for ${status.email} (UID: ${status.uid}).`,
      );
      console.log(
        `Provisioning is CREATE-ONLY and does NOT overwrite passwords of existing accounts.`,
      );
      console.log(
        `To change the password for an existing facility, execute:\n  node scripts/reset-facility-password.js ${facilityId}\n`,
      );
      process.exit(0);
    }

    if (status.state !== "NOT_CREATED") {
      console.error(
        `[INCONSISTENCY DETECTED] Account is in state "${status.state}": ${status.details}. Provisioning aborted. Manual administrative review required.`,
      );
      process.exit(1);
    }

    console.log(`\nProvisioning NEW Facility Account: ${facilityName} (${facilityId})`);
    console.log(
      `Password Requirements: Minimum 8 characters (at least 1 letter, at least 1 number).`,
    );
    const password = await getSecurePasswordInput("FACILITY_PASSWORD", "Facility Password");

    const result = await provisionFacilityAccount(facilityId, facilityName, category, password);

    console.log(`\n✓ Successfully provisioned trusted facility profile for ${facilityName}:`);
    console.log(`- Auth Email: ${result.email}`);
    console.log(`- UID: ${result.uid}`);
    console.log(`- Canonical facilityId: ${result.facilityId}`);
    console.log(`- Role: facility`);
    console.log(`- Active: true\n`);
  } catch (err) {
    console.error("Error provisioning facility:", err.message || err);
    process.exit(1);
  }
}

main();
