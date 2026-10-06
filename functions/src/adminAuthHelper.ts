import { CallableRequest, HttpsError } from "firebase-functions/v2/https";
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue, Firestore } from "firebase-admin/firestore";
import { AdminAuditLogEntry } from "./accountTypes.js";

export const TARGET_DATABASE_ID = "ai-studio-hospitalhubdesig-7f7a6729-a1d2-48e8-ba86-ae6c290d754c";

export function getAdminInstances() {
  const apps = getApps();
  const app = apps.length > 0 ? apps[0]! : initializeApp();
  const auth = getAuth(app);
  const db = getFirestore(app, TARGET_DATABASE_ID);
  return { app, auth, db };
}

export async function verifyAdminCaller(request: CallableRequest, db: Firestore) {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError(
      "unauthenticated",
      "Authentication required: Caller is not signed in with valid Firebase credentials.",
    );
  }

  const callerUid = request.auth.uid;
  const callerDocSnap = await db.collection("users").doc(callerUid).get();

  if (!callerDocSnap.exists) {
    throw new HttpsError(
      "permission-denied",
      "Authorization failed: Administrator user profile does not exist.",
    );
  }

  const callerData = callerDocSnap.data();
  if (!callerData || callerData["role"] !== "admin" || callerData["active"] !== true) {
    throw new HttpsError(
      "permission-denied",
      "Authorization failed: Caller is not an active administrator.",
    );
  }

  return { callerUid, adminData: callerData };
}

export async function recordAdminAuditLog(
  db: Firestore,
  entry: Omit<AdminAuditLogEntry, "timestamp">,
): Promise<{ auditLogged: boolean; warning?: string }> {
  try {
    await db.collection("admin_audit_logs").add({
      ...entry,
      timestamp: FieldValue.serverTimestamp(),
    });
    return { auditLogged: true };
  } catch (err) {
    console.error("Failed to write security audit log to named Firestore database:", err);
    return {
      auditLogged: false,
      warning:
        "Account operation completed successfully, but the security audit log entry could not be written.",
    };
  }
}

export interface ResolvedDoctorAccount {
  uid: string;
  profileDoc: FirebaseFirestore.DocumentSnapshot;
  profileData: FirebaseFirestore.DocumentData;
  authUser: import("firebase-admin/auth").UserRecord;
  expectedEmail: string;
}

/**
 * Centralized, hardened Doctor identity resolver.
 * Enforces:
 * - Query WITHOUT limit(1) to detect duplicate doctorId profiles (ACCOUNT_CONFLICT)
 * - Profile exists and is singular (UNKNOWN_ACCOUNT or ACCOUNT_CONFLICT)
 * - Profile role is 'doctor' and doctorId matches requested ID (SECURITY_MISMATCH)
 * - Auth user exists by profile document UID (PARTIAL_ACCOUNT)
 * - Auth UID matches profile document UID (SECURITY_MISMATCH)
 * - Auth email matches expected synthetic email doctor_<doctorId>@auth.local (SECURITY_MISMATCH)
 */
export async function resolveAndVerifyDoctorAccount(
  db: Firestore,
  auth: import("firebase-admin/auth").Auth,
  doctorId: string,
): Promise<ResolvedDoctorAccount> {
  if (!doctorId || typeof doctorId !== "string" || !doctorId.trim()) {
    throw new HttpsError("invalid-argument", "Missing or invalid doctorId for Doctor account.");
  }

  const cleanDoctorId = doctorId.trim();
  const expectedEmail = `doctor_${cleanDoctorId.toLowerCase()}@auth.local`;

  // Query users collection for role == "doctor" and doctorId == doctorId WITHOUT limit(1)
  const profilesQuery = await db
    .collection("users")
    .where("role", "==", "doctor")
    .where("doctorId", "==", cleanDoctorId)
    .get();

  if (profilesQuery.empty) {
    throw new HttpsError(
      "not-found",
      `UNKNOWN_ACCOUNT: Doctor with ID '${cleanDoctorId}' not found.`,
    );
  }

  if (profilesQuery.docs.length > 1) {
    throw new HttpsError(
      "failed-precondition",
      `ACCOUNT_CONFLICT: Multiple profiles (${profilesQuery.docs.length}) claim doctorId '${cleanDoctorId}'. Manual resolution required.`,
    );
  }

  const profileDoc = profilesQuery.docs[0]!;
  const profileData = profileDoc.data();
  const uid = profileDoc.id;

  if (profileData["role"] !== "doctor") {
    throw new HttpsError(
      "failed-precondition",
      `SECURITY_MISMATCH: Profile role is '${profileData["role"]}', expected 'doctor'.`,
    );
  }

  if (profileData["doctorId"] !== cleanDoctorId) {
    throw new HttpsError(
      "failed-precondition",
      `SECURITY_MISMATCH: Profile doctorId '${profileData["doctorId"]}' does not match requested '${cleanDoctorId}'.`,
    );
  }

  let authUser;
  try {
    authUser = await auth.getUser(uid);
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === "auth/user-not-found") {
      throw new HttpsError(
        "failed-precondition",
        "PARTIAL_ACCOUNT: Trusted Firestore profile exists but Firebase Auth user is missing.",
      );
    }
    throw new HttpsError("internal", "INTERNAL_OPERATION_FAILED: Auth check failed.");
  }

  if (authUser.uid !== uid) {
    throw new HttpsError(
      "failed-precondition",
      "SECURITY_MISMATCH: Auth UID does not match trusted profile UID.",
    );
  }

  if (authUser.email !== expectedEmail) {
    throw new HttpsError(
      "failed-precondition",
      `SECURITY_MISMATCH: Auth email '${authUser.email}' does not match expected '${expectedEmail}'.`,
    );
  }

  return {
    uid,
    profileDoc,
    profileData,
    authUser,
    expectedEmail,
  };
}
