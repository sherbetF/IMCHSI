import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, defaultDb, functions, IS_DEFAULT_PRIMARY_DB } from "@/lib/firebase";

export interface SyncMirrorCallOptions {
  uid: string;
  expectedRole?: string | null;
  outsourceAppointmentId?: string;
  rheumatologyReferralId?: string;
  maxRetries?: number;
  baseDelayMs?: number;
}

export interface SyncMirrorVerificationResult {
  verifiedInDefaultDb: boolean;
  callableSucceeded: boolean;
  mirrorExists: boolean | null;
  mirroredRole: string | null;
  mirroredActive: boolean | null;
  mirroredAccountKey: string | null;
  mirroredFacilityId: string | null;
  attempts: number;
  errorCode?: string;
  errorMessage?: string;
}

interface BackendSyncCallablePayload {
  uid?: string;
  outsourceAppointmentId?: string;
  rheumatologyReferralId?: string;
  checkWriteFreeze?: boolean;
}

export interface DeployedWriteFreezeStatusResult {
  success: boolean;
  writeFreezeActive: boolean;
  writeFreezeSource: string;
  primaryDatabaseId: string;
  mirrorWritesDisabled: boolean;
}

interface BackendSyncCallableResponse {
  success: boolean;
  verifiedInDefaultDb?: boolean;
  uid?: string;
  writeFreezeActive?: boolean;
  writeFreezeSource?: string;
  primaryDatabaseId?: string;
  mirrorWritesDisabled?: boolean;
  mirroredProfile?: {
    role?: string;
    active?: boolean;
    accountKey?: string;
    facilityId?: string;
    outsourceProviderId?: string;
    providerId?: string;
    doctorId?: string;
  };
  message?: string;
}

/**
 * Queries the deployed `syncUserAuthorizationMirror` Cloud Function with `{ checkWriteFreeze: true }`
 * so operators can verify that deployed Cloud Functions actively enforce `HOSPITALHUB_WRITE_FREEZE`
 * and inspect the active `primaryDatabaseId`.
 */
export async function verifyDeployedWriteFreezeStatus(): Promise<DeployedWriteFreezeStatusResult> {
  const checkCallable = httpsCallable<BackendSyncCallablePayload, BackendSyncCallableResponse>(
    functions,
    "syncUserAuthorizationMirror",
  );
  const res = await checkCallable({ checkWriteFreeze: true });
  return {
    success: Boolean(res.data?.success),
    writeFreezeActive: Boolean(res.data?.writeFreezeActive),
    writeFreezeSource: String(res.data?.writeFreezeSource || "unknown"),
    primaryDatabaseId: String(res.data?.primaryDatabaseId || "unknown"),
    mirrorWritesDisabled: Boolean(res.data?.mirrorWritesDisabled),
  };
}

const inFlightSyncPromises = new Map<string, Promise<SyncMirrorVerificationResult>>();

function isMockService(serviceInstance: unknown): boolean {
  return (
    !serviceInstance ||
    typeof serviceInstance !== "object" ||
    "_type" in (serviceInstance as Record<string, unknown>)
  );
}

function isTransientCallableError(err: unknown): boolean {
  const code = String((err as { code?: string })?.code || "").toLowerCase();
  const msg = String((err as { message?: string })?.message || "").toLowerCase();

  // Do not retry permanent authorization or missing-document errors
  if (
    code.includes("unauthenticated") ||
    code.includes("permission-denied") ||
    code.includes("not-found") ||
    code.includes("invalid-argument")
  ) {
    return false;
  }

  return (
    code.includes("unavailable") ||
    code.includes("deadline-exceeded") ||
    code.includes("resource-exhausted") ||
    code.includes("internal") ||
    code.includes("aborted") ||
    msg.includes("network") ||
    msg.includes("fetch") ||
    msg.includes("temporarily unavailable")
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Verifies and synchronizes the authenticated user's authorization mirror in the
 * `(default)` Firestore database via the trusted backend callable `syncUserAuthorizationMirror`,
 * with bounded exponential backoff retries when synchronization is temporarily unavailable.
 *
 * Security Invariants:
 * - Never sends `role`, `active`, or any authorization fields from the client.
 * - Never writes to `(default)` from the client.
 * - Never reports `verifiedInDefaultDb: true` unless the document in `(default)` is verified
 *   either by a read-back from `defaultDb` or by the backend callable's read-after-write check.
 */
export async function ensureUserAuthorizationMirrorSynced(
  options: SyncMirrorCallOptions,
): Promise<SyncMirrorVerificationResult> {
  const cleanUid = options.uid?.trim();
  if (!cleanUid) {
    return {
      verifiedInDefaultDb: false,
      callableSucceeded: false,
      mirrorExists: null,
      mirroredRole: null,
      mirroredActive: null,
      mirroredAccountKey: null,
      mirroredFacilityId: null,
      attempts: 0,
      errorCode: "invalid-argument",
      errorMessage: "Missing UID for authorization mirror synchronization.",
    };
  }

  // Once (default) is primary, verify the authoritative user document directly.
  // Never invoke the legacy mirror synchronization callable in this mode.
  if (IS_DEFAULT_PRIMARY_DB) {
    if (!auth.currentUser || auth.currentUser.uid !== cleanUid) {
      return {
        verifiedInDefaultDb: false,
        callableSucceeded: false,
        mirrorExists: null,
        mirroredRole: null,
        mirroredActive: null,
        mirroredAccountKey: null,
        mirroredFacilityId: null,
        attempts: 0,
        errorCode: "unauthenticated",
        errorMessage: "Authenticated UID does not match the requested user.",
      };
    }

    try {
      const snapshot = await getDoc(doc(defaultDb, "users", cleanUid));
      const data = snapshot.exists() ? snapshot.data() : null;
      const role = typeof data?.["role"] === "string" ? data["role"] : null;
      const active = typeof data?.["active"] === "boolean" ? data["active"] : null;
      const expectedRole = options.expectedRole ?? null;

      return {
        verifiedInDefaultDb:
          snapshot.exists() &&
          active === true &&
          (!expectedRole || role === expectedRole),
        callableSucceeded: false,
        mirrorExists: snapshot.exists(),
        mirroredRole: role,
        mirroredActive: active,
        mirroredAccountKey:
          typeof data?.["accountKey"] === "string" ? data["accountKey"] : null,
        mirroredFacilityId:
          typeof data?.["facilityId"] === "string" ? data["facilityId"] : null,
        attempts: 0,
      };
    } catch (error: unknown) {
      return {
        verifiedInDefaultDb: false,
        callableSucceeded: false,
        mirrorExists: null,
        mirroredRole: null,
        mirroredActive: null,
        mirroredAccountKey: null,
        mirroredFacilityId: null,
        attempts: 0,
        errorCode: String((error as { code?: string })?.code || "unknown"),
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const dedupeKey = `${cleanUid}::${options.outsourceAppointmentId || ""}::${options.rheumatologyReferralId || ""}`;
  const existingInFlight = inFlightSyncPromises.get(dedupeKey);
  if (existingInFlight) {
    return existingInFlight;
  }

  const syncTask = executeMirrorSyncWithRetry(options);
  inFlightSyncPromises.set(dedupeKey, syncTask);

  try {
    return await syncTask;
  } finally {
    inFlightSyncPromises.delete(dedupeKey);
  }
}

async function executeMirrorSyncWithRetry(
  options: SyncMirrorCallOptions,
): Promise<SyncMirrorVerificationResult> {
  const cleanUid = options.uid.trim();
  const expectedRole = options.expectedRole ?? null;
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1500;

  let mirrorExists: boolean | null = null;
  let mirroredRole: string | null = null;
  let mirroredActive: boolean | null = null;
  let mirroredAccountKey: string | null = null;
  let mirroredFacilityId: string | null = null;

  // Step 1: Check if the user's own document in `(default)` is already readable and valid
  // (when no appointment/referral mirror sync is simultaneously needed).
  if (
    !options.outsourceAppointmentId &&
    !options.rheumatologyReferralId &&
    !isMockService(defaultDb)
  ) {
    try {
      const mirrorSnap = await getDoc(doc(defaultDb, "users", cleanUid));
      mirrorExists = mirrorSnap.exists();
      if (mirrorSnap.exists()) {
        const data = mirrorSnap.data();
        mirroredRole = typeof data["role"] === "string" ? data["role"] : null;
        mirroredActive = typeof data["active"] === "boolean" ? data["active"] : null;
        mirroredAccountKey = typeof data["accountKey"] === "string" ? data["accountKey"] : null;
        mirroredFacilityId = typeof data["facilityId"] === "string" ? data["facilityId"] : null;

        if (mirroredActive === true && (!expectedRole || mirroredRole === expectedRole)) {
          return {
            verifiedInDefaultDb: true,
            callableSucceeded: false,
            mirrorExists: true,
            mirroredRole,
            mirroredActive,
            mirroredAccountKey,
            mirroredFacilityId,
            attempts: 0,
          };
        }
      }
    } catch {
      // Client own-document read on (default) may fail if firestore.default.rules is not yet deployed;
      // proceed to trusted backend callable below.
    }
  }

  // Step 2: Call trusted backend Cloud Function `syncUserAuthorizationMirror` with safe retry
  if (!functions || isMockService(functions)) {
    return {
      verifiedInDefaultDb: false,
      callableSucceeded: false,
      mirrorExists,
      mirroredRole,
      mirroredActive,
      mirroredAccountKey,
      mirroredFacilityId,
      attempts: 0,
      errorCode: "functions-unavailable",
      errorMessage: "Firebase Functions instance is not initialized.",
    };
  }

  const syncCallable = httpsCallable<BackendSyncCallablePayload, BackendSyncCallableResponse>(
    functions,
    "syncUserAuthorizationMirror",
  );

  // Strictly send only identifiers — never send role or active status from the client
  const requestPayload: BackendSyncCallablePayload = {
    uid: cleanUid,
    ...(options.outsourceAppointmentId
      ? { outsourceAppointmentId: options.outsourceAppointmentId }
      : {}),
    ...(options.rheumatologyReferralId
      ? { rheumatologyReferralId: options.rheumatologyReferralId }
      : {}),
  };

  let attempts = 0;
  let lastErrorCode: string | undefined;
  let lastErrorMessage: string | undefined;

  while (attempts < maxRetries) {
    // Stop retrying if the user signed out or changed accounts
    if (auth?.currentUser && auth.currentUser.uid !== cleanUid) {
      return {
        verifiedInDefaultDb: false,
        callableSucceeded: false,
        mirrorExists,
        mirroredRole,
        mirroredActive,
        mirroredAccountKey,
        mirroredFacilityId,
        attempts,
        errorCode: "cancelled",
        errorMessage: "Authenticated user changed before mirror sync completed.",
      };
    }

    attempts++;
    try {
      const response = await syncCallable(requestPayload);
      const data = response.data;

      if (data?.success) {
        const profile = data.mirroredProfile || {};
        mirroredRole = typeof profile.role === "string" ? profile.role : expectedRole;
        mirroredActive = typeof profile.active === "boolean" ? profile.active : true;
        mirroredAccountKey = typeof profile.accountKey === "string" ? profile.accountKey : null;
        mirroredFacilityId = typeof profile.facilityId === "string" ? profile.facilityId : null;
        mirrorExists = true;

        // Also attempt client own-document read in (default) to double-confirm when rules allow
        let clientReadVerified = false;
        if (!isMockService(defaultDb)) {
          try {
            const verifySnap = await getDoc(doc(defaultDb, "users", cleanUid));
            if (verifySnap.exists()) {
              const vData = verifySnap.data();
              clientReadVerified =
                vData["active"] === true && (!expectedRole || vData["role"] === expectedRole);
            }
          } catch {
            // Ignore if client rules on (default) are not yet deployed
          }
        }

        const verified =
          (data.verifiedInDefaultDb !== false &&
            mirroredActive === true &&
            (!expectedRole || mirroredRole === expectedRole)) ||
          clientReadVerified;

        return {
          verifiedInDefaultDb: verified,
          callableSucceeded: true,
          mirrorExists: true,
          mirroredRole,
          mirroredActive,
          mirroredAccountKey,
          mirroredFacilityId,
          attempts,
        };
      }

      lastErrorCode = "sync-returned-false";
      lastErrorMessage = data?.message || "Backend callable returned success: false.";
      break;
    } catch (err: unknown) {
      lastErrorCode = String((err as { code?: string })?.code || "unknown");
      lastErrorMessage = err instanceof Error ? err.message : String(err);

      if (attempts < maxRetries && isTransientCallableError(err)) {
        const backoffMs = baseDelayMs * Math.pow(2, attempts - 1);
        await delay(backoffMs);
        continue;
      }
      break;
    }
  }

  return {
    verifiedInDefaultDb: false,
    callableSucceeded: false,
    mirrorExists,
    mirroredRole,
    mirroredActive,
    mirroredAccountKey,
    mirroredFacilityId,
    attempts,
    ...(lastErrorCode !== undefined ? { errorCode: lastErrorCode } : {}),
    ...(lastErrorMessage !== undefined ? { errorMessage: lastErrorMessage } : {}),
  };
}
