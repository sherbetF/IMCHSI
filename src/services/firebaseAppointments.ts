import {
  collection,
  doc,
  setDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  updateDoc,
  orderBy,
  Unsubscribe,
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
import {
  defaultEchoRequests,
  defaultStressRequests,
  defaultHolterRequests,
  defaultBPRequests,
  defaultLungFunctionRequests,
  defaultOutsourceRequests,
  defaultRheumatologyRequests,
} from "@/utils/appointmentStore";
import { parseDateToTimestamp } from "@/utils/dateUtils";

export interface UnifiedRequestNotification {
  id: string;
  rawId: string;
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
    | "Completed - Result Ready";
  createdAt: string;
  scheduledDate?: string;
  rejectReason?: string;
  rejectedBy?: string;
  resultFile?: {
    fileName: string;
    uploadedAt: string;
    summaryNotes: string;
  };
  [key: string]: unknown;
}

const ECHO_COLLECTION = "echo_appointments";
const STRESS_COLLECTION = "stress_test_appointments";
const HOLTER_COLLECTION = "holter_appointments";
const BP_COLLECTION = "blood_pressure_appointments";
const LFT_COLLECTION = "lung_function_appointments";
const OUTSOURCE_COLLECTION = "outsource_appointments";
const RHEUMATOLOGY_COLLECTION = "rheumatology_appointments";

// Initialize and seed default records to Firestore if empty
let isSeeded = false;
export async function seedInitialDataIfEmpty() {
  if (isSeeded) return;
  // According to Firebase guidelines, do not attempt to read or seed protected collections while unauthenticated
  const currentAuth = getFirebaseAuth();
  if (!currentAuth?.currentUser) return;
  isSeeded = true;
  try {
    const echoSnap = await getDocs(collection(db, ECHO_COLLECTION));
    if (echoSnap.empty) {
      for (const item of defaultEchoRequests) {
        await setDoc(doc(db, ECHO_COLLECTION, item.id), item);
      }
    }

    const stressSnap = await getDocs(collection(db, STRESS_COLLECTION));
    if (stressSnap.empty) {
      for (const item of defaultStressRequests) {
        await setDoc(doc(db, STRESS_COLLECTION, item.id), item);
      }
    }

    const holterSnap = await getDocs(collection(db, HOLTER_COLLECTION));
    if (holterSnap.empty) {
      for (const item of defaultHolterRequests) {
        await setDoc(doc(db, HOLTER_COLLECTION, item.id), item);
      }
    }

    const bpSnap = await getDocs(collection(db, BP_COLLECTION));
    if (bpSnap.empty) {
      for (const item of defaultBPRequests) {
        await setDoc(doc(db, BP_COLLECTION, item.id), item);
      }
    }

    const lftSnap = await getDocs(collection(db, LFT_COLLECTION));
    if (lftSnap.empty) {
      for (const item of defaultLungFunctionRequests) {
        await setDoc(doc(db, LFT_COLLECTION, item.id), item);
      }
    }

    const outsourceSnap = await getDocs(collection(db, OUTSOURCE_COLLECTION));
    if (outsourceSnap.empty) {
      for (const item of defaultOutsourceRequests) {
        await setDoc(doc(db, OUTSOURCE_COLLECTION, item.id), item);
      }
    }

    const rheumSnap = await getDocs(collection(db, RHEUMATOLOGY_COLLECTION));
    if (rheumSnap.empty) {
      for (const item of defaultRheumatologyRequests) {
        await setDoc(doc(db, RHEUMATOLOGY_COLLECTION, item.id), item);
      }
    }
  } catch (err) {
    console.warn("Firestore seed note:", err);
  }
}

// -------------------------------------------------------------
// Real-time Subscriptions with Facility Isolation & Admin Bypass
// -------------------------------------------------------------

export function subscribeToAppointments(
  collectionName: "echo" | "stress" | "holter" | "bp" | "lft" | "outsource" | "rheumatology",
  facilityName: string | null,
  isAdmin: boolean,
  callback: (data: AppointmentRecord[]) => void,
): Unsubscribe {
  // CRITICAL Firebase Integration Guideline:
  // Only attach onSnapshot listeners if auth is ready and user is authenticated.
  const currentAuth = getFirebaseAuth();
  if (!currentAuth?.currentUser) {
    callback([]);
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
  if (isAdmin) {
    q = query(colRef);
  } else if (facilityName) {
    q = query(colRef, where("facilityName", "==", facilityName));
  } else {
    // Non-admin without selected facility context loaded yet:
    // Do not run an unfiltered query. Pass empty array.
    callback([]);
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
      callback(records);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, colName);
      } catch (err) {
        console.warn(`Firestore subscription note for ${colName}:`, err);
      }
      callback([]);
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

  try {
    await setDoc(doc(db, colName, appointment.id), appointment);
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

// Global notification listener for admin/facility
export function subscribeToAllPendingNotifications(
  facilityNameOrCallback: string | null | ((notifications: UnifiedRequestNotification[]) => void),
  isAdminOrCallback?: boolean | ((notifications: UnifiedRequestNotification[]) => void),
  callbackArg?: (notifications: UnifiedRequestNotification[]) => void,
) {
  let facilityName: string | null = null;
  let isAdmin = true;
  let callback: (notifications: UnifiedRequestNotification[]) => void;

  if (typeof facilityNameOrCallback === "function") {
    callback = facilityNameOrCallback;
    facilityName = null;
    isAdmin = true;
  } else if (typeof isAdminOrCallback === "function") {
    facilityName = facilityNameOrCallback;
    isAdmin = true;
    callback = isAdminOrCallback;
  } else {
    facilityName = facilityNameOrCallback;
    isAdmin = !!isAdminOrCallback;
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
        if (isAdmin) {
          // Admin receives notifications for pending requests needing review
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
      if (!isAdmin) {
        if (a.notificationType === "scheduled" && b.notificationType !== "scheduled") return -1;
        if (b.notificationType === "scheduled" && a.notificationType !== "scheduled") return 1;
      }
      return new Date(b.createdAt || "").getTime() - new Date(a.createdAt || "").getTime();
    });

    callback(notifs);
  };

  const unsubEcho = subscribeToAppointments("echo", facilityName, isAdmin, (data) => {
    echoItems = data;
    updateAll();
  });

  const unsubStress = subscribeToAppointments("stress", facilityName, isAdmin, (data) => {
    stressItems = data;
    updateAll();
  });

  const unsubHolter = subscribeToAppointments("holter", facilityName, isAdmin, (data) => {
    holterItems = data;
    updateAll();
  });

  const unsubBP = subscribeToAppointments("bp", facilityName, isAdmin, (data) => {
    bpItems = data;
    updateAll();
  });

  const unsubLFT = subscribeToAppointments("lft", facilityName, isAdmin, (data) => {
    lftItems = data;
    updateAll();
  });

  const unsubOutsource = subscribeToAppointments("outsource", facilityName, isAdmin, (data) => {
    outsourceItems = data;
    updateAll();
  });

  const unsubRheumatology = subscribeToAppointments(
    "rheumatology",
    facilityName,
    isAdmin,
    (data) => {
      rheumatologyItems = data;
      updateAll();
    },
  );

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
