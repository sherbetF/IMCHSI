
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const getUserByEmail = vi.fn();
  const updateUser = vi.fn();
  const updateProfile = vi.fn();
  const getProfiles = vi.fn();
  const verifyAdminCaller = vi.fn();
  const recordAdminAuditLog = vi.fn();

  const where = vi.fn(() => ({ get: getProfiles }));
  const doc = vi.fn(() => ({ update: updateProfile }));
  const collection = vi.fn(() => ({ where, doc }));

  return {
    getUserByEmail,
    updateUser,
    updateProfile,
    getProfiles,
    verifyAdminCaller,
    recordAdminAuditLog,
    collection,
  };
});

// All Firebase services are mocked. No production connection.
vi.mock("../../functions/src/adminAuthHelper.js", () => ({
  getAdminInstances: () => ({
    auth: {
      getUserByEmail: mocks.getUserByEmail,
      updateUser: mocks.updateUser,
    },
    db: {
      collection: mocks.collection,
    },
  }),
  verifyAdminCaller: mocks.verifyAdminCaller,
  recordAdminAuditLog: mocks.recordAdminAuditLog,
  resolveAndVerifyDoctorAccount: vi.fn(),
}));

import { setManagedAccountActiveStatus } from
  "../../functions/src/setManagedAccountActiveStatus";

type AccountType = "CONSUMER" | "PARAMEDIC_NURSE";

const cases = [
  {
    type: "CONSUMER" as AccountType,
    uid: "synthetic_facility_uid",
    email: "facility_hospital_kota_tinggi@auth.local",
    profile: {
      role: "facility",
      facilityId: "hospital_kota_tinggi",
      active: true,
    },
    data: {
      accountType: "CONSUMER",
      facilityId: "hospital_kota_tinggi",
      active: false,
    },
  },
  {
    type: "PARAMEDIC_NURSE" as AccountType,
    uid: "synthetic_paramedic_uid",
    email: "staff_paramedic_nurse@auth.local",
    profile: {
      role: "paramedic_nurse",
      accountKey: "paramedic_nurse_main",
      active: true,
    },
    data: {
      accountType: "PARAMEDIC_NURSE",
      accountKey: "paramedic_nurse_main",
      active: false,
    },
  },
];

describe("Account status rollback security", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mocks.verifyAdminCaller.mockResolvedValue({
      callerUid: "synthetic_admin_uid",
    });

    mocks.recordAdminAuditLog.mockResolvedValue({
      auditLogged: true,
    });
  });

  for (const testCase of cases) {
    describe(testCase.type, () => {
      beforeEach(() => {
        mocks.getUserByEmail.mockResolvedValue({
          uid: testCase.uid,
          email: testCase.email,
          disabled: false,
        });

        mocks.getProfiles.mockResolvedValue({
          docs: [
            {
              id: testCase.uid,
              data: () => ({ ...testCase.profile }),
            },
          ],
          empty: false,
        });

        mocks.updateProfile.mockRejectedValue(
          new Error("Synthetic Firestore failure"),
        );
      });

      it("reports successful rollback accurately", async () => {
        mocks.updateUser.mockResolvedValue({});

        await expect(
          setManagedAccountActiveStatus.run({
            auth: { uid: "synthetic_admin_uid" },
            data: testCase.data,
          } as any),
        ).rejects.toMatchObject({
          code: "internal",
          message: expect.stringContaining(
            "Authentication status restored",
          ),
        });

        expect(mocks.updateUser).toHaveBeenCalledTimes(2);

        expect(mocks.updateUser).toHaveBeenNthCalledWith(
          1,
          testCase.uid,
          { disabled: true },
        );

        expect(mocks.updateUser).toHaveBeenNthCalledWith(
          2,
          testCase.uid,
          { disabled: false },
        );

        expect(mocks.updateProfile).toHaveBeenCalledTimes(1);
        expect(mocks.recordAdminAuditLog).not.toHaveBeenCalled();
      });

      it("reports critical inconsistency when rollback fails", async () => {
        mocks.updateUser
          .mockResolvedValueOnce({})
          .mockRejectedValueOnce(
            new Error("Synthetic Auth rollback failure"),
          );

        await expect(
          setManagedAccountActiveStatus.run({
            auth: { uid: "synthetic_admin_uid" },
            data: testCase.data,
          } as any),
        ).rejects.toMatchObject({
          code: "internal",
          message: expect.stringContaining(
            "CRITICAL_ACCOUNT_STATE_INCONSISTENCY",
          ),
        });

        expect(mocks.updateUser).toHaveBeenCalledTimes(2);

        expect(mocks.updateUser).toHaveBeenNthCalledWith(
          2,
          testCase.uid,
          { disabled: false },
        );

        expect(mocks.updateProfile).toHaveBeenCalledTimes(1);
        expect(mocks.recordAdminAuditLog).not.toHaveBeenCalled();
      });
    });
  }
});
