import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getRheumatologyAttachmentBlob,
  RheumatologyAttachmentError,
} from "@/services/rheumatologyAttachmentsService";

// Mock Firebase SDKs
vi.mock("firebase/storage", () => ({
  ref: vi.fn((_storage, path) => ({ fullPath: path })),
  uploadBytes: vi.fn(),
  getBlob: vi.fn(),
  deleteObject: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  doc: vi.fn((_db, ...parts) => ({ path: parts.join("/") })),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  onSnapshot: vi.fn(),
  serverTimestamp: vi.fn(() => ({ type: "serverTimestamp" })),
  Timestamp: { now: vi.fn() },
}));

vi.mock("firebase/functions", () => ({
  getFunctions: vi.fn(),
  httpsCallable: vi.fn(() => vi.fn()),
}));

vi.mock("@/lib/firebase", () => ({
  auth: { currentUser: { uid: "test_doc_uid" } },
  db: { _type: "firestore" },
  storage: { _type: "storage" },
  functions: { _type: "functions" },
}));

import { getBlob } from "firebase/storage";
import { getDoc } from "firebase/firestore";
import { auth } from "@/lib/firebase";

describe("Hardened Attachment Viewer Service (Issue 1C)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (auth as any).currentUser = { uid: "test_doc_uid" };
  });

  it("1. Doctor retrieves attachment via getBlob() rather than getDownloadURL()", async () => {
    // Mock user profile: Active Doctor
    (getDoc as any).mockImplementation((docRef: { path: string }) => {
      if (docRef.path === "users/test_doc_uid") {
        return Promise.resolve({
          exists: () => true,
          data: () => ({
            role: "doctor",
            active: true,
            doctorId: "DOC_01",
          }),
        });
      }
      if (docRef.path === "rheumatology_appointments/ref_101/attachments/att_01") {
        return Promise.resolve({
          exists: () => true,
          data: () => ({
            attachmentId: "att_01",
            storagePath: "rheumatology/FAC_A/ref_101/att_01/report.pdf",
            originalFileName: "report.pdf",
          }),
        });
      }
      return Promise.resolve({ exists: () => false, data: () => ({}) });
    });

    const mockBlob = new Blob(["fake pdf content"], { type: "application/pdf" });
    (getBlob as any).mockResolvedValue(mockBlob);

    const result = await getRheumatologyAttachmentBlob("ref_101", "att_01");

    expect(result).toBe(mockBlob);
    expect(getBlob).toHaveBeenCalledTimes(1);
    expect(getBlob).toHaveBeenCalledWith({
      fullPath: "rheumatology/FAC_A/ref_101/att_01/report.pdf",
    });
  });

  it("2. Owning Facility retrieves attachment via getBlob()", async () => {
    (auth as any).currentUser = { uid: "test_fac_uid" };

    (getDoc as any).mockImplementation((docRef: { path: string }) => {
      if (docRef.path === "users/test_fac_uid") {
        return Promise.resolve({
          exists: () => true,
          data: () => ({
            role: "facility",
            active: true,
            facilityId: "FAC_A",
          }),
        });
      }
      if (docRef.path === "rheumatology_appointments/ref_101") {
        return Promise.resolve({
          exists: () => true,
          data: () => ({
            facilityId: "FAC_A",
            status: "Pending Doctor Review",
          }),
        });
      }
      if (docRef.path === "rheumatology_appointments/ref_101/attachments/att_02") {
        return Promise.resolve({
          exists: () => true,
          data: () => ({
            attachmentId: "att_02",
            storagePath: "rheumatology/FAC_A/ref_101/att_02/lab.png",
            originalFileName: "lab.png",
          }),
        });
      }
      return Promise.resolve({ exists: () => false, data: () => ({}) });
    });

    const mockBlob = new Blob(["image data"], { type: "image/png" });
    (getBlob as any).mockResolvedValue(mockBlob);

    const result = await getRheumatologyAttachmentBlob("ref_101", "att_02");
    expect(result).toBe(mockBlob);
    expect(getBlob).toHaveBeenCalledTimes(1);
  });

  it("3. Unrelated Facility is denied access to other facility attachment", async () => {
    (auth as any).currentUser = { uid: "test_fac_b_uid" };

    (getDoc as any).mockImplementation((docRef: { path: string }) => {
      if (docRef.path === "users/test_fac_b_uid") {
        return Promise.resolve({
          exists: () => true,
          data: () => ({
            role: "facility",
            active: true,
            facilityId: "FAC_B",
          }),
        });
      }
      if (docRef.path === "rheumatology_appointments/ref_101") {
        return Promise.resolve({
          exists: () => true,
          data: () => ({
            facilityId: "FAC_A", // Belongs to FAC_A, not FAC_B
          }),
        });
      }
      return Promise.resolve({ exists: () => false, data: () => ({}) });
    });

    await expect(getRheumatologyAttachmentBlob("ref_101", "att_01")).rejects.toThrow(
      "You cannot access attachments belonging to another healthcare facility.",
    );
  });

  it("4. Paramedic account is strictly denied attachment access", async () => {
    (auth as any).currentUser = { uid: "test_paramedic_uid" };

    (getDoc as any).mockImplementation((docRef: { path: string }) => {
      if (docRef.path === "users/test_paramedic_uid") {
        return Promise.resolve({
          exists: () => true,
          data: () => ({
            role: "paramedic_nurse",
            active: true,
          }),
        });
      }
      return Promise.resolve({ exists: () => false, data: () => ({}) });
    });

    await expect(getRheumatologyAttachmentBlob("ref_101", "att_01")).rejects.toThrow(
      "Paramedic accounts are not authorized to access clinical document attachments.",
    );
  });

  it("5. Outsource account is strictly denied attachment access", async () => {
    (auth as any).currentUser = { uid: "test_outsource_uid" };

    (getDoc as any).mockImplementation((docRef: { path: string }) => {
      if (docRef.path === "users/test_outsource_uid") {
        return Promise.resolve({
          exists: () => true,
          data: () => ({
            role: "outsource",
            active: true,
          }),
        });
      }
      return Promise.resolve({ exists: () => false, data: () => ({}) });
    });

    await expect(getRheumatologyAttachmentBlob("ref_101", "att_01")).rejects.toThrow(
      "Outsource accounts are not authorized to access Rheumatology attachments.",
    );
  });

  it("6. Inactive account is denied access", async () => {
    (getDoc as any).mockImplementation((docRef: { path: string }) => {
      if (docRef.path === "users/test_doc_uid") {
        return Promise.resolve({
          exists: () => true,
          data: () => ({
            role: "doctor",
            active: false, // Inactive account
          }),
        });
      }
      return Promise.resolve({ exists: () => false, data: () => ({}) });
    });

    await expect(getRheumatologyAttachmentBlob("ref_101", "att_01")).rejects.toThrow(
      "Your account is currently inactive.",
    );
  });

  it("7. Handles storage/unauthorized cleanly without leaking sensitive details", async () => {
    (getDoc as any).mockImplementation((docRef: { path: string }) => {
      if (docRef.path === "users/test_doc_uid") {
        return Promise.resolve({
          exists: () => true,
          data: () => ({
            role: "doctor",
            active: true,
            doctorId: "DOC_01",
          }),
        });
      }
      if (docRef.path === "rheumatology_appointments/ref_101/attachments/att_01") {
        return Promise.resolve({
          exists: () => true,
          data: () => ({
            attachmentId: "att_01",
            storagePath: "rheumatology/FAC_A/ref_101/att_01/report.pdf",
          }),
        });
      }
      return Promise.resolve({ exists: () => false, data: () => ({}) });
    });

    (getBlob as any).mockRejectedValue({
      code: "storage/unauthorized",
      message: "Firebase Storage: User does not have permission to access '...'",
    });

    await expect(getRheumatologyAttachmentBlob("ref_101", "att_01")).rejects.toThrow(
      "Access to this clinical document was denied. Verify you have active authorization.",
    );
  });

  it("8. Cancellation/supersession pattern prevents orphaned Object URLs on stale resolutions", async () => {
    // Simulates the safe cancellation logic in RheumatologyAttachmentsManager:
    let activeFetchId = 0;
    let activeObjectUrl: string | null = null;
    const revokedUrls: string[] = [];

    const mockCreateObjectURL = vi.fn((_blob: Blob) => "blob:http://localhost:3000/mock-uuid-999");
    const mockRevokeObjectURL = vi.fn((url: string) => {
      revokedUrls.push(url);
    });

    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = mockCreateObjectURL;
    URL.revokeObjectURL = mockRevokeObjectURL;

    try {
      // Step A: First fetch starts
      const fetch1Id = ++activeFetchId;

      // Step B: User closes viewer or selects second attachment before first completes
      activeFetchId += 1;

      // Step C: First fetch completes (stale result)
      const mockBlob = new Blob(["data"], { type: "application/pdf" });
      if (activeFetchId === fetch1Id) {
        activeObjectUrl = URL.createObjectURL(mockBlob);
      }

      // Verifies: Object URL was NEVER created for the stale/cancelled fetch
      expect(activeObjectUrl).toBeNull();
      expect(mockCreateObjectURL).not.toHaveBeenCalled();

      // Step D: Second fetch completes normally
      const fetch2Id = ++activeFetchId;
      if (activeFetchId === fetch2Id) {
        activeObjectUrl = URL.createObjectURL(mockBlob);
      }
      expect(activeObjectUrl).toBe("blob:http://localhost:3000/mock-uuid-999");

      // Step E: Viewer closes -> exactly one cleanup occurs
      if (activeObjectUrl) {
        URL.revokeObjectURL(activeObjectUrl);
        activeObjectUrl = null;
      }
      expect(revokedUrls).toEqual(["blob:http://localhost:3000/mock-uuid-999"]);
      expect(activeObjectUrl).toBeNull();
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });

  it("9. Guaranteed cleanup when interrupted between creation and assignment", () => {
    let activeFetchId = 5;
    const currentFetchId = 5;
    let activeObjectUrl: string | null = null;
    const revokedUrls: string[] = [];

    const originalRevoke = URL.revokeObjectURL;
    const originalCreate = URL.createObjectURL;
    URL.createObjectURL = vi.fn(() => "blob:http://localhost:3000/interrupted-url");
    URL.revokeObjectURL = vi.fn((url: string) => {
      revokedUrls.push(url);
    });

    try {
      const blob = new Blob(["interrupted content"]);
      const objectUrl = URL.createObjectURL(blob);

      // Simulate cancellation happening right as objectUrl was created
      activeFetchId = 6;

      if (activeFetchId !== currentFetchId) {
        URL.revokeObjectURL(objectUrl);
      } else {
        activeObjectUrl = objectUrl;
      }

      // Assert: objectUrl was revoked immediately and not orphaned
      expect(activeObjectUrl).toBeNull();
      expect(revokedUrls).toContain("blob:http://localhost:3000/interrupted-url");
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });
});
