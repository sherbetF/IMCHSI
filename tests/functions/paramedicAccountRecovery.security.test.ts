
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const getUserByEmail = vi.fn();
  const updateUser = vi.fn();
  const createUser = vi.fn();
  const setProfile = vi.fn();
  const updateProfile = vi.fn();
  const verifyAdminCaller = vi.fn();

  const getProfiles = vi.fn();
  const where = vi.fn(() => ({ get: getProfiles }));
  const doc = vi.fn(() => ({
    set: setProfile,
    update: updateProfile,
  }));
  const collection = vi.fn(() => ({ where, doc }));

  return {
    getUserByEmail,
    updateUser,
    createUser,
    setProfile,
    updateProfile,
    verifyAdminCaller,
    getProfiles,
    collection,
  };
});

// Prevent real Firebase Admin initialization.
vi.mock("../../functions/src/adminAuthHelper.js", () => ({
  getAdminInstances: () => ({
    auth: {
      getUserByEmail: mocks.getUserByEmail,
      updateUser: mocks.updateUser,
      createUser: mocks.createUser,
    },
    db: {
      collection: mocks.collection,
    },
  }),
  verifyAdminCaller: mocks.verifyAdminCaller,
  recordAdminAuditLog: vi.fn(),
  resolveAndVerifyDoctorAccount: vi.fn(),
}));

import { createManagedAccount } from "../../functions/src/createManagedAccount";
import { resetManagedAccountPassword } from "../../functions/src/resetManagedAccountPassword";

const accountKey = "paramedic_nurse_main";
const email = "staff_paramedic_nurse@auth.local";

describe("Paramedic account recovery security", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.verifyAdminCaller.mockResolvedValue({
      callerUid: "synthetic_admin_uid",
    });

    mocks.getProfiles.mockResolvedValue({
      docs: [],
      empty: true,
    });
  });

  it("rejects password reset when the trusted profile is missing", async () => {
    mocks.getUserByEmail.mockResolvedValue({
      uid: "synthetic_paramedic_uid",
      email,
      disabled: false,
    });

    await expect(
      resetManagedAccountPassword.run({
        auth: { uid: "synthetic_admin_uid" },
        data: {
          accountType: "PARAMEDIC_NURSE",
          accountKey,
          newPassword: "SecurePassword123",
        },
      } as any),
    ).rejects.toMatchObject({
      code: "failed-precondition",
    });

    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.setProfile).not.toHaveBeenCalled();
  });

  it("does not reactivate a disabled account during creation", async () => {
    mocks.getUserByEmail.mockResolvedValue({
      uid: "synthetic_paramedic_uid",
      email,
      disabled: true,
    });

    await expect(
      createManagedAccount.run({
        auth: { uid: "synthetic_admin_uid" },
        data: {
          accountType: "PARAMEDIC_NURSE",
          accountKey,
          password: "SecurePassword123",
        },
      } as any),
    ).rejects.toMatchObject({
      code: "failed-precondition",
    });

    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.setProfile).not.toHaveBeenCalled();
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("rejects unauthorized callers before account operations", async () => {
    mocks.verifyAdminCaller.mockRejectedValue(
      Object.assign(new Error("Permission denied"), {
        code: "permission-denied",
      }),
    );

    await expect(
      createManagedAccount.run({
        auth: { uid: "synthetic_unauthorized_uid" },
        data: {
          accountType: "PARAMEDIC_NURSE",
          accountKey,
          password: "SecurePassword123",
        },
      } as any),
    ).rejects.toMatchObject({
      code: "permission-denied",
    });

    expect(mocks.getUserByEmail).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.setProfile).not.toHaveBeenCalled();
  });
});
