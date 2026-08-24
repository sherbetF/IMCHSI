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
import { db } from "@/lib/firebase";
import {
  defaultEchoRequests,
  defaultStressRequests,
  defaultHolterRequests,
} from "@/utils/appointmentStore";

export interface UnifiedRequestNotification {
  id: string;
  patientName: string;
  mrn: string;
  testType: "Echocardiogram" | "Exercise Stress Test" | "24H Holter";
  procedureType: string;
  urgency: "Routine" | "Urgent";
  facilityName: string;
  createdAt: string;
  status: string;
  route: "/echo" | "/stress-test" | "/holter";
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
    | "Completed - Result Ready";
  createdAt: string;
  scheduledDate?: string;
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

// Initialize and seed default records to Firestore if empty
let isSeeded = false;
export async function seedInitialDataIfEmpty() {
  if (isSeeded) return;
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
  } catch (err) {
    console.warn("Firestore seed note:", err);
  }
}

// -------------------------------------------------------------
// Real-time Subscriptions with Facility Isolation & Admin Bypass
// -------------------------------------------------------------

export function subscribeToAppointments(
  collectionName: "echo" | "stress" | "holter",
  facilityName: string | null,
  isAdmin: boolean,
  callback: (data: AppointmentRecord[]) => void,
): Unsubscribe {
  const colName =
    collectionName === "echo"
      ? ECHO_COLLECTION
      : collectionName === "stress"
        ? STRESS_COLLECTION
        : HOLTER_COLLECTION;

  const colRef = collection(db, colName);

  let q;
  if (isAdmin || !facilityName) {
    // Admin sees all facilities' appointments; if no specific facility is chosen, fetch all
    q = query(colRef);
  } else {
    // Isolated: non-admin only queries their selected facility
    q = query(colRef, where("facilityName", "==", facilityName));
  }

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const records: AppointmentRecord[] = [];
      snapshot.forEach((docSnap) => {
        records.push(docSnap.data() as AppointmentRecord);
      });
      // Sort newest first
      records.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      callback(records);
    },
    (error) => {
      console.error(`Error in ${colName} subscription:`, error);
      // Fallback to local default requests so the page never hangs or blocks
      if (collectionName === "echo") {
        const local = defaultEchoRequests.filter((r) =>
          isAdmin || !facilityName ? true : r.facilityName === facilityName,
        );
        callback(local);
      } else if (collectionName === "stress") {
        const local = defaultStressRequests.filter((r) =>
          isAdmin || !facilityName ? true : r.facilityName === facilityName,
        );
        callback(local);
      } else if (collectionName === "holter") {
        const local = defaultHolterRequests.filter((r) =>
          isAdmin || !facilityName ? true : r.facilityName === facilityName,
        );
        callback(local);
      }
    },
  );

  return unsubscribe;
}

// -------------------------------------------------------------
// CRUD Operations
// -------------------------------------------------------------

export async function createAppointment(
  collectionName: "echo" | "stress" | "holter",
  appointment: AppointmentRecord,
) {
  const colName =
    collectionName === "echo"
      ? ECHO_COLLECTION
      : collectionName === "stress"
        ? STRESS_COLLECTION
        : HOLTER_COLLECTION;

  await setDoc(doc(db, colName, appointment.id), appointment);
}

export async function updateAppointment(
  collectionName: "echo" | "stress" | "holter",
  id: string,
  updates: Partial<AppointmentRecord>,
) {
  const colName =
    collectionName === "echo"
      ? ECHO_COLLECTION
      : collectionName === "stress"
        ? STRESS_COLLECTION
        : HOLTER_COLLECTION;

  await updateDoc(doc(db, colName, id), updates);
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

  let echoItems: AppointmentRecord[] = [];
  let stressItems: AppointmentRecord[] = [];
  let holterItems: AppointmentRecord[] = [];

  const updateAll = () => {
    const isPending = (status: string) =>
      status === "Pending Confirmation" || status === "Under Review";

    const notifs: Array<{
      id: string;
      patientName: string;
      mrn: string;
      testType: "Echocardiogram" | "Exercise Stress Test" | "24H Holter";
      procedureType: string;
      urgency: "Routine" | "Urgent";
      facilityName: string;
      createdAt: string;
      status: string;
      route: "/echo" | "/stress-test" | "/holter";
    }> = [];

    echoItems.forEach((r) => {
      if (isPending(r.status)) {
        notifs.push({
          id: r.id,
          patientName: r.patientName,
          mrn: r.mrn,
          testType: "Echocardiogram",
          procedureType: r.procedureType,
          urgency: r.urgency,
          facilityName: r.facilityName,
          createdAt: r.createdAt,
          status: r.status,
          route: "/echo",
        });
      }
    });

    stressItems.forEach((r) => {
      if (isPending(r.status)) {
        notifs.push({
          id: r.id,
          patientName: r.patientName,
          mrn: r.mrn,
          testType: "Exercise Stress Test",
          procedureType: r.procedureType,
          urgency: r.urgency,
          facilityName: r.facilityName,
          createdAt: r.createdAt,
          status: r.status,
          route: "/stress-test",
        });
      }
    });

    holterItems.forEach((r) => {
      if (isPending(r.status)) {
        notifs.push({
          id: r.id,
          patientName: r.patientName,
          mrn: r.mrn,
          testType: "24H Holter",
          procedureType: r.procedureType,
          urgency: r.urgency,
          facilityName: r.facilityName,
          createdAt: r.createdAt,
          status: r.status,
          route: "/holter",
        });
      }
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

  return () => {
    unsubEcho();
    unsubStress();
    unsubHolter();
  };
}
