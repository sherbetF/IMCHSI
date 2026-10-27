import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as crypto from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminInstances, STORAGE_BUCKET_NAME } from "./adminAuthHelper.js";
import {
  authenticateCaller,
  sanitizeInput,
  validateStoragePath,
  verifyOutsourceProviderRelationship,
} from "./authorizePatientReportDownload.js";

export interface ReplaceReportFileRequest {
  storagePath: string;
  newFileBase64: string;
  fileName: string;
  contentType: string;
  summaryNotes?: string;
}

export interface ReplaceReportFileResponse {
  success: boolean;
  storagePath: string;
  archivePath?: string;
  version: number;
  uploadedAt: string;
}

/**
 * Computes a monotonic server-managed version number based on target file state and prior report audit records.
 */
export function calculateNextReportVersion(
  targetGeneration: number | string | null,
  existingAuditLogs?: Array<{ version?: number }>,
): number {
  if (targetGeneration === null) {
    return 1;
  }
  let maxVersion = 1;
  if (existingAuditLogs && existingAuditLogs.length > 0) {
    for (const log of existingAuditLogs) {
      if (typeof log?.version === "number" && log.version > maxVersion) {
        maxVersion = log.version;
      }
    }
  }
  return existingAuditLogs && existingAuditLogs.length > 0 ? maxVersion + 1 : 2;
}

/**
 * Validates magic byte signatures and file bounds.
 * Rejects empty files, files > 20MB, and MIME type/magic signature mismatches.
 */
export function validateFileContentAndSignature(
  fileBuffer: Buffer,
  claimedContentType: string,
): string {
  if (!fileBuffer || fileBuffer.length === 0) {
    throw new HttpsError("invalid-argument", "File payload is empty (0 bytes). Upload rejected.");
  }

  const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
  if (fileBuffer.length > MAX_SIZE_BYTES) {
    throw new HttpsError(
      "invalid-argument",
      `File size (${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB) exceeds 20MB limit.`,
    );
  }

  const header = fileBuffer.subarray(0, 16);
  let detectedType: string | null = null;

  // PDF: %PDF- (0x25 0x50 0x44 0x46)
  if (
    header.length >= 4 &&
    header[0] === 0x25 &&
    header[1] === 0x50 &&
    header[2] === 0x44 &&
    header[3] === 0x46
  ) {
    detectedType = "application/pdf";
  }
  // PNG: \x89PNG\r\n\x1a\n (0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A)
  else if (
    header.length >= 8 &&
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47 &&
    header[4] === 0x0d &&
    header[5] === 0x0a &&
    header[6] === 0x1a &&
    header[7] === 0x0a
  ) {
    detectedType = "image/png";
  }
  // JPEG: 0xFF 0xD8 0xFF
  else if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    detectedType = "image/jpeg";
  }
  // WebP: RIFF .... WEBP
  else if (
    header.length >= 12 &&
    header[0] === 0x52 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x46 &&
    header[8] === 0x57 &&
    header[9] === 0x45 &&
    header[10] === 0x42 &&
    header[11] === 0x50
  ) {
    detectedType = "image/webp";
  }

  if (!detectedType) {
    throw new HttpsError(
      "invalid-argument",
      "Magic byte signature verification failed: File format is unsupported or file header is corrupted.",
    );
  }

  const normalizedClaimed = claimedContentType.toLowerCase().trim();
  const isJpegMatch =
    detectedType === "image/jpeg" &&
    (normalizedClaimed === "image/jpeg" || normalizedClaimed === "image/jpg");

  if (detectedType !== normalizedClaimed && !isJpegMatch) {
    throw new HttpsError(
      "invalid-argument",
      `MIME signature mismatch: Payload claims '${claimedContentType}', but magic bytes signature detected '${detectedType}'. Upload rejected.`,
    );
  }

  return detectedType;
}

const DIAGNOSTIC_COLLECTIONS = [
  "echo_appointments",
  "stress_test_appointments",
  "holter_appointments",
  "blood_pressure_appointments",
  "lung_function_appointments",
];

/**
 * Searches Firestore diagnostic and outsource collections for a matching record.
 */
async function findAppointmentRecord(
  db: any,
  prefix: string,
  reportId: string,
): Promise<{ collectionName: string; recordData: Record<string, any> }> {
  if (prefix === "outsource") {
    // 1. Direct document ID lookup in outsource_appointments
    const docSnap = await db.collection("outsource_appointments").doc(reportId).get();
    if (docSnap.exists) {
      return { collectionName: "outsource_appointments", recordData: docSnap.data() || {} };
    }

    // 2. Fallback query by id or reportId or resultFile.reportId
    const queryByReportId = await db
      .collection("outsource_appointments")
      .where("reportId", "==", reportId)
      .limit(1)
      .get();
    if (!queryByReportId.empty) {
      return {
        collectionName: "outsource_appointments",
        recordData: queryByReportId.docs[0].data() || {},
      };
    }

    throw new HttpsError(
      "not-found",
      "Outsource report replacement failed: Target outsource appointment record does not exist in database.",
    );
  } else {
    // Search diagnostic collections
    for (const colName of DIAGNOSTIC_COLLECTIONS) {
      const docSnap = await db.collection(colName).doc(reportId).get();
      if (docSnap.exists) {
        return { collectionName: colName, recordData: docSnap.data() || {} };
      }
    }

    // Fallback query across collections
    for (const colName of DIAGNOSTIC_COLLECTIONS) {
      const q = await db.collection(colName).where("reportId", "==", reportId).limit(1).get();
      if (!q.empty) {
        return { collectionName: colName, recordData: q.docs[0].data() || {} };
      }
    }

    throw new HttpsError(
      "not-found",
      "Report replacement failed: Diagnostic appointment or report record does not exist in database.",
    );
  }
}

/**
 * Secure backend Cloud Function for replacing an existing medical report file.
 * Features:
 * - Content magic byte validation
 * - Server-side record existence and facility ownership verification
 * - Provider assignment authorization for Outsource appointments
 * - Immutable archive creation under {prefix}/{facilityId}/reports/{reportId}/archive/{archiveId}/{fileName}
 * - Concurrency-safe replacement using Cloud Storage generation preconditions (ifGenerationMatch)
 */
export const replaceReportFile = onCall(
  {
    cors: true,
    maxInstances: 10,
  },
  async (
    request: CallableRequest<ReplaceReportFileRequest>,
  ): Promise<ReplaceReportFileResponse> => {
    const { storage, db } = getAdminInstances();
    const caller = await authenticateCaller(request, db);

    const { storagePath, newFileBase64, fileName, contentType, summaryNotes } = request.data || {};

    if (!newFileBase64 || typeof newFileBase64 !== "string") {
      throw new HttpsError("invalid-argument", "Missing or invalid newFileBase64 payload.");
    }

    validateStoragePath(storagePath);
    const cleanFileName = sanitizeInput(fileName, "fileName", 200);
    const cleanContentType = sanitizeInput(contentType, "contentType", 100);

    // Validate path structure: facilities/{facilityId}/reports/{reportId}/{fileName} or outsource/...
    const parts = storagePath.split("/");
    if (parts.length !== 5) {
      throw new HttpsError("invalid-argument", "Invalid storage path structure.");
    }

    const [prefix, pathFacilityId, reportsDir, pathReportId] = parts;
    if ((prefix !== "facilities" && prefix !== "outsource") || reportsDir !== "reports") {
      throw new HttpsError("invalid-argument", "Invalid storage path hierarchy.");
    }

    // 1. Validate File Content & Magic Bytes Signature
    const fileBuffer = Buffer.from(newFileBase64, "base64");
    const verifiedContentType = validateFileContentAndSignature(fileBuffer, cleanContentType);

    // 2. Validate Firestore Record Existence & Assignment Relationship
    const { recordData } = await findAppointmentRecord(db, prefix, pathReportId);

    const recordFacilityId = (recordData["facilityId"] || "").trim();
    if (!recordFacilityId || recordFacilityId !== pathFacilityId) {
      throw new HttpsError(
        "permission-denied",
        "Facility ownership mismatch: Storage path facilityId does not match the clinical appointment record.",
      );
    }

    // 3. Server-side Role Authorization
    if (caller.role !== "admin") {
      if (prefix === "facilities") {
        if (caller.role !== "facility" || caller.facilityId !== pathFacilityId) {
          throw new HttpsError(
            "permission-denied",
            "Access denied: Facility accounts cannot update diagnostic reports for other facilities.",
          );
        }
      } else if (prefix === "outsource") {
        if (caller.role === "outsource") {
          const isAuthorized = verifyOutsourceProviderRelationship(caller, recordData);
          if (!isAuthorized) {
            throw new HttpsError(
              "permission-denied",
              "Access denied: Outsource provider is not assigned to this appointment record.",
            );
          }
        } else {
          throw new HttpsError(
            "permission-denied",
            "Access denied: Facility accounts and unauthorized roles are not permitted to replace Outsource reports.",
          );
        }
      }
    }

    const bucket = storage.bucket(STORAGE_BUCKET_NAME);
    const targetFile = bucket.file(storagePath);

    // 4. Retrieve Existing File Metadata & Generation Number for Precondition Matching
    let targetGeneration: number | string | null = null;

    try {
      const [meta] = await targetFile.getMetadata();
      targetGeneration = meta.generation !== undefined ? meta.generation : null;
    } catch (err: any) {
      if (err?.code === 404 || err?.message?.includes("No such object")) {
        targetGeneration = null;
      } else {
        throw new HttpsError("internal", "Failed to retrieve existing target file state.");
      }
    }

    const contentHash = crypto.createHash("sha256").update(fileBuffer).digest("hex");

    // 5. Authoritative Monotonic Report Versioning Scoped to storagePath (Only COMPLETED ops count)
    let currentVersion = 1;
    if (targetGeneration !== null) {
      try {
        // Query audit logs scoped strictly to storagePath
        const auditSnaps = await db
          .collection("report_audit_logs")
          .where("storagePath", "==", storagePath)
          .get();

        const existingLogs: Array<{ version?: number; storagePath?: string }> = [];
        if (!auditSnaps.empty) {
          auditSnaps.forEach((doc: any) => {
            existingLogs.push(doc.data() || {});
          });
        } else {
          // Fallback query for legacy audit records matching reportId where storagePath matches or is null
          const legacySnaps = await db
            .collection("report_audit_logs")
            .where("reportId", "==", pathReportId)
            .get();
          if (!legacySnaps.empty) {
            legacySnaps.forEach((doc: any) => {
              const data = doc.data() || {};
              if (!data.storagePath || data.storagePath === storagePath) {
                existingLogs.push(data);
              }
            });
          }
        }

        // Also check operation records scoped to storagePath (REQUIRE status === "COMPLETED")
        const opSnaps = await db
          .collection("report_operations")
          .where("storagePath", "==", storagePath)
          .get();
        if (!opSnaps.empty) {
          opSnaps.forEach((doc: any) => {
            const data = doc.data() || {};
            if (
              data.status === "COMPLETED" &&
              (typeof data.intendedVersion === "number" || typeof data.version === "number")
            ) {
              existingLogs.push({ version: data.intendedVersion || data.version });
            }
          });
        }

        currentVersion = calculateNextReportVersion(targetGeneration, existingLogs);
      } catch (err: any) {
        console.error("Critical failure retrieving version history:", err);
        throw new HttpsError(
          "internal",
          `Failed to retrieve authoritative report version history: ${err?.message || "Database error"}. Replacement aborted.`,
        );
      }
    }

    // 6. Enforce Server-Side Idempotency via Atomic Firestore Transaction
    const idempotencyRaw = `${caller.uid}|${storagePath}|${targetGeneration !== null ? String(targetGeneration) : "0"}|${contentHash}`;
    const idempotencyKey = crypto.createHash("sha256").update(idempotencyRaw).digest("hex");
    const operationDocId = `idemp_${idempotencyKey}`;
    const operationRef = db.collection("report_operations").doc(operationDocId);

    let isCompleted = false;
    let isRetry = false;
    let existingOpData: any = null;
    let operationId = `op_${Date.now()}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    let previousVersion = targetGeneration !== null ? Math.max(1, currentVersion - 1) : null;
    const archiveId = `${Date.now()}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    let archivePath =
      targetGeneration !== null
        ? `${prefix}/${pathFacilityId}/reports/${pathReportId}/archive/${archiveId}/${cleanFileName}`
        : undefined;

    try {
      await db.runTransaction(async (tx: any) => {
        const docSnap = await tx.get(operationRef);
        if (docSnap.exists) {
          const data = docSnap.data();
          if (data?.status === "COMPLETED") {
            isCompleted = true;
            existingOpData = data;
            return;
          }
          // Verify actor and params match
          if (
            data?.actorId !== caller.uid ||
            data?.storagePath !== storagePath ||
            data?.contentHash !== contentHash
          ) {
            throw new HttpsError(
              "already-exists",
              "Idempotency conflict: An operation with this key exists with conflicting payload or parameters.",
            );
          }
          isRetry = true;
          existingOpData = data;
          operationId = data.operationId || operationId;
          currentVersion = data.intendedVersion || currentVersion;
          previousVersion =
            data.previousVersion !== undefined ? data.previousVersion : previousVersion;
          archivePath = data.archivePath || archivePath;

          tx.update(operationRef, {
            updatedAt: FieldValue.serverTimestamp(),
            retryCount: FieldValue.increment(1),
          });
        } else {
          tx.set(operationRef, {
            operationId,
            idempotencyKey,
            storagePath,
            reportId: pathReportId,
            facilityId: pathFacilityId,
            actorId: caller.uid,
            actorRole: caller.role,
            sourceGeneration: targetGeneration !== null ? String(targetGeneration) : null,
            intendedAction: "REPORT_FILE_REPLACE",
            intendedVersion: currentVersion,
            previousVersion,
            contentHash,
            status: "PENDING",
            archivePath: archivePath || null,
            retryCount: 0,
            timestamp: FieldValue.serverTimestamp(),
            createdAt: new Date().toISOString(),
          });
        }
      });
    } catch (opErr: any) {
      if (opErr instanceof HttpsError) {
        throw opErr;
      }
      console.error("Critical failure executing operation transaction:", opErr);
      throw new HttpsError(
        "internal",
        `Durable operation logging failure: Unable to record replacement operation (${
          opErr?.message || "Database error"
        }). Replacement aborted.`,
      );
    }

    if (isCompleted && existingOpData) {
      return {
        success: true,
        storagePath,
        archivePath: existingOpData.archivePath || undefined,
        version: existingOpData.intendedVersion || existingOpData.version || currentVersion,
        uploadedAt:
          existingOpData.completedIso || existingOpData.createdAt || new Date().toISOString(),
      };
    }

    // 7. Check for Resumable Operation: If Cloud Storage save succeeded in prior attempt
    let isStorageSavedAlready = false;
    if (isRetry && existingOpData) {
      try {
        const [checkMeta] = await targetFile.getMetadata();
        if (
          checkMeta &&
          (checkMeta.metadata?.operationId === operationId ||
            (checkMeta.metadata?.contentHash === contentHash &&
              checkMeta.generation &&
              String(checkMeta.generation) !== String(targetGeneration)))
        ) {
          isStorageSavedAlready = true;
        }
      } catch (_e) {
        // Storage check error ignored
      }
    }

    if (!isStorageSavedAlready) {
      // Version Archival Logic: Archive prior version if it exists
      if (targetGeneration !== null && archivePath) {
        const archiveFile = bucket.file(archivePath);

        try {
          const copyOpts: any = {
            ifSourceGenerationMatch: targetGeneration,
            ifGenerationMatch: 0,
          };
          await targetFile.copy(archiveFile, copyOpts);
          await archiveFile.setMetadata({
            metadata: {
              operationId,
              reportId: pathReportId,
              facilityId: pathFacilityId,
              actorId: caller.uid,
              actorRole: caller.role,
              archivedPath: archivePath,
              timestamp: new Date().toISOString(),
              action: "REPORT_VERSION_ARCHIVED",
              archivedAt: new Date().toISOString(),
              archivedByUid: caller.uid,
              originalStoragePath: storagePath,
              sourceGeneration: String(targetGeneration),
              version: String(previousVersion),
              summaryNotes: summaryNotes || "Archived previous report version during update",
            },
          });
        } catch (err: any) {
          await operationRef
            .update({
              status: "ABORTED_ARCHIVAL_FAILED",
              error: err?.message || "Archival copy error",
              updatedAt: FieldValue.serverTimestamp(),
            })
            .catch(() => {});

          if (
            err?.code === 412 ||
            err?.code === 404 ||
            err?.message?.includes("condition") ||
            err?.message?.includes("precondition") ||
            err?.message?.includes("No such object")
          ) {
            throw new HttpsError(
              "aborted",
              `Concurrent modification detected during version archival: Source file generation (${targetGeneration}) was updated or deleted by another process before copy completed.`,
            );
          }
          throw new HttpsError(
            "internal",
            `Archival failure: Failed to archive prior report version (${err?.message || "Storage error"}). Report replacement aborted.`,
          );
        }
      }

      // Concurrency-Safe Save with Generation Preconditions
      const saveOpts: any = {
        contentType: verifiedContentType,
        preconditionOpts:
          targetGeneration !== null
            ? { ifGenerationMatch: targetGeneration }
            : { ifGenerationMatch: 0 },
        metadata: {
          metadata: {
            operationId,
            reportId: pathReportId,
            facilityId: pathFacilityId,
            actorId: caller.uid,
            actorRole: caller.role,
            archivedPath: archivePath || "",
            timestamp: new Date().toISOString(),
            action: "REPORT_FILE_REPLACED",
            uploadedByUid: caller.uid,
            updatedAt: new Date().toISOString(),
            version: String(currentVersion),
            summaryNotes: summaryNotes || "Report replaced via secure versioning",
            contentHash,
          },
        },
      };

      try {
        await targetFile.save(fileBuffer, saveOpts);
      } catch (err: any) {
        await operationRef
          .update({
            status: "FAILED_STORAGE_SAVE",
            error: err?.message || "Storage save error",
            updatedAt: FieldValue.serverTimestamp(),
          })
          .catch(() => {});

        if (
          err?.code === 412 ||
          err?.message?.includes("condition") ||
          err?.message?.includes("precondition")
        ) {
          throw new HttpsError(
            "aborted",
            "Concurrent modification detected: The report file was updated by another user or process. Replacement rejected.",
          );
        }
        throw new HttpsError(
          "internal",
          `Failed to save replacement report file: ${err?.message || "Storage write error"}`,
        );
      }
    }

    const nowIso = new Date().toISOString();

    // 8. Atomic Audit Finalization via Firestore Batch
    const batch = db.batch();

    batch.update(operationRef, {
      status: "COMPLETED",
      completedAt: FieldValue.serverTimestamp(),
      completedIso: nowIso,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const auditRef = db.collection("report_audit_logs").doc(`audit_${operationId}`);
    batch.set(auditRef, {
      operationId,
      idempotencyKey,
      reportId: pathReportId,
      facilityId: pathFacilityId,
      actorId: caller.uid,
      actorRole: caller.role,
      storagePath,
      archivePath: archivePath || null,
      action: "REPORT_FILE_REPLACED",
      version: currentVersion,
      sourceGeneration: targetGeneration !== null ? String(targetGeneration) : null,
      contentHash,
      timestamp: FieldValue.serverTimestamp(),
      createdAt: nowIso,
    });

    try {
      await batch.commit();
    } catch (auditErr: any) {
      console.error(
        "Critical warning: Failed to finalize audit log / operation record in Firestore:",
        auditErr,
      );
      throw new HttpsError(
        "internal",
        `Audit logging failure: Report file was replaced in Cloud Storage, but writing the Firestore audit record failed (${
          auditErr?.message || "Database error"
        }).`,
      );
    }

    return {
      success: true,
      storagePath,
      archivePath,
      version: currentVersion,
      uploadedAt: nowIso,
    };
  },
);
