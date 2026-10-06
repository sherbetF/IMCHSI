/**
 * Production Security Helpers for Facility Account Frontend Gate and Form Validation.
 *
 * Shared between frontend components (FacilityPasswordChangeScreen, FacilityContext, __root)
 * and security regression test suites.
 */

export type FacilityGateDecision = "FORCE_PASSWORD_CHANGE" | "ALLOW_NORMAL_ACCESS" | "DENIED";

export interface FacilityGateProfile {
  role?: string;
  active?: boolean;
  mustChangePassword?: boolean;
}

/**
 * Authoritative frontend security gate evaluator for Facility password setup.
 * Used at the application root gate to block normal interface access when mustChangePassword === true.
 */
export function getFacilityPasswordGateState(
  profile: FacilityGateProfile | null | undefined,
): FacilityGateDecision {
  if (!profile || profile.role !== "facility" || profile.active !== true) {
    return "DENIED";
  }

  // Backward compatibility rule:
  // If mustChangePassword is missing/undefined/false, treat as false -> ALLOW_NORMAL_ACCESS.
  if (profile.mustChangePassword === true) {
    return "FORCE_PASSWORD_CHANGE";
  }

  return "ALLOW_NORMAL_ACCESS";
}

export interface PasswordFormValidationResult {
  valid: boolean;
  hasMinLength: boolean;
  hasLetter: boolean;
  hasNumber: boolean;
  isMatch: boolean;
  error?: string;
}

/**
 * Shared production helper for client-side Facility password change form validation.
 */
export function validateFacilityPasswordForm(
  newPassword: string,
  confirmPassword: string,
): PasswordFormValidationResult {
  const hasMinLength = newPassword.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const isMatch = newPassword.length > 0 && newPassword === confirmPassword;

  if (!hasMinLength || !hasLetter || !hasNumber) {
    return {
      valid: false,
      hasMinLength,
      hasLetter,
      hasNumber,
      isMatch,
      error: "Password does not meet all required complexity criteria.",
    };
  }

  if (newPassword !== confirmPassword) {
    return {
      valid: false,
      hasMinLength,
      hasLetter,
      hasNumber,
      isMatch: false,
      error: "Passwords do not match. Please re-enter.",
    };
  }

  return {
    valid: true,
    hasMinLength,
    hasLetter,
    hasNumber,
    isMatch: true,
  };
}
