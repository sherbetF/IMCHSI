import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  PRIMARY_NAMED_DATABASE_ID,
  TRUSTED_USER_MIRROR_FIELDS,
  buildAuthorizationMirrorPayload,
  buildOutsourceAppointmentMirrorPayload,
  buildRheumatologyAppointmentMirrorPayload,
  syncAuthorizationProfile,
  setAuthorizationProfileActiveStatus,
  syncOutsourceAppointmentMirror,
  syncRheumatologyAppointmentMirror,
  syncAllStorageAuthorizationMirrors,
} from "../../functions/src/authorizationMirror";

function createInMemoryFirestore() {
  const collections = new Map<string, Map<string, Record<string, unknown>>>();

  const getColMap = (colName: string) => {
    if (!collections.has(colName)) {
      collections.set(colName, new Map());
    }
    return collections.get(colName)!;
  };

  return {
    _collections: collections,
    collection: vi.fn((colName: string) => {
      const colMap = getColMap(colName);
      return {
        doc: vi.fn((docId: string) => ({
          id: docId,
          get: vi.fn(async () => ({
            id: docId,
            exists: colMap.has(docId),
            data: () => (colMap.has(docId) ? { ...colMap.get(docId)! } : undefined),
          })),
          set: vi.fn(async (payload: Record<string, unknown>, options?: { merge?: boolean }) => {
            if (options?.merge && colMap.has(docId)) {
              colMap.set(docId, { ...colMap.get(docId)!, ...payload });
            } else {
              colMap.set(docId, { ...payload });
            }
          }),
          delete: vi.fn(async () => {
            colMap.delete(docId);
          }),
        })),
        get: vi.fn(async () => ({
          docs: Array.from(colMap.entries()).map(([id, data]) => ({
            id,
            exists: true,
            data: () => ({ ...data }),
          })),
        })),
      };
    }),
  };
}

describe("Default Firestore Database Authorization Mirror & Storage Dependencies", () => {
  let primaryNamedDb: ReturnType<typeof createInMemoryFirestore>;
  let defaultMirrorDb: ReturnType<typeof createInMemoryFirestore>;

  beforeEach(() => {
    primaryNamedDb = createInMemoryFirestore();
    defaultMirrorDb = createInMemoryFirestore();
  });

  it("1. Preserves primary named database ID and strictly restricts copied user fields to the 7 trusted fields", () => {
    expect(PRIMARY_NAMED_DATABASE_ID).toBe(
      "ai-studio-hospitalhubdesig-7f7a6729-a1d2-48e8-ba86-ae6c290d754c",
    );
    expect(TRUSTED_USER_MIRROR_FIELDS).toEqual([
      "role",
      "active",
      "facilityId",
      "accountKey",
      "outsourceProviderId",
      "providerId",
      "doctorId",
    ]);
  });

  it("2. Copies only fields that actually exist in the authoritative user document (excludes PII, passwords, and non-existent fields)", () => {
    const authoritativeParamedicDoc = {
      role: "paramedic_nurse",
      active: true,
      accountKey: "paramedic_nurse_main",
      displayName: "Paramedic / Nurse Staff",
      email: "staff_paramedic_nurse@auth.local",
      passwordHash: "secret_hash_never_copied",
      createdAt: "2026-01-01T00:00:00Z",
    };

    const mirrorPayload = buildAuthorizationMirrorPayload(authoritativeParamedicDoc);

    expect(mirrorPayload).toEqual({
      role: "paramedic_nurse",
      active: true,
      accountKey: "paramedic_nurse_main",
    });
    expect("facilityId" in mirrorPayload).toBe(false);
    expect("outsourceProviderId" in mirrorPayload).toBe(false);
    expect("providerId" in mirrorPayload).toBe(false);
    expect("doctorId" in mirrorPayload).toBe(false);
    expect("displayName" in mirrorPayload).toBe(false);
    expect("email" in mirrorPayload).toBe(false);
    expect("passwordHash" in mirrorPayload).toBe(false);
  });

  it("3. Synchronizes and verifies paramedic_nurse account (UID: aIV1KRR5jUgFjShudWhktAGS2Wm2) into (default) database with active: true, role: 'paramedic_nurse', accountKey: 'paramedic_nurse_main'", async () => {
    const paramedicUid = "aIV1KRR5jUgFjShudWhktAGS2Wm2";
    await primaryNamedDb.collection("users").doc(paramedicUid).set({
      role: "paramedic_nurse",
      active: true,
      accountKey: "paramedic_nurse_main",
      displayName: "Paramedic Staff",
    });

    const primarySnap = await primaryNamedDb.collection("users").doc(paramedicUid).get();
    await syncAuthorizationProfile(
      paramedicUid,
      primarySnap.data()!,
      defaultMirrorDb as unknown as any,
    );

    const mirrorSnap = await defaultMirrorDb.collection("users").doc(paramedicUid).get();
    expect(mirrorSnap.exists).toBe(true);
    expect(mirrorSnap.id).toBe(paramedicUid);
    expect(mirrorSnap.data()).toEqual({
      role: "paramedic_nurse",
      active: true,
      accountKey: "paramedic_nurse_main",
    });
  });

  it("4. Reflects new accounts, role changes, activation, and deactivation in (default) database", async () => {
    const facilityUid = "uid_facility_hkt";
    const initialFacilityDoc = {
      role: "facility",
      active: true,
      facilityId: "hospital_kota_tinggi",
      facilityName: "Hospital Kota Tinggi",
    };

    // Create new account mirror
    await syncAuthorizationProfile(
      facilityUid,
      initialFacilityDoc,
      defaultMirrorDb as unknown as any,
    );
    let mirrorSnap = await defaultMirrorDb.collection("users").doc(facilityUid).get();
    expect(mirrorSnap.data()).toEqual({
      role: "facility",
      active: true,
      facilityId: "hospital_kota_tinggi",
    });

    // Deactivate account
    await setAuthorizationProfileActiveStatus(
      facilityUid,
      false,
      defaultMirrorDb as unknown as any,
      initialFacilityDoc,
    );
    mirrorSnap = await defaultMirrorDb.collection("users").doc(facilityUid).get();
    expect(mirrorSnap.data()).toEqual({
      role: "facility",
      active: false,
      facilityId: "hospital_kota_tinggi",
    });

    // Reactivate account
    await setAuthorizationProfileActiveStatus(
      facilityUid,
      true,
      defaultMirrorDb as unknown as any,
      initialFacilityDoc,
    );
    mirrorSnap = await defaultMirrorDb.collection("users").doc(facilityUid).get();
    expect(mirrorSnap.data()).toEqual({
      role: "facility",
      active: true,
      facilityId: "hospital_kota_tinggi",
    });

    // Role change (e.g., to doctor with doctorId, removing facilityId)
    await syncAuthorizationProfile(
      facilityUid,
      {
        role: "doctor",
        active: true,
        doctorId: "dr_ahmad",
      },
      defaultMirrorDb as unknown as any,
    );
    mirrorSnap = await defaultMirrorDb.collection("users").doc(facilityUid).get();
    expect(mirrorSnap.data()).toEqual({
      role: "doctor",
      active: true,
      doctorId: "dr_ahmad",
    });
    expect("facilityId" in (mirrorSnap.data() || {})).toBe(false);
  });

  it("5. Synchronizes all Firestore collections depended on by storage.rules (users, outsource_appointments, rheumatology_appointments)", async () => {
    // Seed primary named database
    await primaryNamedDb.collection("users").doc("aIV1KRR5jUgFjShudWhktAGS2Wm2").set({
      role: "paramedic_nurse",
      active: true,
      accountKey: "paramedic_nurse_main",
    });
    await primaryNamedDb.collection("users").doc("uid_outsource").set({
      role: "outsource",
      active: true,
      outsourceProviderId: "columbia_asia_tebrau",
      providerId: "PROV_01",
    });
    await primaryNamedDb.collection("outsource_appointments").doc("OUT-REP-100").set({
      facilityId: "kk_masai",
      outsourceProviderId: "columbia_asia_tebrau",
      providerId: "PROV_01",
      status: "Scheduled",
      patientName: "Sensitive Patient Name Not Copied",
    });
    await primaryNamedDb.collection("rheumatology_appointments").doc("RHEUM-REF-200").set({
      facilityId: "hospital_mersing",
      status: "Pending Doctor Review",
      patientName: "Sensitive Patient Name Not Copied",
    });

    const result = await syncAllStorageAuthorizationMirrors(
      primaryNamedDb as unknown as any,
      defaultMirrorDb as unknown as any,
    );

    expect(result.errors).toEqual([]);
    expect(result.users).toEqual({ total: 2, synced: 2 });
    expect(result.outsourceAppointments).toEqual({ total: 1, synced: 1 });
    expect(result.rheumatologyAppointments).toEqual({ total: 1, synced: 1 });

    const outsourceMirror = await defaultMirrorDb
      .collection("outsource_appointments")
      .doc("OUT-REP-100")
      .get();
    expect(outsourceMirror.data()).toEqual({
      facilityId: "kk_masai",
      outsourceProviderId: "columbia_asia_tebrau",
      providerId: "PROV_01",
      status: "Scheduled",
    });
    expect("patientName" in (outsourceMirror.data() || {})).toBe(false);

    const rheumMirror = await defaultMirrorDb
      .collection("rheumatology_appointments")
      .doc("RHEUM-REF-200")
      .get();
    expect(rheumMirror.data()).toEqual({
      facilityId: "hospital_mersing",
      status: "Pending Doctor Review",
    });
    expect("patientName" in (rheumMirror.data() || {})).toBe(false);
  });

  it("6. Verifies firestore.default.rules allows only own-document get and strictly denies list, create, update, delete on all mirror collections", () => {
    const defaultRulesPath = path.resolve(__dirname, "../../firestore.default.rules");
    const defaultRules = fs.readFileSync(defaultRulesPath, "utf-8");

    expect(defaultRules).toContain("match /users/{uid}");
    expect(defaultRules).toContain(
      "allow get: if request.auth != null && request.auth.uid == uid;",
    );
    expect(defaultRules).toContain("allow list, create, update, delete: if false;");
    expect(defaultRules).toContain("match /outsource_appointments/{appointmentId}");
    expect(defaultRules).toContain("match /rheumatology_appointments/{appointmentId}");

    const denyMutations =
      defaultRules.match(/allow list, create, update, delete:\s*if false;/g) || [];
    expect(denyMutations.length).toBe(3);
    expect(defaultRules).not.toContain("allow write: if true");
  });

  it("7. Throws an error and refuses to report success if the mirror document cannot be verified in (default) after write", async () => {
    const brokenDefaultDb = {
      collection: vi.fn(() => ({
        doc: vi.fn((docId: string) => ({
          id: docId,
          set: vi.fn(async () => {}),
          get: vi.fn(async () => ({
            id: docId,
            exists: false,
            data: () => undefined,
          })),
        })),
      })),
    };

    await expect(
      syncAuthorizationProfile(
        "aIV1KRR5jUgFjShudWhktAGS2Wm2",
        {
          role: "paramedic_nurse",
          active: true,
          accountKey: "paramedic_nurse_main",
        },
        brokenDefaultDb as unknown as any,
      ),
    ).rejects.toThrow(/Verification failed: Mirror document users\/aIV1KRR5jUgFjShudWhktAGS2Wm2/);
  });
});
