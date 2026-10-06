/**
 * Trusted Facility Password Reset Script
 *
 * Uses shared backend library scripts/lib/facility-account-admin.js.
 *
 * Usage:
 *   node scripts/reset-facility-password.js <facilityId>
 */

import {
  normalizeFacilityId,
  getFacilityAccountStatus,
  resetFacilityPassword,
  getAllCanonicalFacilities,
} from "./lib/facility-account-admin.js";
import { getSecurePasswordInput } from "./prompt-helper.js";

const CANONICAL_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

async function main() {
  const rawFacilityId = process.argv[2];

  if (!rawFacilityId || !rawFacilityId.trim()) {
    console.error("Usage: node scripts/reset-facility-password.js <facilityId>");
    console.error("Example: node scripts/reset-facility-password.js kk_masai");
    process.exit(1);
  }

  const facilityId = normalizeFacilityId(rawFacilityId);

  // Validate facilityId against explicit canonical registry
  const canonicalFacilities = getAllCanonicalFacilities();
  const existsInRegistry = canonicalFacilities.some((f) => f.facilityId === facilityId);
  if (!existsInRegistry) {
    console.error(
      `❌ [RESET PASSWORD FAILED]: facilityId '${facilityId}' does not exist in the explicit canonical facility registry!`,
    );
    console.error(`Please use an immutable canonical facilityId from src/data/facilities.ts.`);
    process.exit(1);
  }

  if (!CANONICAL_ID_REGEX.test(facilityId)) {
    console.error(
      `Invalid facilityId format "${rawFacilityId}". Only alphanumeric, hyphens, and underscores are allowed.`,
    );
    process.exit(1);
  }

  try {
    const status = await getFacilityAccountStatus(facilityId);

    if (status.state === "NOT_CREATED") {
      console.error(
        `Error: No existing Firebase Auth user found for ${status.email}. Reset aborted.`,
      );
      console.error(`If this facility does not exist yet, run provision-facility.js first.`);
      process.exit(1);
    }

    if (status.state !== "EXISTS_ACTIVE" && status.state !== "EXISTS_INACTIVE") {
      console.error(
        `Error: Account is in state "${status.state}": ${status.details}. Reset aborted.`,
      );
      process.exit(1);
    }

    const profile = status.profileData;
    if (profile.role !== "facility" || profile.facilityId !== facilityId) {
      console.error(
        `Profile Mismatch: Document users/${status.uid} has role "${profile.role}" and facilityId "${profile.facilityId}". Target expected role "facility" and facilityId "${facilityId}". Aborting.`,
      );
      process.exit(1);
    }

    console.log(`\nTarget Facility ID: ${facilityId}`);
    console.log(
      `Password Requirements: Minimum 8 characters (at least 1 letter, at least 1 number).`,
    );
    const newPassword = await getSecurePasswordInput("FACILITY_PASSWORD", "New Facility Password");

    await resetFacilityPassword(facilityId, newPassword);

    console.log(`\n✓ Successfully reset password for facility "${facilityId}":`);
    console.log(`- Auth Email: ${status.email}`);
    console.log(`- UID: ${status.uid}`);
    console.log(`- Canonical facilityId: ${facilityId}`);
    console.log(`- Profile Active Status: ${profile.active}`);
    console.log(`- Stable Identity Maintained: YES\n`);
  } catch (err) {
    console.error("Error resetting facility password:", err.message || err);
    process.exit(1);
  }
}

main();
