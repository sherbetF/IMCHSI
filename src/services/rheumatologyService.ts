/**
 * Dedicated Service Layer for HospitalHub Rheumatology Module (Hardened Stage 3B)
 *
 * Workflow:
 * 1. FACILITY creates referral -> "Pending Doctor Review"
 * 2. DOCTOR reviews referral:
 *    - Accepts with controlled instructions & timeframe -> "Awaiting Scheduling"
 *    - Returns for more clinical information -> "Returned to Facility"
 *    - Rejects referral -> "Rejected"
 * 3. FACILITY resubmits returned referral -> "Pending Doctor Review"
 * 4. PARAMEDIC schedules appointments:
 *    - Blood taking (optional, based on doctor instructions; can be set or cleared)
 *    - Doctor consultation (mandatory)
 *    -> "Scheduled"
 * 5. PARAMEDIC reschedules appointments -> "Scheduled"
 *
 * Security & Data Integrity Hardening:
 * - Firestore Rules enforce authoritative field allowlists & state transitions.
 * - Service layer enforces strict role isolation (Admin cannot impersonate Facility/Doctor/Paramedic).
 * - Document keys use Firestore auto-generated IDs with transaction uniqueness checks (never overwritten).
 * - High-entropy human-readable referral numbers (RHEUM-YYYY-XXXXXX) use crypto.getRandomValues().
 * - Historical "Pending Confirmation" is strictly READ-ONLY (no mutation paths allowed).
 * - Subscriptions derive query scope strictly from the trusted user profile.
 */

import {
  collection,
  doc,
  getDoc,
  runTransaction,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  FieldValue,
  Unsubscribe,
  DocumentReference,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase";

export const RHEUMATOLOGY_COLLECTION = "rheumatology_appointments";

// -------------------------------------------------------------
// Controlled Statuses & Controlled Input Sets
// -------------------------------------------------------------

export type RheumatologyStatus =
  | "Pending Doctor Review"
  | "Returned to Facility"
  | "Awaiting Scheduling"
  | "Scheduled"
  | "Rejected"
  | "Pending Confirmation"; // Historical legacy compatibility for READ ONLY

export type DoctorReviewStatus = "Reviewed" | "Returned" | "Rejected";

export const CONTROLLED_REVIEW_TIMEFRAMES = [
  "Urgent",
  "Within 2 Weeks",
  "Within 1 Month",
  "Within 2 Months",
  "Within 3 Months",
  "Within 4 Months",
  "Within 6 Months",
  "Other",
] as const;

export type DoctorReviewTimeframe = (typeof CONTROLLED_REVIEW_TIMEFRAMES)[number];

export const CONTROLLED_INVESTIGATIONS = [
  "FBC",
  "Renal Profile",
  "LFT",
  "ESR",
  "CRP",
  "Other",
] as const;

export type DoctorRequiredInvestigation = (typeof CONTROLLED_INVESTIGATIONS)[number];

export interface RheumatologyRecord {
  id: string; // Authoritative Firestore document ID
  referralNumber?: string; // High-entropy display tracking number (RHEUM-YYYY-XXXXXX)
  facilityId: string;
  facilityName: string;
  facilityCategory: string;
  patientName: string;
  mrn: string;
  contactNumber: string;
  email: string;
  procedureType: string;
  urgency: "Routine" | "Urgent";
  referringDoctor: string;
  department?: string;
  clinicalIndication: string;
  diagnosis: string;
  duplicateJustification?: string;
  status: RheumatologyStatus;

  createdAt: Timestamp | FieldValue | string;
  submittedAt?: Timestamp | FieldValue | string | null;
  updatedAt?: Timestamp | FieldValue | string | null;

  // Doctor Review Domain
  doctorReviewStatus?: DoctorReviewStatus;
  reviewedByDoctorId?: string;
  reviewedByUid?: string;
  reviewedByDoctorNameSnapshot?: string;
  reviewedAt?: Timestamp | FieldValue | string | null;
  reviewTimeframe?: string;
  requiredInvestigations?: string[];
  doctorInstructions?: string;
  returnReason?: string;
  rejectReason?: string;

  // Paramedic Scheduling Domain
  bloodTakingDate?: Timestamp | FieldValue | string | null;
  doctorAppointmentDate?: Timestamp | FieldValue | string | null;
  scheduledByUid?: string;
  scheduledByNameSnapshot?: string;
  scheduledAt?: Timestamp | FieldValue | string | null;

  // Legacy fields if present historically
  scheduledDate?: string;
  rejectedBy?: string;
}

// -------------------------------------------------------------
// Error Classes & Codes
// -------------------------------------------------------------

export type RheumatologyErrorCode =
  | "NOT_AUTHENTICATED"
  | "WRONG_ROLE"
  | "ACCOUNT_INACTIVE"
  | "INVALID_REFERRAL"
  | "INVALID_STATE"
  | "INVALID_INPUT"
  | "PERMISSION_DENIED"
  | "NOT_FOUND";

export class RheumatologyServiceError extends Error {
  public readonly code: RheumatologyErrorCode;
  constructor(code: RheumatologyErrorCode, message: string) {
    super(message);
    this.name = "RheumatologyServiceError";
    this.code = code;
    Object.setPrototypeOf(this, RheumatologyServiceError.prototype);
  }
}

// -------------------------------------------------------------
// Narrow Input Payloads (NO Security Fields)
// -------------------------------------------------------------

export interface CreateRheumatologyReferralInput {
  patientName: string;
  mrn: string;
  contactNumber: string;
  email?: string;
  clinicalIndication: string;
  diagnosis: string;
  referringDoctor?: string;
  department?: string;
  urgency?: "Routine" | "Urgent";
  duplicateJustification?: string;
}

export interface ResubmitRheumatologyReferralInput {
  referralId: string;
  patientName: string;
  mrn: string;
  contactNumber: string;
  email?: string;
  clinicalIndication: string;
  diagnosis: string;
}

export interface DoctorReviewInput {
  referralId: string;
  reviewTimeframe: DoctorReviewTimeframe;
  customTimeframe?: string; // Only valid when reviewTimeframe is "Other"
  requiredInvestigations: DoctorRequiredInvestigation[]; // Empty array indicates no blood tests required
  doctorInstructions?: string;
}

export interface ReturnReferralInput {
  referralId: string;
  returnReason: string;
}

export interface RejectReferralInput {
  referralId: string;
  rejectReason: string;
}

export interface ScheduleRheumatologyInput {
  referralId: string;
  doctorAppointmentDate: Date | Timestamp;
  bloodTakingDate?: Date | Timestamp | null;
}

export interface RescheduleRheumatologyInput {
  referralId: string;
  doctorAppointmentDate: Date | Timestamp;
  bloodTakingDate?: Date | Timestamp | null; // Passing null explicitly clears any existing blood appointment
}

// -------------------------------------------------------------
// Internal Identity & Profile Resolver
// -------------------------------------------------------------

export const VALID_APPLICATION_ROLES = [
  "admin",
  "facility",
  "paramedic_nurse",
  "doctor",
  "outsource",
] as const;

export type ValidUserRole = (typeof VALID_APPLICATION_ROLES)[number];

interface TrustedCallerProfile {
  uid: string;
  role: ValidUserRole;
  active: boolean;
  facilityId?: string;
  facilityName?: string;
  category?: string;
  doctorId?: string;
  displayName?: string;
  accountKey?: string;
}

async function getTrustedCallerProfile(): Promise<TrustedCallerProfile> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new RheumatologyServiceError(
      "NOT_AUTHENTICATED",
      "Authentication required: You must be logged in to perform this operation.",
    );
  }

  const profileRef = doc(db, "users", currentUser.uid);
  const profileSnap = await getDoc(profileRef);

  if (!profileSnap.exists()) {
    throw new RheumatologyServiceError(
      "NOT_FOUND",
      "User profile not found. Account provisioning is required.",
    );
  }

  const data = profileSnap.data();

  // Runtime Role Validation
  const rawRole = data["role"];
  if (typeof rawRole !== "string" || !VALID_APPLICATION_ROLES.includes(rawRole as ValidUserRole)) {
    throw new RheumatologyServiceError(
      "WRONG_ROLE",
      "Invalid or unrecognized authorization role in user profile.",
    );
  }

  if (data["active"] !== true) {
    throw new RheumatologyServiceError(
      "ACCOUNT_INACTIVE",
      "Account deactivated: You do not have permission to perform this action.",
    );
  }

  return {
    uid: currentUser.uid,
    role: rawRole as ValidUserRole,
    active: true,
    facilityId: typeof data["facilityId"] === "string" ? data["facilityId"].trim() : undefined,
    facilityName:
      typeof data["facilityName"] === "string" ? data["facilityName"].trim() : undefined,
    category: typeof data["category"] === "string" ? data["category"].trim() : undefined,
    doctorId: typeof data["doctorId"] === "string" ? data["doctorId"].trim() : undefined,
    displayName: typeof data["displayName"] === "string" ? data["displayName"].trim() : undefined,
    accountKey: typeof data["accountKey"] === "string" ? data["accountKey"].trim() : undefined,
  };
}

function normalizeTimestamp(val: Date | Timestamp): Timestamp {
  if (val instanceof Timestamp) return val;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) {
      throw new RheumatologyServiceError("INVALID_INPUT", "Invalid date value provided.");
    }
    return Timestamp.fromDate(val);
  }
  throw new RheumatologyServiceError(
    "INVALID_INPUT",
    "Date value must be a valid JavaScript Date or Firestore Timestamp.",
  );
}

function generateReferralNumber(): string {
  // High-entropy human-readable tracking number: RHEUM-YYYY-XXXXXX
  const year = new Date().getFullYear();
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  const randomSuffix = (100000 + (buffer[0] % 900000)).toString();
  return `RHEUM-${year}-${randomSuffix}`;
}

// -------------------------------------------------------------
// 1. CREATE RHEUMATOLOGY REFERRAL (Facility Operation)
// -------------------------------------------------------------

export async function createRheumatologyReferral(input: CreateRheumatologyReferralInput): Promise<{
  id: string;
  documentId: string;
  referralNumber: string;
  referral: RheumatologyRecord;
}> {
  const caller = await getTrustedCallerProfile();

  // Strict role check: Facility ONLY (Admin cannot impersonate Facility)
  if (caller.role !== "facility") {
    throw new RheumatologyServiceError(
      "WRONG_ROLE",
      "Only verified healthcare facility accounts may submit new Rheumatology referrals.",
    );
  }

  const trustedFacilityId = caller.facilityId;
  if (!trustedFacilityId) {
    throw new RheumatologyServiceError(
      "PERMISSION_DENIED",
      "Missing valid canonical facilityId in facility profile.",
    );
  }

  // Validate Facility input fields
  const patientName = input.patientName?.trim();
  const mrn = input.mrn?.trim();
  const contactNumber = input.contactNumber?.trim();
  const clinicalIndication = input.clinicalIndication?.trim();
  const diagnosis = input.diagnosis?.trim();

  if (!patientName) {
    throw new RheumatologyServiceError("INVALID_INPUT", "Patient name is required.");
  }
  if (!mrn) {
    throw new RheumatologyServiceError("INVALID_INPUT", "Identification / MRN is required.");
  }
  if (!contactNumber) {
    throw new RheumatologyServiceError("INVALID_INPUT", "Contact phone number is required.");
  }
  if (!clinicalIndication) {
    throw new RheumatologyServiceError("INVALID_INPUT", "Clinical indication is required.");
  }
  if (!diagnosis) {
    throw new RheumatologyServiceError(
      "INVALID_INPUT",
      "Clinical impression / diagnosis is required.",
    );
  }

  // Authoritative document identity: Firestore auto-generated unique ID
  const newDocRef = doc(collection(db, RHEUMATOLOGY_COLLECTION)) as DocumentReference<
    Record<string, unknown>
  >;
  const referralNumber = generateReferralNumber();

  const newRecord: Record<string, unknown> = {
    id: newDocRef.id,
    referralNumber,
    facilityId: trustedFacilityId,
    facilityName: caller.facilityName || trustedFacilityId,
    facilityCategory: caller.category || "Hospital",
    patientName,
    mrn,
    contactNumber,
    email: input.email?.trim() || "N/A",
    procedureType: "Rheumatology Clinical Consultation",
    urgency: input.urgency || "Routine",
    referringDoctor: input.referringDoctor?.trim() || "N/A",
    department: input.department?.trim() || "Rheumatology",
    clinicalIndication,
    diagnosis,
    status: "Pending Doctor Review",
    createdAt: serverTimestamp(),
    submittedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (input.duplicateJustification?.trim()) {
    newRecord["duplicateJustification"] = input.duplicateJustification.trim();
  }

  // Atomic creation: verifies document does not exist before writing (no overwrite risk)
  await runTransaction(db, async (transaction) => {
    const existingSnap = await transaction.get(newDocRef);
    if (existingSnap.exists()) {
      throw new RheumatologyServiceError(
        "INVALID_STATE",
        "Document key collision detected. Operation aborted to prevent overwriting existing data.",
      );
    }
    transaction.set(newDocRef, newRecord);
  });

  return {
    id: newDocRef.id,
    documentId: newDocRef.id,
    referralNumber,
    referral: {
      ...newRecord,
      createdAt: new Date().toISOString(),
      submittedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as RheumatologyRecord,
  };
}

// -------------------------------------------------------------
// 2. RESUBMIT RHEUMATOLOGY REFERRAL (Facility Operation)
// -------------------------------------------------------------

export async function resubmitRheumatologyReferral(
  input: ResubmitRheumatologyReferralInput,
): Promise<void> {
  const caller = await getTrustedCallerProfile();

  // Strict role check: Facility ONLY
  if (caller.role !== "facility") {
    throw new RheumatologyServiceError(
      "WRONG_ROLE",
      "Only the referring facility may resubmit a returned referral.",
    );
  }

  const referralId = input.referralId?.trim();
  if (!referralId) {
    throw new RheumatologyServiceError("INVALID_INPUT", "Missing referralId for resubmission.");
  }

  const patientName = input.patientName?.trim();
  const mrn = input.mrn?.trim();
  const contactNumber = input.contactNumber?.trim();
  const clinicalIndication = input.clinicalIndication?.trim();
  const diagnosis = input.diagnosis?.trim();

  if (!patientName || !mrn || !contactNumber || !clinicalIndication || !diagnosis) {
    throw new RheumatologyServiceError(
      "INVALID_INPUT",
      "All required clinical fields must be populated upon resubmission.",
    );
  }

  const docRef = doc(db, RHEUMATOLOGY_COLLECTION, referralId) as DocumentReference<
    Record<string, unknown>
  >;

  await runTransaction(db, async (transaction) => {
    const docSnap = await transaction.get(docRef);
    if (!docSnap.exists()) {
      throw new RheumatologyServiceError("NOT_FOUND", `Referral '${referralId}' not found.`);
    }

    const data = docSnap.data();

    // Verify facility ownership
    if (data["facilityId"] !== caller.facilityId) {
      throw new RheumatologyServiceError(
        "PERMISSION_DENIED",
        "You are not authorized to resubmit referrals originating from another facility.",
      );
    }

    // Verify current status: ONLY "Returned to Facility" (historical "Pending Confirmation" is READ-ONLY)
    const currentStatus = data["status"];
    if (currentStatus === "Rejected") {
      throw new RheumatologyServiceError(
        "INVALID_STATE",
        "Referral has been rejected and cannot be resubmitted.",
      );
    }

    if (currentStatus !== "Returned to Facility") {
      throw new RheumatologyServiceError(
        "INVALID_STATE",
        `Cannot resubmit referral with status '${currentStatus}'. Only referrals with status 'Returned to Facility' can be resubmitted.`,
      );
    }

    // Update Facility-owned fields strictly conforming to firestore.rules affectedKeys
    transaction.update(docRef, {
      patientName,
      mrn,
      contactNumber,
      email: input.email?.trim() || "N/A",
      clinicalIndication,
      diagnosis,
      status: "Pending Doctor Review",
      updatedAt: serverTimestamp(),
    });
  });
}

// -------------------------------------------------------------
// 3. SUBMIT DOCTOR REVIEW (Doctor Operation)
// -------------------------------------------------------------

export async function submitDoctorReview(input: DoctorReviewInput): Promise<void> {
  const caller = await getTrustedCallerProfile();

  // Strict role check: Doctor ONLY
  if (caller.role !== "doctor") {
    throw new RheumatologyServiceError(
      "WRONG_ROLE",
      "Only authorized Rheumatology doctors may perform clinical review.",
    );
  }

  const doctorId = caller.doctorId;
  if (!doctorId) {
    throw new RheumatologyServiceError("PERMISSION_DENIED", "Missing doctorId in doctor profile.");
  }

  const referralId = input.referralId?.trim();
  if (!referralId) {
    throw new RheumatologyServiceError("INVALID_INPUT", "Missing referralId for doctor review.");
  }

  // Validate review timeframe against controlled options
  if (!input.reviewTimeframe || !CONTROLLED_REVIEW_TIMEFRAMES.includes(input.reviewTimeframe)) {
    throw new RheumatologyServiceError(
      "INVALID_INPUT",
      `Invalid review timeframe. Must be one of: ${CONTROLLED_REVIEW_TIMEFRAMES.join(", ")}`,
    );
  }

  let finalTimeframe: string = input.reviewTimeframe;
  if (input.reviewTimeframe === "Other") {
    const custom = input.customTimeframe?.trim();
    if (!custom || custom.length < 2 || custom.length > 100) {
      throw new RheumatologyServiceError(
        "INVALID_INPUT",
        "When 'Other' timeframe is selected, a custom timeframe between 2 and 100 characters must be provided.",
      );
    }
    finalTimeframe = `Other: ${custom}`;
  }

  // Validate required investigations against controlled set
  const reqInvestigations = Array.isArray(input.requiredInvestigations)
    ? input.requiredInvestigations
    : [];

  for (const inv of reqInvestigations) {
    if (!CONTROLLED_INVESTIGATIONS.includes(inv)) {
      throw new RheumatologyServiceError(
        "INVALID_INPUT",
        `Invalid investigation '${inv}'. Allowed options: ${CONTROLLED_INVESTIGATIONS.join(", ")}`,
      );
    }
  }

  if (input.doctorInstructions && input.doctorInstructions.length > 2000) {
    throw new RheumatologyServiceError(
      "INVALID_INPUT",
      "Doctor instructions cannot exceed 2000 characters.",
    );
  }

  const docRef = doc(db, RHEUMATOLOGY_COLLECTION, referralId) as DocumentReference<
    Record<string, unknown>
  >;

  await runTransaction(db, async (transaction) => {
    const docSnap = await transaction.get(docRef);
    if (!docSnap.exists()) {
      throw new RheumatologyServiceError("NOT_FOUND", `Referral '${referralId}' not found.`);
    }

    const data = docSnap.data();
    const currentStatus = data["status"];

    if (currentStatus === "Rejected") {
      throw new RheumatologyServiceError(
        "INVALID_STATE",
        "Referral has been rejected and cannot be reviewed.",
      );
    }

    // New workflow requirement: Only "Pending Doctor Review" can be reviewed
    if (currentStatus !== "Pending Doctor Review") {
      throw new RheumatologyServiceError(
        "INVALID_STATE",
        `Referral is currently in status '${currentStatus}' and cannot be reviewed in this state.`,
      );
    }

    transaction.update(docRef, {
      status: "Awaiting Scheduling",
      doctorReviewStatus: "Reviewed",
      reviewedByDoctorId: doctorId,
      reviewedByUid: caller.uid,
      reviewedByDoctorNameSnapshot: caller.displayName || "Rheumatology Specialist",
      reviewedAt: serverTimestamp(),
      reviewTimeframe: finalTimeframe,
      requiredInvestigations: reqInvestigations,
      doctorInstructions: input.doctorInstructions?.trim() || "",
      updatedAt: serverTimestamp(),
    });
  });
}

// -------------------------------------------------------------
// 4. RETURN RHEUMATOLOGY REFERRAL (Doctor Operation)
// -------------------------------------------------------------

export async function returnRheumatologyReferral(input: ReturnReferralInput): Promise<void> {
  const caller = await getTrustedCallerProfile();

  // Strict role check: Doctor ONLY
  if (caller.role !== "doctor") {
    throw new RheumatologyServiceError(
      "WRONG_ROLE",
      "Only authorized Rheumatology doctors may return a referral.",
    );
  }

  const doctorId = caller.doctorId;
  if (!doctorId) {
    throw new RheumatologyServiceError("PERMISSION_DENIED", "Missing doctorId in doctor profile.");
  }

  const referralId = input.referralId?.trim();
  if (!referralId) {
    throw new RheumatologyServiceError("INVALID_INPUT", "Missing referralId.");
  }

  const returnReason = input.returnReason?.trim();
  if (!returnReason || returnReason.length < 5) {
    throw new RheumatologyServiceError(
      "INVALID_INPUT",
      "A clear return reason of at least 5 characters is required.",
    );
  }
  if (returnReason.length > 1000) {
    throw new RheumatologyServiceError(
      "INVALID_INPUT",
      "Return reason cannot exceed 1000 characters.",
    );
  }

  const docRef = doc(db, RHEUMATOLOGY_COLLECTION, referralId) as DocumentReference<
    Record<string, unknown>
  >;

  await runTransaction(db, async (transaction) => {
    const docSnap = await transaction.get(docRef);
    if (!docSnap.exists()) {
      throw new RheumatologyServiceError("NOT_FOUND", `Referral '${referralId}' not found.`);
    }

    const data = docSnap.data();
    const currentStatus = data["status"];

    if (currentStatus === "Rejected") {
      throw new RheumatologyServiceError(
        "INVALID_STATE",
        "Referral has already been rejected and cannot be returned.",
      );
    }

    if (currentStatus !== "Pending Doctor Review") {
      throw new RheumatologyServiceError(
        "INVALID_STATE",
        `Referral is in status '${currentStatus}' and cannot be returned.`,
      );
    }

    transaction.update(docRef, {
      status: "Returned to Facility",
      doctorReviewStatus: "Returned",
      returnReason,
      reviewedByDoctorId: doctorId,
      reviewedByUid: caller.uid,
      reviewedByDoctorNameSnapshot: caller.displayName || "Rheumatology Specialist",
      reviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

// -------------------------------------------------------------
// 5. REJECT RHEUMATOLOGY REFERRAL (Doctor Operation)
// -------------------------------------------------------------

export async function rejectRheumatologyReferral(input: RejectReferralInput): Promise<void> {
  const caller = await getTrustedCallerProfile();

  // Strict role check: Doctor ONLY
  if (caller.role !== "doctor") {
    throw new RheumatologyServiceError(
      "WRONG_ROLE",
      "Only authorized Rheumatology doctors may reject a referral.",
    );
  }

  const doctorId = caller.doctorId;
  if (!doctorId) {
    throw new RheumatologyServiceError("PERMISSION_DENIED", "Missing doctorId in doctor profile.");
  }

  const referralId = input.referralId?.trim();
  if (!referralId) {
    throw new RheumatologyServiceError("INVALID_INPUT", "Missing referralId.");
  }

  const rejectReason = input.rejectReason?.trim();
  if (!rejectReason || rejectReason.length < 5) {
    throw new RheumatologyServiceError(
      "INVALID_INPUT",
      "A clinical rejection reason of at least 5 characters is required.",
    );
  }
  if (rejectReason.length > 1000) {
    throw new RheumatologyServiceError(
      "INVALID_INPUT",
      "Rejection reason cannot exceed 1000 characters.",
    );
  }

  const docRef = doc(db, RHEUMATOLOGY_COLLECTION, referralId) as DocumentReference<
    Record<string, unknown>
  >;

  await runTransaction(db, async (transaction) => {
    const docSnap = await transaction.get(docRef);
    if (!docSnap.exists()) {
      throw new RheumatologyServiceError("NOT_FOUND", `Referral '${referralId}' not found.`);
    }

    const data = docSnap.data();
    const currentStatus = data["status"];

    if (currentStatus === "Rejected") {
      throw new RheumatologyServiceError("INVALID_STATE", "Referral is already rejected.");
    }

    if (currentStatus !== "Pending Doctor Review") {
      throw new RheumatologyServiceError(
        "INVALID_STATE",
        `Referral is in status '${currentStatus}' and cannot be rejected in this state.`,
      );
    }

    transaction.update(docRef, {
      status: "Rejected",
      doctorReviewStatus: "Rejected",
      rejectReason,
      reviewedByDoctorId: doctorId,
      reviewedByUid: caller.uid,
      reviewedByDoctorNameSnapshot: caller.displayName || "Rheumatology Specialist",
      reviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

// -------------------------------------------------------------
// 6. SCHEDULE RHEUMATOLOGY APPOINTMENTS (Paramedic Operation)
// -------------------------------------------------------------

export async function scheduleRheumatologyAppointments(
  input: ScheduleRheumatologyInput,
): Promise<void> {
  const caller = await getTrustedCallerProfile();

  // Strict role check: Paramedic ONLY
  if (caller.role !== "paramedic_nurse") {
    throw new RheumatologyServiceError(
      "WRONG_ROLE",
      "Only paramedic / nurse accounts may schedule appointments.",
    );
  }

  const referralId = input.referralId?.trim();
  if (!referralId) {
    throw new RheumatologyServiceError("INVALID_INPUT", "Missing referralId for scheduling.");
  }

  // Doctor consultation date is mandatory
  const doctorDate = normalizeTimestamp(input.doctorAppointmentDate);
  const bloodDate = input.bloodTakingDate ? normalizeTimestamp(input.bloodTakingDate) : null;

  // Validate sequencing: blood taking must occur on or before doctor consultation
  if (bloodDate && bloodDate.toMillis() > doctorDate.toMillis()) {
    throw new RheumatologyServiceError(
      "INVALID_INPUT",
      "Prerequisite blood-taking appointment cannot be scheduled after the doctor review appointment.",
    );
  }

  const docRef = doc(db, RHEUMATOLOGY_COLLECTION, referralId) as DocumentReference<
    Record<string, unknown>
  >;

  await runTransaction(db, async (transaction) => {
    const docSnap = await transaction.get(docRef);
    if (!docSnap.exists()) {
      throw new RheumatologyServiceError("NOT_FOUND", `Referral '${referralId}' not found.`);
    }

    const data = docSnap.data();
    const currentStatus = data["status"];

    if (currentStatus === "Rejected") {
      throw new RheumatologyServiceError(
        "INVALID_STATE",
        "Referral has been rejected and cannot be scheduled.",
      );
    }

    if (currentStatus === "Scheduled") {
      throw new RheumatologyServiceError(
        "INVALID_STATE",
        "Referral is already scheduled. Use reschedule to update appointment dates.",
      );
    }

    if (currentStatus !== "Awaiting Scheduling") {
      throw new RheumatologyServiceError(
        "INVALID_STATE",
        `Referral is currently in status '${currentStatus}'. It must be reviewed by a doctor ('Awaiting Scheduling') before scheduling.`,
      );
    }

    const updatePayload: Record<string, unknown> = {
      status: "Scheduled",
      doctorAppointmentDate: doctorDate,
      bloodTakingDate: bloodDate, // Set to Timestamp or null
      scheduledByUid: caller.uid,
      scheduledByNameSnapshot: caller.displayName || "Paramedic / Nurse",
      scheduledAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    transaction.update(docRef, updatePayload);
  });
}

// -------------------------------------------------------------
// 7. RESCHEDULE RHEUMATOLOGY APPOINTMENTS (Paramedic Operation)
// -------------------------------------------------------------

export async function rescheduleRheumatologyAppointments(
  input: RescheduleRheumatologyInput,
): Promise<void> {
  const caller = await getTrustedCallerProfile();

  // Strict role check: Paramedic ONLY
  if (caller.role !== "paramedic_nurse") {
    throw new RheumatologyServiceError(
      "WRONG_ROLE",
      "Only paramedic / nurse accounts may reschedule appointments.",
    );
  }

  const referralId = input.referralId?.trim();
  if (!referralId) {
    throw new RheumatologyServiceError("INVALID_INPUT", "Missing referralId for rescheduling.");
  }

  const doctorDate = normalizeTimestamp(input.doctorAppointmentDate);
  const bloodDate = input.bloodTakingDate ? normalizeTimestamp(input.bloodTakingDate) : null;

  if (bloodDate && bloodDate.toMillis() > doctorDate.toMillis()) {
    throw new RheumatologyServiceError(
      "INVALID_INPUT",
      "Prerequisite blood-taking appointment cannot be scheduled after the doctor review appointment.",
    );
  }

  const docRef = doc(db, RHEUMATOLOGY_COLLECTION, referralId) as DocumentReference<
    Record<string, unknown>
  >;

  await runTransaction(db, async (transaction) => {
    const docSnap = await transaction.get(docRef);
    if (!docSnap.exists()) {
      throw new RheumatologyServiceError("NOT_FOUND", `Referral '${referralId}' not found.`);
    }

    const data = docSnap.data();
    const currentStatus = data["status"];

    if (currentStatus !== "Scheduled") {
      throw new RheumatologyServiceError(
        "INVALID_STATE",
        `Referral is in status '${currentStatus}'. Only previously scheduled referrals can be rescheduled.`,
      );
    }

    // scheduledAt preserves original initial scheduling timestamp.
    // bloodTakingDate explicitly set to null if cleared.
    const updatePayload: Record<string, unknown> = {
      status: "Scheduled",
      doctorAppointmentDate: doctorDate,
      bloodTakingDate: bloodDate, // Explicitly writes null if cleared, removing prior date
      scheduledByUid: caller.uid,
      scheduledByNameSnapshot: caller.displayName || "Paramedic / Nurse",
      updatedAt: serverTimestamp(),
    };

    transaction.update(docRef, updatePayload);
  });
}

// -------------------------------------------------------------
// 8. SUBSCRIBE TO RHEUMATOLOGY REFERRALS (Trusted Profile Derived)
// -------------------------------------------------------------

export type RheumatologySubscriptionStatus =
  "loading" | "success" | "empty" | "authenticationRequired" | "permissionDenied" | "error";

export interface RheumatologySubscriptionOptions {
  statusFilter?: RheumatologyStatus | "ALL";
}

export function subscribeToRheumatologyReferrals(
  callback: (referrals: RheumatologyRecord[], status: RheumatologySubscriptionStatus) => void,
  options?: RheumatologySubscriptionOptions,
): Unsubscribe {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    callback([], "authenticationRequired");
    return () => {};
  }

  let activeUnsubscribe: Unsubscribe | null = null;
  let isCancelled = false;

  // Resolve trusted profile asynchronously to derive authoritative query scope
  getTrustedCallerProfile()
    .then((caller) => {
      if (isCancelled) return;

      const colRef = collection(db, RHEUMATOLOGY_COLLECTION);
      let q;

      if (caller.role === "facility") {
        if (!caller.facilityId) {
          callback([], "permissionDenied");
          return;
        }
        // Facility strictly queries their own canonical facilityId
        q = query(colRef, where("facilityId", "==", caller.facilityId));
      } else if (
        caller.role === "doctor" ||
        caller.role === "paramedic_nurse" ||
        caller.role === "admin"
      ) {
        // Clinical roles and Admins query the collection subject to security rules
        q = query(colRef);
      } else {
        // Outsource or unrecognized roles are strictly denied
        callback([], "permissionDenied");
        return;
      }

      activeUnsubscribe = onSnapshot(
        q,
        (snapshot) => {
          let records: RheumatologyRecord[] = [];
          snapshot.forEach((docSnap) => {
            records.push({
              ...docSnap.data(),
              id: docSnap.id,
            } as RheumatologyRecord);
          });

          // Apply in-memory status filter if requested
          if (options?.statusFilter && options.statusFilter !== "ALL") {
            records = records.filter((r) => r.status === options.statusFilter);
          }

          // Sort newest submissions first
          records.sort((a, b) => {
            const timeA = extractTimestampMillis(a.submittedAt || a.createdAt);
            const timeB = extractTimestampMillis(b.submittedAt || b.createdAt);
            return timeB - timeA;
          });

          const subStatus: RheumatologySubscriptionStatus =
            records.length === 0 ? "empty" : "success";
          callback(records, subStatus);
        },
        (err) => {
          console.warn("Rheumatology subscription error:", err);
          const subStatus: RheumatologySubscriptionStatus =
            err.code === "permission-denied" ? "permissionDenied" : "error";
          callback([], subStatus);
        },
      );
    })
    .catch((err) => {
      if (isCancelled) return;
      console.warn("Error resolving caller profile for subscription:", err);
      callback([], "permissionDenied");
    });

  return () => {
    isCancelled = true;
    if (activeUnsubscribe) {
      activeUnsubscribe();
    }
  };
}

function extractTimestampMillis(val: unknown): number {
  if (!val) return 0;
  if (val instanceof Timestamp) return val.toMillis();
  if (typeof val === "object" && val !== null && "seconds" in val) {
    return (val as { seconds: number }).seconds * 1000;
  }
  if (typeof val === "string") {
    const t = new Date(val).getTime();
    return isNaN(t) ? 0 : t;
  }
  if (val instanceof Date) return val.getTime();
  return 0;
}
