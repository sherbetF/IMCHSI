/**
 * Appointment Notification & Shared Types
 *
 * NOTE: Production builds contain NO synthetic/mock patient or appointment data.
 * All records are fetched in real-time from Firestore based on the authenticated
 * facility/user context.
 */

export type {
  UnifiedRequestNotification,
  AppointmentRecord,
} from "@/services/firebaseAppointments";

export {
  getReadNotificationIds,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "@/services/firebaseAppointments";

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
