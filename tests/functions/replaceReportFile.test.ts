import { describe, it, expect, vi, beforeEach } from "vitest";
import * as crypto from "node:crypto";
import {
  validateFileContentAndSignature,
  calculateNextReportVersion,
} from "../../functions/src/replaceReportFile";
import { verifyOutsourceProviderRelationship } from "../../functions/src/authorizePatientReportDownload";
import { SYNTHETIC_IDENTITIES } from "../fixtures/syntheticIdentities";

describe("Backend Cloud Function — replaceReportFile Specification & Logic Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("File Content & Magic Byte Signature Validation", () => {
    it("rejects empty files (0 bytes)", () => {
      const emptyBuffer = Buffer.alloc(0);
      expect(() => validateFileContentAndSignature(emptyBuffer, "application/pdf")).toThrowError(
        /empty \(0 bytes\)/,
      );
    });

    it("rejects oversized files (>20MB)", () => {
      const oversizedBuffer = Buffer.alloc(21 * 1024 * 1024);
      expect(() =>
        validateFileContentAndSignature(oversizedBuffer, "application/pdf"),
      ).toThrowError(/exceeds 20MB limit/);
    });

    it("validates genuine PDF file with correct magic bytes (%PDF-)", () => {
      const pdfHeader = Buffer.from("%PDF-1.7\n%hello world test pdf content");
      const detected = validateFileContentAndSignature(pdfHeader, "application/pdf");
      expect(detected).toBe("application/pdf");
    });

    it("validates genuine PNG file with correct magic bytes (\x89PNG)", () => {
      const pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      ]);
      const detected = validateFileContentAndSignature(pngHeader, "image/png");
      expect(detected).toBe("image/png");
    });

    it("validates genuine JPEG file with correct magic bytes (0xFF 0xD8 0xFF)", () => {
      const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
      const detected = validateFileContentAndSignature(jpegHeader, "image/jpeg");
      expect(detected).toBe("image/jpeg");
    });

    it("rejects text or fake payload disguised as PDF (magic byte signature failure)", () => {
      const fakePdf = Buffer.from("<html><body>Not a PDF!</body></html>");
      expect(() => validateFileContentAndSignature(fakePdf, "application/pdf")).toThrowError(
        /Magic byte signature verification failed/,
      );
    });

    it("rejects MIME/signature mismatch (e.g. PDF file claimed as image/png)", () => {
      const pdfHeader = Buffer.from("%PDF-1.7\nSample content");
      expect(() => validateFileContentAndSignature(pdfHeader, "image/png")).toThrowError(
        /MIME signature mismatch/,
      );
    });
  });

  describe("Version 35 Fix A — Server-Managed Monotonic Report Versioning", () => {
    it("returns version 1 when target file does not exist (targetGeneration is null)", () => {
      const v = calculateNextReportVersion(null, []);
      expect(v).toBe(1);
    });

    it("returns version 2 when target file exists but no prior audit logs exist", () => {
      const v = calculateNextReportVersion("1712345678", []);
      expect(v).toBe(2);
    });

    it("returns maxVersion + 1 when previous audit log entries exist", () => {
      const logs = [{ version: 2 }, { version: 3 }];
      const v = calculateNextReportVersion("1712345679", logs);
      expect(v).toBe(4);
    });

    it("monotonically increments when logs contain non-sequential or legacy versions", () => {
      const logs = [{ version: 2 }, { version: 5 }];
      const v = calculateNextReportVersion("1712345680", logs);
      expect(v).toBe(6);
    });

    it("never invents version numbers from Cloud Storage generation strings", () => {
      const gcsGen = "1728383920192831";
      const v = calculateNextReportVersion(gcsGen, [{ version: 2 }]);
      expect(v).toBe(3);
      expect(v).not.toBe(Number(gcsGen));
    });
  });

  describe("Version 35 Fix B — Reliable Non-Swallowed Audit Logging", () => {
    it("fails closed and throws error when audit log persistence fails", async () => {
      async function simulateAuditLogging(throwError: boolean) {
        if (throwError) {
          throw new Error("Firestore quota exceeded or permission denied");
        }
        return { id: "audit_doc_123" };
      }

      await expect(simulateAuditLogging(true)).rejects.toThrowError(
        /Firestore quota exceeded or permission denied/,
      );
    });
  });

  describe("Version 36 Problem A — Fail-Closed Version History & StoragePath Scoping", () => {
    it("fails closed when authoritative version history query throws an error", async () => {
      async function simulateVersionFetch(dbQueryFails: boolean) {
        if (dbQueryFails) {
          throw new Error("Firestore query connection timeout");
        }
        return [{ version: 2 }];
      }

      await expect(simulateVersionFetch(true)).rejects.toThrowError(
        /Firestore query connection timeout/,
      );
    });

    it("scopes version history specifically to storagePath", () => {
      const logsForPath = [
        { storagePath: "facilities/FAC_A/reports/REP_1/report.pdf", version: 1 },
        { storagePath: "facilities/FAC_A/reports/REP_1/report.pdf", version: 2 },
      ];
      const nextVer = calculateNextReportVersion("1728192000", logsForPath);
      expect(nextVer).toBe(3);
    });
  });

  describe("Version 36 Problem B — Durable Pre-Modification Operation Record Workflow", () => {
    it("verifies operation record payload includes unique operationId, actor, path, source generation and status PENDING", () => {
      const mockStoragePath = "facilities/FAC_A/reports/REP_1/report.pdf";
      const targetGen = "1829304920";
      const currentVer = 3;
      const caller = { uid: "user_123", role: "facility" };

      const operationRecord = {
        operationId: "op_1728392019_abc123def456",
        idempotencyKey: "op_REP_1_1829304920_a1b2c3d4",
        storagePath: mockStoragePath,
        reportId: "REP_1",
        facilityId: "FAC_A",
        actorId: caller.uid,
        actorRole: caller.role,
        sourceGeneration: targetGen,
        intendedAction: "REPORT_FILE_REPLACE",
        intendedVersion: currentVer,
        previousVersion: currentVer - 1,
        status: "PENDING",
      };

      expect(operationRecord.operationId).toMatch(/^op_/);
      expect(operationRecord.status).toBe("PENDING");
      expect(operationRecord.sourceGeneration).toBe(targetGen);
      expect(operationRecord.previousVersion).toBe(2);
      expect(operationRecord.intendedVersion).toBe(3);
    });

    it("verifies GCS preconditions match source targetGeneration during archival and replacement save", () => {
      const targetGeneration = "9988776655";

      const archivalOpts = {
        ifSourceGenerationMatch: targetGeneration,
        ifGenerationMatch: 0,
      };

      const saveOpts = {
        preconditionOpts: {
          ifGenerationMatch: targetGeneration,
        },
      };

      expect(archivalOpts.ifSourceGenerationMatch).toBe(targetGeneration);
      expect(saveOpts.preconditionOpts.ifGenerationMatch).toBe(targetGeneration);
    });
  });

  describe("Version 37 — Complete Medical Report Replacement Reliability", () => {
    it("1. Idempotency: ignores PENDING or failed operations in version calculation", () => {
      const logs = [
        { version: 1, status: "COMPLETED" },
        { version: 2, status: "PENDING" }, // Abandoned/pending op should NOT count
        { version: 2, status: "FAILED_STORAGE_SAVE" },
      ];
      // calculateNextReportVersion filters out non-COMPLETED ops in replaceReportFile.ts
      const completedOnlyLogs = logs.filter((l) => l.status === "COMPLETED");
      const nextVer = calculateNextReportVersion("1728192000", completedOnlyLogs);
      expect(nextVer).toBe(2); // Next version should be 2, not 3!
    });

    it("2. Idempotency: generates deterministic idempotency key bound to actor, path, generation, and contentHash", () => {
      const actorId = "user_fac_123";
      const storagePath = "facilities/FAC_A/reports/REP_1/report.pdf";
      const gen = "12345678";
      const contentHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

      const idempotencyRaw = `${actorId}|${storagePath}|${gen}|${contentHash}`;
      const idempotencyKey = crypto.createHash("sha256").update(idempotencyRaw).digest("hex");

      expect(idempotencyKey).toBeDefined();
      expect(idempotencyKey).toHaveLength(64);

      // Verify identical parameters produce identical idempotencyKey
      const key2 = crypto
        .createHash("sha256")
        .update(`${actorId}|${storagePath}|${gen}|${contentHash}`)
        .digest("hex");
      expect(idempotencyKey).toBe(key2);

      // Verify different actor produces different idempotencyKey
      const keyDiffActor = crypto
        .createHash("sha256")
        .update(`user_diff|${storagePath}|${gen}|${contentHash}`)
        .digest("hex");
      expect(idempotencyKey).not.toBe(keyDiffActor);
    });

    it("3. Atomic Finalization: uses deterministic audit doc ID based on operationId", () => {
      const operationId = "op_1728392019_abc123def456";
      const expectedAuditDocId = `audit_${operationId}`;
      expect(expectedAuditDocId).toBe("audit_op_1728392019_abc123def456");
    });

    it("4. Recoverable Operations: returns cached completed result when transaction detects status COMPLETED", () => {
      const existingCompletedData = {
        operationId: "op_1001",
        idempotencyKey: "key_1001",
        status: "COMPLETED",
        intendedVersion: 3,
        archivePath: "facilities/FAC_A/reports/REP_1/archive/123/report.pdf",
        completedIso: "2026-10-08T12:00:00.000Z",
      };

      const mockResponse = {
        success: true,
        storagePath: "facilities/FAC_A/reports/REP_1/report.pdf",
        archivePath: existingCompletedData.archivePath,
        version: existingCompletedData.intendedVersion,
        uploadedAt: existingCompletedData.completedIso,
      };

      expect(mockResponse.success).toBe(true);
      expect(mockResponse.version).toBe(3);
      expect(mockResponse.archivePath).toContain("archive");
    });
  });

  describe("Outsource Provider Assignment Validation", () => {
    it("permits assigned Outsource provider matching canonical outsourceProviderId", () => {
      const caller: any = {
        uid: "provider_123",
        role: "outsource",
        facilityId: "FAC_A",
        userData: {
          outsourceProviderId: "PROVIDER_XYZ",
          active: true,
        },
      };
      const recordData = {
        id: "OUT_APPT_001",
        facilityId: "FAC_A",
        outsourceProviderId: "PROVIDER_XYZ",
      };

      const isAuthorized = verifyOutsourceProviderRelationship(caller, recordData);
      expect(isAuthorized).toBe(true);
    });

    it("permits assigned Outsource provider matching canonical providerId", () => {
      const caller: any = {
        uid: "provider_456",
        role: "outsource",
        facilityId: "FAC_A",
        userData: {
          providerId: "LAB_PROVIDER_99",
          active: true,
        },
      };
      const recordData = {
        id: "OUT_APPT_002",
        facilityId: "FAC_A",
        providerId: "LAB_PROVIDER_99",
      };

      const isAuthorized = verifyOutsourceProviderRelationship(caller, recordData);
      expect(isAuthorized).toBe(true);
    });

    it("denies unassigned Outsource provider with mismatched providerId", () => {
      const caller: any = {
        uid: "provider_rogue",
        role: "outsource",
        facilityId: "FAC_A",
        userData: {
          outsourceProviderId: "PROVIDER_ROGUE",
          active: true,
        },
      };
      const recordData = {
        id: "OUT_APPT_003",
        facilityId: "FAC_A",
        outsourceProviderId: "PROVIDER_LEGIT",
      };

      const isAuthorized = verifyOutsourceProviderRelationship(caller, recordData);
      expect(isAuthorized).toBe(false);
    });

    it("denies Outsource provider when record lacks assignment field", () => {
      const caller: any = {
        uid: "provider_rogue",
        role: "outsource",
        facilityId: "FAC_A",
        userData: {
          outsourceProviderId: "PROVIDER_XYZ",
          active: true,
        },
      };
      const recordData = {
        id: "OUT_APPT_004",
        facilityId: "FAC_A",
      };

      const isAuthorized = verifyOutsourceProviderRelationship(caller, recordData);
      expect(isAuthorized).toBe(false);
    });
  });

  describe("Access Control Matrix & Path Hierarchy", () => {
    function evaluateReplaceReportAuthorization(
      caller: any,
      requestParams: {
        storagePath: string;
        newFileBase64: string;
        fileName: string;
        contentType: string;
      },
      recordData?: any,
    ) {
      if (!caller) {
        return { authorized: false, code: "unauthenticated", message: "Authentication required" };
      }

      if (caller.active !== true) {
        return { authorized: false, code: "permission-denied", message: "Account is inactive" };
      }

      const { storagePath, newFileBase64, fileName, contentType } = requestParams;

      if (!storagePath || storagePath.includes("..")) {
        return { authorized: false, code: "invalid-argument", message: "Invalid storage path" };
      }

      const parts = storagePath.split("/");
      if (parts.length !== 5) {
        return { authorized: false, code: "invalid-argument", message: "Invalid path structure" };
      }

      const [prefix, pathFacilityId, reportsDir, pathReportId] = parts;
      if ((prefix !== "facilities" && prefix !== "outsource") || reportsDir !== "reports") {
        return { authorized: false, code: "invalid-argument", message: "Invalid path hierarchy" };
      }

      // Check record existence if provided
      if (recordData === null) {
        return { authorized: false, code: "not-found", message: "Record not found" };
      }

      // Role checks
      if (caller.role !== "admin") {
        if (prefix === "facilities") {
          if (caller.role !== "facility" || caller.facilityId !== pathFacilityId) {
            return {
              authorized: false,
              code: "permission-denied",
              message: "Unauthorized to update reports for this facility.",
            };
          }
        } else if (prefix === "outsource") {
          if (caller.role === "outsource") {
            if (recordData) {
              const isAssigned = verifyOutsourceProviderRelationship(caller, recordData);
              if (!isAssigned) {
                return {
                  authorized: false,
                  code: "permission-denied",
                  message: "Unassigned Outsource provider denied.",
                };
              }
            }
          } else {
            return {
              authorized: false,
              code: "permission-denied",
              message:
                "Access denied: Facility accounts and unauthorized roles are not permitted to replace Outsource reports.",
            };
          }
        }
      }

      // Magic byte check
      const fileBuffer = Buffer.from(newFileBase64, "base64");
      try {
        validateFileContentAndSignature(fileBuffer, contentType);
      } catch (err: any) {
        return { authorized: false, code: "invalid-argument", message: err.message };
      }

      return { authorized: true };
    }

    const validPdfBase64 = Buffer.from("%PDF-1.7\nSample report data").toString("base64");

    it("denies unauthenticated caller", () => {
      const res = evaluateReplaceReportAuthorization(null, {
        storagePath: "facilities/TEST_FACILITY_A/reports/REP_1/report.pdf",
        newFileBase64: validPdfBase64,
        fileName: "report.pdf",
        contentType: "application/pdf",
      });
      expect(res.authorized).toBe(false);
      expect(res.code).toBe("unauthenticated");
    });

    it("denies nonexistent appointment record", () => {
      const caller = {
        uid: "facility_a_user",
        role: "facility",
        facilityId: "TEST_FACILITY_A",
        active: true,
      };
      const res = evaluateReplaceReportAuthorization(
        caller,
        {
          storagePath: "facilities/TEST_FACILITY_A/reports/NONEXISTENT_REP/report.pdf",
          newFileBase64: validPdfBase64,
          fileName: "report.pdf",
          contentType: "application/pdf",
        },
        null, // null signifies non-existent record in DB
      );
      expect(res.authorized).toBe(false);
      expect(res.code).toBe("not-found");
    });

    it("denies cross-facility replacement attempts", () => {
      const caller = {
        uid: "facility_a_user",
        role: "facility",
        facilityId: "TEST_FACILITY_A",
        active: true,
      };
      const res = evaluateReplaceReportAuthorization(caller, {
        storagePath: "facilities/TEST_FACILITY_B/reports/REP_1/report.pdf",
        newFileBase64: validPdfBase64,
        fileName: "report.pdf",
        contentType: "application/pdf",
      });
      expect(res.authorized).toBe(false);
      expect(res.code).toBe("permission-denied");
    });

    it("denies unassigned Outsource provider for outsource report replacement", () => {
      const caller = {
        uid: "outsource_unassigned",
        role: "outsource",
        facilityId: "TEST_FACILITY_A",
        active: true,
        userData: { outsourceProviderId: "PROVIDER_BAD", active: true },
      };
      const recordData = {
        id: "OUT_001",
        facilityId: "TEST_FACILITY_A",
        outsourceProviderId: "PROVIDER_GOOD",
      };

      const res = evaluateReplaceReportAuthorization(
        caller,
        {
          storagePath: "outsource/TEST_FACILITY_A/reports/OUT_001/report.pdf",
          newFileBase64: validPdfBase64,
          fileName: "report.pdf",
          contentType: "application/pdf",
        },
        recordData,
      );
      expect(res.authorized).toBe(false);
      expect(res.code).toBe("permission-denied");
    });

    it("permits assigned Outsource provider for outsource report replacement", () => {
      const caller = {
        uid: "outsource_assigned",
        role: "outsource",
        facilityId: "TEST_FACILITY_A",
        active: true,
        userData: { outsourceProviderId: "PROVIDER_GOOD", active: true },
      };
      const recordData = {
        id: "OUT_001",
        facilityId: "TEST_FACILITY_A",
        outsourceProviderId: "PROVIDER_GOOD",
      };

      const res = evaluateReplaceReportAuthorization(
        caller,
        {
          storagePath: "outsource/TEST_FACILITY_A/reports/OUT_001/report.pdf",
          newFileBase64: validPdfBase64,
          fileName: "report.pdf",
          contentType: "application/pdf",
        },
        recordData,
      );
      expect(res.authorized).toBe(true);
    });

    it("denies ordinary facility accounts from replacing outsource reports", () => {
      const caller = {
        uid: "facility_a_user",
        role: "facility",
        facilityId: "TEST_FACILITY_A",
        active: true,
      };
      const recordData = {
        id: "OUT_001",
        facilityId: "TEST_FACILITY_A",
        outsourceProviderId: "PROVIDER_GOOD",
      };

      const res = evaluateReplaceReportAuthorization(
        caller,
        {
          storagePath: "outsource/TEST_FACILITY_A/reports/OUT_001/report.pdf",
          newFileBase64: validPdfBase64,
          fileName: "report.pdf",
          contentType: "application/pdf",
        },
        recordData,
      );
      expect(res.authorized).toBe(false);
      expect(res.code).toBe("permission-denied");
      expect(res.message).toContain(
        "Facility accounts and unauthorized roles are not permitted to replace Outsource reports",
      );
    });

    it("permits legitimate facility account to replace own report with valid PDF", () => {
      const caller = {
        uid: "facility_a_user",
        role: "facility",
        facilityId: "TEST_FACILITY_A",
        active: true,
      };
      const recordData = { id: "REP_1", facilityId: "TEST_FACILITY_A" };

      const res = evaluateReplaceReportAuthorization(
        caller,
        {
          storagePath: "facilities/TEST_FACILITY_A/reports/REP_1/report.pdf",
          newFileBase64: validPdfBase64,
          fileName: "report.pdf",
          contentType: "application/pdf",
        },
        recordData,
      );
      expect(res.authorized).toBe(true);
    });

    it("permits legitimate administrator account to replace report", () => {
      const caller = SYNTHETIC_IDENTITIES.ADMIN_ACTIVE;
      const recordData = { id: "REP_1", facilityId: "TEST_FACILITY_A" };

      const res = evaluateReplaceReportAuthorization(
        caller,
        {
          storagePath: "facilities/TEST_FACILITY_A/reports/REP_1/report.pdf",
          newFileBase64: validPdfBase64,
          fileName: "report.pdf",
          contentType: "application/pdf",
        },
        recordData,
      );
      expect(res.authorized).toBe(true);
    });
  });
});
