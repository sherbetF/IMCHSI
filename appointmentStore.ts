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

const ECHO_KEY = "hsi_echo_requests_v2";
const STRESS_KEY = "hsi_stresstest_requests_v2";
const HOLTER_KEY = "hsi_holter_requests_v2";
const READ_NOTIFS_KEY = "hsi_read_notifications_v1";

export const defaultEchoRequests = [
  {
    id: "ECHO-2026-1042",
    facilityName: "Hospital Sultan Ismail",
    facilityCategory: "Hospital",
    patientName: "Ahmad Razak bin Abdullah",
    mrn: "ID-884920",
    contactNumber: "+60 12-345 6789",
    email: "ahmad.razak@example.com",
    procedureType: "Transthoracic Echocardiogram (TTE)",
    urgency: "Routine",
    referringDoctor: "Dr. Lim Wei Hong (Cardiology)",
    clinicalIndication: "Hypertension & shortness of breath on exertion",
    diagnosis: "Hypertensive Heart Disease / LVH",
    status: "Confirmed",
    createdAt: "2026-08-15 10:15",
  },
  {
    id: "ECHO-2026-1043",
    facilityName: "KK Sultan Ismail",
    facilityCategory: "Klinik Kesihatan",
    patientName: "Siti Nurhaliza binti Ibrahim",
    mrn: "ID-773192",
    contactNumber: "+60 17-889 1234",
    email: "siti.ibrahim@example.com",
    procedureType: "Transthoracic Echocardiogram (TTE)",
    urgency: "Urgent",
    referringDoctor: "Dr. Sarah Tan (Internal Medicine)",
    clinicalIndication: "Exertional chest tightness & easy fatigue",
    diagnosis: "Suspected Coronary Artery Disease",
    status: "Pending Confirmation",
    createdAt: "2026-08-16 08:45",
  },
  {
    id: "ECHO-2026-1044",
    facilityName: "KK Ulu Tiram",
    facilityCategory: "Klinik Kesihatan",
    patientName: "Tan Kah Poh",
    mrn: "ID-910243",
    contactNumber: "+60 19-223 4455",
    email: "kp.tan@example.com",
    procedureType: "Transthoracic Echocardiogram (TTE)",
    urgency: "Urgent",
    referringDoctor: "Dr. Rajan Nair (Cardiothoracic)",
    clinicalIndication: "High grade fever with new systolic murmur",
    diagnosis: "Infective Endocarditis rule out",
    status: "Under Review",
    createdAt: "2026-08-16 09:30",
  },
];

export const defaultStressRequests = [
  {
    id: "EST-2026-1011",
    facilityName: "Hospital Sultan Ismail",
    facilityCategory: "Hospital",
    patientName: "Chong Wei Lian",
    mrn: "ID-554109",
    contactNumber: "+60 16-772 3891",
    email: "wl.chong@example.com",
    procedureType: "Exercise Stress Test (Treadmill)",
    urgency: "Routine",
    referringDoctor: "Dr. Lim Wei Hong (Cardiology)",
    clinicalIndication: "Exertional chest discomfort on climbing stairs",
    diagnosis: "Ischaemic Heart Disease Evaluation",
    status: "Confirmed",
    createdAt: "2026-08-15 11:30",
  },
  {
    id: "EST-2026-1012",
    facilityName: "KK Sultan Ismail",
    facilityCategory: "Klinik Kesihatan",
    patientName: "Kavitha A/P Muthusamy",
    mrn: "ID-620194",
    contactNumber: "+60 13-441 0092",
    email: "kavitha.m@example.com",
    procedureType: "Exercise Stress Test (Treadmill)",
    urgency: "Urgent",
    referringDoctor: "Dr. Sarah Tan (Internal Medicine)",
    clinicalIndication: "Atypical chest pain with multiple cardiovascular risk factors",
    diagnosis: "Rule out Angina Pectoris",
    status: "Pending Confirmation",
    createdAt: "2026-08-16 09:10",
  },
];

export const defaultHolterRequests = [
  {
    id: "HOLTER-2026-2021",
    facilityName: "Hospital Sultan Ismail",
    facilityCategory: "Hospital",
    patientName: "Lee Kok Keong",
    mrn: "ID-339201",
    contactNumber: "+60 12-881 2043",
    email: "kk.lee@example.com",
    procedureType: "24 Hours Holter Monitoring",
    urgency: "Routine",
    referringDoctor: "Dr. Lim Wei Hong (Cardiology)",
    clinicalIndication: "Recurrent palpitations & presyncope episodes",
    diagnosis: "Symptomatic Arrhythmia Rule Out / Atrial Fibrillation",
    status: "Confirmed",
    createdAt: "2026-08-15 14:20",
  },
  {
    id: "HOLTER-2026-2022",
    facilityName: "KK Sultan Ismail",
    facilityCategory: "Klinik Kesihatan",
    patientName: "Zainab binti Mohamad",
    mrn: "ID-441802",
    contactNumber: "+60 19-332 9911",
    email: "zainab.m@example.com",
    procedureType: "24 Hours Holter Monitoring",
    urgency: "Urgent",
    referringDoctor: "Dr. Sarah Tan (Internal Medicine)",
    clinicalIndication: "Unexplained syncope with normal baseline 12-lead ECG",
    diagnosis: "Paroxysmal Atrial Fibrillation / Sick Sinus Syndrome",
    status: "Pending Confirmation",
    createdAt: "2026-08-16 10:05",
  },
];

export interface GenericAppointmentRequest {
  id: string;
  patientName: string;
  mrn: string;
  procedureType: string;
  urgency: "Routine" | "Urgent";
  facilityName: string;
  createdAt: string;
  status: string;
  [key: string]: unknown;
}

export function emitRequestsChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("hsi_requests_updated"));
  }
}

export function getStoredEchoRequests(): GenericAppointmentRequest[] {
  if (typeof window === "undefined") return defaultEchoRequests as GenericAppointmentRequest[];
  try {
    const raw = localStorage.getItem(ECHO_KEY);
    return raw ? JSON.parse(raw) : defaultEchoRequests;
  } catch {
    return defaultEchoRequests as GenericAppointmentRequest[];
  }
}

export function saveEchoRequests(requests: GenericAppointmentRequest[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ECHO_KEY, JSON.stringify(requests));
    emitRequestsChanged();
  } catch (err) {
    console.error("Failed to save echo requests", err);
  }
}

export function getStoredStressRequests(): GenericAppointmentRequest[] {
  if (typeof window === "undefined") return defaultStressRequests as GenericAppointmentRequest[];
  try {
    const raw = localStorage.getItem(STRESS_KEY);
    return raw ? JSON.parse(raw) : defaultStressRequests;
  } catch {
    return defaultStressRequests as GenericAppointmentRequest[];
  }
}

export function saveStressRequests(requests: GenericAppointmentRequest[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STRESS_KEY, JSON.stringify(requests));
    emitRequestsChanged();
  } catch (err) {
    console.error("Failed to save stress requests", err);
  }
}

export function getStoredHolterRequests(): GenericAppointmentRequest[] {
  if (typeof window === "undefined") return defaultHolterRequests as GenericAppointmentRequest[];
  try {
    const raw = localStorage.getItem(HOLTER_KEY);
    return raw ? JSON.parse(raw) : defaultHolterRequests;
  } catch {
    return defaultHolterRequests as GenericAppointmentRequest[];
  }
}

export function saveHolterRequests(requests: GenericAppointmentRequest[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(HOLTER_KEY, JSON.stringify(requests));
    emitRequestsChanged();
  } catch (err) {
    console.error("Failed to save holter requests", err);
  }
}

export function getReadNotificationIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(READ_NOTIFS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function markNotificationAsRead(id: string) {
  if (typeof window === "undefined") return;
  try {
    const current = getReadNotificationIds();
    if (!current.includes(id)) {
      const updated = [...current, id];
      localStorage.setItem(READ_NOTIFS_KEY, JSON.stringify(updated));
      emitRequestsChanged();
    }
  } catch (err) {
    console.error("Failed to mark notification read", err);
  }
}

export function markAllNotificationsAsRead(ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    const current = getReadNotificationIds();
    const merged = Array.from(new Set([...current, ...ids]));
    localStorage.setItem(READ_NOTIFS_KEY, JSON.stringify(merged));
    emitRequestsChanged();
  } catch (err) {
    console.error("Failed to mark all notifications read", err);
  }
}

export function getAllNewAppointmentRequests(): UnifiedRequestNotification[] {
  const echo = getStoredEchoRequests();
  const stress = getStoredStressRequests();
  const holter = getStoredHolterRequests();

  const isPending = (status: string) =>
    status === "Pending Confirmation" || status === "Under Review";

  const notifications: UnifiedRequestNotification[] = [];

  echo.forEach((r) => {
    if (isPending(r.status)) {
      notifications.push({
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

  stress.forEach((r) => {
    if (isPending(r.status)) {
      notifications.push({
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

  holter.forEach((r) => {
    if (isPending(r.status)) {
      notifications.push({
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

  return notifications;
}
