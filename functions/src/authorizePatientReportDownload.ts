import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { getAdminInstances, STORAGE_BUCKET_NAME } from "./adminAuthHelper.js";

export type SupportedDiagnosticModule = "echo" | "stress" | "holter" | "bp" | "lft";
export type SupportedReportModule = SupportedDiagnosticModule | "outsource";
export type SupportedClinicalModule = SupportedReportModule | "rheumatology";

export interface GetReportDownloadSignedUrlRequest {
  module: SupportedReportModule | string;
  appointmentId: string;
}

export interface GetRheumatologyAttachmentDownloadSignedUrlRequest {
  appointmentId?: string;
  referralId?: string;
  attachmentId: string;
  module?: string;
}

export interface DownloadSignedUrlResponse {
  success: boolean;
  downloadUrl: string;
  fileName: string;
  contentType: string;
  expiresInSeconds: number;
}

export const MODULE_COLLECTION_MAP: Record<string, string> = {
  echo: "echo_appointments",
  stress: "stress_test_appointments",
  stress_test: "stress_test_appointments",
  holter: "holter_appointments",
  bp: "blood_pressure_appointments",
  blood_pressure: "blood_pressure_appointments",
  lft: "lung_function_appointments",
  lung_function: "lung_function_appointments",
  outsource: "outsource_appointments",
  rheumatology: "rheumatology_appointments",
};

export const SAFE_ID_REGEX = /^[a-zA-Z0-9._-]+$/;
export const URL_EXPIRATION_SECONDS = 300; // 5 minutes maximum expiry

/**
 * Validates input parameters to prevent path traversal or injection.
 */
export function sanitizeInput(val: unknown, paramName: string, maxLength = 256): string {
  if (typeof val !== "string" || !val.trim()) {
    throw new HttpsError("invalid-argument", `Missing or invalid parameter: ${paramName}`);
  }
  const clean = val.trim();
  if (clean.length > maxLength) {
    throw new HttpsError(
      "invalid-argument",
      `Parameter ${paramName} exceeds maximum length (${maxLength}).`,
    );
  }
  if (!SAFE_ID_REGEX.test(clean)) {
    throw new HttpsError(
      "invalid-argument",
      `Parameter ${paramName} contains invalid characters. Only alphanumeric, dashes, dots, and underscores are permitted.`,
    );
  }
  return clean;
}

/**
 * Validates that storage paths do not contain traversal or suspicious prefixes.
 */
export function validateStoragePath(storagePath: string): void {
  if (
    !storagePath ||
    typeof storagePath !== "string" ||
    storagePath.includes("..") ||
    storagePath.includes("//") ||
    storagePath.startsWith("/") ||
    storagePath.endsWith("/")
  ) {
    throw new HttpsError("invalid-argument", "Path traversal or malformed storage path detected.");
  }
}

export interface CallerProfile {
  uid: string;
  role: string;
  facilityId: string | null;
  doctorId: string | null;
  displayName: string | null;
  userData: Record<string, any>;
}

/**
 * Authenticates the caller and verifies their active profile against the named Firestore DB.
 */
export async function authenticateCaller(
  request: CallableRequest<any>,
  db: any,
): Promise<CallerProfile> {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError(
      "unauthenticated",
      "Authentication required: Caller is not signed in with valid Firebase credentials.",
    );
  }

  const callerUid = request.auth.uid;
  const userDocSnap = await db.collection("users").doc(callerUid).get();
  if (!userDocSnap.exists) {
    throw new HttpsError(
      "permission-denied",
      "Authorization failed: User profile not found in database.",
    );
  }

  const userData = userDocSnap.data();
  if (!userData || userData["active"] !== true) {
    throw new HttpsError(
      "permission-denied",
      "Authorization failed: Account is inactive, disabled, or suspended.",
    );
  }

  const role = userData["role"];
  const permittedRoles = ["admin", "facility", "doctor", "paramedic_nurse", "outsource"];
  if (!role || !permittedRoles.includes(role)) {
    throw new HttpsError(
      "permission-denied",
      `Authorization failed: Unknown or unpermitted role: ${role}`,
    );
  }

  return {
    uid: callerUid,
    role,
    facilityId: userData["facilityId"] || null,
    doctorId: userData["doctorId"] || null,
    displayName: userData["displayName"] || null,
    userData,
  };
}

/**
 * Server-side verification of provider-to-record authorization relationship for Outsource accounts.
 *
 * Security Corrections (Issue 1D.2B):
 * - Removed all partial and fuzzy string matching (.includes() checks).
 * - Removed free-text matching on hospital names, provider names, referring doctors, and display names.
 * - Removed uploadedByUid fallback: uploadedByUid alone does NOT establish trusted assignment.
 * - Requires explicit, trustworthy provider-to-record canonical identifiers:
 *     caller.userData.outsourceProviderId === recordData.outsourceProviderId, OR
 *     caller.userData.providerId === recordData.providerId.
 * - If no canonical relationship is established, fails closed (returns false).
 */
export function verifyOutsourceProviderRelationship(
  caller: CallerProfile,
  recordData: Record<string, any>,
): boolean {
  if (!caller || !caller.userData || !recordData) {
    return false;
  }

  // 1. Explicit canonical outsourceProviderId match
  const callerOutsourceProviderId =
    typeof caller.userData["outsourceProviderId"] === "string"
      ? caller.userData["outsourceProviderId"].trim()
      : "";
  const recordOutsourceProviderId =
    typeof recordData["outsourceProviderId"] === "string"
      ? recordData["outsourceProviderId"].trim()
      : "";

  if (
    callerOutsourceProviderId &&
    recordOutsourceProviderId &&
    SAFE_ID_REGEX.test(callerOutsourceProviderId) &&
    SAFE_ID_REGEX.test(recordOutsourceProviderId) &&
    callerOutsourceProviderId === recordOutsourceProviderId
  ) {
    return true;
  }

  // 2. Explicit canonical providerId match
  const callerProviderId =
    typeof caller.userData["providerId"] === "string" ? caller.userData["providerId"].trim() : "";
  const recordProviderId =
    typeof recordData["providerId"] === "string" ? recordData["providerId"].trim() : "";

  if (
    callerProviderId &&
    recordProviderId &&
    SAFE_ID_REGEX.test(callerProviderId) &&
    SAFE_ID_REGEX.test(recordProviderId) &&
    callerProviderId === recordProviderId
  ) {
    return true;
  }

  // Strict fail closed: free-text matches, hospital name .includes(), and uploadedByUid alone are disallowed.
  return false;
}

/**
 * Validates exact Storage path linkage for Diagnostic and Outsource reports.
 *
 * Requirements (Issue 1D.2B):
 * - NICL diagnostic: facilities/{facilityId}/reports/{reportId}/{fileName}
 * - Outsource: outsource/{facilityId}/reports/{reportId}/{fileName}
 * - Path facilityId must match trusted record facilityId.
 * - Path reportId must match appointmentId OR recordData.id OR recordData.reportId OR resultFile.reportId.
 *   Safely handles historical reports without assuming reportId equals Firestore appointmentId.
 * - Fails closed on any structure or ownership mismatch.
 */
export function validateReportStoragePathLinkage(params: {
  storagePath: string;
  module: string;
  facilityId: string;
  appointmentId: string;
  recordData: Record<string, any>;
}): void {
  const { storagePath, module, facilityId, appointmentId, recordData } = params;
  const parts = storagePath.split("/");
  if (parts.length !== 5) {
    throw new HttpsError(
      "permission-denied",
      "Storage path linkage validation failed: Canonical path structure mismatch.",
    );
  }

  const [prefix, pathFacilityId, reportsDir, pathReportId, fileName] = parts;

  // 1. Module prefix validation
  const expectedPrefix = module === "outsource" ? "outsource" : "facilities";
  if (prefix !== expectedPrefix) {
    throw new HttpsError(
      "permission-denied",
      `Storage path linkage validation failed: Expected prefix '${expectedPrefix}'.`,
    );
  }

  // 2. Owning Facility validation
  if (!facilityId || pathFacilityId !== facilityId) {
    throw new HttpsError(
      "permission-denied",
      "Storage path linkage validation failed: Owning facility mismatch.",
    );
  }

  // 3. Reports directory segment validation
  if (reportsDir !== "reports") {
    throw new HttpsError(
      "permission-denied",
      "Storage path linkage validation failed: Missing 'reports' segment in path.",
    );
  }

  // 4. Report identifier linkage:
  // Does not assume reportId equals appointmentId; checks appointmentId, recordData.id,
  // recordData.reportId, and resultFile.reportId.
  const validLinkedReportIds = new Set<string>();
  if (appointmentId) validLinkedReportIds.add(appointmentId);
  if (typeof recordData["id"] === "string" && recordData["id"].trim()) {
    validLinkedReportIds.add(recordData["id"].trim());
  }
  if (typeof recordData["reportId"] === "string" && recordData["reportId"].trim()) {
    validLinkedReportIds.add(recordData["reportId"].trim());
  }
  if (
    recordData["resultFile"] &&
    typeof recordData["resultFile"]["reportId"] === "string" &&
    recordData["resultFile"]["reportId"].trim()
  ) {
    validLinkedReportIds.add(recordData["resultFile"]["reportId"].trim());
  }
  if (
    recordData["attachedReport"] &&
    typeof recordData["attachedReport"]["reportId"] === "string" &&
    recordData["attachedReport"]["reportId"].trim()
  ) {
    validLinkedReportIds.add(recordData["attachedReport"]["reportId"].trim());
  }

  if (!validLinkedReportIds.has(pathReportId)) {
    throw new HttpsError(
      "permission-denied",
      "Storage path linkage validation failed: Path reportId does not match appointment record.",
    );
  }

  // 5. File name validation
  if (!fileName || fileName.includes("..") || fileName.length > 256) {
    throw new HttpsError(
      "permission-denied",
      "Storage path linkage validation failed: Invalid file name.",
    );
  }
}

/**
 * Validates exact Storage path linkage for Rheumatology attachments.
 *
 * Requirements (Issue 1D.2B):
 * - Path format: rheumatology/{facilityId}/{referralId}/{attachmentId}/{fileName}
 * - Exact referral facilityId, referral identifier, and attachmentId required.
 * - Fails closed on any structure or ownership mismatch.
 */
export function validateRheumatologyAttachmentPathLinkage(params: {
  storagePath: string;
  facilityId: string;
  referralId: string;
  attachmentId: string;
  recordData: Record<string, any>;
}): void {
  const { storagePath, facilityId, referralId, attachmentId, recordData } = params;
  const parts = storagePath.split("/");
  if (parts.length !== 5) {
    throw new HttpsError(
      "permission-denied",
      "Storage path linkage validation failed: Invalid Rheumatology attachment path structure.",
    );
  }

  const [prefix, pathFacilityId, pathReferralId, pathAttachmentId, fileName] = parts;

  // 1. Prefix must be "rheumatology"
  if (prefix !== "rheumatology") {
    throw new HttpsError(
      "permission-denied",
      "Storage path linkage validation failed: Expected 'rheumatology' prefix.",
    );
  }

  // 2. Owning Facility check
  if (!facilityId || pathFacilityId !== facilityId) {
    throw new HttpsError(
      "permission-denied",
      "Storage path linkage validation failed: Facility mismatch for clinical attachment.",
    );
  }

  // 3. Referral identifier linkage: appointmentId OR recordData.id OR recordData.referralId
  const validLinkedReferralIds = new Set<string>();
  if (referralId) validLinkedReferralIds.add(referralId);
  if (typeof recordData["id"] === "string" && recordData["id"].trim()) {
    validLinkedReferralIds.add(recordData["id"].trim());
  }
  if (typeof recordData["referralId"] === "string" && recordData["referralId"].trim()) {
    validLinkedReferralIds.add(recordData["referralId"].trim());
  }

  if (!validLinkedReferralIds.has(pathReferralId)) {
    throw new HttpsError(
      "permission-denied",
      "Storage path linkage validation failed: Path referralId does not match referral record.",
    );
  }

  // 4. Exact attachmentId check
  if (!attachmentId || pathAttachmentId !== attachmentId) {
    throw new HttpsError(
      "permission-denied",
      "Storage path linkage validation failed: Path attachmentId does not match requested attachment.",
    );
  }

  // 5. File name validation
  if (!fileName || fileName.includes("..") || fileName.length > 256) {
    throw new HttpsError(
      "permission-denied",
      "Storage path linkage validation failed: Invalid file name.",
    );
  }
}

/**
 * Generates a short-lived (5 min) signed download URL for a file in Google Cloud Storage.
 *
 * Security Requirements (Issue 1D.2B):
 * 1. Checks that the exact object exists in the configured bucket before signing.
 * 2. Rejects missing objects with sanitized HttpsError('not-found', ...).
 * 3. Never returns fake, simulated, or fallback signed URLs with tokens like test_signed_token.
 * 4. Fails closed with sanitized HttpsError('internal', ...) on any signing error (missing IAM, signBlob failure, etc.).
 * 5. Never leaks storage paths or internal credentials in client error messages.
 */
export async function generateV4SignedUrl(
  storage: any,
  targetStoragePath: string,
  fileName: string,
  contentType: string,
): Promise<DownloadSignedUrlResponse> {
  const bucket = storage.bucket(STORAGE_BUCKET_NAME);
  const file = bucket.file(targetStoragePath);

  // 1. Verify object existence in the Storage bucket before signing
  let exists = false;
  try {
    const [fileExists] = await file.exists();
    exists = Boolean(fileExists);
  } catch (err: any) {
    if (err instanceof HttpsError) throw err;
    throw new HttpsError(
      "internal",
      "Failed to verify storage object existence. Please contact system administrator.",
    );
  }

  if (!exists) {
    throw new HttpsError("not-found", "The requested report file could not be found in storage.");
  }

  // 2. Generate signed URL - fail closed, NEVER return fake or simulated URLs
  try {
    const [signedUrl] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + URL_EXPIRATION_SECONDS * 1000,
    });

    if (!signedUrl || typeof signedUrl !== "string") {
      throw new Error("Empty signed URL returned by storage provider.");
    }

    return {
      success: true,
      downloadUrl: signedUrl,
      fileName: fileName || "Diagnostic_Report.pdf",
      contentType: contentType || "application/pdf",
      expiresInSeconds: URL_EXPIRATION_SECONDS,
    };
  } catch (err: any) {
    if (err instanceof HttpsError) throw err;
    throw new HttpsError(
      "internal",
      "Failed to generate secure download URL. Please contact system administrator.",
    );
  }
}

/**
 * 1. Cloud Function: getReportDownloadSignedUrl
 * Handles read-only download authorization for diagnostic reports:
 * - Echo, Stress Test, Holter, Blood Pressure, Lung Function, Outsource
 *
 * Permissions:
 * - Diagnostic: Owning Facility: ALLOW | Admin: ALLOW | Doctor: DENY | Paramedic: DENY | Outsource: DENY
 * - Outsource: Owning Facility: ALLOW | Admin: ALLOW | Outsource: ALLOW (only if canonical provider matches) | Doctor: DENY | Paramedic: DENY
 *
 * Zero Firestore writes: audit mutations removed.
 */
export const getReportDownloadSignedUrl = onCall(
  { cors: true },
  async (
    request: CallableRequest<GetReportDownloadSignedUrlRequest>,
  ): Promise<DownloadSignedUrlResponse> => {
    // Reject arbitrary direct storagePath parameter
    if ((request.data as any)?.storagePath) {
      throw new HttpsError(
        "invalid-argument",
        "Arbitrary storagePath is not accepted. Provide structured module and appointmentId.",
      );
    }

    const { db, storage } = getAdminInstances();
    const caller = await authenticateCaller(request, db);

    const rawModule = request.data?.module;
    const rawAppointmentId = request.data?.appointmentId;

    if (!rawModule || typeof rawModule !== "string") {
      throw new HttpsError("invalid-argument", "Missing or invalid parameter: module");
    }
    const cleanModule = rawModule.toLowerCase().trim();
    if (!MODULE_COLLECTION_MAP[cleanModule] || cleanModule === "rheumatology") {
      throw new HttpsError(
        "invalid-argument",
        `Invalid diagnostic or outsource module: ${rawModule}. Use getRheumatologyAttachmentDownloadSignedUrl for rheumatology.`,
      );
    }

    const appointmentId = sanitizeInput(rawAppointmentId, "appointmentId");
    const collectionName = MODULE_COLLECTION_MAP[cleanModule];

    // Fetch the appointment record from the named Firestore database (read-only)
    const docSnap = await db.collection(collectionName).doc(appointmentId).get();
    if (!docSnap.exists) {
      throw new HttpsError("not-found", "Clinical appointment record not found.");
    }

    const recordData = docSnap.data() || {};
    const targetFacilityId = recordData["facilityId"] || "";

    // === Enforce Approved Clinical Permissions Matrix ===
    if (cleanModule === "outsource") {
      // Outsource reports permissions:
      // - Owning Facility: ALLOW
      // - Admin: ALLOW
      // - Outsource: ALLOW only when a trustworthy, server-verified provider-to-record canonical relationship exists
      // - Doctor: DENY
      // - Paramedic/Nurse: DENY
      if (caller.role === "admin") {
        // ALLOW
      } else if (caller.role === "facility") {
        if (!caller.facilityId || caller.facilityId !== targetFacilityId) {
          throw new HttpsError(
            "permission-denied",
            "Access denied: Facility accounts cannot access outsource reports from other healthcare facilities.",
          );
        }
      } else if (caller.role === "outsource") {
        const isAuthorizedProvider = verifyOutsourceProviderRelationship(caller, recordData);
        if (!isAuthorizedProvider) {
          throw new HttpsError(
            "permission-denied",
            "Access denied: Outsource account is not authorized for this specific outsource report record.",
          );
        }
      } else if (caller.role === "doctor") {
        throw new HttpsError(
          "permission-denied",
          "Doctor accounts are restricted from accessing outsource diagnostic reports.",
        );
      } else if (caller.role === "paramedic_nurse") {
        throw new HttpsError(
          "permission-denied",
          "Paramedic/Nurse accounts are restricted from accessing raw diagnostic reports.",
        );
      } else {
        throw new HttpsError("permission-denied", "Unauthorized role for outsource report access.");
      }
    } else {
      // Diagnostic reports (Echo, Stress Test, Holter, Blood Pressure, Lung Function):
      // - Owning Facility: ALLOW
      // - Admin: ALLOW
      // - Doctor: DENY
      // - Paramedic/Nurse: DENY
      // - Outsource: DENY
      if (caller.role === "admin") {
        // ALLOW
      } else if (caller.role === "facility") {
        if (!caller.facilityId || caller.facilityId !== targetFacilityId) {
          throw new HttpsError(
            "permission-denied",
            "Access denied: Facility accounts cannot access patient documents from other healthcare facilities.",
          );
        }
      } else if (caller.role === "doctor") {
        throw new HttpsError(
          "permission-denied",
          "Doctor accounts are restricted from accessing diagnostic reports.",
        );
      } else if (caller.role === "paramedic_nurse") {
        throw new HttpsError(
          "permission-denied",
          "Paramedic/Nurse accounts are restricted from accessing raw diagnostic reports.",
        );
      } else if (caller.role === "outsource") {
        throw new HttpsError(
          "permission-denied",
          "Outsource accounts are restricted from accessing diagnostic reports.",
        );
      } else {
        throw new HttpsError(
          "permission-denied",
          "Unauthorized role for diagnostic report access.",
        );
      }
    }

    // Resolve Storage path exclusively from trusted Firestore document record
    const resultFile = recordData["resultFile"] || recordData["attachedReport"];
    if (
      !resultFile ||
      !resultFile["storagePath"] ||
      typeof resultFile["storagePath"] !== "string"
    ) {
      throw new HttpsError(
        "not-found",
        "No diagnostic report file is attached to this appointment record.",
      );
    }

    const targetStoragePath = String(resultFile["storagePath"]).trim();
    validateStoragePath(targetStoragePath);

    // Validate exact Storage path linkage to this record
    validateReportStoragePathLinkage({
      storagePath: targetStoragePath,
      module: cleanModule,
      facilityId: targetFacilityId,
      appointmentId,
      recordData,
    });

    const targetFileName = resultFile["fileName"] || "Diagnostic_Report.pdf";
    const targetContentType = resultFile["contentType"] || "application/pdf";

    // Strictly read-only: NO Firestore audit writes (db.collection("audit_report_access") removed)
    return await generateV4SignedUrl(storage, targetStoragePath, targetFileName, targetContentType);
  },
);

/**
 * 2. Cloud Function: getRheumatologyAttachmentDownloadSignedUrl
 * Handles read-only download authorization for Rheumatology clinical attachments.
 * - Owning Facility: ALLOW
 * - Active, verified Rheumatology Doctor: ALLOW according to existing clinical policy
 * - Admin: ALLOW
 * - Paramedic/Nurse: DENY
 * - Outsource: DENY
 *
 * Zero Firestore writes: audit mutations removed.
 */
export const getRheumatologyAttachmentDownloadSignedUrl = onCall(
  { cors: true },
  async (
    request: CallableRequest<GetRheumatologyAttachmentDownloadSignedUrlRequest>,
  ): Promise<DownloadSignedUrlResponse> => {
    // Reject arbitrary direct storagePath parameter
    if ((request.data as any)?.storagePath) {
      throw new HttpsError(
        "invalid-argument",
        "Arbitrary storagePath is not accepted. Provide structured appointmentId and attachmentId.",
      );
    }

    const { db, storage } = getAdminInstances();
    const caller = await authenticateCaller(request, db);

    const rawAppointmentId = request.data?.appointmentId || request.data?.referralId;
    const rawAttachmentId = request.data?.attachmentId;

    if (!rawAppointmentId) {
      throw new HttpsError("invalid-argument", "Missing parameter: appointmentId or referralId");
    }
    if (!rawAttachmentId) {
      throw new HttpsError("invalid-argument", "Missing parameter: attachmentId");
    }

    const appointmentId = sanitizeInput(rawAppointmentId, "appointmentId");
    const attachmentId = sanitizeInput(rawAttachmentId, "attachmentId");

    // Fetch the rheumatology appointment record (read-only)
    const docSnap = await db.collection("rheumatology_appointments").doc(appointmentId).get();
    if (!docSnap.exists) {
      throw new HttpsError("not-found", "Rheumatology referral record not found.");
    }

    const recordData = docSnap.data() || {};
    const targetFacilityId = recordData["facilityId"] || "";

    // === Enforce Approved Clinical Permissions Matrix for Rheumatology ===
    // - Owning Facility: ALLOW
    // - Active, verified Rheumatology Doctor: ALLOW
    // - Admin: ALLOW
    // - Paramedic/Nurse: DENY
    // - Outsource: DENY
    if (caller.role === "admin") {
      // ALLOW
    } else if (caller.role === "facility") {
      if (!caller.facilityId || caller.facilityId !== targetFacilityId) {
        throw new HttpsError(
          "permission-denied",
          "Access denied: Facility accounts cannot access attachments from other healthcare facilities.",
        );
      }
    } else if (caller.role === "doctor") {
      // Active, verified Doctor with canonical doctorId
      if (!caller.doctorId || typeof caller.doctorId !== "string" || !caller.doctorId.trim()) {
        throw new HttpsError(
          "permission-denied",
          "Doctor profile is missing valid doctorId credentials.",
        );
      }
      // ALLOW
    } else if (caller.role === "paramedic_nurse") {
      throw new HttpsError(
        "permission-denied",
        "Paramedic/Nurse accounts are restricted from accessing clinical attachments.",
      );
    } else if (caller.role === "outsource") {
      throw new HttpsError(
        "permission-denied",
        "Outsource accounts are restricted from accessing rheumatology attachments.",
      );
    } else {
      throw new HttpsError(
        "permission-denied",
        "Unauthorized role for rheumatology attachment access.",
      );
    }

    // Resolve storage path from subcollection or document array (read-only)
    let targetStoragePath = "";
    let targetFileName = "attachment.pdf";
    let targetContentType = "application/pdf";

    // 1. Check attachments subcollection
    const subDoc = await db
      .collection("rheumatology_appointments")
      .doc(appointmentId)
      .collection("attachments")
      .doc(attachmentId)
      .get();

    if (subDoc.exists) {
      const attData = subDoc.data() || {};
      targetStoragePath = attData["storagePath"] || "";
      targetFileName = attData["originalFileName"] || attData["fileName"] || "attachment.pdf";
      targetContentType = attData["contentType"] || "application/pdf";
    }

    // 2. Check referralAttachments array if not found in subcollection
    if (!targetStoragePath && Array.isArray(recordData["referralAttachments"])) {
      const match = recordData["referralAttachments"].find(
        (a: any) => a?.attachmentId === attachmentId,
      );
      if (match) {
        targetStoragePath = match.storagePath || "";
        targetFileName = match.fileName || match.originalFileName || "attachment.pdf";
        targetContentType = match.contentType || "application/pdf";
      }
    }

    if (!targetStoragePath) {
      throw new HttpsError("not-found", "Requested attachment not found on this referral record.");
    }

    validateStoragePath(targetStoragePath);

    // Validate exact Storage path linkage to this referral and attachment
    validateRheumatologyAttachmentPathLinkage({
      storagePath: targetStoragePath,
      facilityId: targetFacilityId,
      referralId: appointmentId,
      attachmentId,
      recordData,
    });

    // Strictly read-only: NO Firestore audit writes (db.collection("audit_report_access") removed)
    return await generateV4SignedUrl(storage, targetStoragePath, targetFileName, targetContentType);
  },
);

/**
 * Backward-compatible router: authorizePatientReportDownload
 * Routes structured requests to getReportDownloadSignedUrl or getRheumatologyAttachmentDownloadSignedUrl.
 * Explicitly rejects arbitrary storagePath requests.
 */
export const authorizePatientReportDownload = onCall(
  { cors: true },
  async (request: CallableRequest<any>): Promise<DownloadSignedUrlResponse> => {
    if (request.data?.storagePath) {
      throw new HttpsError(
        "invalid-argument",
        "Arbitrary storagePath is deprecated and disabled. Provide module and appointmentId.",
      );
    }

    const mod = request.data?.module?.toLowerCase()?.trim();
    if (mod === "rheumatology") {
      return (getRheumatologyAttachmentDownloadSignedUrl as any).run(request);
    }
    return (getReportDownloadSignedUrl as any).run(request);
  },
);
