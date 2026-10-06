import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import {
  getAdminInstances,
  verifyAdminCaller,
  recordAdminAuditLog,
  resolveAndVerifyDoctorAccount,
} from "./adminAuthHelper.js";
import { CANONICAL_FACILITIES } from "./canonicalFacilities.js";
import { PARAMEDIC_NURSE_ACCOUNT } from "./managedStaffAccounts.js";
import {
  SetManagedAccountActiveStatusRequest,
  ManagedAccountOperationResponse,
} from "./accountTypes.js";

export const setManagedAccountActiveStatus = onCall(
  { cors: true },
  async (
    request: CallableRequest<SetManagedAccountActiveStatusRequest>,
  ): Promise<ManagedAccountOperationResponse> => {
    const { auth, db } = getAdminInstances();
    const { callerUid } = await verifyAdminCaller(request, db);

    const data = request.data;
    if (!data || !data.accountType || typeof data.active !== "boolean") {
      throw new HttpsError(
        "invalid-argument",
        "Missing required fields: accountType and active (boolean) are required.",
      );
    }

    const targetActive = data.active;

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

      let authUser;
      try {
        authUser = await auth.getUserByEmail(expectedEmail);
      } catch (err: unknown) {
        const e = err as { code?: string };
        if (e.code === "auth/user-not-found") {
          throw new HttpsError(
            "not-found",
            "ACCOUNT_NOT_CREATED: Account does not exist in Firebase Auth.",
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

      // Check current state to prevent redundant work
      const currentlyActive = profileData["active"] === true && !authUser.disabled;
      if (targetActive && currentlyActive) {
        throw new HttpsError("already-exists", "ALREADY_ACTIVE: Account is already active.");
      }
      if (
        !targetActive &&
        !currentlyActive &&
        profileData["active"] === false &&
        authUser.disabled
      ) {
        throw new HttpsError("already-exists", "ALREADY_DISABLED: Account is already disabled.");
      }

      // Step 1: Update Auth state
      try {
        await auth.updateUser(authUser.uid, {
          disabled: !targetActive,
        });
      } catch (err: unknown) {
        console.error("Auth updateUser disabled status error:", err);
        throw new HttpsError(
          "internal",
          "INTERNAL_OPERATION_FAILED: Failed to update Auth status.",
        );
      }

      // Step 2: Update Profile state in Named Database
      try {
        const updatePayload: Record<string, unknown> = {
          active: targetActive,
          updatedAt: FieldValue.serverTimestamp(),
        };
        if (!targetActive) {
          updatePayload["disabledAt"] = FieldValue.serverTimestamp();
        } else {
          updatePayload["reactivatedAt"] = FieldValue.serverTimestamp();
        }

        await db.collection("users").doc(authUser.uid).update(updatePayload);
      } catch (err: unknown) {
        // Rollback Auth state on Firestore update failure
        console.error("Firestore update failed, rolling back Auth disabled state:", err);
        await auth.updateUser(authUser.uid, { disabled: authUser.disabled }).catch((rbErr) => {
          console.error("Critical: Failed to rollback Auth state after Firestore error:", rbErr);
        });
        throw new HttpsError(
          "internal",
          "INTERNAL_OPERATION_FAILED: Failed to update profile active status. Operation rolled back.",
        );
      }

      // Audit log (Failure returns warning, does NOT repeat account operation)
      const actionName = targetActive ? "ACCOUNT_REACTIVATED" : "ACCOUNT_DISABLED";
      const auditRes = await recordAdminAuditLog(db, {
        action: actionName,
        adminUid: callerUid,
        targetRole: "facility",
        targetAccountType: "CONSUMER",
        targetIdentifier: canonical.facilityId,
        success: true,
        notes: `${targetActive ? "Reactivated" : "Disabled"} Consumer account for ${canonical.facilityName}`,
      });

      return {
        success: true,
        message: `Successfully ${targetActive ? "reactivated" : "disabled"} account for ${canonical.facilityName}.`,
        accountType: "CONSUMER",
        identifier: canonical.facilityId,
        status: targetActive ? "ACTIVE" : "INACTIVE",
        auditLogged: auditRes.auditLogged,
        ...(auditRes.warning ? { warning: auditRes.warning } : {}),
      };
    } else if (data.accountType === "PARAMEDIC_NURSE") {
      const accountKey = data.accountKey;
      if (accountKey !== PARAMEDIC_NURSE_ACCOUNT.accountKey) {
        throw new HttpsError(
          "invalid-argument",
          "UNKNOWN_ACCOUNT: Unknown Paramedic / Nurse accountKey.",
        );
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
            "ACCOUNT_NOT_CREATED: Paramedic / Nurse account does not exist in Auth.",
          );
        }
        throw new HttpsError("internal", "INTERNAL_OPERATION_FAILED: Auth check failed.");
      }

      const profilesQuery = await db.collection("users").where("role", "==", staffDef.role).get();

      if (profilesQuery.docs.length > 1) {
        throw new HttpsError(
          "failed-precondition",
          "ACCOUNT_CONFLICT: Multiple profiles claim Paramedic/Nurse role.",
        );
      }

      if (profilesQuery.docs.length === 0) {
        throw new HttpsError(
          "failed-precondition",
          "PARTIAL_ACCOUNT: Paramedic / Nurse profile missing.",
        );
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

      const currentlyActive = profileData["active"] === true && !authUser.disabled;
      if (targetActive && currentlyActive) {
        throw new HttpsError(
          "already-exists",
          "ALREADY_ACTIVE: Paramedic / Nurse is already active.",
        );
      }
      if (
        !targetActive &&
        !currentlyActive &&
        profileData["active"] === false &&
        authUser.disabled
      ) {
        throw new HttpsError(
          "already-exists",
          "ALREADY_DISABLED: Paramedic / Nurse is already disabled.",
        );
      }

      // Step 1: Update Auth state
      try {
        await auth.updateUser(authUser.uid, {
          disabled: !targetActive,
        });
      } catch (err: unknown) {
        console.error("Auth updateUser disabled status error:", err);
        throw new HttpsError(
          "internal",
          "INTERNAL_OPERATION_FAILED: Failed to update Auth status.",
        );
      }

      // Step 2: Update Profile state in Named Database
      try {
        const updatePayload: Record<string, unknown> = {
          active: targetActive,
          updatedAt: FieldValue.serverTimestamp(),
        };
        if (!targetActive) {
          updatePayload["disabledAt"] = FieldValue.serverTimestamp();
        } else {
          updatePayload["reactivatedAt"] = FieldValue.serverTimestamp();
        }

        await db.collection("users").doc(authUser.uid).update(updatePayload);
      } catch (err: unknown) {
        console.error("Firestore update failed, rolling back Auth disabled state:", err);
        await auth.updateUser(authUser.uid, { disabled: authUser.disabled }).catch((rbErr) => {
          console.error("Critical: Failed to rollback Auth state after Firestore error:", rbErr);
        });
        throw new HttpsError(
          "internal",
          "INTERNAL_OPERATION_FAILED: Failed to update profile active status. Operation rolled back.",
        );
      }

      // Audit log (Failure returns warning, does NOT repeat account operation)
      const actionName = targetActive ? "ACCOUNT_REACTIVATED" : "ACCOUNT_DISABLED";
      const auditRes = await recordAdminAuditLog(db, {
        action: actionName,
        adminUid: callerUid,
        targetRole: "paramedic_nurse",
        targetAccountType: "PARAMEDIC_NURSE",
        targetIdentifier: staffDef.accountKey,
        success: true,
        notes: `${targetActive ? "Reactivated" : "Disabled"} Paramedic / Nurse account`,
      });

      return {
        success: true,
        message: `Successfully ${targetActive ? "reactivated" : "disabled"} Paramedic / Nurse account.`,
        accountType: "PARAMEDIC_NURSE",
        identifier: staffDef.accountKey,
        status: targetActive ? "ACTIVE" : "INACTIVE",
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

      // Check current state
      const currentlyActive = profileData["active"] === true && !authUser.disabled;
      if (targetActive && currentlyActive) {
        throw new HttpsError("already-exists", "ALREADY_ACTIVE: Doctor is already active.");
      }
      if (
        !targetActive &&
        !currentlyActive &&
        profileData["active"] === false &&
        authUser.disabled
      ) {
        throw new HttpsError("already-exists", "ALREADY_DISABLED: Doctor is already disabled.");
      }

      // Step 1: Update Auth state
      try {
        await auth.updateUser(uid, {
          disabled: !targetActive,
        });
      } catch (err: unknown) {
        console.error("Auth updateUser disabled status error for Doctor:", err);
        throw new HttpsError(
          "internal",
          "INTERNAL_OPERATION_FAILED: Failed to update Doctor Auth status.",
        );
      }

      // Step 2: Update Profile state
      try {
        const updatePayload: Record<string, unknown> = {
          active: targetActive,
          updatedAt: FieldValue.serverTimestamp(),
        };
        if (!targetActive) {
          updatePayload["disabledAt"] = FieldValue.serverTimestamp();
        } else {
          updatePayload["reactivatedAt"] = FieldValue.serverTimestamp();
        }

        await db.collection("users").doc(uid).update(updatePayload);
      } catch (err: unknown) {
        console.error("Firestore update failed for Doctor active status, rolling back:", err);
        await auth.updateUser(uid, { disabled: authUser.disabled }).catch((rbErr) => {
          console.error("Critical: Failed to rollback Doctor Auth state:", rbErr);
        });
        throw new HttpsError(
          "internal",
          "INTERNAL_OPERATION_FAILED: Failed to update Doctor profile active status. Operation rolled back.",
        );
      }

      // Audit log
      const actionName = targetActive ? "DOCTOR_REACTIVATED" : "DOCTOR_DISABLED";
      const auditRes = await recordAdminAuditLog(db, {
        action: actionName,
        adminUid: callerUid,
        targetRole: "doctor",
        targetAccountType: "DOCTOR",
        targetIdentifier: doctorId,
        success: true,
        notes: `${targetActive ? "Reactivated" : "Disabled"} Doctor account for ${profileData["displayName"]}`,
      });

      return {
        success: true,
        message: `Successfully ${targetActive ? "reactivated" : "disabled"} account for Doctor ${profileData["displayName"]}.`,
        accountType: "DOCTOR",
        identifier: doctorId,
        status: targetActive ? "ACTIVE" : "INACTIVE",
        auditLogged: auditRes.auditLogged,
        ...(auditRes.warning ? { warning: auditRes.warning } : {}),
      };
    } else {
      throw new HttpsError("invalid-argument", "Invalid accountType provided.");
    }
  },
);
