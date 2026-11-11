import { Firestore } from "firebase-admin/firestore";
import { getAdminInstances, isUsingDefaultAsPrimaryDb } from "./adminAuthHelper.js";

/**
 * Authoritative primary HospitalHub database ID prior to (default) cutover:
 * ai-studio-hospitalhubdesig-7f7a6729-a1d2-48e8-ba86-ae6c290d754c
 */
export const PRIMARY_NAMED_DATABASE_ID =
  "ai-studio-hospitalhubdesig-7f7a6729-a1d2-48e8-ba86-ae6c290d754c";

/**
 * Returns true when stripped-payload mirror writes to (default) are disabled
 * (e.g., during migration preparation, write freeze, or after switching primary DB to (default)).
 */
export function isAuthorizationMirrorDisabled(): boolean {
  return (
    process.env.HOSPITALHUB_DISABLE_MIRROR_WRITES === "true" ||
    process.env.HOSPITALHUB_WRITE_FREEZE === "true" ||
    isUsingDefaultAsPrimaryDb()
  );
}

/**
 * Exact set of trusted authorization fields permitted in the (default) database
 * `users/{uid}` mirror document for Firebase Storage Security Rules evaluation.
 *
 * Only fields that actually exist in the authoritative user document are copied.
 */
export const TRUSTED_USER_MIRROR_FIELDS = [
  "role",
  "active",
  "facilityId",
  "accountKey",
  "outsourceProviderId",
  "providerId",
  "doctorId",
] as const;

export type TrustedUserMirrorField = (typeof TRUSTED_USER_MIRROR_FIELDS)[number];

export interface AuthorizationMirrorPayload {
  role?: string;
  active?: boolean;
  facilityId?: string;
  accountKey?: string;
  outsourceProviderId?: string;
  providerId?: string;
  doctorId?: string;
}

/**
 * Exact set of trusted authorization fields in `outsource_appointments/{reportId}`
 * depended on by `storage.rules` (`canFacilityReadAppointmentReport` and `canUploadAppointmentReport`).
 */
export const TRUSTED_OUTSOURCE_APPOINTMENT_MIRROR_FIELDS = [
  "facilityId",
  "outsourceProviderId",
  "providerId",
  "status",
] as const;

/**
 * Exact set of trusted authorization fields in `rheumatology_appointments/{referralId}`
 * depended on by `storage.rules` (`canReadRheumatologyStorage` and `canWriteRheumatologyStorage`).
 */
export const TRUSTED_RHEUMATOLOGY_APPOINTMENT_MIRROR_FIELDS = ["facilityId", "status"] as const;

/**
 * Extracts only the trusted authorization fields that actually exist on the
 * authoritative user document from the primary named database.
 */
export function buildAuthorizationMirrorPayload(
  sourceData: Record<string, unknown> | undefined | null,
): AuthorizationMirrorPayload {
  const mirrorPayload: AuthorizationMirrorPayload = {};
  if (!sourceData || typeof sourceData !== "object") {
    return mirrorPayload;
  }

  if (
    Object.prototype.hasOwnProperty.call(sourceData, "role") &&
    typeof sourceData.role === "string" &&
    sourceData.role.trim().length > 0
  ) {
    mirrorPayload.role = sourceData.role.trim();
  }

  if (
    Object.prototype.hasOwnProperty.call(sourceData, "active") &&
    typeof sourceData.active === "boolean"
  ) {
    mirrorPayload.active = sourceData.active;
  }

  if (
    Object.prototype.hasOwnProperty.call(sourceData, "facilityId") &&
    typeof sourceData.facilityId === "string" &&
    sourceData.facilityId.trim().length > 0
  ) {
    mirrorPayload.facilityId = sourceData.facilityId.trim();
  }

  if (
    Object.prototype.hasOwnProperty.call(sourceData, "accountKey") &&
    typeof sourceData.accountKey === "string" &&
    sourceData.accountKey.trim().length > 0
  ) {
    mirrorPayload.accountKey = sourceData.accountKey.trim();
  }

  if (
    Object.prototype.hasOwnProperty.call(sourceData, "outsourceProviderId") &&
    typeof sourceData.outsourceProviderId === "string" &&
    sourceData.outsourceProviderId.trim().length > 0
  ) {
    mirrorPayload.outsourceProviderId = sourceData.outsourceProviderId.trim();
  }

  if (
    Object.prototype.hasOwnProperty.call(sourceData, "providerId") &&
    typeof sourceData.providerId === "string" &&
    sourceData.providerId.trim().length > 0
  ) {
    mirrorPayload.providerId = sourceData.providerId.trim();
  }

  if (
    Object.prototype.hasOwnProperty.call(sourceData, "doctorId") &&
    typeof sourceData.doctorId === "string" &&
    sourceData.doctorId.trim().length > 0
  ) {
    mirrorPayload.doctorId = sourceData.doctorId.trim();
  }

  return mirrorPayload;
}

/**
 * Extracts only the existing Storage-rule-relevant fields for `outsource_appointments/{reportId}`.
 */
export function buildOutsourceAppointmentMirrorPayload(
  sourceData: Record<string, unknown> | undefined | null,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (!sourceData || typeof sourceData !== "object") {
    return payload;
  }

  for (const field of TRUSTED_OUTSOURCE_APPOINTMENT_MIRROR_FIELDS) {
    if (
      Object.prototype.hasOwnProperty.call(sourceData, field) &&
      typeof sourceData[field] === "string" &&
      (sourceData[field] as string).trim().length > 0
    ) {
      payload[field] = (sourceData[field] as string).trim();
    }
  }

  return payload;
}

/**
 * Extracts only the existing Storage-rule-relevant fields for `rheumatology_appointments/{referralId}`.
 */
export function buildRheumatologyAppointmentMirrorPayload(
  sourceData: Record<string, unknown> | undefined | null,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (!sourceData || typeof sourceData !== "object") {
    return payload;
  }

  for (const field of TRUSTED_RHEUMATOLOGY_APPOINTMENT_MIRROR_FIELDS) {
    if (
      Object.prototype.hasOwnProperty.call(sourceData, field) &&
      typeof sourceData[field] === "string" &&
      (sourceData[field] as string).trim().length > 0
    ) {
      payload[field] = (sourceData[field] as string).trim();
    }
  }

  return payload;
}

/**
 * Writes the trusted user authorization mirror document into the `(default)` Firestore database:
 *   Collection: `users`
 *   Document ID: `{uid}`
 *
 * When `targetDefaultDb` is omitted (production runtime) and `isAuthorizationMirrorDisabled()` is true,
 * this function safely no-ops so full migrated documents in `(default)` are never overwritten.
 */
export async function syncAuthorizationProfile(
  uid: string,
  sourceUserData: Record<string, unknown>,
  targetDefaultDb?: Firestore,
): Promise<AuthorizationMirrorPayload> {
  const cleanUid = uid?.trim();
  if (!cleanUid) {
    throw new Error("syncAuthorizationProfile requires a valid non-empty uid.");
  }

  const mirrorPayload = buildAuthorizationMirrorPayload(sourceUserData);
  if (!targetDefaultDb && isAuthorizationMirrorDisabled()) {
    return mirrorPayload;
  }

  const defaultDb = targetDefaultDb || getAdminInstances().defaultDb;
  const docRef = defaultDb.collection("users").doc(cleanUid);

  await docRef.set(mirrorPayload);

  const verifySnap = await docRef.get();
  if (!verifySnap.exists) {
    throw new Error(
      `Verification failed: Mirror document users/${cleanUid} was not found in (default) database after write.`,
    );
  }

  const verifiedData = verifySnap.data() || {};
  if (mirrorPayload.role !== undefined && verifiedData.role !== mirrorPayload.role) {
    throw new Error(
      `Verification failed: Mirror document users/${cleanUid} role mismatch in (default) database.`,
    );
  }
  if (mirrorPayload.active !== undefined && verifiedData.active !== mirrorPayload.active) {
    throw new Error(
      `Verification failed: Mirror document users/${cleanUid} active mismatch in (default) database.`,
    );
  }

  return mirrorPayload;
}

/**
 * Synchronizes the `active` status of an existing user mirror in `(default)`.
 */
export async function setAuthorizationProfileActiveStatus(
  uid: string,
  active: boolean,
  targetDefaultDb?: Firestore,
  authoritativeUserData?: Record<string, unknown>,
): Promise<void> {
  const cleanUid = uid?.trim();
  if (!cleanUid) {
    throw new Error("setAuthorizationProfileActiveStatus requires a valid non-empty uid.");
  }

  if (!targetDefaultDb && isAuthorizationMirrorDisabled()) {
    return;
  }

  const defaultDb = targetDefaultDb || getAdminInstances().defaultDb;

  if (authoritativeUserData) {
    await syncAuthorizationProfile(cleanUid, { ...authoritativeUserData, active }, defaultDb);
    return;
  }

  const { db } = getAdminInstances();
  const primarySnap = await db.collection("users").doc(cleanUid).get();
  if (primarySnap.exists) {
    await syncAuthorizationProfile(cleanUid, { ...(primarySnap.data() || {}), active }, defaultDb);
  } else {
    const docRef = defaultDb.collection("users").doc(cleanUid);
    await docRef.set({ active }, { merge: true });
    const verifySnap = await docRef.get();
    if (!verifySnap.exists || verifySnap.data()?.active !== active) {
      throw new Error(
        `Verification failed: Could not verify active=${active} on users/${cleanUid} in (default) database.`,
      );
    }
  }
}

/**
 * Synchronizes an `outsource_appointments/{reportId}` mirror document in `(default)`.
 */
export async function syncOutsourceAppointmentMirror(
  reportId: string,
  sourceData: Record<string, unknown> | undefined | null,
  targetDefaultDb?: Firestore,
): Promise<void> {
  const cleanId = reportId?.trim();
  if (!cleanId) return;

  if (!targetDefaultDb && isAuthorizationMirrorDisabled()) {
    return;
  }

  const defaultDb = targetDefaultDb || getAdminInstances().defaultDb;
  const docRef = defaultDb.collection("outsource_appointments").doc(cleanId);

  if (!sourceData) {
    await docRef.delete();
    return;
  }

  const payload = buildOutsourceAppointmentMirrorPayload(sourceData);
  await docRef.set(payload, { merge: true });
}

/**
 * Synchronizes a `rheumatology_appointments/{referralId}` mirror document in `(default)`.
 */
export async function syncRheumatologyAppointmentMirror(
  referralId: string,
  sourceData: Record<string, unknown> | undefined | null,
  targetDefaultDb?: Firestore,
): Promise<void> {
  const cleanId = referralId?.trim();
  if (!cleanId) return;

  if (!targetDefaultDb && isAuthorizationMirrorDisabled()) {
    return;
  }

  const defaultDb = targetDefaultDb || getAdminInstances().defaultDb;
  const docRef = defaultDb.collection("rheumatology_appointments").doc(cleanId);

  if (!sourceData) {
    await docRef.delete();
    return;
  }

  const payload = buildRheumatologyAppointmentMirrorPayload(sourceData);
  await docRef.set(payload, { merge: true });
}

export interface BulkMirrorSyncSummary {
  users: { total: number; synced: number };
  outsourceAppointments: { total: number; synced: number };
  rheumatologyAppointments: { total: number; synced: number };
  errors: string[];
}

/**
 * Bulk-synchronizes all Storage-rule-dependent documents from the primary named database
 * to the `(default)` database.
 */
export async function syncAllStorageAuthorizationMirrors(
  sourceNamedDb?: Firestore,
  targetDefaultDb?: Firestore,
): Promise<BulkMirrorSyncSummary> {
  const instances = !sourceNamedDb || !targetDefaultDb ? getAdminInstances() : null;
  const db = sourceNamedDb || instances!.db;
  const defaultDb = targetDefaultDb || instances!.defaultDb;

  const summary: BulkMirrorSyncSummary = {
    users: { total: 0, synced: 0 },
    outsourceAppointments: { total: 0, synced: 0 },
    rheumatologyAppointments: { total: 0, synced: 0 },
    errors: [],
  };

  if (!sourceNamedDb && !targetDefaultDb && isAuthorizationMirrorDisabled()) {
    return summary;
  }

  const usersSnap = await db.collection("users").get();
  summary.users.total = usersSnap.docs.length;
  for (const docSnap of usersSnap.docs) {
    try {
      await syncAuthorizationProfile(docSnap.id, docSnap.data(), defaultDb);
      summary.users.synced++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      summary.errors.push(`users/${docSnap.id}: ${msg}`);
    }
  }

  const outsourceSnap = await db.collection("outsource_appointments").get();
  summary.outsourceAppointments.total = outsourceSnap.docs.length;
  for (const docSnap of outsourceSnap.docs) {
    try {
      await syncOutsourceAppointmentMirror(docSnap.id, docSnap.data(), defaultDb);
      summary.outsourceAppointments.synced++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      summary.errors.push(`outsource_appointments/${docSnap.id}: ${msg}`);
    }
  }

  const rheumSnap = await db.collection("rheumatology_appointments").get();
  summary.rheumatologyAppointments.total = rheumSnap.docs.length;
  for (const docSnap of rheumSnap.docs) {
    try {
      await syncRheumatologyAppointmentMirror(docSnap.id, docSnap.data(), defaultDb);
      summary.rheumatologyAppointments.synced++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      summary.errors.push(`rheumatology_appointments/${docSnap.id}: ${msg}`);
    }
  }

  return summary;
}
