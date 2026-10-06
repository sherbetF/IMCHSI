# HospitalHub Rheumatology Security & Workflow Test Suite (Stage 7 & Stage 7B)

This document describes the automated security, authorization, state-machine, and Firebase Rules execution testing suite for HospitalHub Rheumatology and Account Manager modules.

---

## 1. Safety & Environment Invariants

- **Synthetic Data Only**: All test fixtures use synthetic identities (`TEST_FACILITY_A`, `TEST_FACILITY_B`, `dr_rheum_test_001`, `paramedic_nurse_main`, etc.).
- **Zero Production Mutations**: Tests NEVER contact production Firebase or mutate the production database (`ai-studio-hospitalhubdesig-7f7a6729-a1d2-48e8-ba86-ae6c290d754c`).
- **Production Safety Guard**: `tests/emulator/testEnvironment.ts` contains an explicit fail-fast guard that refuses execution if directed at `outsource-f1e0f` without emulator host environment variables.
- **Zero Real Patient Data**: No actual patient clinical information or PII is used.
- **No Production Credentials**: Tests do not require service account private keys or production Admin Auth credentials.

---

## 2. Test Architecture & Execution Levels

The test suite is structured into distinct execution levels:

| Level                             | Suite / Path                                                                                                                                                                  | Description & Verification Mode                                                                                                                                                                      |
| :-------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Real Emulator Rules Execution** | `tests/emulator/firestoreRheumatology.emulator.test.ts`<br>`tests/emulator/rheumatologyAttachments.emulator.test.ts`<br>`tests/emulator/storageRheumatology.emulator.test.ts` | Real Firebase Emulator integration tests using `@firebase/rules-unit-testing`. Evaluates actual `firestore.rules` and `storage.rules` against live emulator with `assertSucceeds` and `assertFails`. |
| **Static Rules Structure**        | `tests/rules/firestoreRheumatology.rules.test.ts`<br>`tests/rules/storageRheumatology.rules.test.ts`                                                                          | Static AST and rule parsing assertions verifying path match blocks, helper functions, field allowlists, and catch-all default-deny rules.                                                            |
| **Backend Callable Unit Tests**   | `tests/functions/rheumatologyAttachmentReservation.test.ts`<br>`tests/functions/accountManagerAuthorization.test.ts`                                                          | Unit tests for Cloud Function logic, atomic 5-slot limits, concurrency race handling, input sanitization, and password complexity.                                                                   |
| **Service & State Machine Tests** | `tests/services/rheumatologyService.test.ts`                                                                                                                                  | Unit tests for state transitions, doctor timeframe/investigation vocabularies, time normalization, and blood test sequencing.                                                                        |
| **UI Role Regression Tests**      | `tests/ui/rheumatologyUiRegression.test.ts`                                                                                                                                   | Role-aware navigation, Paramedic clinical attachment exclusion, and Admin-only Doctor management controls.                                                                                           |

---

## 3. How to Run the Security Test Suite

### Running All Tests

```bash
npm run test:security
```

Or:

```bash
npm test
```

### Running Targeted Suites

```bash
# Run Real Firebase Emulator Rules tests
npm run test:security:emulator

# Run Static Rules & Unit tests
npm run test:security:static

# Run Rules tests
npm run test:rules

# Run Backend Callable tests
npm run test:functions

# Run Service and State Machine tests
npm run test:services
```

---

## 4. Firebase Emulator Requirements for Live Execution

- **Prerequisites**: Node.js $\ge 18$, Java JRE/JDK $\ge 11$ (required by Firebase CLI to spawn local Firestore/Storage emulator JARs).
- **Starting Local Emulators**:
  ```bash
  firebase emulators:exec --only firestore,storage "vitest run tests/emulator"
  ```
- **Environment Note**: In environments where Java is absent, emulator tests detect the absence of the emulator host and report the exact limitation without generating false-positive claims.

---

## 5. Pre-Deployment Verification Checklist

Before any production deployment gate:

1. `npm run test:security` must pass 100% with zero failures.
2. `npm run build` (frontend SPA) must compile cleanly.
3. `npm --prefix functions run build` (Cloud Functions TypeScript) must compile cleanly.
4. Verify that NO deployments were executed (`firebase deploy` is never run automatically).
