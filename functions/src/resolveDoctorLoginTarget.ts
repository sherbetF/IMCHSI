import { onCall, CallableRequest, HttpsError } from "firebase-functions/v2/https";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { generateDoctorLoginKey } from "./doctorLoginHelper.js";

const TARGET_DATABASE_ID = "ai-studio-hospitalhubdesig-7f7a6729-a1d2-48e8-ba86-ae6c290d754c";

function getAdminDb() {
  const apps = getApps();
  const app = apps.length > 0 ? apps[0]! : initializeApp();
  return getFirestore(app, TARGET_DATABASE_ID);
}

export interface ResolveDoctorLoginTargetRequest {
  loginKey: string;
}

export interface ResolveDoctorLoginTargetResponse {
  email: string;
  loginKey: string;
}

/**
 * Public pre-authentication callable to resolve an opaque Doctor login selector to the
 * corresponding synthetic Firebase Auth email required by signInWithEmailAndPassword.
 *
 * Security Invariants:
 * - Only resolves ACTIVE doctors (`role == "doctor"` && `active == true`).
 * - Never returns canonical doctorId, UID, password, or profile metadata.
 * - Does not accept or compare passwords; password verification is exclusively performed
 *   by the Firebase Authentication client SDK.
 * - Does not perform password-only discovery.
 * - Input validation rejects empty, malformed, or missing loginKeys.
 */
export const resolveDoctorLoginTarget = onCall(
  {
    cors: true,
  },
  async (
    request: CallableRequest<ResolveDoctorLoginTargetRequest>,
  ): Promise<ResolveDoctorLoginTargetResponse> => {
    const loginKey = request.data?.loginKey;
    if (!loginKey || typeof loginKey !== "string" || !loginKey.trim().startsWith("doc_sel_")) {
      throw new HttpsError("invalid-argument", "Missing or invalid Doctor login key.");
    }

    const cleanLoginKey = loginKey.trim();
    const db = getAdminDb();
    const querySnap = await db
      .collection("users")
      .where("role", "==", "doctor")
      .where("active", "==", true)
      .get();

    for (const doc of querySnap.docs) {
      const data = doc.data();
      const rawDoctorId = data["doctorId"];
      const doctorId = typeof rawDoctorId === "string" ? rawDoctorId.trim() : "";
      if (!doctorId) continue;

      const expectedKey = generateDoctorLoginKey(doctorId);
      if (expectedKey === cleanLoginKey) {
        const email = `doctor_${doctorId.toLowerCase()}@auth.local`;
        return {
          email,
          loginKey: cleanLoginKey,
        };
      }
    }

    throw new HttpsError(
      "not-found",
      "Selected doctor account is unavailable. Please select your name again.",
    );
  },
);
