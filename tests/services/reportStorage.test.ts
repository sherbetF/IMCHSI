import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockStorageRef,
  mockUploadBytes,
  mockUploadBytesResumable,
  mockGetBlob,
  mockGetDownloadURL,
  mockDeleteObject,
} = vi.hoisted(() => ({
  mockStorageRef: vi.fn((_storage, path) => ({
    fullPath: path,
    name: path.split("/").pop(),
  })),
  mockUploadBytes: vi.fn(),
  mockUploadBytesResumable: vi.fn(),
  mockGetBlob: vi.fn(),
  mockGetDownloadURL: vi.fn(),
  mockDeleteObject: vi.fn(),
}));

vi.mock("firebase/storage", () => ({
  ref: mockStorageRef,
  uploadBytes: mockUploadBytes,
  uploadBytesResumable: mockUploadBytesResumable,
  getBlob: mockGetBlob,
  getDownloadURL: mockGetDownloadURL,
  deleteObject: mockDeleteObject,
}));

vi.mock("@/lib/firebase", () => ({
  storage: { _type: "firebase_storage_mock" },
  auth: { currentUser: { uid: "test_user_123" } },
  db: { _type: "firestore" },
  defaultDb: { _type: "firestore_default" },
}));

import {
  uploadReportFile,
  getReportBlob,
  getReportDownloadUrl,
  deleteReportFile,
} from "@/services/reportStorage";

describe("Firebase Storage Report Service (reportStorage.ts)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUploadBytes.mockResolvedValue({
      metadata: { fullPath: "mock_path" },
    });
    mockGetDownloadURL.mockResolvedValue("https://storage.googleapis.com/download/mock.pdf");
  });

  it("1. Verifies 'ref' is defined and called with correct storage instance and canonical path", async () => {
    const file = new File(["test pdf content"], "Holter_Report.pdf", {
      type: "application/pdf",
    });

    const result = await uploadReportFile(file, "hospital_kota_tinggi", "HOLTER-HKT-1001", false);

    expect(mockStorageRef).toHaveBeenCalledTimes(1);
    expect(mockStorageRef).toHaveBeenCalledWith(
      { _type: "firebase_storage_mock" },
      "facilities/hospital_kota_tinggi/reports/HOLTER-HKT-1001/Holter_Report.pdf",
    );

    expect(result).toBeDefined();
    expect(result.storagePath).toBe(
      "facilities/hospital_kota_tinggi/reports/HOLTER-HKT-1001/Holter_Report.pdf",
    );
    expect(result.fileName).toBe("Holter_Report.pdf");
    expect(result.contentType).toBe("application/pdf");
  });

  it("2. Uploads small PDF and saves correct metadata", async () => {
    const file = new File(["%PDF-1.4 small pdf"], "small_ecg.pdf", {
      type: "application/pdf",
    });

    const result = await uploadReportFile(file, "kk_masai", "HOLTER-KMS-2022", false, "Test notes");

    expect(mockUploadBytes).toHaveBeenCalledTimes(1);
    expect(result.summaryNotes).toBe("Test notes");
    expect(result.storagePath).toContain("facilities/kk_masai/reports/HOLTER-KMS-2022/");
  });

  it("3. Uploads large PDF with progress callback using uploadBytesResumable", async () => {
    const largeBuffer = new Uint8Array(2 * 1024 * 1024); // 2 MB
    const file = new File([largeBuffer], "Holter_24H_Continuous.pdf", {
      type: "application/pdf",
    });

    const progressReports: Array<{ stage: string; percent: number }> = [];
    const onProgress = (stage: string, _msg: string, percent: number) => {
      progressReports.push({ stage, percent });
    };

    mockUploadBytesResumable.mockImplementation((_ref, _blob, _meta) => {
      return {
        on: (_event: string, _onState: any, _onError: any, onComplete: any) => {
          onComplete();
        },
      };
    });

    const result = await uploadReportFile(
      file,
      "hospital_mersing",
      "HOLTER-HMS-3003",
      false,
      "Resumable upload",
      onProgress,
    );

    expect(mockUploadBytesResumable).toHaveBeenCalledTimes(1);
    expect(result.storagePath).toBe(
      "facilities/hospital_mersing/reports/HOLTER-HMS-3003/Holter_24H_Continuous.pdf",
    );
    expect(progressReports.some((p) => p.stage === "completed")).toBe(true);
  });

  it("4. Uploads JPEG/PNG image files with correct MIME type and structure", async () => {
    const imgFile = new File(["fake image binary"], "stress_treadmill.jpg", {
      type: "image/jpeg",
    });

    const result = await uploadReportFile(imgFile, "hospital_kluang", "STRESS-HKL-4004", false);

    expect(mockStorageRef).toHaveBeenCalledWith(
      expect.anything(),
      "facilities/hospital_kluang/reports/STRESS-HKL-4004/stress_treadmill.jpg",
    );
    expect(result.contentType).toBe("image/jpeg");
  });

  it("5. Outsource requests use outsource rootPrefix", async () => {
    const file = new File(["outsource report"], "CT_Scan_Report.pdf", {
      type: "application/pdf",
    });

    const result = await uploadReportFile(file, "columbia_asia", "OUTSOURCE-CA-5005", true);

    expect(result.storagePath).toBe(
      "outsource/columbia_asia/reports/OUTSOURCE-CA-5005/CT_Scan_Report.pdf",
    );
  });

  it("6. getReportBlob calls ref and getBlob properly", async () => {
    const mockBlob = new Blob(["pdf content"], { type: "application/pdf" });
    mockGetBlob.mockResolvedValue(mockBlob);

    const blob = await getReportBlob("facilities/fac_1/reports/rep_1/result.pdf");

    expect(mockStorageRef).toHaveBeenCalledWith(
      { _type: "firebase_storage_mock" },
      "facilities/fac_1/reports/rep_1/result.pdf",
    );
    expect(mockGetBlob).toHaveBeenCalledTimes(1);
    expect(blob).toBe(mockBlob);
  });

  it("7. deleteReportFile calls ref and deleteObject properly", async () => {
    mockDeleteObject.mockResolvedValue(undefined);

    await deleteReportFile("facilities/fac_1/reports/rep_1/result.pdf");

    expect(mockStorageRef).toHaveBeenCalledWith(
      { _type: "firebase_storage_mock" },
      "facilities/fac_1/reports/rep_1/result.pdf",
    );
    expect(mockDeleteObject).toHaveBeenCalledTimes(1);
  });

  it("8. getReportDownloadUrl calls ref and getDownloadURL properly", async () => {
    mockGetDownloadURL.mockResolvedValue("https://storage.googleapis.com/test-url");

    const url = await getReportDownloadUrl("facilities/fac_1/reports/rep_1/result.pdf");

    expect(url).toBe("https://storage.googleapis.com/test-url");
    expect(mockGetDownloadURL).toHaveBeenCalledTimes(1);
  });

  it("9. Holter PDF upload logs pre-upload diagnostics, preserves application/pdf contentType (never application/gzip), and omits Base64 dataUrl", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const pdfContent = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n" + "A".repeat(4096);
    const holterPdf = new File([pdfContent], "Holter_Result_New.pdf", {
      type: "application/pdf",
    });

    const result = await uploadReportFile(
      holterPdf,
      "hospital_kota_tinggi",
      "HOLTER-NEW-9001",
      false,
      "24 Hours Holter diagnostic report attached.",
    );

    expect(result.contentType).toBe("application/pdf");
    expect(result.contentType).not.toBe("application/gzip");
    expect(result.dataUrl).toBeUndefined();
    expect(result.storagePath).toBe(
      "facilities/hospital_kota_tinggi/reports/HOLTER-NEW-9001/Holter_Result_New.pdf",
    );

    expect(mockUploadBytes).toHaveBeenCalledWith(
      expect.objectContaining({
        fullPath: "facilities/hospital_kota_tinggi/reports/HOLTER-NEW-9001/Holter_Result_New.pdf",
      }),
      expect.any(Blob),
      expect.objectContaining({
        contentType: "application/pdf",
      }),
    );

    expect(infoSpy).toHaveBeenCalledWith(
      "[ReportStorage] Pre-Upload Diagnostics:",
      expect.objectContaining({
        authenticatedUid: "test_user_123",
        firestoreDatabaseId: "ai-studio-hospitalhubdesig-7f7a6729-a1d2-48e8-ba86-ae6c290d754c",
        firebaseStorageBucket: "outsource-f1e0f.firebasestorage.app",
        fileName: "Holter_Result_New.pdf",
        fileType: "application/pdf",
        fileSize: holterPdf.size,
        finalUploadContentType: "application/pdf",
        finalStoragePath:
          "facilities/hospital_kota_tinggi/reports/HOLTER-NEW-9001/Holter_Result_New.pdf",
      }),
    );

    infoSpy.mockRestore();
  });
});
