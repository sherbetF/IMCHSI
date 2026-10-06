/**
 * Secure Backend Facility Account Manager CLI
 *
 * Usage:
 *   node scripts/manage-facilities.js
 *
 * Manages approximately 84 facility accounts using Firebase Admin SDK.
 * Backend-only. Fails closed if credentials are not configured.
 */

import readline from "readline";
import {
  initializeAdminApp,
  getAllCanonicalFacilities,
  getFacilityAccountStatus,
  provisionFacilityAccount,
  resetFacilityPassword,
  setFacilityActiveStatus,
  generateSecurePassword,
  validatePasswordStrength,
} from "./lib/facility-account-admin.js";
import { promptHiddenPassword } from "./prompt-helper.js";

function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function question(rl, query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function promptYesNo(rl, query) {
  const ans = await question(rl, query + " (y/N): ");
  return ans.trim().toLowerCase() === "y" || ans.trim().toLowerCase() === "yes";
}

async function promptConfirmYes(rl, query) {
  const ans = await question(rl, query + ' (Type "YES" to confirm): ');
  return ans.trim() === "YES";
}

async function getPasswordInteractively(rl) {
  const choice = await question(
    rl,
    "\n[1] Enter Password manually\n[2] Generate Secure Password automatically\n[0] Cancel\nSelect password option: ",
  );

  if (choice === "1") {
    console.log("Password requirements: Minimum 12 characters.");
    const pass1 = await promptHiddenPassword("Enter Password: ");
    try {
      validatePasswordStrength(pass1);
    } catch (err) {
      console.log(`Error: ${err.message}`);
      return null;
    }
    const pass2 = await promptHiddenPassword("Confirm Password: ");
    if (pass1 !== pass2) {
      console.log("Error: Password confirmation does not match.");
      return null;
    }
    return pass1;
  } else if (choice === "2") {
    const generated = generateSecurePassword(16);
    console.log("\n==================================================");
    console.log("GENERATED SECURE PASSWORD (SAVE THIS NOW):");
    console.log(generated);
    console.log("==================================================");
    console.log("WARNING: Store/transmit this password securely. It cannot be retrieved later.");
    const confirmed = await promptConfirmYes(rl, "Have you securely saved this password?");
    if (!confirmed) {
      console.log("Password generation cancelled.");
      return null;
    }
    return generated;
  } else {
    return null;
  }
}

async function main() {
  // 1. Initialize Firebase Admin SDK (Fail Closed)
  try {
    initializeAdminApp();
  } catch (err) {
    console.error("\n[FATAL ERROR] Firebase Admin credentials are not configured.");
    console.error(err.message || err);
    console.error(
      "Please set GOOGLE_APPLICATION_CREDENTIALS environment variable or ensure service account is available.",
    );
    process.exit(1);
  }

  const facilities = getAllCanonicalFacilities();

  while (true) {
    // Fetch dynamic statuses for all facilities
    console.log("\nFetching facility account statuses from Firebase...");
    const facilityStatuses = [];
    let accountsCreated = 0;
    let accountsNotCreated = 0;
    let activeCount = 0;
    let inactiveCount = 0;

    for (const fac of facilities) {
      try {
        const st = await getFacilityAccountStatus(fac.facilityId);
        if (st.state === "EXISTS_ACTIVE" || st.state === "EXISTS_INACTIVE") {
          accountsCreated++;
          if (st.state === "EXISTS_ACTIVE") activeCount++;
          else inactiveCount++;
        } else {
          accountsNotCreated++;
        }
        facilityStatuses.push({ ...fac, status: st });
      } catch (err) {
        facilityStatuses.push({
          ...fac,
          status: { state: "ERROR", details: err.message },
        });
        accountsNotCreated++;
      }
    }

    console.clear();
    console.log("========================================");
    console.log("     FACILITY ACCOUNT MANAGEMENT");
    console.log("========================================");
    console.log(`Total Facilities:      ${facilities.length}`);
    console.log(`Accounts Created:      ${accountsCreated}`);
    console.log(`Accounts Not Created:  ${accountsNotCreated}`);
    console.log(`Active:                ${activeCount}`);
    console.log(`Inactive:              ${inactiveCount}`);
    console.log("----------------------------------------");
    console.log("[1] List All Facilities");
    console.log("[2] Search Facility");
    console.log("[3] Filter by Category");
    console.log("[4] Show Facilities Without Accounts");
    console.log("[5] Show Existing Accounts");
    console.log("[6] Create Facility Account");
    console.log("[7] Reset Facility Password");
    console.log("[8] Activate / Deactivate Facility");
    console.log("[9] Inspect Facility Account");
    console.log("[0] Exit");
    console.log("========================================");

    const rl = createInterface();
    const choice = await question(rl, "Select: ");
    rl.close();

    const trimmedChoice = choice.trim();

    if (trimmedChoice === "0") {
      console.log("\nExiting Facility Account Manager safely.");
      process.exit(0);
    }

    if (trimmedChoice === "1") {
      await displayFacilityList(facilityStatuses, "ALL FACILITIES");
    } else if (trimmedChoice === "2") {
      const rlSearch = createInterface();
      const query = await question(rlSearch, "Enter search query (name, ID, category): ");
      rlSearch.close();
      const q = query.trim().toLowerCase();
      const filtered = facilityStatuses.filter(
        (f) =>
          f.facilityName.toLowerCase().includes(q) ||
          f.facilityId.toLowerCase().includes(q) ||
          f.category.toLowerCase().includes(q),
      );
      await displayFacilityList(filtered, `SEARCH RESULTS FOR: "${query}"`);
    } else if (trimmedChoice === "3") {
      const rlCat = createInterface();
      console.log("\nCategories:");
      console.log("[1] Hospital");
      console.log("[2] Klinik Kesihatan (KK)");
      console.log("[3] Klinik Kesihatan Ibu & Anak (KKIA)");
      console.log("[4] Klinik Desa (KD)");
      const catChoice = await question(rlCat, "Select category: ");
      rlCat.close();

      let targetCat = "";
      if (catChoice === "1") targetCat = "Hospital";
      else if (catChoice === "2") targetCat = "Klinik Kesihatan";
      else if (catChoice === "3") targetCat = "Klinik Kesihatan Ibu & Anak";
      else if (catChoice === "4") targetCat = "Klinik Desa";

      if (targetCat) {
        const filtered = facilityStatuses.filter((f) => f.category === targetCat);
        await displayFacilityList(filtered, `CATEGORY: ${targetCat}`);
      } else {
        console.log("Invalid category selection.");
        await pause();
      }
    } else if (trimmedChoice === "4") {
      const withoutAccounts = facilityStatuses.filter((f) => f.status.state === "NOT_CREATED");
      await displayFacilityList(withoutAccounts, "FACILITIES WITHOUT ACCOUNTS");
    } else if (trimmedChoice === "5") {
      const existing = facilityStatuses.filter(
        (f) => f.status.state === "EXISTS_ACTIVE" || f.status.state === "EXISTS_INACTIVE",
      );
      await displayFacilityList(existing, "EXISTING ACCOUNTS");
    } else if (trimmedChoice === "6") {
      await handleCreateAccountFlow(facilityStatuses);
    } else if (trimmedChoice === "7") {
      await handleResetPasswordFlow(facilityStatuses);
    } else if (trimmedChoice === "8") {
      await handleActiveToggleFlow(facilityStatuses);
    } else if (trimmedChoice === "9") {
      await handleInspectFlow(facilityStatuses);
    } else {
      console.log("Invalid option. Please try again.");
      await pause();
    }
  }
}

async function displayFacilityList(list, title) {
  console.clear();
  console.log(`================================================================================`);
  console.log(` ${title} (Total: ${list.length})`);
  console.log(`================================================================================`);
  console.log(
    padEnd("No.", 5) +
      padEnd("Facility ID", 25) +
      padEnd("Facility Name", 35) +
      padEnd("Category", 18) +
      padEnd("Account", 14) +
      padEnd("Status", 10),
  );
  console.log("-".repeat(107));

  list.forEach((item, index) => {
    const num = padEnd(String(index + 1), 5);
    const id = padEnd(item.facilityId, 25);
    const name = padEnd(item.facilityName, 35);
    const cat = padEnd(item.category, 18);
    let acc = "NOT CREATED";
    let stat = "-";

    if (item.status.state === "EXISTS_ACTIVE") {
      acc = "EXISTS";
      stat = "ACTIVE";
    } else if (item.status.state === "EXISTS_INACTIVE") {
      acc = "EXISTS";
      stat = "INACTIVE";
    } else if (item.status.state.includes("PARTIAL") || item.status.state.includes("SECURITY")) {
      acc = "REVIEW REQ";
      stat = "WARNING";
    } else if (item.status.state === "ERROR") {
      acc = "ERROR";
      stat = "ERROR";
    }

    console.log(num + id + name + cat + padEnd(acc, 14) + padEnd(stat, 10));
  });

  console.log("================================================================================");
  await pause();
}

async function selectFacilityFromPrompt(
  facilityStatuses,
  promptMessage = "Select facility number: ",
) {
  const rl = createInterface();
  const input = await question(rl, promptMessage);
  rl.close();

  const num = parseInt(input.trim(), 10);
  if (isNaN(num) || num < 1 || num > facilityStatuses.length) {
    console.log("Invalid facility selection.");
    return null;
  }
  return facilityStatuses[num - 1];
}

async function handleCreateAccountFlow(facilityStatuses) {
  const withoutAccounts = facilityStatuses.filter((f) => f.status.state === "NOT_CREATED");
  if (withoutAccounts.length === 0) {
    console.log("\nAll facilities already have accounts!");
    await pause();
    return;
  }

  await displayFacilityList(withoutAccounts, "FACILITIES WITHOUT ACCOUNTS (SELECT TO CREATE)");
  const selected = await selectFacilityFromPrompt(
    withoutAccounts,
    "Enter facility number to create account (0 to cancel): ",
  );
  if (!selected) return;

  console.log(`\nSelected Facility: ${selected.facilityName}`);
  console.log(`Facility ID:       ${selected.facilityId}`);
  console.log(`Category:          ${selected.category}`);
  console.log(`Account Status:    NOT CREATED`);

  const rlConf = createInterface();
  const confirm = await question(rlConf, "\n[1] Create Account\n[0] Cancel\nSelect: ");
  rlConf.close();

  if (confirm.trim() !== "1") {
    console.log("Account creation cancelled.");
    await pause();
    return;
  }

  const rlPass = createInterface();
  const password = await getPasswordInteractively(rlPass);
  rlPass.close();

  if (!password) {
    console.log("Account creation cancelled (no password provided).");
    await pause();
    return;
  }

  const rlFinal = createInterface();
  const proceed = await promptConfirmYes(rlFinal, `Create account for "${selected.facilityName}"?`);
  rlFinal.close();

  if (!proceed) {
    console.log("Account creation aborted.");
    await pause();
    return;
  }

  try {
    console.log("\nProvisioning account via Firebase Admin SDK...");
    const res = await provisionFacilityAccount(
      selected.facilityId,
      selected.facilityName,
      selected.category,
      password,
    );
    console.log("\n========================================");
    console.log("SUCCESS");
    console.log("========================================");
    console.log(`Facility:                  ${res.facilityName}`);
    console.log(`Facility ID:               ${res.facilityId}`);
    console.log(`Firebase Authentication:   CREATED`);
    console.log(`Trusted Profile:           CREATED`);
    console.log(`Status:                    ${res.status}`);
    console.log("========================================");
  } catch (err) {
    console.error("\n[PROVISIONING FAILED]", err.message || err);
  }
  await pause();
}

async function handleResetPasswordFlow(facilityStatuses) {
  const existing = facilityStatuses.filter(
    (f) => f.status.state === "EXISTS_ACTIVE" || f.status.state === "EXISTS_INACTIVE",
  );
  if (existing.length === 0) {
    console.log("\nNo existing accounts found to reset password.");
    await pause();
    return;
  }

  await displayFacilityList(existing, "EXISTING ACCOUNTS (SELECT TO RESET PASSWORD)");
  const selected = await selectFacilityFromPrompt(
    existing,
    "Enter facility number to reset password (0 to cancel): ",
  );
  if (!selected) return;

  console.log(`\nTarget Facility: ${selected.facilityName} (${selected.facilityId})`);

  const rlPass = createInterface();
  const newPassword = await getPasswordInteractively(rlPass);
  rlPass.close();

  if (!newPassword) {
    console.log("Password reset cancelled.");
    await pause();
    return;
  }

  const rlFinal = createInterface();
  const proceed = await promptConfirmYes(rlFinal, `Reset password for "${selected.facilityName}"?`);
  rlFinal.close();

  if (!proceed) {
    console.log("Password reset aborted.");
    await pause();
    return;
  }

  try {
    console.log("\nResetting password via Firebase Admin SDK...");
    const res = await resetFacilityPassword(selected.facilityId, newPassword);
    console.log("\n========================================");
    console.log("SUCCESS");
    console.log("========================================");
    console.log(`Facility:       ${selected.facilityName}`);
    console.log(`Facility ID:    ${res.facilityId}`);
    console.log(`UID:            ${res.uid}`);
    console.log(`Password:       CHANGED`);
    console.log("========================================");
  } catch (err) {
    console.error("\n[PASSWORD RESET FAILED]", err.message || err);
  }
  await pause();
}

async function handleActiveToggleFlow(facilityStatuses) {
  const existing = facilityStatuses.filter(
    (f) => f.status.state === "EXISTS_ACTIVE" || f.status.state === "EXISTS_INACTIVE",
  );
  if (existing.length === 0) {
    console.log("\nNo existing accounts found.");
    await pause();
    return;
  }

  await displayFacilityList(existing, "EXISTING ACCOUNTS (SELECT TO ACTIVATE / DEACTIVATE)");
  const selected = await selectFacilityFromPrompt(
    existing,
    "Enter facility number (0 to cancel): ",
  );
  if (!selected) return;

  const currentActive = selected.status.state === "EXISTS_ACTIVE";
  console.log(`\nFacility:       ${selected.facilityName}`);
  console.log(`Facility ID:    ${selected.facilityId}`);
  console.log(`Current Status: ${currentActive ? "ACTIVE" : "INACTIVE"}`);

  const targetActive = !currentActive;
  const actionLabel = targetActive ? "ACTIVATE" : "DEACTIVATE";

  const rlFinal = createInterface();
  const proceed = await promptConfirmYes(
    rlFinal,
    `${actionLabel} account for "${selected.facilityName}"?`,
  );
  rlFinal.close();

  if (!proceed) {
    console.log("Operation cancelled.");
    await pause();
    return;
  }

  try {
    console.log(`\nUpdating status to ${targetActive ? "ACTIVE" : "INACTIVE"}...`);
    const res = await setFacilityActiveStatus(selected.facilityId, targetActive);
    console.log("\n========================================");
    console.log("SUCCESS");
    console.log("========================================");
    console.log(`Facility:    ${selected.facilityName}`);
    console.log(`Facility ID: ${res.facilityId}`);
    console.log(`New Status:  ${res.active ? "ACTIVE" : "INACTIVE"}`);
    console.log("========================================");
  } catch (err) {
    console.error("\n[STATUS UPDATE FAILED]", err.message || err);
  }
  await pause();
}

async function handleInspectFlow(facilityStatuses) {
  await displayFacilityList(facilityStatuses, "ALL FACILITIES (SELECT TO INSPECT)");
  const selected = await selectFacilityFromPrompt(
    facilityStatuses,
    "Enter facility number to inspect (0 to cancel): ",
  );
  if (!selected) return;

  const status = await getFacilityAccountStatus(selected.facilityId);

  console.clear();
  console.log("========================================");
  console.log("          FACILITY ACCOUNT INSPECT");
  console.log("========================================");
  console.log(`Facility:           ${selected.facilityName}`);
  console.log(`Facility ID:        ${selected.facilityId}`);
  console.log(`Category:           ${selected.category}`);
  console.log(`Firebase Auth:      ${status.authExists ? "EXISTS" : "NOT FOUND"}`);
  console.log(`Trusted Profile:    ${status.profileExists ? "EXISTS" : "NOT FOUND"}`);
  console.log(`Account State:      ${status.state}`);
  console.log(`Details:            ${status.details}`);
  if (status.uid) {
    console.log(`UID:                ${status.uid}`);
  }
  if (status.profileData) {
    console.log(`Role:               ${status.profileData.role || "N/A"}`);
    console.log(`Active:             ${status.profileData.active !== false ? "YES" : "NO"}`);
    console.log(`Profile Created:    ${status.profileData.createdAt || "N/A"}`);
  }
  if (status.authMetadata) {
    console.log(`Auth Created:       ${status.authMetadata.creationTime || "N/A"}`);
    console.log(`Last Sign-In:       ${status.authMetadata.lastSignInTime || "NEVER SIGNED IN"}`);
  }
  console.log(`Synthetic Email:    ${status.email}`);
  console.log("========================================");
  await pause();
}

function padEnd(str, len) {
  if (!str) str = "";
  if (str.length >= len) return str.substring(0, len - 1) + " ";
  return str + " ".repeat(len - str.length);
}

function pause() {
  return new Promise((resolve) => {
    const rl = createInterface();
    rl.question("\nPress Enter to continue...", () => {
      rl.close();
      resolve();
    });
  });
}

main().catch((err) => {
  console.error("Fatal error in facility manager CLI:", err);
  process.exit(1);
});
