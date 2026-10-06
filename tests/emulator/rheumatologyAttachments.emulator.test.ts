import { describe, it, beforeAll, afterAll, beforeEach, expect } from "vitest";
import { RulesTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { serverTimestamp } from "firebase/firestore";
import {
  createRealRulesTestEnvironment,
  seedSyntheticUserProfiles,
  NAMED_DATABASE_ID,
} from "./testEnvironment";
import { SYNTHETIC_IDENTITIES } from "../fixtures/syntheticIdentities";

describe("Stage 7C — Clinical Attachment Metadata Rules Execution Tests", () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await createRealRulesTestEnvironment();
    await seedSyntheticUserProfiles(testEnv);
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seedSyntheticUserProfiles(testEnv);
  });

  // --------------------------------------------------------------------------
  // 1. Metadata Read Permissions (Section 33, 34, 35, 36, 37, 38)
  // --------------------------------------------------------------------------
  it("Section 33-38: Attachment metadata READ access matrix", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore({ databaseId: NAMED_DATABASE_ID } as any);
      await db.collection("rheumatology_appointments").doc("ref_att").set({
        id: "ref_att",
        facilityId: "TEST_FACILITY_A",
        status: "Pending Doctor Review",
      });

      await db
        .collection("rheumatology_appointments")
        .doc("ref_att")
        .collection("attachments")
        .doc("att_001")
        .set({
          attachmentId: "att_001",
          originalFileName: "lab_report.pdf",
          storagePath: "rheumatology/TEST_FACILITY_A/ref_att/att_001/lab_report.pdf",
          contentType: "application/pdf",
          size: 1024 * 500,
          uploadedAt: new Date(),
          uploadedByUid: SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE.uid,
        });
    });

    const facADb = testEnv
      .authenticatedContext(SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE.uid)
      .firestore({ databaseId: NAMED_DATABASE_ID } as any);
    const facBDb = testEnv
      .authenticatedContext(SYNTHETIC_IDENTITIES.FACILITY_B_ACTIVE.uid)
      .firestore({ databaseId: NAMED_DATABASE_ID } as any);
    const inactFacDb = testEnv
      .authenticatedContext(SYNTHETIC_IDENTITIES.FACILITY_A_INACTIVE.uid)
      .firestore({ databaseId: NAMED_DATABASE_ID } as any);
    const docDb = testEnv
      .authenticatedContext(SYNTHETIC_IDENTITIES.DOCTOR_A_ACTIVE.uid)
      .firestore({ databaseId: NAMED_DATABASE_ID } as any);
    const inactDocDb = testEnv
      .authenticatedContext(SYNTHETIC_IDENTITIES.DOCTOR_A_INACTIVE.uid)
      .firestore({ databaseId: NAMED_DATABASE_ID } as any);
    const paramDb = testEnv
      .authenticatedContext(SYNTHETIC_IDENTITIES.PARAMEDIC_ACTIVE.uid)
      .firestore({ databaseId: NAMED_DATABASE_ID } as any);
    const adminDb = testEnv
      .authenticatedContext(SYNTHETIC_IDENTITIES.ADMIN_ACTIVE.uid)
      .firestore({ databaseId: NAMED_DATABASE_ID } as any);
    const outsourceDb = testEnv
      .authenticatedContext(SYNTHETIC_IDENTITIES.OUTSOURCE_ACTIVE.uid)
      .firestore({ databaseId: NAMED_DATABASE_ID } as any);
    const unauthDb = testEnv
      .unauthenticatedContext()
      .firestore({ databaseId: NAMED_DATABASE_ID } as any);

    const targetDoc = "rheumatology_appointments/ref_att/attachments/att_001";

    // Owning Facility -> ALLOW
    await assertSucceeds(facADb.doc(targetDoc).get());

    // Other Facility -> DENIED
    await assertFails(facBDb.doc(targetDoc).get());

    // Inactive Facility -> DENIED
    await assertFails(inactFacDb.doc(targetDoc).get());

    // Doctor -> ALLOW
    await assertSucceeds(docDb.doc(targetDoc).get());

    // Inactive Doctor -> DENIED
    await assertFails(inactDocDb.doc(targetDoc).get());

    // Paramedic -> DENIED (CRITICAL)
    await assertFails(paramDb.doc(targetDoc).get());

    // Admin -> ALLOW
    await assertSucceeds(adminDb.doc(targetDoc).get());

    // Outsource -> DENIED
    await assertFails(outsourceDb.doc(targetDoc).get());

    // Unauthenticated -> DENIED
    await assertFails(unauthDb.doc(targetDoc).get());
  });

  // --------------------------------------------------------------------------
  // 2. Metadata Creation with vs without Reservation (Section 38, 39 & uploadedAt == request.time)
  // --------------------------------------------------------------------------
  it("Section 38 & 39: Metadata creation succeeds WITH slot reservation & request.time, fails WITHOUT", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore({ databaseId: NAMED_DATABASE_ID } as any);
      await db.collection("rheumatology_appointments").doc("ref_res").set({
        id: "ref_res",
        facilityId: "TEST_FACILITY_A",
        status: "Pending Doctor Review",
      });

      // Seed backend-owned slot reservation for att_reserved ONLY
      await db
        .collection("rheumatology_appointments")
        .doc("ref_res")
        .collection("attachment_control")
        .doc("summary")
        .set({
          activeAttachmentIds: ["att_reserved"],
          activeCount: 1,
        });
    });

    const facADb = testEnv
      .authenticatedContext(SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE.uid)
      .firestore({ databaseId: NAMED_DATABASE_ID } as any);

    // 1. Metadata creation for unreserved ID -> DENIED
    await assertFails(
      facADb
        .collection("rheumatology_appointments")
        .doc("ref_res")
        .collection("attachments")
        .doc("att_unreserved")
        .set({
          attachmentId: "att_unreserved",
          originalFileName: "blood_test.pdf",
          storagePath: "rheumatology/TEST_FACILITY_A/ref_res/att_unreserved/blood_test.pdf",
          contentType: "application/pdf",
          size: 1024 * 100,
          uploadedAt: new Date("2020-01-01T00:00:00Z"),
          uploadedByUid: SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE.uid,
        }),
    );

    // 2. Metadata creation with non-server timestamp -> DENIED (uploadedAt must be request.time)
    await assertFails(
      facADb
        .collection("rheumatology_appointments")
        .doc("ref_res")
        .collection("attachments")
        .doc("att_reserved")
        .set({
          attachmentId: "att_reserved",
          originalFileName: "blood_test.pdf",
          storagePath: "rheumatology/TEST_FACILITY_A/ref_res/att_reserved/blood_test.pdf",
          contentType: "application/pdf",
          size: 1024 * 100,
          uploadedAt: new Date("2020-01-01T00:00:00Z"), // FAKE TIMESTAMP
          uploadedByUid: SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE.uid,
        }),
    );
  });

  // --------------------------------------------------------------------------
  // 3. Metadata Immutability (Section 40)
  // --------------------------------------------------------------------------
  it("Section 40: Metadata UPDATE is strictly DENIED", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore({ databaseId: NAMED_DATABASE_ID } as any);
      await db.collection("rheumatology_appointments").doc("ref_imm").set({
        id: "ref_imm",
        facilityId: "TEST_FACILITY_A",
        status: "Pending Doctor Review",
      });

      await db
        .collection("rheumatology_appointments")
        .doc("ref_imm")
        .collection("attachments")
        .doc("att_imm")
        .set({
          attachmentId: "att_imm",
          originalFileName: "xray.png",
          storagePath: "rheumatology/TEST_FACILITY_A/ref_imm/att_imm/xray.png",
          contentType: "image/png",
          size: 1024 * 200,
          uploadedAt: new Date(),
          uploadedByUid: SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE.uid,
        });
    });

    const facADb = testEnv
      .authenticatedContext(SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE.uid)
      .firestore({ databaseId: NAMED_DATABASE_ID } as any);

    await assertFails(
      facADb
        .collection("rheumatology_appointments")
        .doc("ref_imm")
        .collection("attachments")
        .doc("att_imm")
        .update({
          originalFileName: "modified_name.png",
        }),
    );
  });

  // --------------------------------------------------------------------------
  // 4. Status-Based Metadata Deletion
  // --------------------------------------------------------------------------
  it("Stage 7C: Metadata deletion succeeds in mutable states, fails in locked states", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore({ databaseId: NAMED_DATABASE_ID } as any);

      // Mutable state: Pending Doctor Review
      await db.collection("rheumatology_appointments").doc("ref_del_pend").set({
        id: "ref_del_pend",
        facilityId: "TEST_FACILITY_A",
        status: "Pending Doctor Review",
      });
      await db
        .collection("rheumatology_appointments")
        .doc("ref_del_pend")
        .collection("attachments")
        .doc("att_p")
        .set({
          attachmentId: "att_p",
          originalFileName: "doc1.pdf",
          storagePath: "rheumatology/TEST_FACILITY_A/ref_del_pend/att_p/doc1.pdf",
          contentType: "application/pdf",
          size: 1000,
          uploadedAt: new Date(),
          uploadedByUid: SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE.uid,
        });

      // Locked state: Awaiting Scheduling
      await db.collection("rheumatology_appointments").doc("ref_del_lock").set({
        id: "ref_del_lock",
        facilityId: "TEST_FACILITY_A",
        status: "Awaiting Scheduling",
      });
      await db
        .collection("rheumatology_appointments")
        .doc("ref_del_lock")
        .collection("attachments")
        .doc("att_l")
        .set({
          attachmentId: "att_l",
          originalFileName: "doc2.pdf",
          storagePath: "rheumatology/TEST_FACILITY_A/ref_del_lock/att_l/doc2.pdf",
          contentType: "application/pdf",
          size: 1000,
          uploadedAt: new Date(),
          uploadedByUid: SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE.uid,
        });
    });

    const facADb = testEnv
      .authenticatedContext(SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE.uid)
      .firestore({ databaseId: NAMED_DATABASE_ID } as any);
    const docDb = testEnv
      .authenticatedContext(SYNTHETIC_IDENTITIES.DOCTOR_A_ACTIVE.uid)
      .firestore({ databaseId: NAMED_DATABASE_ID } as any);

    // Owning facility in Pending Doctor Review -> ALLOW
    await assertSucceeds(
      facADb
        .collection("rheumatology_appointments")
        .doc("ref_del_pend")
        .collection("attachments")
        .doc("att_p")
        .delete(),
    );

    // Owning facility in Awaiting Scheduling (locked) -> DENIED
    await assertFails(
      facADb
        .collection("rheumatology_appointments")
        .doc("ref_del_lock")
        .collection("attachments")
        .doc("att_l")
        .delete(),
    );

    // Doctor deleting attachment -> DENIED
    await assertFails(
      docDb
        .collection("rheumatology_appointments")
        .doc("ref_del_pend")
        .collection("attachments")
        .doc("att_p")
        .delete(),
    );
  });
});
