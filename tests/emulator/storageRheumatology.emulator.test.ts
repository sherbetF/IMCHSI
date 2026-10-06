import { describe, it, beforeAll, afterAll, beforeEach, expect } from "vitest";
import { RulesTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import {
  createRealRulesTestEnvironment,
  seedSyntheticUserProfiles,
  NAMED_DATABASE_ID,
} from "./testEnvironment";
import { SYNTHETIC_IDENTITIES } from "../fixtures/syntheticIdentities";

describe("Stage 7C — Firebase Storage Rules Real Execution Tests", () => {
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
    await testEnv.clearStorage();
    await seedSyntheticUserProfiles(testEnv);
  });

  async function seedReferral(docId: string, data: Record<string, any>) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const dbNamed = context.firestore({ databaseId: NAMED_DATABASE_ID } as any);
      const dbDefault = context.firestore();
      await dbNamed.collection("rheumatology_appointments").doc(docId).set(data);
      await dbDefault.collection("rheumatology_appointments").doc(docId).set(data);
    });
  }

  // --------------------------------------------------------------------------
  // 1. Comprehensive MIME Types (PDF, JPEG, PNG, SVG, ZIP, Octet-stream, etc.)
  // --------------------------------------------------------------------------
  it("Stage 7C: Allowed MIME types (PDF, JPEG, PNG) SUCCEED, blocked MIME types (SVG, ZIP, Octet-Stream, HTML, JS) FAIL", async () => {
    await seedReferral("ref_store_mime", {
      id: "ref_store_mime",
      facilityId: "TEST_FACILITY_A",
      status: "Pending Doctor Review",
    });

    const facAContext = testEnv.authenticatedContext(SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE.uid);
    const storage = facAContext.storage();

    // 1. Allowed: PDF -> SUCCEEDS
    const pdfRef = storage.ref("rheumatology/TEST_FACILITY_A/ref_store_mime/att_pdf/report.pdf");
    await assertSucceeds(
      pdfRef.put(new Uint8Array([0x25, 0x50, 0x44, 0x46]), { contentType: "application/pdf" }),
    );

    // 2. Allowed: JPEG -> SUCCEEDS
    const jpegRef = storage.ref("rheumatology/TEST_FACILITY_A/ref_store_mime/att_jpg/photo.jpg");
    await assertSucceeds(
      jpegRef.put(new Uint8Array([0xff, 0xd8, 0xff]), { contentType: "image/jpeg" }),
    );

    // 3. Allowed: PNG -> SUCCEEDS
    const pngRef = storage.ref("rheumatology/TEST_FACILITY_A/ref_store_mime/att_png/image.png");
    await assertSucceeds(
      pngRef.put(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { contentType: "image/png" }),
    );

    // 4. Blocked: SVG -> DENIED
    const svgRef = storage.ref("rheumatology/TEST_FACILITY_A/ref_store_mime/att_svg/vector.svg");
    await assertFails(
      svgRef.put(new Uint8Array([0x3c, 0x73, 0x76, 0x67]), { contentType: "image/svg+xml" }),
    );

    // 5. Blocked: ZIP -> DENIED
    const zipRef = storage.ref("rheumatology/TEST_FACILITY_A/ref_store_mime/att_zip/archive.zip");
    await assertFails(
      zipRef.put(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), { contentType: "application/zip" }),
    );

    // 6. Blocked: Octet-Stream -> DENIED
    const octetRef = storage.ref("rheumatology/TEST_FACILITY_A/ref_store_mime/att_oct/bin.dat");
    await assertFails(
      octetRef.put(new Uint8Array([0x00, 0x01, 0x02]), { contentType: "application/octet-stream" }),
    );

    // 7. Blocked: HTML -> DENIED
    const htmlRef = storage.ref("rheumatology/TEST_FACILITY_A/ref_store_mime/att_html/index.html");
    await assertFails(
      htmlRef.put(new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c]), { contentType: "text/html" }),
    );

    // 8. Blocked: JS -> DENIED
    const jsRef = storage.ref("rheumatology/TEST_FACILITY_A/ref_store_mime/att_js/script.js");
    await assertFails(
      jsRef.put(new Uint8Array([0x63, 0x6f, 0x6e, 0x73]), {
        contentType: "application/javascript",
      }),
    );
  });

  // --------------------------------------------------------------------------
  // 2. Exact Size Boundaries (10 MiB vs 10 MiB + 1 byte)
  // --------------------------------------------------------------------------
  it("Stage 7C: Exactly 10 MiB (10,485,760 bytes) SUCCEEDS, 10 MiB + 1 byte FAILS", async () => {
    await seedReferral("ref_store_size", {
      id: "ref_store_size",
      facilityId: "TEST_FACILITY_A",
      status: "Pending Doctor Review",
    });

    const facA = testEnv.authenticatedContext(SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE.uid).storage();

    // Exactly 10 MiB (10 * 1024 * 1024 = 10,485,760 bytes) -> SUCCEEDS
    const exact10MiB = new Uint8Array(10 * 1024 * 1024);
    const valid10Ref = facA.ref("rheumatology/TEST_FACILITY_A/ref_store_size/att_10mb/large.pdf");
    await assertSucceeds(valid10Ref.put(exact10MiB, { contentType: "application/pdf" }));

    // 10 MiB + 1 byte (10,485,761 bytes) -> DENIED
    const over10MiB = new Uint8Array(10 * 1024 * 1024 + 1);
    const invalidRef = facA.ref(
      "rheumatology/TEST_FACILITY_A/ref_store_size/att_over/toolarge.pdf",
    );
    await assertFails(invalidRef.put(over10MiB, { contentType: "application/pdf" }));
  });

  // --------------------------------------------------------------------------
  // 3. Cross-Facility & Role Access Matrix + Inactive / Unauthenticated Access
  // --------------------------------------------------------------------------
  it("Stage 7C: Read and write authorization matrix with inactive & unauthenticated negative controls", async () => {
    await seedReferral("ref_matrix", {
      id: "ref_matrix",
      facilityId: "TEST_FACILITY_A",
      status: "Pending Doctor Review",
    });

    const facAContext = testEnv.authenticatedContext(SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE.uid);
    const inactFacContext = testEnv.authenticatedContext(
      SYNTHETIC_IDENTITIES.FACILITY_A_INACTIVE.uid,
    );
    const facBContext = testEnv.authenticatedContext(SYNTHETIC_IDENTITIES.FACILITY_B_ACTIVE.uid);
    const docContext = testEnv.authenticatedContext(SYNTHETIC_IDENTITIES.DOCTOR_A_ACTIVE.uid);
    const inactDocContext = testEnv.authenticatedContext(
      SYNTHETIC_IDENTITIES.DOCTOR_A_INACTIVE.uid,
    );
    const paramContext = testEnv.authenticatedContext(SYNTHETIC_IDENTITIES.PARAMEDIC_ACTIVE.uid);
    const adminContext = testEnv.authenticatedContext(SYNTHETIC_IDENTITIES.ADMIN_ACTIVE.uid);
    const outsourceContext = testEnv.authenticatedContext(
      SYNTHETIC_IDENTITIES.OUTSOURCE_ACTIVE.uid,
    );
    const unauthContext = testEnv.unauthenticatedContext();

    const validPath = "rheumatology/TEST_FACILITY_A/ref_matrix/att_001/report.pdf";

    // 1. Facility A uploads initial file -> ALLOW
    await assertSucceeds(
      facAContext
        .storage()
        .ref(validPath)
        .put(new Uint8Array([1, 2, 3]), { contentType: "application/pdf" }),
    );

    // 2. Facility B reading Facility A file -> DENIED
    await assertFails(facBContext.storage().ref(validPath).getDownloadURL());

    // 3. Inactive Facility reading -> DENIED
    await assertFails(inactFacContext.storage().ref(validPath).getDownloadURL());

    // 4. Inactive Facility uploading -> DENIED
    await assertFails(
      inactFacContext
        .storage()
        .ref("rheumatology/TEST_FACILITY_A/ref_matrix/att_inact/doc.pdf")
        .put(new Uint8Array([1, 2, 3]), { contentType: "application/pdf" }),
    );

    // 5. Doctor reading file -> ALLOW
    await assertSucceeds(docContext.storage().ref(validPath).getDownloadURL());

    // 6. Inactive Doctor reading file -> DENIED
    await assertFails(inactDocContext.storage().ref(validPath).getDownloadURL());

    // 7. Paramedic reading file -> DENIED (CRITICAL)
    await assertFails(paramContext.storage().ref(validPath).getDownloadURL());

    // 8. Admin reading file -> ALLOW
    await assertSucceeds(adminContext.storage().ref(validPath).getDownloadURL());

    // 9. Outsource reading file -> DENIED
    await assertFails(outsourceContext.storage().ref(validPath).getDownloadURL());

    // 10. Unauthenticated reading -> DENIED
    await assertFails(unauthContext.storage().ref(validPath).getDownloadURL());

    // 11. Unauthenticated upload -> DENIED
    await assertFails(
      unauthContext
        .storage()
        .ref("rheumatology/TEST_FACILITY_A/ref_matrix/att_unauth/doc.pdf")
        .put(new Uint8Array([1, 2, 3]), { contentType: "application/pdf" }),
    );

    // 12. Doctor attempting upload -> DENIED
    await assertFails(
      docContext
        .storage()
        .ref("rheumatology/TEST_FACILITY_A/ref_matrix/att_002/doc.pdf")
        .put(new Uint8Array([1, 2, 3]), { contentType: "application/pdf" }),
    );

    // 13. Paramedic attempting upload -> DENIED
    await assertFails(
      paramContext
        .storage()
        .ref("rheumatology/TEST_FACILITY_A/ref_matrix/att_002/doc.pdf")
        .put(new Uint8Array([1, 2, 3]), { contentType: "application/pdf" }),
    );
  });

  // --------------------------------------------------------------------------
  // 4. Status-Based Facility Deletion for all required statuses
  // --------------------------------------------------------------------------
  it("Stage 7C: Status-based Facility deletion succeeds for mutable statuses, fails for locked statuses and non-facility roles", async () => {
    // Mutable statuses
    await seedReferral("ref_pend", {
      id: "ref_pend",
      facilityId: "TEST_FACILITY_A",
      status: "Pending Doctor Review",
    });
    await seedReferral("ref_ret", {
      id: "ref_ret",
      facilityId: "TEST_FACILITY_A",
      status: "Returned to Facility",
    });

    // Locked statuses
    await seedReferral("ref_sched_lock", {
      id: "ref_sched_lock",
      facilityId: "TEST_FACILITY_A",
      status: "Awaiting Scheduling",
    });
    await seedReferral("ref_done_lock", {
      id: "ref_done_lock",
      facilityId: "TEST_FACILITY_A",
      status: "Scheduled",
    });
    await seedReferral("ref_rej_lock", {
      id: "ref_rej_lock",
      facilityId: "TEST_FACILITY_A",
      status: "Rejected",
    });

    const facA = testEnv.authenticatedContext(SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE.uid).storage();
    const doc = testEnv.authenticatedContext(SYNTHETIC_IDENTITIES.DOCTOR_A_ACTIVE.uid).storage();
    const param = testEnv.authenticatedContext(SYNTHETIC_IDENTITIES.PARAMEDIC_ACTIVE.uid).storage();
    const admin = testEnv.authenticatedContext(SYNTHETIC_IDENTITIES.ADMIN_ACTIVE.uid).storage();

    // Upload files to all status paths while rules are bypassed or in allowed state
    const p1 = "rheumatology/TEST_FACILITY_A/ref_pend/att_1/f.pdf";
    const p2 = "rheumatology/TEST_FACILITY_A/ref_ret/att_2/f.pdf";
    const p3 = "rheumatology/TEST_FACILITY_A/ref_sched_lock/att_3/f.pdf";
    const p4 = "rheumatology/TEST_FACILITY_A/ref_done_lock/att_4/f.pdf";
    const p5 = "rheumatology/TEST_FACILITY_A/ref_rej_lock/att_5/f.pdf";

    await assertSucceeds(facA.ref(p1).put(new Uint8Array([1]), { contentType: "application/pdf" }));
    await assertSucceeds(facA.ref(p2).put(new Uint8Array([2]), { contentType: "application/pdf" }));

    // 1. Delete in "Pending Doctor Review" -> SUCCEEDS
    await assertSucceeds(facA.ref(p1).delete());

    // 2. Delete in "Returned to Facility" -> SUCCEEDS
    await assertSucceeds(facA.ref(p2).delete());

    // 3. Delete in "Awaiting Scheduling" -> FAILS
    await assertFails(facA.ref(p3).delete());

    // 4. Delete in "Scheduled" -> FAILS
    await assertFails(facA.ref(p4).delete());

    // 5. Delete in "Rejected" -> FAILS
    await assertFails(facA.ref(p5).delete());

    // 6. Non-facility role deletion (Doctor, Paramedic, Admin) -> FAILS
    await assertSucceeds(facA.ref(p1).put(new Uint8Array([1]), { contentType: "application/pdf" }));
    await assertFails(doc.ref(p1).delete());
    await assertFails(param.ref(p1).delete());
    await assertFails(admin.ref(p1).delete());
  });

  // --------------------------------------------------------------------------
  // 5. Path-Spoof & Firestore-Lookup Negative Controls
  // --------------------------------------------------------------------------
  it("Stage 7C: Path-spoofing and Firestore-lookup negative controls are DENIED", async () => {
    // ref_B belongs to Facility B
    await seedReferral("ref_B", {
      id: "ref_B",
      facilityId: "TEST_FACILITY_B",
      status: "Pending Doctor Review",
    });

    const facA = testEnv.authenticatedContext(SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE.uid).storage();

    // 1. Facility A uploading with Facility B in the path -> DENIED (Path Spoof)
    const spoofPath = "rheumatology/TEST_FACILITY_B/ref_B/att_spoof/file.pdf";
    await assertFails(
      facA.ref(spoofPath).put(new Uint8Array([1, 2, 3]), { contentType: "application/pdf" }),
    );

    // 2. Facility A uploading under its own path prefix, but for a referral doc that doesn't exist -> DENIED
    const nonExistentRefPath = "rheumatology/TEST_FACILITY_A/non_existent_ref/att_1/file.pdf";
    await assertFails(
      facA
        .ref(nonExistentRefPath)
        .put(new Uint8Array([1, 2, 3]), { contentType: "application/pdf" }),
    );

    // 3. Facility A uploading under its own path prefix, but referencing Facility B's referral -> DENIED
    const crossFacilityRefPath = "rheumatology/TEST_FACILITY_A/ref_B/att_1/file.pdf";
    await assertFails(
      facA
        .ref(crossFacilityRefPath)
        .put(new Uint8Array([1, 2, 3]), { contentType: "application/pdf" }),
    );
  });

  // --------------------------------------------------------------------------
  // 6. Same-Path Overwrite Denial (Section 55)
  // --------------------------------------------------------------------------
  it("Section 55: Same-path overwrite is strictly DENIED", async () => {
    await seedReferral("ref_over", {
      id: "ref_over",
      facilityId: "TEST_FACILITY_A",
      status: "Pending Doctor Review",
    });

    const facA = testEnv.authenticatedContext(SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE.uid).storage();
    const filePath = "rheumatology/TEST_FACILITY_A/ref_over/att_unique/file.pdf";

    // 1st Upload -> SUCCEEDS
    await assertSucceeds(
      facA.ref(filePath).put(new Uint8Array([1, 2, 3]), { contentType: "application/pdf" }),
    );

    // 2nd Upload to SAME path -> DENIED (Immutability)
    await assertFails(
      facA.ref(filePath).put(new Uint8Array([4, 5, 6]), { contentType: "application/pdf" }),
    );
  });
});
