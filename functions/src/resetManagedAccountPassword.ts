import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import {
  getAdminInstances,
  verifyAdminCaller,
  recordAdminAuditLog,
  resolveAndVerifyDoctorAccount,
} from "./adminAuthHelper.js";
import { validateManagedPassword } from "./passwordValidator.js";
import { buildConsumerFacilityResetUpdatePayload } from "./facilityPasswordSecurity.js";
import { CANONICAL_FACILITIES } from "./canonicalFacilities.js";
import { PARAMEDIC_NURSE_ACCOUNT } from "./managedStaffAccounts.js";
import {
  ResetManagedAccountPasswordRequest,
  ManagedAccountOperationResponse,
} from "./accountTypes.js";

export const resetManagedAccountPassword = onCall(
  { cors: true },
  async (
    request: CallableRequest<ResetManagedAccountPasswordRequest>,
  ): Promise<ManagedAccountOperationResponse> => {
    const { auth, db } = getAdminInstances();
    const { callerUid } = await verifyAdminCaller(request, db);

    const data = request.data;
    if (!data || !data.accountType || !data.newPassword) {
      throw new HttpsError(
        "invalid-argument",
        "Missing required fields: accountType and newPassword are required.",
      );
    }

    // 1. Validate Password Policy
    const passValidation = validateManagedPassword(data.newPassword);
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

      const canonical = CANONICAL_FACILITIES.find((f) => f.facilityId === facilityId);
      if (!canonical) {
        throw new HttpsError(
          "invalid-argument",
          `UNKNOWN_ACCOUNT: Unknown facilityId '${facilityId}'.`,
        );
      }

      const expectedEmail = `facility_${canonical.facilityId}@auth.local`;

      // 2. Identity & Conflict Validation
      let authUser;
      try {
        authUser = await auth.getUserByEmail(expectedEmail);
      } catch (err: unknown) {
        const e = err as { code?: string };
        if (e.code === "auth/user-not-found") {
          throw new HttpsError(
            "not-found",
            "ACCOUNT_NOT_CREATED: Firebase Auth account does not exist.",
          );
        }
        throw new HttpsError("internal", "INTERNAL_OPERATION_FAILED: Auth check failed.");
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

      if (profilesQuery.docs.length === 0) {
        throw new HttpsError(
          "failed-precondition",
          "PARTIAL_ACCOUNT: Auth user exists but trusted Firestore profile is missing.",
        );
      }

      const profileDoc = profilesQuery.docs[0]!;
      const profileData = profileDoc.data();

      // Explicit verification: UID, role, facilityId, and expected Auth email
      if (profileDoc.id !== authUser.uid) {
        throw new HttpsError(
          "failed-precondition",
          "SECURITY_MISMATCH: Auth UID does not match trusted profile UID.",
        );
      }

      if (profileData["role"] !== "facility") {
        throw new HttpsError(
          "failed-precondition",
          `SECURITY_MISMATCH: Profile role is '${profileData["role"]}', expected 'facility'.`,
        );
      }

      if (profileData["facilityId"] !== canonical.facilityId) {
        throw new HttpsError(
          "failed-precondition",
          `SECURITY_MISMATCH: Profile facilityId '${profileData["facilityId"]}' does not match canonical '${canonical.facilityId}'.`,
        );
      }

      if (authUser.email !== expectedEmail) {
        throw new HttpsError(
          "failed-precondition",
          `SECURITY_MISMATCH: Auth email '${authUser.email}' does not match expected '${expectedEmail}'.`,
        );
      }

      // 3. Update Password (preserves active/disabled state untouched)
      try {
        await auth.updateUser(authUser.uid, {
          password: data.newPassword,
        });
      } catch (err: unknown) {
        console.error("Auth updateUser password error:", err);
        throw new HttpsError(
          "internal",
          "INTERNAL_OPERATION_FAILED: Failed to update password in Auth.",
        );
      }

      // 4. Update Security Profile: Set mustChangePassword = true (Fail-closed consistency)
      try {
        await db
          .collection("users")
          .doc(profileDoc.id)
          .update({
            ...buildConsumerFacilityResetUpdatePayload(),
            updatedAt: FieldValue.serverTimestamp(),
          });
      } catch (err: unknown) {
        console.error("Firestore profile update failed after Auth password reset:", err);
        throw new HttpsError(
          "internal",
          "INTERNAL_OPERATION_FAILED: Temporary password was updated in Auth, but failed to update security profile flag in Firestore. Please retry password reset.",
        );
      }

      // 5. Record Audit Log (Failure returns warning, does NOT repeat account operation)
      const auditRes = await recordAdminAuditLog(db, {
        action: "PASSWORD_RESET",
        adminUid: callerUid,
        targetRole: "facility",
        targetAccountType: "CONSUMER",
        targetIdentifier: canonical.facilityId,
        success: true,
        notes: `Reset temporary password for Consumer account ${canonical.facilityName}`,
      });

      const currentStatus =
        authUser.disabled || profileData["active"] === false ? "INACTIVE" : "ACTIVE";

      return {
        success: true,
        message: `Successfully reset temporary password for ${canonical.facilityName}. The facility must sign in using this temporary password and create a new private password. (Account remains ${currentStatus})`,
        accountType: "CONSUMER",
        identifier: canonical.facilityId,
        status: currentStatus,
        auditLogged: auditRes.auditLogged,
        ...(auditRes.warning ? { warning: auditRes.warning } : {}),
      };
    } else if (data.accountType === "PARAMEDIC_NURSE") {
      const accountKey = data.accountKey;
      if (accountKey !== PARAMEDIC_NURSE_ACCOUNT.accountKey) {
        throw new HttpsError("invalid-argument", "UNKNOWN_ACCOUNT: Unknown Paramedic accountKey.");
      }

      const staffDef = PARAMEDIC_NURSE_ACCOUNT;

      let authUser;
      try {
        authUser = await auth.getUserByEmail(staffDef.email);
      } catch (err: unknown) {
        const e = err as { code?: string };
        if (e.code === "auth/user-not-found") {
          throw new HttpsError(
            "not-found",
            "ACCOUNT_NOT_CREATED: Paramedic Auth account does not exist.",
          );
        }
        throw new HttpsError("internal", "INTERNAL_OPERATION_FAILED: Auth check failed.");
      }

      const profilesQuery = await db.collection("users").where("role", "==", staffDef.role).get();

      if (profilesQuery.docs.length > 1) {
        throw new HttpsError(
          "failed-precondition",
          "ACCOUNT_CONFLICT: Multiple profiles claim Paramedic role.",
        );
      }

      if (profilesQuery.docs.length === 0) {
        // Auto-heal missing profile for Auth user
        await db.collection("users").doc(authUser.uid).set({
          role: staffDef.role,
          accountKey: staffDef.accountKey,
          displayName: staffDef.displayName,
          active: !authUser.disabled,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      const profileDoc = profilesQuery.docs[0]!;
      const profileData = profileDoc.data();

      // Explicit verification: UID, role, accountKey, and expected Auth email
      if (profileDoc.id !== authUser.uid) {
        throw new HttpsError(
          "failed-precondition",
          "SECURITY_MISMATCH: Auth UID does not match trusted profile UID.",
        );
      }

      if (profileData["role"] !== staffDef.role) {
        throw new HttpsError(
          "failed-precondition",
          `SECURITY_MISMATCH: Profile role is '${profileData["role"]}', expected '${staffDef.role}'.`,
        );
      }

      if (profileData["accountKey"] !== staffDef.accountKey) {
        throw new HttpsError(
          "failed-precondition",
          `SECURITY_MISMATCH: Profile accountKey is '${profileData["accountKey"]}', expected '${staffDef.accountKey}'.`,
        );
      }

      if (authUser.email !== staffDef.email) {
        throw new HttpsError(
          "failed-precondition",
          `SECURITY_MISMATCH: Auth email '${authUser.email}' does not match expected '${staffDef.email}'.`,
        );
      }

      // Update Password
      try {
        await auth.updateUser(authUser.uid, {
          password: data.newPassword,
        });
      } catch (err: unknown) {
        console.error("Auth updateUser password error:", err);
        throw new HttpsError(
          "internal",
          "INTERNAL_OPERATION_FAILED: Failed to update password in Auth.",
        );
      }

      // Audit Log
      const auditRes = await recordAdminAuditLog(db, {
        action: "PASSWORD_RESET",
        adminUid: callerUid,
        targetRole: "paramedic_nurse",
        targetAccountType: "PARAMEDIC_NURSE",
        targetIdentifier: staffDef.accountKey,
        success: true,
        notes: "Reset password for Paramedic account",
      });

      const currentStatus =
        authUser.disabled || profileData["active"] === false ? "INACTIVE" : "ACTIVE";

      return {
        success: true,
        message: `Successfully reset password for Paramedic. (Account remains ${currentStatus})`,
        accountType: "PARAMEDIC_NURSE",
        identifier: staffDef.accountKey,
        status: currentStatus,
        auditLogged: auditRes.auditLogged,
        ...(auditRes.warning ? { warning: auditRes.warning } : {}),
      };
    } else if (data.accountType === "DOCTOR") {
      const doctorId = data.doctorId;
      if (!doctorId) {
        throw new HttpsError("invalid-argument", "Missing doctorId for Doctor account.");
      }

      // Resolve and verify Doctor identity securely
      const { uid, profileData, authUser } = await resolveAndVerifyDoctorAccount(
        db,
        auth,
        doctorId,
      );

      // 3. Update Password
      try {
        await auth.updateUser(uid, {
          password: data.newPassword,
        });
      } catch (err: unknown) {
        console.error("Auth updateUser password error for Doctor:", err);
        throw new HttpsError(
          "internal",
          "INTERNAL_OPERATION_FAILED: Failed to update Doctor password in Auth.",
        );
      }

      // 4. Record Audit Log
      const auditRes = await recordAdminAuditLog(db, {
        action: "DOCTOR_PASSWORD_RESET",
        adminUid: callerUid,
        targetRole: "doctor",
        targetAccountType: "DOCTOR",
        targetIdentifier: doctorId,
        success: true,
        notes: `Reset password for Doctor ${profileData["displayName"]} (ID: ${doctorId})`,
      });

      const currentStatus =
        authUser.disabled || profileData["active"] === false ? "INACTIVE" : "ACTIVE";

      return {
        success: true,
        message: `Successfully reset password for Doctor ${profileData["displayName"]}. (Account remains ${currentStatus})`,
        accountType: "DOCTOR",
        identifier: doctorId,
        status: currentStatus,
        auditLogged: auditRes.auditLogged,
        ...(auditRes.warning ? { warning: auditRes.warning } : {}),
      };
    } else {
      throw new HttpsError("invalid-argument", "Invalid accountType provided.");
    }
  },
);
