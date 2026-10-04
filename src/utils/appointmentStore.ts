export interface UnifiedRequestNotification {
  id: string;
  patientName: string;
  mrn: string;
  testType:
    | "Echocardiogram"
    | "Exercise Stress Test"
    | "24H Holter"
    | "24H Blood Pressure"
    | "Lung Function / Spirometry"
    | "Outsource Radiology & Diagnostic Report";
  procedureType: string;
  urgency: "Routine" | "Urgent";
  facilityName: string;
  createdAt: string;
  status: string;
  route: "/echo" | "/stress-test" | "/holter" | "/blood-pressure" | "/lung-function" | "/outsource";
}

const ECHO_KEY = "hsi_echo_requests_v2";
const STRESS_KEY = "hsi_stresstest_requests_v2";
const HOLTER_KEY = "hsi_holter_requests_v2";
const BP_KEY = "hsi_bloodpressure_requests_v2";
const LFT_KEY = "hsi_lungfunction_requests_v2";
const OUTSOURCE_KEY = "hsi_outsource_requests_v1";
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
    createdAt: "15/08/2026 10:15",
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
    createdAt: "16/08/2026 08:45",
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
    createdAt: "16/08/2026 09:30",
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
    createdAt: "15/08/2026 11:30",
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
    createdAt: "16/08/2026 09:10",
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
    createdAt: "15/08/2026 14:20",
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
    createdAt: "16/08/2026 10:05",
  },
];

export const defaultBPRequests = [
  {
    id: "ABPM-2026-3001",
    facilityName: "Hospital Sultan Ismail",
    facilityCategory: "Hospital",
    patientName: "Kamal bin Mohd Yusof",
    mrn: "ID-449102",
    contactNumber: "+60 12-456 7890",
    email: "kamal.yusof@example.com",
    procedureType: "24 Hours Ambulatory Blood Pressure Monitoring (ABPM)",
    urgency: "Routine",
    referringDoctor: "Dr. Lim Wei Hong (Cardiology)",
    clinicalIndication: "Apparent Treatment-Resistant Hypertension on 3 antihypertensive agents",
    diagnosis: "Essential Hypertension / Suspected White Coat Effect",
    status: "Confirmed",
    createdAt: "15/08/2026 12:30",
  },
  {
    id: "ABPM-2026-3002",
    facilityName: "KK Sultan Ismail",
    facilityCategory: "Klinik Kesihatan",
    patientName: "Nurul Huda binti Othman",
    mrn: "ID-558291",
    contactNumber: "+60 19-876 5432",
    email: "nurul.huda@example.com",
    procedureType: "24 Hours Ambulatory Blood Pressure Monitoring (ABPM)",
    urgency: "Urgent",
    referringDoctor: "Dr. Sarah Tan (Internal Medicine)",
    clinicalIndication: "Labile blood pressure with nocturnal headache & non-dipping concern",
    diagnosis: "Secondary Hypertension Investigation / Masked Hypertension",
    status: "Pending Confirmation",
    createdAt: "16/08/2026 11:20",
  },
];

export const defaultLungFunctionRequests = [
  {
    id: "LFT-2026-4001",
    facilityName: "Hospital Sultan Ismail",
    facilityCategory: "Hospital",
    patientName: "Tan Chee Meng",
    mrn: "ID-663910",
    contactNumber: "+60 12-772 3190",
    email: "tan.cm@example.com",
    procedureType: "Lung Function Test / Spirometry",
    urgency: "Routine",
    referringDoctor: "Dr. Lim Wei Hong (Respiratory Medicine)",
    clinicalIndication: "Exertional dyspnea & chronic dry cough for 6 months, smoker 20 pack-years",
    diagnosis: "Chronic Obstructive Pulmonary Disease (COPD) / Asthma-COPD Overlap",
    status: "Confirmed",
    createdAt: "15/08/2026 15:40",
  },
  {
    id: "LFT-2026-4002",
    facilityName: "KK Sultan Ismail",
    facilityCategory: "Klinik Kesihatan",
    patientName: "Faridah binti Ismail",
    mrn: "ID-772019",
    contactNumber: "+60 18-912 4003",
    email: "faridah.i@example.com",
    procedureType: "Lung Function Test / Spirometry",
    urgency: "Urgent",
    referringDoctor: "Dr. Sarah Tan (Internal Medicine)",
    clinicalIndication: "Poorly controlled wheezing & nocturnal breathlessness despite ICS-LABA",
    diagnosis: "Severe Persistent Bronchial Asthma / Reversibility Assessment",
    status: "Pending Confirmation",
    createdAt: "16/08/2026 11:45",
  },
];

export const defaultOutsourceRequests = [
  {
    id: "OUT-2026-5001",
    facilityName: "KPJ Johor Specialist Hospital",
    facilityCategory: "Private Hospital",
    patientName: "Muhammad Amirul bin Zulkifli",
    mrn: "ID-992014",
    contactNumber: "+60 11-2345 8890",
    email: "amirul.z@example.com",
    procedureType: "MRI Brain & Spine (Outsource)",
    urgency: "Routine",
    referringDoctor: "Dr. Hassan Basri (Neurology - KPJ)",
    clinicalIndication: "Chronic intractable migraine with focal numbness",
    diagnosis: "Intracranial Space Occupying Lesion Rule Out",
    status: "Confirmed",
    createdAt: "18/08/2026 09:15",
  },
  {
    id: "OUT-2026-5002",
    facilityName: "Regency Specialist Hospital",
    facilityCategory: "Private Hospital",
    patientName: "Wong Siew Ling",
    mrn: "ID-883102",
    contactNumber: "+60 17-662 1099",
    email: "sl.wong@example.com",
    procedureType: "CT Thorax & Abdomen (Outsource)",
    urgency: "Urgent",
    referringDoctor: "Dr. Karen Teo (Oncology - Regency)",
    clinicalIndication: "Staging scan for persistent hilar lymphadenopathy",
    diagnosis: "Lymphoma Staging / Metastatic Workup",
    status: "Pending Confirmation",
    createdAt: "19/08/2026 10:40",
  },
  {
    id: "OUT-2026-5003",
    facilityName: "Gleneagles Medini Hospital",
    facilityCategory: "Private Hospital",
    patientName: "Subramaniam A/L Krishnan",
    mrn: "ID-774012",
    contactNumber: "+60 12-901 3344",
    email: "subra.k@example.com",
    procedureType: "Coronary Angiogram (COROS Outsource)",
    urgency: "Urgent",
    referringDoctor: "Dr. Alex Tan (Cardiology - Gleneagles)",
    clinicalIndication: "High risk treadmill stress test with ischemic ST depression",
    diagnosis: "Severe Triple Vessel Disease (TVD)",
    status: "Under Review",
    createdAt: "20/08/2026 14:00",
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

export function getStoredBPRequests(): GenericAppointmentRequest[] {
  if (typeof window === "undefined") return defaultBPRequests as GenericAppointmentRequest[];
  try {
    const raw = localStorage.getItem(BP_KEY);
    return raw ? JSON.parse(raw) : defaultBPRequests;
  } catch {
    return defaultBPRequests as GenericAppointmentRequest[];
  }
}

export function saveBPRequests(requests: GenericAppointmentRequest[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(BP_KEY, JSON.stringify(requests));
    emitRequestsChanged();
  } catch (err) {
    console.error("Failed to save BP requests", err);
  }
}

export function getStoredLungFunctionRequests(): GenericAppointmentRequest[] {
  if (typeof window === "undefined")
    return defaultLungFunctionRequests as GenericAppointmentRequest[];
  try {
    const raw = localStorage.getItem(LFT_KEY);
    return raw ? JSON.parse(raw) : defaultLungFunctionRequests;
  } catch {
    return defaultLungFunctionRequests as GenericAppointmentRequest[];
  }
}

export function saveLungFunctionRequests(requests: GenericAppointmentRequest[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LFT_KEY, JSON.stringify(requests));
    emitRequestsChanged();
  } catch (err) {
    console.error("Failed to save lung function requests", err);
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

  const bp = getStoredBPRequests();
  bp.forEach((r) => {
    if (isPending(r.status)) {
      notifications.push({
        id: r.id,
        patientName: r.patientName,
        mrn: r.mrn,
        testType: "24H Blood Pressure",
        procedureType: r.procedureType,
        urgency: r.urgency,
        facilityName: r.facilityName,
        createdAt: r.createdAt,
        status: r.status,
        route: "/blood-pressure",
      });
    }
  });

  return notifications;
}
