import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminInstances, recordAdminAuditLog } from "./adminAuthHelper.js";
import { validateManagedPassword } from "./passwordValidator.js";
import {
  validateFacilityPasswordChangeAuth,
  buildFacilityPasswordChangeSuccessPayload,
} from "./facilityPasswordSecurity.js";
import { ChangeFacilityPasswordRequest, ChangeFacilityPasswordResponse } from "./accountTypes.js";

/**
 * Dedicated Authenticated Callable Cloud Function for Facility Password Setup.
 *
 * Security Invariants:
 * 1. Requires valid Firebase Authentication.
 * 2. Uses request.auth.uid strictly as the single source of truth for identity.
 *    Never accepts or trusts a client-supplied target UID.
 * 3. Verifies trusted profile in the Named Firestore Database:
 *    - Role must be 'facility'
 *    - Account must be 'active: true'
 *    - Profile must have 'mustChangePassword: true'
 * 4. Authoritatively validates new password complexity (>=8 chars, >=1 letter, >=1 number).
 * 5. Updates Firebase Auth password.
 * 6. Atomically clears 'mustChangePassword: false' upon success with fail-closed consistency.
 * 7. ZERO passwords stored in Firestore, logged, or returned.
 */
export const changeFacilityPassword = onCall(
  { cors: true },
  async (
    request: CallableRequest<ChangeFacilityPasswordRequest>,
  ): Promise<ChangeFacilityPasswordResponse> => {
    // 1. Validate Authentication & Caller Uid
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError(
        "unauthenticated",
        "Authentication required: Caller is not signed in with valid Firebase credentials.",
      );
    }

    const callerUid = request.auth.uid;
    const { auth, db } = getAdminInstances();

    // 2. Validate Input Payload
    const data = request.data;
    if (!data || !data.newPassword) {
      throw new HttpsError("invalid-argument", "Missing required field: newPassword is required.");
    }

    // 3. Authoritative Password Policy Validation
    const passValidation = validateManagedPassword(data.newPassword);
    if (!passValidation.valid) {
      throw new HttpsError(
        "invalid-argument",
        passValidation.error || "INVALID_PASSWORD: Password does not meet complexity requirements.",
      );
    }

    // 4. Load Trusted Firestore Profile from Named Database
    const profileDocRef = db.collection("users").doc(callerUid);
    const profileSnap = await profileDocRef.get();

    if (!profileSnap.exists) {
      throw new HttpsError(
        "permission-denied",
        "Authorization failed: Trusted user profile not found.",
      );
    }

    const profileData = profileSnap.data();

    // 5. Authoritative Production Helper Validation
    const authValidation = validateFacilityPasswordChangeAuth(request.auth, profileData);
    if (!authValidation.authorized) {
      throw new HttpsError(
        authValidation.errorCode || "permission-denied",
        authValidation.errorMessage || "Authorization failed.",
      );
    }

    const facilityId = authValidation.facilityId!;

    // 6. Update Password in Firebase Authentication
    try {
      await auth.updateUser(callerUid, {
        password: data.newPassword,
      });
    } catch (err: unknown) {
      console.error("Auth updateUser password error during facility password change:", err);
      throw new HttpsError(
        "internal",
        "INTERNAL_OPERATION_FAILED: Failed to update password in Firebase Authentication.",
      );
    }

    // 7. Update Security Profile in Named Firestore Database (Fail-Closed)
    try {
      await profileDocRef.update({
        ...buildFacilityPasswordChangeSuccessPayload(),
        passwordChangedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (err: unknown) {
      console.error("Firestore profile update failed after Auth password change:", err);
      throw new HttpsError(
        "internal",
        "PASSWORD_UPDATE_PARTIAL_FAILURE: Password updated in Auth, but failed to clear security flag in Firestore. Account remains locked until flag is cleared.",
      );
    }

    // 9. Record Safe Security Audit Log
    await recordAdminAuditLog(db, {
      action: "FACILITY_PASSWORD_CHANGED",
      adminUid: callerUid,
      targetRole: "facility",
      targetAccountType: "CONSUMER",
      targetIdentifier: facilityId,
      success: true,
      notes: `Facility ${facilityId} successfully established private password.`,
    });

    // 10. Return Safe Response (No credentials or sensitive data)
    return {
      success: true,
      message: "Private password established successfully. Welcome to HospitalHub.",
      facilityId,
    };
  },
);
