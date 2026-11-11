import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockGetBlob, mockRef } = vi.hoisted(() => ({
  mockGetBlob: vi.fn(),
  mockRef: vi.fn((_storage, path) => ({ fullPath: path })),
}));

vi.mock("firebase/storage", () => ({
  ref: mockRef,
  getBlob: mockGetBlob,
}));

vi.mock("@/lib/firebase", () => ({
  storage: { _type: "mock_storage" },
  auth: { currentUser: { uid: "test_user" } },
  db: {},
  defaultDb: {},
}));

import { viewReportFile } from "@/services/reportStorage";

describe("Authenticated diagnostic report viewer", () => {
  const reportPath = "facilities/test/reports/123/report.pdf";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("opens a loading tab before Firebase finishes downloading", async () => {
    let finishDownload!: (blob: Blob) => void;

    mockGetBlob.mockImplementation(
      () => new Promise<Blob>((resolve) => {
        finishDownload = resolve;
      }),
    );

    const tab = {
      closed: false,
      document: {
        title: "",
        body: {
          appendChild: vi.fn(),
          textContent: "",
        },
        createElement: vi.fn(() => ({
          textContent: "",
          style: { cssText: "" },
        })),
      },
      location: { replace: vi.fn() },
    };

    const openSpy = vi.fn(() => tab);
    const createUrl = vi.fn(() => "blob:mock-report");
    const revokeUrl = vi.fn();

    vi.stubGlobal("window", { open: openSpy });
    vi.stubGlobal("URL", {
      createObjectURL: createUrl,
      revokeObjectURL: revokeUrl,
    });

    const pending = viewReportFile(reportPath);

    expect(openSpy).toHaveBeenCalledWith("", "_blank");
    expect(tab.document.body.appendChild).toHaveBeenCalled();
    expect(tab.location.replace).not.toHaveBeenCalled();

    finishDownload(
      new Blob(["%PDF-1.4"], { type: "application/pdf" }),
    );

    await pending;

    expect(mockGetBlob).toHaveBeenCalledTimes(1);
    expect(tab.location.replace).toHaveBeenCalledWith(
      "blob:mock-report",
    );

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(revokeUrl).toHaveBeenCalledWith("blob:mock-report");
  });

  it("shows an error if Firebase download fails", async () => {
    mockGetBlob.mockRejectedValue(new Error("Permission denied"));

    const tab = {
      closed: false,
      document: {
        title: "",
        body: {
          appendChild: vi.fn(),
          textContent: "",
        },
        createElement: vi.fn(() => ({
          textContent: "",
          style: { cssText: "" },
        })),
      },
      location: { replace: vi.fn() },
    };

    vi.stubGlobal("window", {
      open: vi.fn(() => tab),
    });

    await expect(viewReportFile(reportPath)).rejects.toThrow(
      "Permission denied",
    );

    expect(tab.document.body.textContent).toContain(
      "Unable to load this report",
    );
  });

  it("rejects a blocked popup before downloading", async () => {
    vi.stubGlobal("window", {
      open: vi.fn(() => null),
    });

    await expect(viewReportFile(reportPath)).rejects.toThrow(
      "Popup blocked",
    );

    expect(mockGetBlob).not.toHaveBeenCalled();
  });
});
