import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  assertWriteFreezeInactive,
  getWriteFreezeStatus,
} from "../../functions/src/adminAuthHelper.js";
import { HttpsError } from "firebase-functions/v2/https";

/**
 * Offline negative tests for HOSPITALHUB_WRITE_FREEZE guard.
 * Validates that mutating operations are blocked without touching live production databases.
 */
describe("Phase 2B — Write Freeze Guard Negative Tests (Offline)", () => {
  const originalEnv = process.env.HOSPITALHUB_WRITE_FREEZE;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.HOSPITALHUB_WRITE_FREEZE;
    } else {
      process.env.HOSPITALHUB_WRITE_FREEZE = originalEnv;
    }
  });

  it("passes when write freeze is inactive", async () => {
    process.env.HOSPITALHUB_WRITE_FREEZE = "false";
    const status = await getWriteFreezeStatus();
    expect(status.writeFreezeActive).toBe(false);
    await expect(assertWriteFreezeInactive(undefined, "testOp")).resolves.toBeUndefined();
  });

  it("throws HttpsError('unavailable') when HOSPITALHUB_WRITE_FREEZE is 'true'", async () => {
    process.env.HOSPITALHUB_WRITE_FREEZE = "true";
    const status = await getWriteFreezeStatus();
    expect(status.writeFreezeActive).toBe(true);

    try {
      await assertWriteFreezeInactive(undefined, "changeFacilityPassword");
      expect.fail("Should have thrown HttpsError");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpsError);
      const httpsErr = err as HttpsError;
      expect(httpsErr.code).toBe("unavailable");
      expect(httpsErr.message).toContain("HospitalHub write freeze is active");
      expect(httpsErr.message).toContain("changeFacilityPassword");
    }
  });

  it("blocks account provisioning and resets when freeze is active", async () => {
    process.env.HOSPITALHUB_WRITE_FREEZE = "true";

    await expect(
      assertWriteFreezeInactive(undefined, "createManagedAccount"),
    ).rejects.toMatchObject({
      code: "unavailable",
    });

    await expect(
      assertWriteFreezeInactive(undefined, "resetManagedAccountPassword"),
    ).rejects.toMatchObject({
      code: "unavailable",
    });
  });
});
