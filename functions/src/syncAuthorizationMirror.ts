import { onCall, HttpsError } from "firebase-functions/v2/https";
import {
  getAdminInstances,
  assertWriteFreezeInactive,
  getWriteFreezeStatus,
  isUsingDefaultAsPrimaryDb,
} from "./adminAuthHelper.js";
import {
  buildAuthorizationMirrorPayload,
  isAuthorizationMirrorDisabled,
} from "./authorizationMirror.js";

/**
 * Callable Function: `syncUserAuthorizationMirror`
 *
 * Migration-safe authorization verifier & synchronizer:
 * 1. Supports `{ checkWriteFreeze: true }` so operators can verify whether the deployed
 *    Cloud Functions actively enforce `HOSPITALHUB_WRITE_FREEZE` and inspect `primaryDatabaseId`.
 * 2. Enforces `assertWriteFreezeInactive` before performing any write.
 * 3. Retires all background `onDocumentWritten` mirror triggers so full migrated documents
 *    in `(default)` can never be overwritten by stripped 3-to-7 field mirror payloads.
 * 4. When `(default)` already contains the user document (or when `isUsingDefaultAsPrimaryDb()`
 *    or `HOSPITALHUB_DISABLE_MIRROR_WRITES=true` is active), verifies the document in `(default)`
 *    without overwriting full document fields.
 */
export const syncUserAuthorizationMirror = onCall(
  {
    region: "us-central1",
    cors: true,
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Authentication is required.");
    }

    const callerUid = request.auth.uid;
    const { db, defaultDb } = getAdminInstances();

    // Allow operators/clients to inspect deployed write-freeze and primary DB configuration
    if (request.data?.checkWriteFreeze === true) {
      const freezeStatus = await getWriteFreezeStatus(db);
      return {
        success: true,
        writeFreezeActive: freezeStatus.writeFreezeActive,
        writeFreezeSource: freezeStatus.source,
        primaryDatabaseId: freezeStatus.primaryDatabaseId,
        mirrorWritesDisabled: isAuthorizationMirrorDisabled(),
      };
    }

    const callerSnap = await db.collection("users").doc(callerUid).get();
    if (!callerSnap.exists) {
      throw new HttpsError(
        "not-found",
        "Authoritative user authorization profile does not exist in primary database.",
      );
    }

    const callerData = callerSnap.data() || {};
    const mirroredProfile = buildAuthorizationMirrorPayload(callerData);

    // Check if (default) already has the user document
    const existingDefaultSnap = await defaultDb.collection("users").doc(callerUid).get();
    if (existingDefaultSnap.exists) {
      const existingData = existingDefaultSnap.data() || {};
      if (
        existingData.role === mirroredProfile.role &&
        existingData.active === mirroredProfile.active
      ) {
        return {
          success: true,
          verifiedInDefaultDb: true,
          uid: callerUid,
          mirroredProfile: buildAuthorizationMirrorPayload(existingData),
        };
      }
    }

    // If mirror writes are disabled or (default) is already primary, do not write stripped payloads
    if (isAuthorizationMirrorDisabled() || isUsingDefaultAsPrimaryDb()) {
      return {
        success: existingDefaultSnap.exists,
        verifiedInDefaultDb: existingDefaultSnap.exists,
        uid: callerUid,
        mirroredProfile,
      };
    }

    // Enforce write freeze before any fallback merge write
    await assertWriteFreezeInactive(db, "syncUserAuthorizationMirror");

    await defaultDb.collection("users").doc(callerUid).set(mirroredProfile, { merge: true });
    const verifySnap = await defaultDb.collection("users").doc(callerUid).get();

    return {
      success: verifySnap.exists,
      verifiedInDefaultDb: verifySnap.exists,
      uid: callerUid,
      mirroredProfile,
    };
  },
);
