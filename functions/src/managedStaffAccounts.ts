/**
 * Managed Staff Account Definitions (Centralized Roles)
 *
 * Paramedic / Nurse is a centralized scheduling role that operates across all canonical facilities.
 * Stable Account Identifier: "paramedic_nurse_main"
 * Synthetic Email Convention: "staff_paramedic_nurse@auth.local"
 */

export interface ManagedStaffDefinition {
  accountKey: string;
  role: "paramedic_nurse";
  displayName: string;
  email: string;
  description: string;
}

export const PARAMEDIC_NURSE_ACCOUNT: ManagedStaffDefinition = {
  accountKey: "paramedic_nurse_main",
  role: "paramedic_nurse",
  displayName: "Paramedic / Nurse",
  email: "staff_paramedic_nurse@auth.local",
  description: "Centralized appointment scheduling across all facilities",
};

export const MANAGED_STAFF_ACCOUNTS: ManagedStaffDefinition[] = [PARAMEDIC_NURSE_ACCOUNT];
