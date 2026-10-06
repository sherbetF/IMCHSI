/**
 * Authoritative Server-Side Password Validator for Managed Accounts.
 *
 * Rules:
 * - Minimum length: 8 characters
 * - At least one alphabetic letter ([a-zA-Z])
 * - At least one numeric digit ([0-9])
 * - Case-sensitive
 * - Must NEVER be stored in Firestore, logged, or placed in URLs
 */

export interface PasswordValidationResult {
  valid: boolean;
  error?: string;
}

export function validateManagedPassword(password: unknown): PasswordValidationResult {
  if (typeof password !== "string") {
    return { valid: false, error: "Password must be a string." };
  }

  if (password.length < 8) {
    return { valid: false, error: "Password must be at least 8 characters long." };
  }

  if (!/[a-zA-Z]/.test(password)) {
    return { valid: false, error: "Password must contain at least one alphabetic letter." };
  }

  if (!/[0-9]/.test(password)) {
    return { valid: false, error: "Password must contain at least one numeric digit." };
  }

  return { valid: true };
}
