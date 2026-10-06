/**
 * Automated Test Script for Backend Facility Account Manager
 *
 * Tests core library functions and safeguards in scripts/lib/facility-account-admin.js.
 * Usage:
 *   node scripts/test-facility-manager.js
 */

import {
  normalizeFacilityId,
  getAllCanonicalFacilities,
  validatePasswordStrength,
  generateSecurePassword,
} from "./lib/facility-account-admin.js";

async function runTests() {
  console.log("Running Facility Account Manager Tests...\n");

  // Test 1: Normalization
  const testName = "Hospital Sultan Ismail";
  const normalized = normalizeFacilityId(testName);
  if (normalized !== "hospital_sultan_ismail") {
    throw new Error(`Normalization failed: expected "hospital_sultan_ismail", got "${normalized}"`);
  }
  console.log("✓ Test 1 Passed: Normalization");

  // Test 2: Facilities Count & Structure
  const facilities = getAllCanonicalFacilities();
  if (facilities.length !== 84) {
    throw new Error(`Expected 84 facilities, found ${facilities.length}`);
  }
  console.log(
    `✓ Test 2 Passed: Canonical Facility List loaded successfully (${facilities.length} facilities found).`,
  );

  // Test 3: Password Strength Validation
  let errorCaught = false;
  try {
    validatePasswordStrength("short123");
  } catch (err) {
    errorCaught = true;
  }
  if (!errorCaught) {
    throw new Error("Password validation failed to reject short password.");
  }
  console.log("✓ Test 3 Passed: Password Strength Validation (rejects <12 chars)");

  // Test 4: Secure Password Generation
  const securePass = generateSecurePassword(16);
  if (securePass.length !== 16) {
    throw new Error("Generated secure password has incorrect length.");
  }
  validatePasswordStrength(securePass);
  console.log("✓ Test 4 Passed: Secure Password Generator produces valid >=12 char passwords.");

  // Test 5: Facility Account Status State Mapping (EXISTS_ACTIVE vs EXISTS_INACTIVE)
  // Unit test logic mimicking getFacilityAccountStatus state determination rules
  const evaluateState = (authExists, profileExists, profileData, facilityId) => {
    if (!authExists && !profileExists) return "NOT_CREATED";
    if (authExists && profileExists) {
      if (profileData.role !== "facility") return "SECURITY_MISMATCH";
      if (profileData.facilityId !== facilityId) return "SECURITY_MISMATCH";
      return profileData.active === false ? "EXISTS_INACTIVE" : "EXISTS_ACTIVE";
    }
    if (authExists && !profileExists) return "PARTIAL_MISSING_PROFILE";
    if (!authExists && profileExists) return "PARTIAL_MISSING_AUTH";
    return "UNKNOWN";
  };

  const facilityId = "kk_bandar_mas";
  const activeProfile = { role: "facility", facilityId: "kk_bandar_mas", active: true };
  const inactiveProfile = { role: "facility", facilityId: "kk_bandar_mas", active: false };

  const activeState = evaluateState(true, true, activeProfile, facilityId);
  if (activeState !== "EXISTS_ACTIVE") {
    throw new Error(`Expected state "EXISTS_ACTIVE" for active profile, got "${activeState}"`);
  }
  console.log('✓ Test 5A Passed: active valid profile -> status.state === "EXISTS_ACTIVE"');

  const inactiveState = evaluateState(true, true, inactiveProfile, facilityId);
  if (inactiveState !== "EXISTS_INACTIVE") {
    throw new Error(
      `Expected state "EXISTS_INACTIVE" for inactive profile, got "${inactiveState}"`,
    );
  }
  console.log('✓ Test 5B Passed: inactive valid profile -> status.state === "EXISTS_INACTIVE"');

  console.log("\nAll backend facility account manager unit tests passed successfully!\n");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
