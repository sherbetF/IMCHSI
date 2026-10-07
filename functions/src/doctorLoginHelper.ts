import crypto from "crypto";

const DOCTOR_SELECTOR_SECRET =
  process.env.DOCTOR_SELECTOR_SECRET || "hospitalhub-doctor-login-selector-secret-v1-9f8a3c2e1b";

/**
 * Generates an opaque, non-sensitive pre-authentication loginKey selector from a canonical doctorId.
 *
 * Invariants:
 * - Never returns UID, email, or canonical doctorId.
 * - One-way HMAC prevents reversing the selector back to the canonical doctorId.
 * - Deterministic so active doctors map reliably across function instances.
 * - Opaque token format: 'doc_sel_<24 hex chars>'.
 * - Grants NO authorization by itself; merely a selection hint for pre-auth email resolution.
 */
export function generateDoctorLoginKey(doctorId: string): string {
  const cleanId = (doctorId || "").trim().toLowerCase();
  const hmac = crypto.createHmac("sha256", DOCTOR_SELECTOR_SECRET);
  hmac.update(cleanId);
  return `doc_sel_${hmac.digest("hex").slice(0, 24)}`;
}
