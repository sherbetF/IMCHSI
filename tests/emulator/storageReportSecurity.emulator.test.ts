import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import { RulesTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import {
  createRealRulesTestEnvironment,
  seedSyntheticUserProfiles,
  NAMED_DATABASE_ID,
} from "./testEnvironment";
import { SYNTHETIC_IDENTITIES } from "../fixtures/syntheticIdentities";

describe("Medical Diagnostic Reports — Firebase Storage Rules Role-Based Permissions", () => {
  let testEnv: RulesTestEnvironment;

  const KK_AIR_TAWAR_5_ACTIVE = {
    uid: "test_uid_kk_air_tawar_5_active",
    role: "facility" as const,
    facilityId: "kk_air_tawar_5",
    facilityName: "Klinik Kesihatan Air Tawar 5",
    category: "Klinik Kesihatan",
    active: true,
  };

  const KK_AIR_TAWAR_5_INACTIVE = {
    uid: "test_uid_kk_air_tawar_5_inactive",
    role: "facility" as const,
    facilityId: "kk_air_tawar_5",
    facilityName: "Klinik Kesihatan Air Tawar 5",
    category: "Klinik Kesihatan",
    active: false,
  };

  const KK_MASAI_ACTIVE = {
    uid: "test_uid_kk_masai_active",
    role: "facility" as const,
    facilityId: "kk_masai",
    facilityName: "Klinik Kesihatan Masai",
    category: "Klinik Kesihatan",
    active: true,
  };

  const OUTSOURCE_USER_ALPHA = {
    uid: "test_uid_outsource_alpha",
    role: "outsource" as const,
    outsourceProviderId: "provider_alpha",
    providerId: "provider_alpha",
    displayName: "Outsource Provider Alpha",
    active: true,
  };

  async function seedCustomProfiles() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const dbNamed = context.firestore({ databaseId: NAMED_DATABASE_ID } as any);
      const dbDefault = context.firestore();

      for (const p of [
        KK_AIR_TAWAR_5_ACTIVE,
        KK_AIR_TAWAR_5_INACTIVE,
        KK_MASAI_ACTIVE,
        OUTSOURCE_USER_ALPHA,
      ]) {
        const docData: Record<string, any> = {
          role: p.role,
          active: p.active,
        };
        if ("facilityId" in p && p.facilityId) docData.facilityId = p.facilityId;
        if ("facilityName" in p && p.facilityName) docData.facilityName = p.facilityName;
        if ("category" in p && p.category) docData.category = p.category;
        if ("outsourceProviderId" in p && p.outsourceProviderId)
          docData.outsourceProviderId = p.outsourceProviderId;
        if ("providerId" in p && p.providerId) docData.providerId = p.providerId;

        await dbNamed.collection("users").doc(p.uid).set(docData);
        // Authorization mirror in (default) database
        await dbDefault.collection("users").doc(p.uid).set(docData);
      }
    });
  }

  async function seedOutsourceAppointment(docId: string, data: Record<string, any>) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const dbNamed = context.firestore({ databaseId: NAMED_DATABASE_ID } as any);
      const dbDefault = context.firestore();
      await dbNamed.collection("outsource_appointments").doc(docId).set(data);
      await dbDefault.collection("outsource_appointments").doc(docId).set(data);
    });
  }

  beforeAll(async () => {
    testEnv = await createRealRulesTestEnvironment();
    await seedSyntheticUserProfiles(testEnv);
    await seedCustomProfiles();
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.clearStorage();
    await seedSyntheticUserProfiles(testEnv);
    await seedCustomProfiles();
  });

  const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x31, 0x2e, 0x35]); // %PDF-1.5

  // --------------------------------------------------------------------------
  // Scenario 1: Admin uploading to any facility — ALLOWED
  // --------------------------------------------------------------------------
  it("Scenario 1: Admin uploading to any facility — ALLOWED", async () => {
    const adminCtx = testEnv.authenticatedContext(SYNTHETIC_IDENTITIES.ADMIN_ACTIVE.uid);
    const storage = adminCtx.storage();
    const adminPath =
      "facilities/kk_air_tawar_5/reports/HOLTER-2026-SCN1/HSI287029_NURUL_AMIRA_BINTI_ISHAK.pdf";

    await assertSucceeds(
      storage.ref(adminPath).put(pdfBytes, {
        contentType: "application/pdf",
        customMetadata: { facilityId: "kk_air_tawar_5", reportId: "HOLTER-2026-SCN1" },
      }),
    );
    await assertSucceeds(storage.ref(adminPath).getDownloadURL());
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Paramedic/Nurse uploading to any facility — ALLOWED
  // --------------------------------------------------------------------------
  it("Scenario 2: Paramedic/Nurse uploading to any facility — ALLOWED", async () => {
    const paramedicCtx = testEnv.authenticatedContext(SYNTHETIC_IDENTITIES.PARAMEDIC_ACTIVE.uid);
    const storage = paramedicCtx.storage();

    // 2a. Uploading to KK Air Tawar 5 -> SUCCEEDS
    const holterPath1 =
      "facilities/kk_air_tawar_5/reports/HOLTER-2026-SCN2/HSI287029_NURUL_AMIRA_BINTI_ISHAK.pdf";
    await assertSucceeds(
      storage.ref(holterPath1).put(pdfBytes, {
        contentType: "application/pdf",
        customMetadata: { facilityId: "kk_air_tawar_5", reportId: "HOLTER-2026-SCN2" },
      }),
    );

    // 2b. Uploading to KK Masai -> SUCCEEDS
    const holterPath2 = "facilities/kk_masai/reports/HOLTER-2026-SCN2B/HSI300122_MOHD_FAIZAL.pdf";
    await assertSucceeds(
      storage.ref(holterPath2).put(pdfBytes, {
        contentType: "application/pdf",
        customMetadata: { facilityId: "kk_masai", reportId: "HOLTER-2026-SCN2B" },
      }),
    );
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Facility viewing its own reports — ALLOWED
  // --------------------------------------------------------------------------
  it("Scenario 3: Facility viewing its own reports — ALLOWED", async () => {
    const reportPath =
      "facilities/kk_air_tawar_5/reports/HOLTER-2026-SCN3/HSI287029_NURUL_AMIRA_BINTI_ISHAK.pdf";

    // Uploaded by Paramedic
    const paramedicCtx = testEnv.authenticatedContext(SYNTHETIC_IDENTITIES.PARAMEDIC_ACTIVE.uid);
    await assertSucceeds(
      paramedicCtx.storage().ref(reportPath).put(pdfBytes, { contentType: "application/pdf" }),
    );

    // KK Air Tawar views its own report -> SUCCEEDS
    const airTawarCtx = testEnv.authenticatedContext(KK_AIR_TAWAR_5_ACTIVE.uid);
    await assertSucceeds(airTawarCtx.storage().ref(reportPath).getDownloadURL());
  });

  // --------------------------------------------------------------------------
  // Scenario 4: Facility viewing another facility's reports — DENIED
  // --------------------------------------------------------------------------
  it("Scenario 4: Facility viewing another facility's reports — DENIED", async () => {
    const masaiReportPath =
      "facilities/kk_masai/reports/HOLTER-2026-SCN4/HSI300122_MOHD_FAIZAL.pdf";

    // Uploaded to KK Masai
    const paramedicCtx = testEnv.authenticatedContext(SYNTHETIC_IDENTITIES.PARAMEDIC_ACTIVE.uid);
    await assertSucceeds(
      paramedicCtx.storage().ref(masaiReportPath).put(pdfBytes, { contentType: "application/pdf" }),
    );

    // KK Air Tawar attempts to read KK Masai's report -> DENIED
    const airTawarCtx = testEnv.authenticatedContext(KK_AIR_TAWAR_5_ACTIVE.uid);
    await assertFails(airTawarCtx.storage().ref(masaiReportPath).getDownloadURL());
  });

  // --------------------------------------------------------------------------
  // Scenario 5: Facility uploading reports — DENIED
  // --------------------------------------------------------------------------
  it("Scenario 5: Facility uploading reports — DENIED", async () => {
    const airTawarCtx = testEnv.authenticatedContext(KK_AIR_TAWAR_5_ACTIVE.uid);
    const uploadPath =
      "facilities/kk_air_tawar_5/reports/HOLTER-2026-SCN5/HSI287029_NURUL_AMIRA_BINTI_ISHAK.pdf";

    // Health facilities must NOT be allowed to upload reports -> DENIED
    await assertFails(
      airTawarCtx.storage().ref(uploadPath).put(pdfBytes, { contentType: "application/pdf" }),
    );
  });

  // --------------------------------------------------------------------------
  // Scenario 6: Inactive paramedic uploading — DENIED
  // --------------------------------------------------------------------------
  it("Scenario 6: Inactive paramedic uploading — DENIED", async () => {
    const inactParamedicCtx = testEnv.authenticatedContext(
      SYNTHETIC_IDENTITIES.PARAMEDIC_INACTIVE.uid,
    );
    const reportPath = "facilities/kk_air_tawar_5/reports/HOLTER-2026-SCN6/test_inact.pdf";

    await assertFails(
      inactParamedicCtx.storage().ref(reportPath).put(pdfBytes, { contentType: "application/pdf" }),
    );
  });

  // --------------------------------------------------------------------------
  // Scenario 7: Unauthenticated upload — DENIED
  // --------------------------------------------------------------------------
  it("Scenario 7: Unauthenticated upload — DENIED", async () => {
    const unauth = testEnv.unauthenticatedContext();
    const reportPath =
      "facilities/kk_air_tawar_5/reports/HOLTER-2026-SCN7/HSI287029_NURUL_AMIRA_BINTI_ISHAK.pdf";

    await assertFails(
      unauth.storage().ref(reportPath).put(pdfBytes, { contentType: "application/pdf" }),
    );
    await assertFails(unauth.storage().ref(reportPath).getDownloadURL());
  });

  // --------------------------------------------------------------------------
  // Scenario 8: Outsource access to unassigned reports — DENIED
  // --------------------------------------------------------------------------
  it("Scenario 8: Outsource access to unassigned reports — DENIED", async () => {
    const outsourcePath = "outsource/columbia_asia/reports/OUTSOURCE-APPT-901/CT_Brain_Report.pdf";

    // Seed outsource appointment assigned to provider_beta (not provider_alpha)
    await seedOutsourceAppointment("OUTSOURCE-APPT-901", {
      facilityId: "columbia_asia",
      outsourceProviderId: "provider_beta",
      providerId: "provider_beta",
      status: "In Progress",
    });

    // Provider Beta uploads report -> SUCCEEDS
    const adminCtx = testEnv.authenticatedContext(SYNTHETIC_IDENTITIES.ADMIN_ACTIVE.uid);
    await assertSucceeds(
      adminCtx.storage().ref(outsourcePath).put(pdfBytes, { contentType: "application/pdf" }),
    );

    // Provider Alpha attempts to access report -> DENIED (Unassigned)
    const providerAlphaCtx = testEnv.authenticatedContext(OUTSOURCE_USER_ALPHA.uid);
    await assertFails(providerAlphaCtx.storage().ref(outsourcePath).getDownloadURL());
  });

  // --------------------------------------------------------------------------
  // Scenario 9: Same-path overwrite and direct client deletion — DENIED
  // --------------------------------------------------------------------------
  it("Scenario 9: Same-path overwrite and direct client deletion — DENIED", async () => {
    const reportPath =
      "facilities/kk_air_tawar_5/reports/HOLTER-2026-SCN9/HSI287029_NURUL_AMIRA_BINTI_ISHAK.pdf";

    // First upload by Paramedic
    const paramedicCtx = testEnv.authenticatedContext(SYNTHETIC_IDENTITIES.PARAMEDIC_ACTIVE.uid);
    await assertSucceeds(
      paramedicCtx.storage().ref(reportPath).put(pdfBytes, { contentType: "application/pdf" }),
    );

    // Attempted overwrite to same path -> DENIED
    await assertFails(
      paramedicCtx.storage().ref(reportPath).put(pdfBytes, { contentType: "application/pdf" }),
    );

    // Attempted client deletion -> DENIED
    await assertFails(paramedicCtx.storage().ref(reportPath).delete());
  });
});
