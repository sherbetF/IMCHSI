import { onCall, CallableRequest } from "firebase-functions/v2/https";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { generateDoctorLoginKey } from "./doctorLoginHelper.js";

const TARGET_DATABASE_ID = "ai-studio-hospitalhubdesig-7f7a6729-a1d2-48e8-ba86-ae6c290d754c";

function getAdminDb() {
  const apps = getApps();
  const app = apps.length > 0 ? apps[0]! : initializeApp();
  return getFirestore(app, TARGET_DATABASE_ID);
}

export interface ActiveDoctorItem {
  loginKey: string;
  displayName: string;
}

export interface ListActiveDoctorsResponse {
  doctors: ActiveDoctorItem[];
}

/**
 * Publicly callable function to retrieve the minimal, safe directory of ACTIVE Doctors for login selection.
 *
 * Security & Privacy Invariants:
 * - Returns ONLY active doctors (`role == "doctor"` && `active == true`).
 * - Exposes ONLY `loginKey` (opaque non-sensitive selector) and `displayName`.
 * - NEVER exposes canonical doctorId, UID, email, password, or security metadata.
 * - Does not require admin credentials so unauthenticated Doctors can select their name on the login screen.
 * - Disambiguates duplicate display names safely without exposing canonical doctorId or sensitive identifiers.
 * - Does not alter Firestore Security Rules.
 */
export const listActiveDoctors = onCall(
  {
    cors: true,
  },
  async (_request: CallableRequest): Promise<ListActiveDoctorsResponse> => {
    const db = getAdminDb();
    const querySnap = await db
      .collection("users")
      .where("role", "==", "doctor")
      .where("active", "==", true)
      .get();

    // Group by displayName to identify duplicates for safe disambiguation
    const nameCountMap = new Map<string, number>();
    for (const doc of querySnap.docs) {
      const data = doc.data();
      const rawName = data["displayName"];
      const name =
        typeof rawName === "string" && rawName.trim().length > 0
          ? rawName.trim()
          : "Unknown Doctor";
      nameCountMap.set(name, (nameCountMap.get(name) || 0) + 1);
    }

    const nameIndexMap = new Map<string, number>();
    const doctors: ActiveDoctorItem[] = [];
    for (const doc of querySnap.docs) {
      const data = doc.data();
      const rawDoctorId = data["doctorId"];
      const doctorId = typeof rawDoctorId === "string" ? rawDoctorId.trim() : "";
      if (!doctorId) continue;

      const rawName = data["displayName"];
      const baseName =
        typeof rawName === "string" && rawName.trim().length > 0
          ? rawName.trim()
          : "Unknown Doctor";

      // Disambiguate if identical display names exist without exposing canonical doctorId
      const totalCount = nameCountMap.get(baseName) || 0;
      let displayName = baseName;
      if (totalCount > 1) {
        const currentIdx = (nameIndexMap.get(baseName) || 0) + 1;
        nameIndexMap.set(baseName, currentIdx);
        displayName = `${baseName} (Account ${currentIdx})`;
      }

      doctors.push({
        loginKey: generateDoctorLoginKey(doctorId),
        displayName,
      });
    }

    // Sort alphabetically by displayName
    doctors.sort((a, b) => a.displayName.localeCompare(b.displayName));

    return { doctors };
  },
);
