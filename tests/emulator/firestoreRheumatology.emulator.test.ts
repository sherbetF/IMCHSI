import { describe, it, beforeAll, afterAll, beforeEach, expect } from "vitest";
import { RulesTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import {
  createRealRulesTestEnvironment,
  seedSyntheticUserProfiles,
  NAMED_DATABASE_ID,
} from "./testEnvironment";
import { SYNTHETIC_IDENTITIES } from "../fixtures/syntheticIdentities";

describe("Stage 7C — Real Firebase Emulator Firestore Rules Execution Tests", () => {
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
  // 1. Cross-Facility Read & Update Isolation (Section 12, 13, 14)
  // --------------------------------------------------------------------------
  it("Section 12 & 13: Facility A reads own referral, Facility B is DENIED read", async () => {
    // Seed Referral A owned by TEST_FACILITY_A
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore({ databaseId: NAMED_DATABASE_ID } as any);
      await db.collection("rheumatology_appointments").doc("ref_A").set({
        id: "ref_A",
        facilityId: "TEST_FACILITY_A",
        patientName: "Test Patient A",
        mrn: "MRN-001",
        contactNumber: "0123456789",
        clinicalIndication: "Joint inflammation",
        diagnosis: "Suspected RA",
        status: "Pending Doctor Review",
        createdAt: new Date().toISOString(),
        submittedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });

    const facAContext = testEnv.authenticatedContext(SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE.uid);
    const facBContext = testEnv.authenticatedContext(SYNTHETIC_IDENTITIES.FACILITY_B_ACTIVE.uid);

    const facADb = facAContext.firestore({ databaseId: NAMED_DATABASE_ID } as any);
    const facBDb = facBContext.firestore({ databaseId: NAMED_DATABASE_ID } as any);

    // Facility A owns ref_A -> ALLOW
    await assertSucceeds(facADb.collection("rheumatology_appointments").doc("ref_A").get());

    // Facility B does NOT own ref_A -> DENY
    await assertFails(facBDb.collection("rheumatology_appointments").doc("ref_A").get());
  });

  it("Section 14: Facility B is DENIED update on Facility A referral", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore({ databaseId: NAMED_DATABASE_ID } as any);
      await db.collection("rheumatology_appointments").doc("ref_A").set({
        id: "ref_A",
        facilityId: "TEST_FACILITY_A",
        patientName: "Test Patient A",
        mrn: "MRN-001",
        contactNumber: "0123456789",
        clinicalIndication: "Joint pain",
        diagnosis: "RA",
        status: "Returned to Facility",
        createdAt: new Date().toISOString(),
        submittedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });

    const facBContext = testEnv.authenticatedContext(SYNTHETIC_IDENTITIES.FACILITY_B_ACTIVE.uid);
    const facBDb = facBContext.firestore({ databaseId: NAMED_DATABASE_ID } as any);

    await assertFails(
      facBDb.collection("rheumatology_appointments").doc("ref_A").update({
        clinicalIndication: "Malicious modification by Facility B",
        status: "Pending Doctor Review",
        updatedAt: new Date().toISOString(),
      }),
    );
  });

  // --------------------------------------------------------------------------
  // 2. Production Facility Query Isolation (Stage 7C Requirement 8)
  // --------------------------------------------------------------------------
  it("Stage 7C: Production Facility Query where('facilityId', '==', facilityId) succeeds, unfiltered query fails", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore({ databaseId: NAMED_DATABASE_ID } as any);
      await db.collection("rheumatology_appointments").doc("ref_A1").set({
        id: "ref_A1",
        facilityId: "TEST_FACILITY_A",
        patientName: "Patient A1",
        mrn: "MRN-A1",
        contactNumber: "0123456789",
        clinicalIndication: "Joint pain",
        diagnosis: "RA",
        status: "Pending Doctor Review",
        createdAt: new Date().toISOString(),
        submittedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await db.collection("rheumatology_appointments").doc("ref_B1").set({
        id: "ref_B1",
        facilityId: "TEST_FACILITY_B",
        patientName: "Patient B1",
        mrn: "MRN-B1",
        contactNumber: "0198765432",
        clinicalIndication: "Lupus nephritis",
        diagnosis: "SLE",
        status: "Pending Doctor Review",
        createdAt: new Date().toISOString(),
        submittedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });

    const facAContext = testEnv.authenticatedContext(SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE.uid);
    const facADb = facAContext.firestore({ databaseId: NAMED_DATABASE_ID } as any);

    // Facility A querying its own facilityId -> SUCCEEDS
    const validQuery = facADb
      .collection("rheumatology_appointments")
      .where("facilityId", "==", "TEST_FACILITY_A");
    await assertSucceeds(validQuery.get());

    // Facility A querying Facility B -> FAILS
    const invalidQuery = facADb
      .collection("rheumatology_appointments")
      .where("facilityId", "==", "TEST_FACILITY_B");
    await assertFails(invalidQuery.get());

    // Facility A querying unfiltered collection -> FAILS
    const unfilteredQuery = facADb.collection("rheumatology_appointments");
    await assertFails(unfilteredQuery.get());

    // Doctor & Admin querying unfiltered -> SUCCEEDS
    const docDb = testEnv
      .authenticatedContext(SYNTHETIC_IDENTITIES.DOCTOR_A_ACTIVE.uid)
      .firestore({ databaseId: NAMED_DATABASE_ID } as any);
    await assertSucceeds(docDb.collection("rheumatology_appointments").get());

    const adminDb = testEnv
      .authenticatedContext(SYNTHETIC_IDENTITIES.ADMIN_ACTIVE.uid)
      .firestore({ databaseId: NAMED_DATABASE_ID } as any);
    await assertSucceeds(adminDb.collection("rheumatology_appointments").get());
  });

  // --------------------------------------------------------------------------
  // 3. Facility Create & Field Protection (Section 15, 16)
  // --------------------------------------------------------------------------
  it("Section 15: Facility A creates valid referral in Pending Doctor Review", async () => {
    const facAContext = testEnv.authenticatedContext(SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE.uid);
    const facADb = facAContext.firestore({ databaseId: NAMED_DATABASE_ID } as any);

    const validPayload = {
      id: "ref_new_01",
      facilityId: "TEST_FACILITY_A",
      patientName: "New Patient A",
      mrn: "MRN-999",
      contactNumber: "0198887766",
      clinicalIndication: "Morning stiffness",
      diagnosis: "Rheumatoid Arthritis",
      status: "Pending Doctor Review",
      createdAt: new Date().toISOString(),
      submittedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await assertSucceeds(
      facADb.collection("rheumatology_appointments").doc("ref_new_01").set(validPayload),
    );
  });

  it("Section 15 & 16: Facility A spoofing facilityId or injecting Doctor fields is DENIED", async () => {
    const facAContext = testEnv.authenticatedContext(SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE.uid);
    const facADb = facAContext.firestore({ databaseId: NAMED_DATABASE_ID } as any);

    // Spoofed facilityId
    const spoofedFacilityPayload = {
      id: "ref_spoof_fac",
      facilityId: "TEST_FACILITY_B", // SPOOF
      patientName: "Spoofed Patient",
      mrn: "MRN-111",
      contactNumber: "011223344",
      clinicalIndication: "Lupus",
      diagnosis: "SLE",
      status: "Pending Doctor Review",
      createdAt: new Date().toISOString(),
      submittedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await assertFails(
      facADb
        .collection("rheumatology_appointments")
        .doc("ref_spoof_fac")
        .set(spoofedFacilityPayload),
    );

    // Protected Doctor Field Injection
    const injectedDoctorPayload = {
      id: "ref_injected_doc",
      facilityId: "TEST_FACILITY_A",
      patientName: "Injected Patient",
      mrn: "MRN-222",
      contactNumber: "011223344",
      clinicalIndication: "Lupus",
      diagnosis: "SLE",
      status: "Pending Doctor Review",
      reviewedByDoctorId: "dr_rheum_test_001", // INJECTION
      createdAt: new Date().toISOString(),
      submittedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await assertFails(
      facADb
        .collection("rheumatology_appointments")
        .doc("ref_injected_doc")
        .set(injectedDoctorPayload),
    );
  });

  // --------------------------------------------------------------------------
  // 4. Doctor Review & Attribution Spoof Denial (Section 18, 19, 20, 21)
  // --------------------------------------------------------------------------
  it("Section 18 & 19: Doctor review succeeds with matching profile, spoofed attribution is DENIED", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore({ databaseId: NAMED_DATABASE_ID } as any);
      await db.collection("rheumatology_appointments").doc("ref_review").set({
        id: "ref_review",
        facilityId: "TEST_FACILITY_A",
        patientName: "Patient For Review",
        mrn: "MRN-333",
        contactNumber: "011111111",
        clinicalIndication: "Polyarthritis",
        diagnosis: "RA",
        status: "Pending Doctor Review",
        createdAt: new Date().toISOString(),
        submittedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });

    const docContext = testEnv.authenticatedContext(SYNTHETIC_IDENTITIES.DOCTOR_A_ACTIVE.uid);
    const docDb = docContext.firestore({ databaseId: NAMED_DATABASE_ID } as any);

    // Spoofed doctor ID -> DENIED
    await assertFails(
      docDb.collection("rheumatology_appointments").doc("ref_review").update({
        status: "Awaiting Scheduling",
        doctorReviewStatus: "Reviewed",
        reviewedByDoctorId: "dr_someone_else", // SPOOF
        reviewedByUid: SYNTHETIC_IDENTITIES.DOCTOR_A_ACTIVE.uid,
        reviewedAt: new Date().toISOString(),
        reviewTimeframe: "Within 2 Weeks",
        doctorInstructions: "Start Methotrexate",
        updatedAt: new Date().toISOString(),
      }),
    );

    // Valid Doctor review -> SUCCEEDS
    await assertSucceeds(
      docDb.collection("rheumatology_appointments").doc("ref_review").update({
        status: "Awaiting Scheduling",
        doctorReviewStatus: "Reviewed",
        reviewedByDoctorId: SYNTHETIC_IDENTITIES.DOCTOR_A_ACTIVE.doctorId,
        reviewedByUid: SYNTHETIC_IDENTITIES.DOCTOR_A_ACTIVE.uid,
        reviewedAt: new Date().toISOString(),
        reviewTimeframe: "Within 2 Weeks",
        doctorInstructions: "Start Methotrexate",
        updatedAt: new Date().toISOString(),
      }),
    );
  });

  it("Section 20 & 21: Doctor transitions to Returned to Facility (requires returnReason) and Rejected (requires rejectReason)", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore({ databaseId: NAMED_DATABASE_ID } as any);
      await db.collection("rheumatology_appointments").doc("ref_ret").set({
        id: "ref_ret",
        facilityId: "TEST_FACILITY_A",
        status: "Pending Doctor Review",
      });
      await db.collection("rheumatology_appointments").doc("ref_rej").set({
        id: "ref_rej",
        facilityId: "TEST_FACILITY_A",
        status: "Pending Doctor Review",
      });
    });

    const docDb = testEnv
      .authenticatedContext(SYNTHETIC_IDENTITIES.DOCTOR_A_ACTIVE.uid)
      .firestore({ databaseId: NAMED_DATABASE_ID } as any);

    // Returned to Facility without reason -> FAILS
    await assertFails(
      docDb.collection("rheumatology_appointments").doc("ref_ret").update({
        status: "Returned to Facility",
        reviewedByDoctorId: SYNTHETIC_IDENTITIES.DOCTOR_A_ACTIVE.doctorId,
        reviewedByUid: SYNTHETIC_IDENTITIES.DOCTOR_A_ACTIVE.uid,
        updatedAt: new Date().toISOString(),
      }),
    );

    // Returned to Facility with reason -> SUCCEEDS
    await assertSucceeds(
      docDb.collection("rheumatology_appointments").doc("ref_ret").update({
        status: "Returned to Facility",
        returnReason: "Need baseline X-ray and RF titers",
        reviewedByDoctorId: SYNTHETIC_IDENTITIES.DOCTOR_A_ACTIVE.doctorId,
        reviewedByUid: SYNTHETIC_IDENTITIES.DOCTOR_A_ACTIVE.uid,
        updatedAt: new Date().toISOString(),
      }),
    );

    // Rejected with reason -> SUCCEEDS
    await assertSucceeds(
      docDb.collection("rheumatology_appointments").doc("ref_rej").update({
        status: "Rejected",
        rejectReason: "Not a rheumatology condition; refer to Orthopedics",
        reviewedByDoctorId: SYNTHETIC_IDENTITIES.DOCTOR_A_ACTIVE.doctorId,
        reviewedByUid: SYNTHETIC_IDENTITIES.DOCTOR_A_ACTIVE.uid,
        updatedAt: new Date().toISOString(),
      }),
    );
  });

  // --------------------------------------------------------------------------
  // 5. Paramedic Scheduling & Clinical Modification Denial (Section 22, 23, 24, 25)
  // --------------------------------------------------------------------------
  it("Section 22 & 23: Paramedic scheduling succeeds, clinical field mutation is DENIED", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore({ databaseId: NAMED_DATABASE_ID } as any);
      await db.collection("rheumatology_appointments").doc("ref_sched").set({
        id: "ref_sched",
        facilityId: "TEST_FACILITY_A",
        patientName: "Patient Sched",
        mrn: "MRN-444",
        contactNumber: "0123456789",
        clinicalIndication: "Gout",
        diagnosis: "Chronic Tophaceous Gout",
        status: "Awaiting Scheduling",
        reviewTimeframe: "Within 1 Month",
        doctorInstructions: "Joint aspiration",
        reviewedByDoctorId: "dr_rheum_test_001",
        createdAt: new Date().toISOString(),
        submittedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });

    const paramContext = testEnv.authenticatedContext(SYNTHETIC_IDENTITIES.PARAMEDIC_ACTIVE.uid);
    const paramDb = paramContext.firestore({ databaseId: NAMED_DATABASE_ID } as any);

    // Paramedic attempting to modify Doctor instructions -> DENIED
    await assertFails(
      paramDb.collection("rheumatology_appointments").doc("ref_sched").update({
        status: "Scheduled",
        doctorAppointmentDate: "2026-11-20 09:30",
        scheduledByUid: SYNTHETIC_IDENTITIES.PARAMEDIC_ACTIVE.uid,
        scheduledAt: new Date().toISOString(),
        doctorInstructions: "Paramedic altered instructions", // UNAUTHORIZED
        updatedAt: new Date().toISOString(),
      }),
    );

    // Valid scheduling -> SUCCEEDS
    await assertSucceeds(
      paramDb.collection("rheumatology_appointments").doc("ref_sched").update({
        status: "Scheduled",
        doctorAppointmentDate: "2026-11-20 09:30",
        scheduledByUid: SYNTHETIC_IDENTITIES.PARAMEDIC_ACTIVE.uid,
        scheduledAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    );
  });

  // --------------------------------------------------------------------------
  // 6. Direct Parent Deletion Denial (Section 32)
  // --------------------------------------------------------------------------
  it("Section 32: Direct parent referral deletion is DENIED for all client roles", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore({ databaseId: NAMED_DATABASE_ID } as any);
      await db.collection("rheumatology_appointments").doc("ref_delete_test").set({
        id: "ref_delete_test",
        facilityId: "TEST_FACILITY_A",
        status: "Pending Doctor Review",
      });
    });

    const roles = [
      SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE.uid,
      SYNTHETIC_IDENTITIES.DOCTOR_A_ACTIVE.uid,
      SYNTHETIC_IDENTITIES.PARAMEDIC_ACTIVE.uid,
      SYNTHETIC_IDENTITIES.ADMIN_ACTIVE.uid,
      SYNTHETIC_IDENTITIES.OUTSOURCE_ACTIVE.uid,
    ];

    for (const uid of roles) {
      const userContext = testEnv.authenticatedContext(uid);
      const userDb = userContext.firestore({ databaseId: NAMED_DATABASE_ID } as any);
      await assertFails(
        userDb.collection("rheumatology_appointments").doc("ref_delete_test").delete(),
      );
    }
  });

  // --------------------------------------------------------------------------
  // 7. Attachment Control Subcollection Direct Client Access Denial (Section 42)
  // --------------------------------------------------------------------------
  it("Section 42: Direct client read/write to attachment_control/summary is strictly DENIED", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore({ databaseId: NAMED_DATABASE_ID } as any);
      await db
        .collection("rheumatology_appointments")
        .doc("ref_ctrl")
        .collection("attachment_control")
        .doc("summary")
        .set({
          activeAttachmentIds: ["att_01"],
          activeCount: 1,
        });
    });

    const testUids = [
      SYNTHETIC_IDENTITIES.FACILITY_A_ACTIVE.uid,
      SYNTHETIC_IDENTITIES.DOCTOR_A_ACTIVE.uid,
      SYNTHETIC_IDENTITIES.PARAMEDIC_ACTIVE.uid,
      SYNTHETIC_IDENTITIES.ADMIN_ACTIVE.uid,
      SYNTHETIC_IDENTITIES.OUTSOURCE_ACTIVE.uid,
    ];

    for (const uid of testUids) {
      const userContext = testEnv.authenticatedContext(uid);
      const userDb = userContext.firestore({ databaseId: NAMED_DATABASE_ID } as any);

      // Direct Client Read -> DENIED
      await assertFails(
        userDb
          .collection("rheumatology_appointments")
          .doc("ref_ctrl")
          .collection("attachment_control")
          .doc("summary")
          .get(),
      );

      // Direct Client Write -> DENIED
      await assertFails(
        userDb
          .collection("rheumatology_appointments")
          .doc("ref_ctrl")
          .collection("attachment_control")
          .doc("summary")
          .set({
            activeAttachmentIds: [],
            activeCount: 0,
          }),
      );
    }
  });

  // --------------------------------------------------------------------------
  // 8. Inactive Users & Unauthenticated Access Denial (Stage 7C Security Hardening)
  // --------------------------------------------------------------------------
  it("Stage 7C: Inactive users and unauthenticated requests are DENIED access", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore({ databaseId: NAMED_DATABASE_ID } as any);
      await db.collection("rheumatology_appointments").doc("ref_sec_test").set({
        id: "ref_sec_test",
        facilityId: "TEST_FACILITY_A",
        status: "Pending Doctor Review",
      });
    });

    // Inactive Facility User -> DENIED
    const inactFacDb = testEnv
      .authenticatedContext(SYNTHETIC_IDENTITIES.FACILITY_A_INACTIVE.uid)
      .firestore({ databaseId: NAMED_DATABASE_ID } as any);
    await assertFails(inactFacDb.collection("rheumatology_appointments").doc("ref_sec_test").get());

    // Inactive Doctor User -> DENIED
    const inactDocDb = testEnv
      .authenticatedContext(SYNTHETIC_IDENTITIES.DOCTOR_A_INACTIVE.uid)
      .firestore({ databaseId: NAMED_DATABASE_ID } as any);
    await assertFails(inactDocDb.collection("rheumatology_appointments").doc("ref_sec_test").get());

    // Unauthenticated -> DENIED
    const unauthDb = testEnv
      .unauthenticatedContext()
      .firestore({ databaseId: NAMED_DATABASE_ID } as any);
    await assertFails(unauthDb.collection("rheumatology_appointments").doc("ref_sec_test").get());
    await assertFails(
      unauthDb.collection("rheumatology_appointments").doc("ref_unauth_new").set({
        id: "ref_unauth_new",
        facilityId: "TEST_FACILITY_A",
        status: "Pending Doctor Review",
      }),
    );
  });
});
