/**
 * Synthetic Test Fixtures for Stage 7 Security & Workflow Test Suite
 *
 * SAFETY GUARANTEE:
 * - Synthetic test data only.
 * - ZERO real patient data.
 * - ZERO real production credentials.
 * - Operates entirely with synthetic UIDs and identifiers.
 */

export interface TestProfile {
  uid: string;
  role: "admin" | "facility" | "paramedic_nurse" | "doctor" | "outsource" | "superuser";
  facilityId?: string;
  facilityName?: string;
  category?: string;
  doctorId?: string;
  displayName?: string;
  accountKey?: string;
  active: boolean;
}

export const SYNTHETIC_IDENTITIES = {
  ADMIN_ACTIVE: {
    uid: "test_uid_admin_active_01",
    role: "admin",
    active: true,
  } as TestProfile,

  ADMIN_INACTIVE: {
    uid: "test_uid_admin_inactive_01",
    role: "admin",
    active: false,
  } as TestProfile,

  FACILITY_A_ACTIVE: {
    uid: "test_uid_facility_a_active_01",
    role: "facility",
    facilityId: "TEST_FACILITY_A",
    facilityName: "Test Klinik Kesihatan A",
    category: "Klinik Kesihatan",
    active: true,
  } as TestProfile,

  FACILITY_A_INACTIVE: {
    uid: "test_uid_facility_a_inactive_01",
    role: "facility",
    facilityId: "TEST_FACILITY_A",
    facilityName: "Test Klinik Kesihatan A",
    category: "Klinik Kesihatan",
    active: false,
  } as TestProfile,

  FACILITY_B_ACTIVE: {
    uid: "test_uid_facility_b_active_01",
    role: "facility",
    facilityId: "TEST_FACILITY_B",
    facilityName: "Test Hospital B",
    category: "Hospital",
    active: true,
  } as TestProfile,

  FACILITY_B_INACTIVE: {
    uid: "test_uid_facility_b_inactive_01",
    role: "facility",
    facilityId: "TEST_FACILITY_B",
    facilityName: "Test Hospital B",
    category: "Hospital",
    active: false,
  } as TestProfile,

  DOCTOR_A_ACTIVE: {
    uid: "test_uid_doctor_a_active_01",
    role: "doctor",
    doctorId: "dr_rheum_test_001",
    displayName: "Dr Test One",
    active: true,
  } as TestProfile,

  DOCTOR_A_INACTIVE: {
    uid: "test_uid_doctor_a_inactive_01",
    role: "doctor",
    doctorId: "dr_rheum_test_001",
    displayName: "Dr Test One",
    active: false,
  } as TestProfile,

  PARAMEDIC_ACTIVE: {
    uid: "test_uid_paramedic_active_01",
    role: "paramedic_nurse",
    accountKey: "paramedic_nurse_main",
    displayName: "Paramedic / Nurse Test",
    active: true,
  } as TestProfile,

  PARAMEDIC_INACTIVE: {
    uid: "test_uid_paramedic_inactive_01",
    role: "paramedic_nurse",
    accountKey: "paramedic_nurse_main",
    displayName: "Paramedic / Nurse Test",
    active: false,
  } as TestProfile,

  OUTSOURCE_ACTIVE: {
    uid: "test_uid_outsource_active_01",
    role: "outsource",
    facilityId: "outsource",
    displayName: "Outsource Provider Test",
    active: true,
  } as TestProfile,

  UNKNOWN_ROLE: {
    uid: "test_uid_unknown_role_01",
    role: "superuser",
    active: true,
  } as TestProfile,

  UNAUTHENTICATED: null,
};
