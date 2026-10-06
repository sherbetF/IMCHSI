/**
 * Production Security Helpers for Facility Account Password Setup & Management.
 *
 * Shared between Cloud Functions (changeFacilityPassword, createManagedAccount,
 * resetManagedAccountPassword) and security regression test suites.
 */

export interface CallableAuthContext {
  uid: string;
}

export interface FacilityProfileData {
  role?: string;
  active?: boolean;
  facilityId?: string;
  mustChangePassword?: boolean;
  [key: string]: unknown;
}

export interface ValidateFacilityPasswordChangeAuthResult {
  authorized: boolean;
  errorCode?: "unauthenticated" | "permission-denied" | "failed-precondition" | "invalid-argument";
  errorMessage?: string;
  facilityId?: string;
}

/**
 * Validates whether a caller is authorized to establish/change a Facility private password.
 * Must be used authoritatively by the changeFacilityPassword callable function.
 */
export function validateFacilityPasswordChangeAuth(
  auth: CallableAuthContext | null | undefined,
  profile: FacilityProfileData | null | undefined,
): ValidateFacilityPasswordChangeAuthResult {
  // 1. Authentication check
  if (!auth || !auth.uid) {
    return {
      authorized: false,
      errorCode: "unauthenticated",
      errorMessage:
        "Authentication required: Caller is not signed in with valid Firebase credentials.",
    };
  }

  // 2. Profile existence check
  if (!profile) {
    return {
      authorized: false,
      errorCode: "permission-denied",
      errorMessage: "Authorization failed: Trusted user profile not found.",
    };
  }

  // 3. Role check
  if (profile.role !== "facility") {
    return {
      authorized: false,
      errorCode: "permission-denied",
      errorMessage: "Authorization failed: Caller is not a Facility account.",
    };
  }

  // 4. Active status check
  if (profile.active !== true) {
    return {
      authorized: false,
      errorCode: "permission-denied",
      errorMessage: "Authorization failed: Facility account is currently disabled.",
    };
  }

  // 5. Canonical facilityId check
  if (!profile.facilityId || typeof profile.facilityId !== "string" || !profile.facilityId.trim()) {
    return {
      authorized: false,
      errorCode: "permission-denied",
      errorMessage: "Authorization failed: Profile is missing valid facilityId.",
    };
  }

  // 6. Force password change requirement check
  if (profile.mustChangePassword !== true) {
    return {
      authorized: false,
      errorCode: "failed-precondition",
      errorMessage:
        "NO_PASSWORD_CHANGE_REQUIRED: Facility account does not have a pending password setup requirement.",
    };
  }

  return {
    authorized: true,
    facilityId: profile.facilityId,
  };
}

/**
 * Builds the authoritative Firestore profile payload for a newly created Consumer Facility account.
 */
export function buildConsumerFacilityProfilePayload(canonical: {
  facilityId: string;
  facilityName: string;
  category: string;
}) {
  return {
    role: "facility" as const,
    facilityId: canonical.facilityId,
    facilityName: canonical.facilityName,
    category: canonical.category,
    active: true as const,
    mustChangePassword: true as const,
  };
}

/**
 * Builds the authoritative Firestore update payload when an Admin resets a Consumer Facility account password.
 */
export function buildConsumerFacilityResetUpdatePayload() {
  return {
    mustChangePassword: true as const,
  };
}

/**
 * Builds the authoritative Firestore update payload after a Facility successfully sets its private password.
 */
export function buildFacilityPasswordChangeSuccessPayload() {
  return {
    mustChangePassword: false as const,
  };
}
