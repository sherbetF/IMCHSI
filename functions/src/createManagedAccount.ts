import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { randomBytes } from "crypto";
import { getAdminInstances, verifyAdminCaller, recordAdminAuditLog } from "./adminAuthHelper.js";
import { validateManagedPassword } from "./passwordValidator.js";
import { buildConsumerFacilityProfilePayload } from "./facilityPasswordSecurity.js";
import { CANONICAL_FACILITIES } from "./canonicalFacilities.js";
import { PARAMEDIC_NURSE_ACCOUNT } from "./managedStaffAccounts.js";
import { CreateManagedAccountRequest, ManagedAccountOperationResponse } from "./accountTypes.js";

export const createManagedAccount = onCall(
  { cors: true },
  async (
    request: CallableRequest<CreateManagedAccountRequest>,
  ): Promise<ManagedAccountOperationResponse> => {
    const { auth, db } = getAdminInstances();
    const { callerUid } = await verifyAdminCaller(request, db);

    const data = request.data;
    if (!data || !data.accountType || !data.password) {
      throw new HttpsError(
        "invalid-argument",
        "Missing required fields: accountType and password are required.",
      );
    }

    // 1. Password Policy Validation (Authoritative Server-Side)
    const passValidation = validateManagedPassword(data.password);
    if (!passValidation.valid) {
      throw new HttpsError(
        "invalid-argument",
        passValidation.error || "INVALID_PASSWORD: Password does not meet complexity requirements.",
      );
    }

    if (data.accountType === "CONSUMER") {
      const facilityId = data.facilityId;
      if (!facilityId) {
        throw new HttpsError("invalid-argument", "Missing facilityId for Consumer account.");
      }

      // Check Canonical Facility Registry
      const canonical = CANONICAL_FACILITIES.find((f) => f.facilityId === facilityId);
      if (!canonical) {
        throw new HttpsError(
          "invalid-argument",
          `UNKNOWN_ACCOUNT: Unknown facilityId '${facilityId}'. Must be one of 84 canonical facilities.`,
        );
      }

      const email = `facility_${canonical.facilityId}@auth.local`;

      // Check Auth and Firestore
      let authUserExists = false;
      try {
        await auth.getUserByEmail(email);
        authUserExists = true;
      } catch (err: unknown) {
        const e = err as { code?: string };
        if (e.code !== "auth/user-not-found") {
          throw new HttpsError("internal", "INTERNAL_OPERATION_FAILED: Auth check failed.");
        }
      }

      const profilesQuery = await db
        .collection("users")
        .where("facilityId", "==", canonical.facilityId)
        .get();

      if (profilesQuery.docs.length > 1) {
        throw new HttpsError(
          "failed-precondition",
          "ACCOUNT_CONFLICT: Multiple profiles claim this facilityId. Manual resolution required.",
        );
      }

      const profileExists = profilesQuery.docs.length === 1;

      if (authUserExists && profileExists) {
        throw new HttpsError(
          "already-exists",
          `ACCOUNT_ALREADY_EXISTS: Account for ${canonical.facilityName} is already provisioned.`,
        );
      }

      if (authUserExists || profileExists) {
        throw new HttpsError(
          "failed-precondition",
          "PARTIAL_ACCOUNT: Inconsistent account state detected. Manual review required.",
        );
      }

      // Step 1: Create Firebase Auth User
      let createdAuthUser;
      try {
        createdAuthUser = await auth.createUser({
          email,
          password: data.password,
          displayName: canonical.facilityName,
          disabled: false,
        });
      } catch (err: unknown) {
        console.error("Auth createUser error:", err);
        throw new HttpsError(
          "internal",
          "INTERNAL_OPERATION_FAILED: Failed to create Auth account.",
        );
      }

      // Step 2: Create Trusted Firestore Profile in Named Database
      try {
        await db
          .collection("users")
          .doc(createdAuthUser.uid)
          .set({
            ...buildConsumerFacilityProfilePayload(canonical),
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
      } catch (err: unknown) {
        // Rollback created Auth user on profile creation failure
        console.error("Firestore profile creation failed, rolling back Auth user:", err);
        await auth.deleteUser(createdAuthUser.uid).catch((delErr) => {
          console.error("Critical: Failed to rollback Auth user after Firestore error:", delErr);
        });
        throw new HttpsError(
          "internal",
          "INTERNAL_OPERATION_FAILED: Failed to create trusted profile. Operation rolled back.",
        );
      }

      // Audit log (Failure returns warning, does NOT repeat account operation)
      const auditRes = await recordAdminAuditLog(db, {
        action: "ACCOUNT_CREATED",
        adminUid: callerUid,
        targetRole: "facility",
        targetAccountType: "CONSUMER",
        targetIdentifier: canonical.facilityId,
        success: true,
        notes: `Created Consumer account for ${canonical.facilityName}`,
      });

      return {
        success: true,
        message: `Successfully created Consumer account for ${canonical.facilityName}.`,
        accountType: "CONSUMER",
        identifier: canonical.facilityId,
        status: "ACTIVE",
        auditLogged: auditRes.auditLogged,
        ...(auditRes.warning ? { warning: auditRes.warning } : {}),
      };
    } else if (data.accountType === "PARAMEDIC_NURSE") {
      const accountKey = data.accountKey;
      if (accountKey !== PARAMEDIC_NURSE_ACCOUNT.accountKey) {
        throw new HttpsError(
          "invalid-argument",
          `UNKNOWN_ACCOUNT: Unknown staff accountKey '${accountKey}'. Expected '${PARAMEDIC_NURSE_ACCOUNT.accountKey}'.`,
        );
      }

      const staffDef = PARAMEDIC_NURSE_ACCOUNT;

      // Check Auth and Firestore
      let authUserExists = false;
      try {
        await auth.getUserByEmail(staffDef.email);
        authUserExists = true;
      } catch (err: unknown) {
        const e = err as { code?: string };
        if (e.code !== "auth/user-not-found") {
          throw new HttpsError("internal", "INTERNAL_OPERATION_FAILED: Auth check failed.");
        }
      }

      const profilesQuery = await db.collection("users").where("role", "==", staffDef.role).get();

      if (profilesQuery.docs.length > 1) {
        throw new HttpsError(
          "failed-precondition",
          "ACCOUNT_CONFLICT: Multiple profiles claim Paramedic/Nurse role. Manual resolution required.",
        );
      }

      const profileExists = profilesQuery.docs.length === 1;

      if (authUserExists && profileExists) {
        throw new HttpsError(
          "already-exists",
          "ACCOUNT_ALREADY_EXISTS: Paramedic / Nurse account is already provisioned.",
        );
      }

      if (authUserExists || profileExists) {
        throw new HttpsError(
          "failed-precondition",
          "PARTIAL_ACCOUNT: Inconsistent account state detected for Paramedic / Nurse. Manual review required.",
        );
      }

      // Step 1: Create Firebase Auth User
      let createdAuthUser;
      try {
        createdAuthUser = await auth.createUser({
          email: staffDef.email,
          password: data.password,
          displayName: staffDef.displayName,
          disabled: false,
        });
      } catch (err: unknown) {
        console.error("Auth createUser error:", err);
        throw new HttpsError(
          "internal",
          "INTERNAL_OPERATION_FAILED: Failed to create Auth account.",
        );
      }

      // Step 2: Create Trusted Firestore Profile in Named Database
      try {
        await db.collection("users").doc(createdAuthUser.uid).set({
          role: staffDef.role,
          accountKey: staffDef.accountKey,
          displayName: staffDef.displayName,
          active: true,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } catch (err: unknown) {
        console.error("Firestore profile creation failed, rolling back Auth user:", err);
        await auth.deleteUser(createdAuthUser.uid).catch((delErr) => {
          console.error("Critical: Failed to rollback Auth user after Firestore error:", delErr);
        });
        throw new HttpsError(
          "internal",
          "INTERNAL_OPERATION_FAILED: Failed to create trusted profile. Operation rolled back.",
        );
      }

      // Audit log (Failure returns warning, does NOT repeat account operation)
      const auditRes = await recordAdminAuditLog(db, {
        action: "ACCOUNT_CREATED",
        adminUid: callerUid,
        targetRole: "paramedic_nurse",
        targetAccountType: "PARAMEDIC_NURSE",
        targetIdentifier: staffDef.accountKey,
        success: true,
        notes: "Created centralized Paramedic / Nurse account",
      });

      return {
        success: true,
        message: "Successfully created centralized Paramedic / Nurse account.",
        accountType: "PARAMEDIC_NURSE",
        identifier: staffDef.accountKey,
        status: "ACTIVE",
        auditLogged: auditRes.auditLogged,
        ...(auditRes.warning ? { warning: auditRes.warning } : {}),
      };
    } else if (data.accountType === "DOCTOR") {
      const displayName = data.displayName;
      if (!displayName || displayName.trim().length < 3) {
        throw new HttpsError(
          "invalid-argument",
          "Valid displayName is required for Doctor account.",
        );
      }

      // Cryptographically secure doctorId generation with bounded collision-safe retry
      let doctorId = "";
      let email = "";
      let uniqueFound = false;
      const MAX_ATTEMPTS = 5;

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        // Use Node crypto.randomBytes for permanent clinical identity
        const randomHex = randomBytes(8).toString("hex").toUpperCase();
        const candidateId = `dr_rheum_${randomHex}`;
        const candidateEmail = `doctor_${candidateId.toLowerCase()}@auth.local`;

        // 1. Verify uniqueness in Firestore users collection
        const existingProfiles = await db
          .collection("users")
          .where("role", "==", "doctor")
          .where("doctorId", "==", candidateId)
          .get();

        if (!existingProfiles.empty) {
          continue;
        }

        // 2. Verify synthetic email uniqueness in Firebase Auth
        try {
          await auth.getUserByEmail(candidateEmail);
          // If user exists, collision in Auth! Retry.
          continue;
        } catch (err: unknown) {
          const e = err as { code?: string };
          if (e.code === "auth/user-not-found") {
            doctorId = candidateId;
            email = candidateEmail;
            uniqueFound = true;
            break;
          }
          throw new HttpsError("internal", "INTERNAL_OPERATION_FAILED: Auth check failed.");
        }
      }

      if (!uniqueFound) {
        throw new HttpsError(
          "internal",
          "INTERNAL_OPERATION_FAILED: Failed to generate a unique Doctor ID after multiple attempts.",
        );
      }

      // Step 1: Create Firebase Auth User
      let createdAuthUser;
      try {
        createdAuthUser = await auth.createUser({
          email,
          password: data.password,
          displayName: displayName.trim(),
          disabled: false,
        });
      } catch (err: unknown) {
        console.error("Auth createUser error for Doctor:", err);
        throw new HttpsError(
          "internal",
          "INTERNAL_OPERATION_FAILED: Failed to create Doctor Auth account.",
        );
      }

      // Step 2: Create Trusted Firestore Profile
      try {
        await db.collection("users").doc(createdAuthUser.uid).set({
          role: "doctor",
          doctorId: doctorId,
          displayName: displayName.trim(),
          active: true,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } catch (err: unknown) {
        console.error("Firestore profile creation failed for Doctor, rolling back:", err);
        await auth.deleteUser(createdAuthUser.uid).catch((delErr) => {
          console.error("Critical: Failed to rollback Doctor Auth user:", delErr);
        });
        throw new HttpsError(
          "internal",
          "INTERNAL_OPERATION_FAILED: Failed to create Doctor profile. Operation rolled back.",
        );
      }

      // Audit log
      const auditRes = await recordAdminAuditLog(db, {
        action: "DOCTOR_ACCOUNT_CREATED",
        adminUid: callerUid,
        targetRole: "doctor",
        targetAccountType: "DOCTOR",
        targetIdentifier: doctorId,
        success: true,
        notes: `Created Doctor account for ${displayName.trim()} (ID: ${doctorId})`,
      });

      return {
        success: true,
        message: `Successfully created Doctor account for ${displayName.trim()} with ID ${doctorId}.`,
        accountType: "DOCTOR",
        identifier: doctorId,
        status: "ACTIVE",
        auditLogged: auditRes.auditLogged,
        ...(auditRes.warning ? { warning: auditRes.warning } : {}),
      };
    } else {
      throw new HttpsError("invalid-argument", "Invalid accountType provided.");
    }
  },
);
