/**
 * Shared Backend Account Management Types and Interfaces
 */

export type ManagedAccountCategory = "CONSUMER" | "PARAMEDIC_NURSE" | "DOCTOR";

export type ManagedAccountStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "NOT_CREATED"
  | "PARTIAL_MISSING_PROFILE"
  | "PARTIAL_MISSING_AUTH"
  | "SECURITY_MISMATCH"
  | "CONFLICT";

export interface ManagedConsumerItem {
  facilityId: string;
  facilityName: string;
  category: string;
  accountType: "CONSUMER";
  status: ManagedAccountStatus;
  statusDetails: string;
}

export interface ManagedStaffItem {
  accountKey: string;
  displayName: string;
  role: "paramedic_nurse";
  accountType: "PARAMEDIC_NURSE";
  status: ManagedAccountStatus;
  statusDetails: string;
}

export interface ManagedDoctorItem {
  doctorId: string;
  displayName: string;
  role: "doctor";
  accountType: "DOCTOR";
  status: ManagedAccountStatus;
  statusDetails: string;
}

export interface ListManagedAccountsResponse {
  consumers: ManagedConsumerItem[];
  staff: ManagedStaffItem[];
  doctors: ManagedDoctorItem[];
  summary: {
    totalConsumers: number;
    totalStaff: number;
    totalDoctors: number;
    activeConsumers: number;
    activeStaff: number;
    activeDoctors: number;
    inactiveConsumers: number;
    inactiveStaff: number;
    inactiveDoctors: number;
    notCreatedConsumers: number;
    notCreatedStaff: number;
    conflictCount: number;
    warningCount: number;
  };
}

/**
 * Write Operation Payloads
 */
export interface CreateConsumerAccountPayload {
  accountType: "CONSUMER";
  facilityId: string;
  password: string;
}

export interface CreateStaffAccountPayload {
  accountType: "PARAMEDIC_NURSE";
  accountKey: string;
  password: string;
}

export interface CreateDoctorAccountPayload {
  accountType: "DOCTOR";
  displayName: string; // Used for profile and Auth displayName
  password: string;
}

export type CreateManagedAccountRequest =
  CreateConsumerAccountPayload | CreateStaffAccountPayload | CreateDoctorAccountPayload;

export interface ResetConsumerPasswordPayload {
  accountType: "CONSUMER";
  facilityId: string;
  newPassword: string;
}

export interface ResetStaffPasswordPayload {
  accountType: "PARAMEDIC_NURSE";
  accountKey: string;
  newPassword: string;
}

export interface ResetDoctorPasswordPayload {
  accountType: "DOCTOR";
  doctorId: string;
  newPassword: string;
}

export type ResetManagedAccountPasswordRequest =
  ResetConsumerPasswordPayload | ResetStaffPasswordPayload | ResetDoctorPasswordPayload;

export interface SetConsumerActiveStatusPayload {
  accountType: "CONSUMER";
  facilityId: string;
  active: boolean;
}

export interface SetStaffActiveStatusPayload {
  accountType: "PARAMEDIC_NURSE";
  accountKey: string;
  active: boolean;
}

export interface SetDoctorActiveStatusPayload {
  accountType: "DOCTOR";
  doctorId: string;
  active: boolean;
}

export type SetManagedAccountActiveStatusRequest =
  SetConsumerActiveStatusPayload | SetStaffActiveStatusPayload | SetDoctorActiveStatusPayload;

export interface ManagedAccountOperationResponse {
  success: boolean;
  message: string;
  accountType: ManagedAccountCategory;
  identifier: string;
  status: ManagedAccountStatus;
  auditLogged: boolean;
  warning?: string;
}

export interface ChangeFacilityPasswordRequest {
  newPassword: string;
}

export interface ChangeFacilityPasswordResponse {
  success: boolean;
  message: string;
  facilityId: string;
}

/**
 * Dedicated Admin Audit Log Concept for Privileged Operations
 */
export type AdminAuditEventAction =
  | "ACCOUNT_CREATED"
  | "PASSWORD_RESET"
  | "ACCOUNT_DISABLED"
  | "ACCOUNT_REACTIVATED"
  | "DOCTOR_ACCOUNT_CREATED"
  | "DOCTOR_PASSWORD_RESET"
  | "DOCTOR_DISABLED"
  | "DOCTOR_REACTIVATED"
  | "FACILITY_PASSWORD_CHANGED";

export interface AdminAuditLogEntry {
  id?: string;
  action: AdminAuditEventAction;
  adminUid: string;
  targetRole: "facility" | "paramedic_nurse" | "doctor";
  targetAccountType: ManagedAccountCategory;
  targetIdentifier: string; // facilityId, accountKey, or doctorId
  timestamp: unknown; // Firestore Timestamp
  success: boolean;
  notes?: string;
}
