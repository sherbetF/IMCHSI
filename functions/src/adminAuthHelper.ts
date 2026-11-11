import { initializeApp, getApps, App } from "firebase-admin/app";
import { getAuth, Auth, UserRecord } from "firebase-admin/auth";
import { getFirestore, Firestore, FieldValue } from "firebase-admin/firestore";
import { getStorage, Storage } from "firebase-admin/storage";
import { HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { defineBoolean, defineString } from "firebase-functions/params";
import { AdminAuditEventAction } from "./accountTypes.js";

export const TARGET_DATABASE_ID = "ai-studio-hospitalhubdesig-7f7a6729-a1d2-48e8-ba86-ae6c290d754c";
export const NAMED_DATABASE_ID = TARGET_DATABASE_ID;
export const DEFAULT_DATABASE_ID = "(default)";
export const STORAGE_BUCKET_NAME = "outsource-f1e0f.firebasestorage.app";

/**
 * Supported Firebase Functions v2 deployment parameters (backed by functions/.env).
 * Delayed Database Switch: Defaults to NAMED_DATABASE_ID until cutover to (default).
 */
export const HOSPITALHUB_PRIMARY_DB_PARAM = defineString("HOSPITALHUB_PRIMARY_DB", {
  default: NAMED_DATABASE_ID,
});

export const HOSPITALHUB_WRITE_FREEZE_PARAM = defineBoolean("HOSPITALHUB_WRITE_FREEZE", {
  default: false,
});

let cachedApp: App | null = null;
let cachedAuth: Auth | null = null;
let cachedDb: Firestore | null = null;
let cachedDbId: string | null = null;
let cachedDefaultDb: Firestore | null = null;
let cachedStorage: Storage | null = null;

/**
 * Resolves the active primary Firestore database ID from environment / Firebase Functions params.
 * Keeps NAMED_DATABASE_ID as the default until explicitly switched to "(default)".
 */
export function resolveTargetDatabaseId(): string {
  const envVal = process.env.HOSPITALHUB_PRIMARY_DB?.trim();
  if (envVal) {
    return envVal;
  }
  try {
    const paramVal = HOSPITALHUB_PRIMARY_DB_PARAM.value()?.trim();
    if (paramVal) {
      return paramVal;
    }
  } catch {
    // Fallback outside Cloud Functions runtime
  }
  return NAMED_DATABASE_ID;
}

export function isUsingDefaultAsPrimaryDb(): boolean {
  return resolveTargetDatabaseId() === DEFAULT_DATABASE_ID;
}

/**
 * Checks whether the write freeze is active via deployed Firebase Functions configuration
 * (`HOSPITALHUB_WRITE_FREEZE` in `functions/.env`) or via runtime Firestore flag
 * (`admin_config/maintenance.writeFreeze === true`).
 */
export async function getWriteFreezeStatus(db?: Firestore): Promise<{
  writeFreezeActive: boolean;
  source: "env_param" | "firestore_admin_config" | "inactive";
  primaryDatabaseId: string;
}> {
  const primaryDatabaseId = resolveTargetDatabaseId();

  if (process.env.HOSPITALHUB_WRITE_FREEZE === "true") {
    return {
      writeFreezeActive: true,
      source: "env_param",
      primaryDatabaseId,
    };
  }

  try {
    if (HOSPITALHUB_WRITE_FREEZE_PARAM.value() === true) {
      return {
        writeFreezeActive: true,
        source: "env_param",
        primaryDatabaseId,
      };
    }
  } catch {
    // Ignore outside Cloud Functions runtime
  }

  if (db) {
    try {
      const maintSnap = await db.collection("admin_config").doc("maintenance").get();
      if (maintSnap.exists && maintSnap.data()?.writeFreeze === true) {
        return {
          writeFreezeActive: true,
          source: "firestore_admin_config",
          primaryDatabaseId,
        };
      }
    } catch {
      // Ignore read error when checking optional runtime flag
    }
  }

  return {
    writeFreezeActive: false,
    source: "inactive",
    primaryDatabaseId,
  };
}

/**
 * Enforces the write freeze across all mutating Cloud Functions.
 * Throws HttpsError("unavailable", ...) if the write freeze is active.
 */
export async function assertWriteFreezeInactive(
  db?: Firestore,
  operationName = "mutation",
): Promise<void> {
  const status = await getWriteFreezeStatus(db);
  if (status.writeFreezeActive) {
    throw new HttpsError(
      "unavailable",
      `HospitalHub write freeze is active (source: ${status.source}). Operation '${operationName}' is temporarily blocked during database maintenance.`,
    );
  }
}

export function getAdminInstances(): {
  app: App;
  auth: Auth;
  db: Firestore;
  defaultDb: Firestore;
  storage: Storage;
} {
  const targetDbId = resolveTargetDatabaseId();

  if (
    cachedApp &&
    cachedAuth &&
    cachedDb &&
    cachedDefaultDb &&
    cachedStorage &&
    cachedDbId === targetDbId
  ) {
    return {
      app: cachedApp,
      auth: cachedAuth,
      db: cachedDb,
      defaultDb: cachedDefaultDb,
      storage: cachedStorage,
    };
  }

  const apps = getApps();
  cachedApp = apps.length > 0 ? apps[0]! : initializeApp();
  cachedAuth = getAuth(cachedApp);
  cachedDefaultDb = getFirestore(cachedApp);
  cachedDb =
    targetDbId === DEFAULT_DATABASE_ID ? cachedDefaultDb : getFirestore(cachedApp, targetDbId);
  cachedDbId = targetDbId;
  cachedStorage = getStorage(cachedApp);

  return {
    app: cachedApp,
    auth: cachedAuth,
    db: cachedDb,
    defaultDb: cachedDefaultDb,
    storage: cachedStorage,
  };
}

/**
 * Verifies that the caller is an authenticated, active administrator in the active primary Firestore DB.
 */
export async function verifyAdminCaller(
  request: CallableRequest,
  db: Firestore,
): Promise<{ callerUid: string; callerData: FirebaseFirestore.DocumentData }> {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError(
      "unauthenticated",
      "Authentication required: Must be signed in with valid Firebase credentials.",
    );
  }

  const callerUid = request.auth.uid;
  const callerDocSnap = await db.collection("users").doc(callerUid).get();

  if (!callerDocSnap.exists) {
    throw new HttpsError("permission-denied", "Authorization failed: User profile does not exist.");
  }

  const callerData = callerDocSnap.data();
  if (!callerData || callerData["role"] !== "admin" || callerData["active"] !== true) {
    throw new HttpsError(
      "permission-denied",
      "Authorization failed: Caller is not an active administrator.",
    );
  }

  return { callerUid, callerData };
}

/**
 * Resolves and verifies a Doctor account by doctorId in both Firestore and Firebase Auth.
 */
export async function resolveAndVerifyDoctorAccount(
  db: Firestore,
  auth: Auth,
  doctorId: string,
): Promise<{
  uid: string;
  profileData: FirebaseFirestore.DocumentData;
  authUser: UserRecord;
}> {
  const cleanDoctorId = doctorId.trim();
  const profilesQuery = await db
    .collection("users")
    .where("role", "==", "doctor")
    .where("doctorId", "==", cleanDoctorId)
    .get();

  if (profilesQuery.docs.length > 1) {
    throw new HttpsError(
      "failed-precondition",
      `ACCOUNT_CONFLICT: Multiple profiles claim doctorId '${cleanDoctorId}'. Manual resolution required.`,
    );
  }

  if (profilesQuery.docs.length === 0) {
    throw new HttpsError(
      "not-found",
      `ACCOUNT_NOT_CREATED: Doctor profile with ID '${cleanDoctorId}' does not exist.`,
    );
  }

  const profileDoc = profilesQuery.docs[0]!;
  const uid = profileDoc.id;
  const profileData = profileDoc.data();

  let authUser: UserRecord;
  try {
    authUser = await auth.getUser(uid);
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === "auth/user-not-found") {
      throw new HttpsError(
        "failed-precondition",
        "PARTIAL_ACCOUNT: Trusted Doctor profile exists in Firestore, but Firebase Auth user is missing.",
      );
    }
    throw new HttpsError("internal", "INTERNAL_OPERATION_FAILED: Auth check failed for Doctor.");
  }

  const expectedEmail = `doctor_${cleanDoctorId.toLowerCase()}@auth.local`;
  if (authUser.email !== expectedEmail) {
    throw new HttpsError(
      "failed-precondition",
      `SECURITY_MISMATCH: Doctor Auth email '${authUser.email}' does not match expected '${expectedEmail}'.`,
    );
  }

  return { uid, profileData, authUser };
}

export interface AuditLogInput {
  action: AdminAuditEventAction | string;
  adminUid: string;
  targetRole: string;
  targetAccountType: string;
  targetIdentifier: string;
  success: boolean;
  notes?: string;
}

/**
 * Records an administrative audit log entry in `admin_audit_logs`.
 * Skips writing if the write freeze is active.
 */
export async function recordAdminAuditLog(
  db: Firestore,
  entry: AuditLogInput,
): Promise<{ auditLogged: boolean; warning?: string }> {
  try {
    const freezeStatus = await getWriteFreezeStatus(db);
    if (freezeStatus.writeFreezeActive) {
      return {
        auditLogged: false,
        warning: "Write freeze active: audit log write skipped.",
      };
    }

    await db.collection("admin_audit_logs").add({
      action: entry.action,
      adminUid: entry.adminUid,
      targetRole: entry.targetRole,
      targetAccountType: entry.targetAccountType,
      targetIdentifier: entry.targetIdentifier,
      timestamp: FieldValue.serverTimestamp(),
      success: entry.success,
      ...(entry.notes ? { notes: entry.notes } : {}),
    });
    return { auditLogged: true };
  } catch (err: unknown) {
    console.error("Warning: Failed to write admin_audit_logs entry:", err);
    return {
      auditLogged: false,
      warning:
        "Account operation succeeded, but the administrative audit log entry could not be recorded.",
    };
  }
}
