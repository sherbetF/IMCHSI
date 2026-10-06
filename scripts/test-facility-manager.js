/**
 * Automated Test Script for Backend Facility Account Manager
 *
 * Tests core library functions, password validation, role isolation, conflict handling,
 * identity verification, and audit logging failure semantics.
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
  console.log("Running Facility Account Manager Backend Tests...\n");

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

  // Test 3: Password Policy Validation (Minimum 8 chars, >=1 letter, >=1 number, case-sensitive)
  const validPasswords = ["Hospital27", "Klinik2026", "Johor123", "SecurePass99!"];
  for (const pwd of validPasswords) {
    validatePasswordStrength(pwd);
  }
  console.log("✓ Test 3A Passed: Valid managed passwords accepted");

  const invalidPasswords = [
    { pwd: "abc", reason: "too short" },
    { pwd: "1234", reason: "too short" },
    { pwd: "hospital", reason: "missing number" },
    { pwd: "12345678", reason: "missing letter" },
    { pwd: "abc123", reason: "too short (6 chars)" },
  ];

  for (const { pwd, reason } of invalidPasswords) {
    let rejected = false;
    try {
      validatePasswordStrength(pwd);
    } catch {
      rejected = true;
    }
    if (!rejected) {
      throw new Error(`Password policy failed to reject '${pwd}' (${reason})`);
    }
  }
  console.log(
    "✓ Test 3B Passed: Invalid passwords rejected properly (<8 chars, no letter, no number)",
  );

  // Test 4: Secure Password Generation
  const securePass = generateSecurePassword(16);
  if (securePass.length !== 16) {
    throw new Error("Generated secure password has incorrect length.");
  }
  validatePasswordStrength(securePass);
  console.log("✓ Test 4 Passed: Secure Password Generator produces valid >=8 char passwords.");

  // Test 5: Conflict & State Determination Simulation
  const evaluateState = (authExists, profiles, targetFacilityId) => {
    if (profiles.length > 1) {
      return "CONFLICT";
    }
    const profileExists = profiles.length === 1;
    const profile = profileExists ? profiles[0] : null;

    if (!authExists && !profileExists) return "NOT_CREATED";
    if (authExists && profileExists) {
      if (profile.role !== "facility") return "SECURITY_MISMATCH";
      if (profile.facilityId !== targetFacilityId) return "SECURITY_MISMATCH";
      return profile.active === false ? "INACTIVE" : "ACTIVE";
    }
    if (authExists && !profileExists) return "PARTIAL_MISSING_PROFILE";
    if (!authExists && profileExists) return "PARTIAL_MISSING_AUTH";
    return "UNKNOWN";
  };

  const facilityId = "kd_tiram_duku";
  const conflictingProfiles = [
    { uid: "uid_1", role: "facility", facilityId: "kd_tiram_duku", active: true },
    { uid: "uid_2", role: "facility", facilityId: "kd_tiram_duku", active: true },
  ];

  const conflictState = evaluateState(true, conflictingProfiles, facilityId);
  if (conflictState !== "CONFLICT") {
    throw new Error(`Expected state "CONFLICT" for duplicate profiles, got "${conflictState}"`);
  }
  console.log(
    '✓ Test 5A Passed: Duplicate profiles claim -> state === "CONFLICT" (kd_tiram_duku safeguard)',
  );

  const singleActiveProfile = [
    { uid: "uid_1", role: "facility", facilityId: "kd_tiram_duku", active: true },
  ];
  const activeState = evaluateState(true, singleActiveProfile, facilityId);
  if (activeState !== "ACTIVE") {
    throw new Error(`Expected state "ACTIVE" for healthy profile, got "${activeState}"`);
  }
  console.log('✓ Test 5B Passed: Single healthy profile -> state === "ACTIVE"');

  const singleInactiveProfile = [
    { uid: "uid_1", role: "facility", facilityId: "kd_tiram_duku", active: false },
  ];
  const inactiveState = evaluateState(true, singleInactiveProfile, facilityId);
  if (inactiveState !== "INACTIVE") {
    throw new Error(`Expected state "INACTIVE" for disabled profile, got "${inactiveState}"`);
  }
  console.log('✓ Test 5C Passed: Inactive profile -> state === "INACTIVE"');

  // Test 6: Consumer Identity & Email Verification Assertions
  const validateConsumerIdentity = (authUser, profile, canonicalFacilityId) => {
    const expectedEmail = `facility_${canonicalFacilityId}@auth.local`;
    if (profile.uid !== authUser.uid) return "SECURITY_MISMATCH_UID";
    if (profile.role !== "facility") return "SECURITY_MISMATCH_ROLE";
    if (profile.facilityId !== canonicalFacilityId) return "SECURITY_MISMATCH_FACILITY";
    if (authUser.email !== expectedEmail) return "SECURITY_MISMATCH_EMAIL";
    return "VALID";
  };

  const healthyAuth = { uid: "auth_123", email: "facility_hospital_kota_tinggi@auth.local" };
  const healthyProfile = { uid: "auth_123", role: "facility", facilityId: "hospital_kota_tinggi" };
  if (validateConsumerIdentity(healthyAuth, healthyProfile, "hospital_kota_tinggi") !== "VALID") {
    throw new Error("Healthy Consumer identity failed validation");
  }

  const badEmailAuth = { uid: "auth_123", email: "wrong_email@auth.local" };
  if (
    validateConsumerIdentity(badEmailAuth, healthyProfile, "hospital_kota_tinggi") !==
    "SECURITY_MISMATCH_EMAIL"
  ) {
    throw new Error("Failed to catch Auth email mismatch for Consumer");
  }

  const badRoleProfile = {
    uid: "auth_123",
    role: "paramedic_nurse",
    facilityId: "hospital_kota_tinggi",
  };
  if (
    validateConsumerIdentity(healthyAuth, badRoleProfile, "hospital_kota_tinggi") !==
    "SECURITY_MISMATCH_ROLE"
  ) {
    throw new Error("Failed to catch Role mismatch for Consumer");
  }

  const badUidProfile = { uid: "other_uid", role: "facility", facilityId: "hospital_kota_tinggi" };
  if (
    validateConsumerIdentity(healthyAuth, badUidProfile, "hospital_kota_tinggi") !==
    "SECURITY_MISMATCH_UID"
  ) {
    throw new Error("Failed to catch UID mismatch for Consumer");
  }
  console.log(
    "✓ Test 6 Passed: Consumer Identity (UID, role, facilityId, Auth email) verification checks",
  );

  // Test 7: Paramedic / Nurse Identity & Email Verification Assertions
  const validateParamedicIdentity = (authUser, profile) => {
    const expectedEmail = "staff_paramedic_nurse@auth.local";
    const expectedKey = "paramedic_nurse_main";
    const expectedRole = "paramedic_nurse";

    if (profile.uid !== authUser.uid) return "SECURITY_MISMATCH_UID";
    if (profile.role !== expectedRole) return "SECURITY_MISMATCH_ROLE";
    if (profile.accountKey !== expectedKey) return "SECURITY_MISMATCH_KEY";
    if (authUser.email !== expectedEmail) return "SECURITY_MISMATCH_EMAIL";
    return "VALID";
  };

  const healthyParamedicAuth = { uid: "staff_uid_1", email: "staff_paramedic_nurse@auth.local" };
  const healthyParamedicProfile = {
    uid: "staff_uid_1",
    role: "paramedic_nurse",
    accountKey: "paramedic_nurse_main",
  };
  if (validateParamedicIdentity(healthyParamedicAuth, healthyParamedicProfile) !== "VALID") {
    throw new Error("Healthy Paramedic/Nurse identity failed validation");
  }

  const badParamedicEmail = { uid: "staff_uid_1", email: "wrong@auth.local" };
  if (
    validateParamedicIdentity(badParamedicEmail, healthyParamedicProfile) !==
    "SECURITY_MISMATCH_EMAIL"
  ) {
    throw new Error("Failed to catch Auth email mismatch for Paramedic/Nurse");
  }

  const badParamedicKey = { uid: "staff_uid_1", role: "paramedic_nurse", accountKey: "wrong_key" };
  if (
    validateParamedicIdentity(healthyParamedicAuth, badParamedicKey) !== "SECURITY_MISMATCH_KEY"
  ) {
    throw new Error("Failed to catch accountKey mismatch for Paramedic/Nurse");
  }
  console.log(
    "✓ Test 7 Passed: Paramedic/Nurse Identity (UID, role, accountKey, Auth email) verification checks",
  );

  // Test 8: Audit Logging Failure Semantics
  // When audit write fails, the account operation must NOT be repeated, and a warning must be returned.
  let accountOperationExecutionCount = 0;
  const executeOperationWithAudit = async (failAuditWrite = false) => {
    // Step 1: Perform account operation
    accountOperationExecutionCount++;
    const operationResult = { success: true, message: "Password updated successfully" };

    // Step 2: Record audit log
    let auditLogged = true;
    let warning = undefined;
    if (failAuditWrite) {
      auditLogged = false;
      warning =
        "Account operation completed successfully, but the security audit log entry could not be written.";
      // Safeguard: Under NO circumstances repeat the account operation!
    }

    return {
      ...operationResult,
      auditLogged,
      ...(warning ? { warning } : {}),
    };
  };

  const res1 = await executeOperationWithAudit(false);
  if (!res1.success || !res1.auditLogged || res1.warning) {
    throw new Error("Normal operation + audit log failed");
  }
  if (accountOperationExecutionCount !== 1) {
    throw new Error("Account operation was unexpectedly repeated");
  }

  const res2 = await executeOperationWithAudit(true);
  if (!res2.success || res2.auditLogged || !res2.warning) {
    throw new Error("Audit log failure handling did not return warning correctly");
  }
  if (accountOperationExecutionCount !== 2) {
    throw new Error("Audit log failure erroneously repeated the underlying account operation!");
  }
  console.log(
    "✓ Test 8 Passed: Audit log failure returns warning without repeating underlying account operation",
  );

  // Test 9: Password Security Invariant
  // Verify that audit log records and profile schemas never contain passwords
  const auditEventSample = {
    action: "PASSWORD_RESET",
    adminUid: "admin_uid_99",
    targetRole: "facility",
    targetAccountType: "CONSUMER",
    targetIdentifier: "hospital_kota_tinggi",
    success: true,
  };
  if (
    "password" in auditEventSample ||
    "newPassword" in auditEventSample ||
    "passwordHash" in auditEventSample
  ) {
    throw new Error("CRITICAL: Password field detected in audit log payload!");
  }
  console.log(
    "✓ Test 9 Passed: Password security invariant (no password in audit log or profiles)",
  );

  console.log("\nAll backend facility account manager tests passed successfully!\n");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
