import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  query,
  where,
  updateDoc,
  orderBy,
  Unsubscribe,
  Timestamp,
  FieldValue,
} from "firebase/firestore";
import { db, auth, handleFirestoreError, OperationType } from "@/lib/firebase";
import { getAuth } from "firebase/auth";

// Safe helper to get active auth instance
function getFirebaseAuth() {
  try {
    return auth || getAuth();
  } catch {
    return null;
  }
}
import { parseDateToTimestamp } from "@/utils/dateUtils";

export interface UnifiedRequestNotification {
  id: string;
  rawId: string;
  facilityId?: string;
  patientName: string;
  mrn: string;
  testType:
    | "Echocardiogram"
    | "Exercise Stress Test"
    | "24H Holter"
    | "24H Blood Pressure"
    | "Lung Function / Spirometry"
    | "Outsource Radiology & Diagnostic Report"
    | "Rheumatology";
  procedureType: string;
  urgency: "Routine" | "Urgent";
  facilityName: string;
  createdAt: string;
  status: string;
  scheduledDate?: string;
  rejectReason?: string;
  notificationType: "scheduled" | "rejected" | "confirmed" | "pending" | "completed";
  route:
    | "/echo"
    | "/stress-test"
    | "/holter"
    | "/blood-pressure"
    | "/lung-function"
    | "/outsource"
    | "/rheumatology";
}

const READ_NOTIFS_KEY = "hsi_read_notifications_v1";

export function getReadNotificationIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(READ_NOTIFS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function markNotificationAsRead(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const existing = getReadNotificationIds();
    if (!existing.includes(id)) {
      const updated = [...existing, id];
      localStorage.setItem(READ_NOTIFS_KEY, JSON.stringify(updated));
      window.dispatchEvent(new Event("hsi_requests_updated"));
    }
  } catch (err) {
    console.error("Failed to mark notification read", err);
  }
}

export function markAllNotificationsAsRead(ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    const existing = getReadNotificationIds();
    const merged = Array.from(new Set([...existing, ...ids]));
    localStorage.setItem(READ_NOTIFS_KEY, JSON.stringify(merged));
    window.dispatchEvent(new Event("hsi_requests_updated"));
  } catch (err) {
    console.error("Failed to mark all notifications read", err);
  }
}

export interface AppointmentRecord {
  id: string;
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
  status:
    | "Pending Confirmation"
    | "Confirmed"
    | "Scheduled"
    | "Under Review"
    | "Rejected"
    | "Completed - Result Ready"
    | "Pending Doctor Review"
    | "Returned to Facility"
    | "Awaiting Scheduling";
  createdAt: string;
  scheduledDate?: string;
  rejectReason?: string;
  rejectedBy?: string;
  resultFile?: {
    storagePath?: string;
    fileName: string;
    contentType?: string;
    fileSize?: number;
    uploadedAt: string;
    summaryNotes?: string;
    dataUrl?: string; // Legacy fallback
  };
  [key: string]: unknown;
}

export interface RheumatologyRecord extends Omit<AppointmentRecord, "status"> {
  // SYSTEM / IDENTITY
  status:
    | "Pending Doctor Review"
    | "Returned to Facility"
    | "Awaiting Scheduling"
    | "Scheduled"
    | "Rejected"
    | "Pending Confirmation"; // For legacy compatibility

  submittedAt?: Timestamp | FieldValue | null;
  updatedAt?: Timestamp | FieldValue | null;

  // FACILITY DOMAIN
  clinicalIndication: string;
  diagnosis: string;
  referralAttachments?: Array<{
    storagePath: string;
    fileName: string;
    uploadedAt: Timestamp | FieldValue | null;
  }>;

  // DOCTOR DOMAIN (Clinical Review)
  doctorReviewStatus?: "Reviewed" | "Returned" | "Rejected";
  reviewedByDoctorId?: string;
  reviewedByUid?: string;
  reviewedByDoctorNameSnapshot?: string;
  reviewedAt?: Timestamp | FieldValue | null;
  reviewTimeframe?: string; // e.g. "Within 4 months"
  requiredInvestigations?: string[]; // e.g. ["FBC", "CRP"]
  doctorInstructions?: string;
  returnReason?: string;
  rejectReason?: string;

  // PARAMEDIC DOMAIN (Operational Scheduling)
  bloodTakingDate?: Timestamp | FieldValue | null;
  doctorAppointmentDate?: Timestamp | FieldValue | null;
  scheduledByUid?: string;
  scheduledByNameSnapshot?: string;
  scheduledAt?: Timestamp | FieldValue | null;
}

const ECHO_COLLECTION = "echo_appointments";
const STRESS_COLLECTION = "stress_test_appointments";
const HOLTER_COLLECTION = "holter_appointments";
const BP_COLLECTION = "blood_pressure_appointments";
const LFT_COLLECTION = "lung_function_appointments";
const OUTSOURCE_COLLECTION = "outsource_appointments";
const RHEUMATOLOGY_COLLECTION = "rheumatology_appointments";

// -------------------------------------------------------------
// Real-time Subscriptions with Facility Isolation & Admin Bypass
// -------------------------------------------------------------

export type SubscriptionStatus =
  "loading" | "success" | "empty" | "authenticationRequired" | "permissionDenied" | "error";

export function subscribeToAppointments(
  collectionName: "echo" | "stress" | "holter" | "bp" | "lft" | "outsource" | "rheumatology",
  facilityId: string | null,
  viewAll: boolean,
  callback: (data: AppointmentRecord[], status?: SubscriptionStatus) => void,
): Unsubscribe {
  // CRITICAL Firebase Integration Guideline:
  // Only attach onSnapshot listeners if auth is ready and user is authenticated.
  const currentAuth = getFirebaseAuth();
  if (!currentAuth?.currentUser) {
    callback([], "authenticationRequired");
    return () => {};
  }

  const colName =
    collectionName === "echo"
      ? ECHO_COLLECTION
      : collectionName === "stress"
        ? STRESS_COLLECTION
        : collectionName === "holter"
          ? HOLTER_COLLECTION
          : collectionName === "bp"
            ? BP_COLLECTION
            : collectionName === "lft"
              ? LFT_COLLECTION
              : collectionName === "rheumatology"
                ? RHEUMATOLOGY_COLLECTION
                : OUTSOURCE_COLLECTION;

  const colRef = collection(db, colName);

  let q;
  if (viewAll) {
    q = query(colRef);
  } else if (facilityId) {
    q = query(colRef, where("facilityId", "==", facilityId));
  } else {
    // Non-admin without selected facility context loaded yet:
    // Do not run an unfiltered query. Pass empty array and loading status.
    callback([], "loading");
    return () => {};
  }

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const records: AppointmentRecord[] = [];
      snapshot.forEach((docSnap) => {
        records.push(docSnap.data() as AppointmentRecord);
      });
      // Sort newest first
      records.sort((a, b) => parseDateToTimestamp(b.createdAt) - parseDateToTimestamp(a.createdAt));
      const status: SubscriptionStatus = records.length === 0 ? "empty" : "success";
      callback(records, status);
    },
    (error) => {
      let status: SubscriptionStatus = "error";
      if (error.code === "permission-denied") {
        status = "permissionDenied";
      }
      try {
        handleFirestoreError(error, OperationType.GET, colName);
      } catch (err) {
        console.warn(`Firestore subscription note for ${colName}:`, err);
      }
      callback([], status);
    },
  );

  return unsubscribe;
}

// -------------------------------------------------------------
// CRUD Operations
// -------------------------------------------------------------

export async function createAppointment(
  collectionName: "echo" | "stress" | "holter" | "bp" | "lft" | "outsource" | "rheumatology",
  appointment: AppointmentRecord,
) {
  const colName =
    collectionName === "echo"
      ? ECHO_COLLECTION
      : collectionName === "stress"
        ? STRESS_COLLECTION
        : collectionName === "holter"
          ? HOLTER_COLLECTION
          : collectionName === "bp"
            ? BP_COLLECTION
            : collectionName === "lft"
              ? LFT_COLLECTION
              : collectionName === "rheumatology"
                ? RHEUMATOLOGY_COLLECTION
                : OUTSOURCE_COLLECTION;

  const docData: AppointmentRecord = {
    ...appointment,
    facilityId: appointment.facilityId,
  };

  try {
    await setDoc(doc(db, colName, appointment.id), docData);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${colName}/${appointment.id}`);
  }
}

export async function updateAppointment(
  collectionName: "echo" | "stress" | "holter" | "bp" | "lft" | "outsource" | "rheumatology",
  id: string,
  updates: Partial<AppointmentRecord>,
) {
  const colName =
    collectionName === "echo"
      ? ECHO_COLLECTION
      : collectionName === "stress"
        ? STRESS_COLLECTION
        : collectionName === "holter"
          ? HOLTER_COLLECTION
          : collectionName === "bp"
            ? BP_COLLECTION
            : collectionName === "lft"
              ? LFT_COLLECTION
              : collectionName === "rheumatology"
                ? RHEUMATOLOGY_COLLECTION
                : OUTSOURCE_COLLECTION;

  try {
    await updateDoc(doc(db, colName, id), updates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${colName}/${id}`);
  }
}

// Global notification listener for admin/paramedic_nurse/facility
export function subscribeToAllPendingNotifications(
  facilityIdOrCallback: string | null | ((notifications: UnifiedRequestNotification[]) => void),
  viewAllOrCallback?: boolean | ((notifications: UnifiedRequestNotification[]) => void),
  callbackArg?: (notifications: UnifiedRequestNotification[]) => void,
) {
  let facilityId: string | null = null;
  let viewAll = true;
  let callback: (notifications: UnifiedRequestNotification[]) => void;

  if (typeof facilityIdOrCallback === "function") {
    callback = facilityIdOrCallback;
    facilityId = null;
    viewAll = true;
  } else if (typeof viewAllOrCallback === "function") {
    facilityId = facilityIdOrCallback;
    viewAll = true;
    callback = viewAllOrCallback;
  } else {
    facilityId = facilityIdOrCallback;
    viewAll = !!viewAllOrCallback;
    callback = callbackArg || (() => {});
  }

  // CRITICAL Firebase Integration Guideline:
  // Only attach listeners if auth is ready and user is authenticated.
  const currentAuth = getFirebaseAuth();
  if (!currentAuth?.currentUser) {
    callback([]);
    return () => {};
  }

  let echoItems: AppointmentRecord[] = [];
  let stressItems: AppointmentRecord[] = [];
  let holterItems: AppointmentRecord[] = [];
  let bpItems: AppointmentRecord[] = [];
  let lftItems: AppointmentRecord[] = [];
  let outsourceItems: AppointmentRecord[] = [];
  let rheumatologyItems: AppointmentRecord[] = [];

  const updateAll = () => {
    const notifs: UnifiedRequestNotification[] = [];

    const processRecords = (
      items: AppointmentRecord[],
      testType: UnifiedRequestNotification["testType"],
      route: UnifiedRequestNotification["route"],
    ) => {
      items.forEach((r) => {
        if (viewAll) {
          // Privileged users (Admin/Paramedic) receive notifications for pending requests needing review
          if (r.status === "Pending Confirmation" || r.status === "Under Review") {
            notifs.push({
              id: `${r.id}-pending`,
              rawId: r.id,
              patientName: r.patientName,
              mrn: r.mrn,
              testType,
              procedureType: r.procedureType,
              urgency: r.urgency,
              facilityName: r.facilityName,
              createdAt: r.createdAt,
              status: r.status,
              scheduledDate: r.scheduledDate,
              rejectReason: r.rejectReason,
              notificationType: "pending",
              route,
            });
          }
        } else {
          // Customers/Facilities receive notifications when admin schedules, updates, or acts on their appointments
          const isScheduled =
            r.status === "Scheduled" || (!!r.scheduledDate && r.scheduledDate !== "----------");
          const isRejected = r.status === "Rejected";
          const isCompleted = r.status === "Completed - Result Ready";
          const isPending = r.status === "Pending Confirmation" || r.status === "Under Review";

          if (isScheduled) {
            notifs.push({
              id: `${r.id}-scheduled-${r.scheduledDate || "done"}`,
              rawId: r.id,
              patientName: r.patientName,
              mrn: r.mrn,
              testType,
              procedureType: r.procedureType,
              urgency: r.urgency,
              facilityName: r.facilityName,
              createdAt: r.createdAt,
              status: "Scheduled",
              scheduledDate: r.scheduledDate,
              rejectReason: r.rejectReason,
              notificationType: "scheduled",
              route,
            });
          } else if (isRejected) {
            notifs.push({
              id: `${r.id}-rejected`,
              rawId: r.id,
              patientName: r.patientName,
              mrn: r.mrn,
              testType,
              procedureType: r.procedureType,
              urgency: r.urgency,
              facilityName: r.facilityName,
              createdAt: r.createdAt,
              status: "Rejected",
              scheduledDate: r.scheduledDate,
              rejectReason: r.rejectReason,
              notificationType: "rejected",
              route,
            });
          } else if (isCompleted) {
            notifs.push({
              id: `${r.id}-completed`,
              rawId: r.id,
              patientName: r.patientName,
              mrn: r.mrn,
              testType,
              procedureType: r.procedureType,
              urgency: r.urgency,
              facilityName: r.facilityName,
              createdAt: r.createdAt,
              status: r.status,
              scheduledDate: r.scheduledDate,
              rejectReason: r.rejectReason,
              notificationType: "completed",
              route,
            });
          } else if (isPending) {
            notifs.push({
              id: `${r.id}-pending`,
              rawId: r.id,
              patientName: r.patientName,
              mrn: r.mrn,
              testType,
              procedureType: r.procedureType,
              urgency: r.urgency,
              facilityName: r.facilityName,
              createdAt: r.createdAt,
              status: r.status,
              scheduledDate: r.scheduledDate,
              rejectReason: r.rejectReason,
              notificationType: "pending",
              route,
            });
          }
        }
      });
    };

    processRecords(echoItems, "Echocardiogram", "/echo");
    processRecords(stressItems, "Exercise Stress Test", "/stress-test");
    processRecords(holterItems, "24H Holter", "/holter");
    processRecords(bpItems, "24H Blood Pressure", "/blood-pressure");
    processRecords(lftItems, "Lung Function / Spirometry", "/lung-function");
    processRecords(outsourceItems, "Outsource Radiology & Diagnostic Report", "/outsource");
    processRecords(rheumatologyItems, "Rheumatology", "/rheumatology");

    // Sort: For customers, prioritize scheduled items first, then by date descending
    notifs.sort((a, b) => {
      if (!viewAll) {
        if (a.notificationType === "scheduled" && b.notificationType !== "scheduled") return -1;
        if (b.notificationType === "scheduled" && a.notificationType !== "scheduled") return 1;
      }
      return new Date(b.createdAt || "").getTime() - new Date(a.createdAt || "").getTime();
    });

    callback(notifs);
  };

  const unsubEcho = subscribeToAppointments("echo", facilityId, viewAll, (data) => {
    echoItems = data;
    updateAll();
  });

  const unsubStress = subscribeToAppointments("stress", facilityId, viewAll, (data) => {
    stressItems = data;
    updateAll();
  });

  const unsubHolter = subscribeToAppointments("holter", facilityId, viewAll, (data) => {
    holterItems = data;
    updateAll();
  });

  const unsubBP = subscribeToAppointments("bp", facilityId, viewAll, (data) => {
    bpItems = data;
    updateAll();
  });

  const unsubLFT = subscribeToAppointments("lft", facilityId, viewAll, (data) => {
    lftItems = data;
    updateAll();
  });

  const unsubOutsource = subscribeToAppointments("outsource", facilityId, viewAll, (data) => {
    outsourceItems = data;
    updateAll();
  });

  const unsubRheumatology = subscribeToAppointments("rheumatology", facilityId, viewAll, (data) => {
    rheumatologyItems = data;
    updateAll();
  });

  return () => {
    unsubEcho();
    unsubStress();
    unsubHolter();
    unsubBP();
    unsubLFT();
    unsubOutsource();
    unsubRheumatology();
  };
}
