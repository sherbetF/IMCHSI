import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { CANONICAL_FACILITIES } from "./canonicalFacilities.js";

const TARGET_DATABASE_ID = "ai-studio-hospitalhubdesig-7f7a6729-a1d2-48e8-ba86-ae6c290d754c";

// Initialize Firebase Admin once
function getAdminInstances() {
  const apps = getApps();
  const app = apps.length > 0 ? apps[0]! : initializeApp();
  const auth = getAuth(app);
  const db = getFirestore(app, TARGET_DATABASE_ID);
  return { app, auth, db };
}

export interface SafeFacilityAccountItem {
  facilityId: string;
  facilityName: string;
  category: string;
  status:
    | "ACTIVE"
    | "INACTIVE"
    | "NOT_CREATED"
    | "PARTIAL_MISSING_PROFILE"
    | "PARTIAL_MISSING_AUTH"
    | "SECURITY_MISMATCH"
    | "CONFLICT";
  statusDetails: string;
}

export interface ListFacilityAccountsResponse {
  facilities: SafeFacilityAccountItem[];
  totalCanonical: number;
  activeCount: number;
  inactiveCount: number;
  notCreatedCount: number;
  conflictCount: number;
  warningCount: number;
}

export const listFacilityAccounts = onCall(
  {
    cors: true,
  },
  async (request: CallableRequest): Promise<ListFacilityAccountsResponse> => {
    // 1. Caller Authentication Verification
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError(
        "unauthenticated",
        "Authentication required: Must be signed in with valid Firebase credentials.",
      );
    }

    const callerUid = request.auth.uid;
    const { auth, db } = getAdminInstances();

    // 2. Caller Authorization Verification from Named Firestore Database
    const callerDocSnap = await db.collection("users").doc(callerUid).get();
    if (!callerDocSnap.exists) {
      throw new HttpsError(
        "permission-denied",
        "Authorization failed: User profile does not exist.",
      );
    }

    const callerData = callerDocSnap.data();
    if (!callerData || callerData["role"] !== "admin" || callerData["active"] !== true) {
      throw new HttpsError(
        "permission-denied",
        "Authorization failed: Caller is not an active administrator.",
      );
    }

    // 3. Process Status for each Canonical Facility (Read-Only)
    const results: SafeFacilityAccountItem[] = [];
    let activeCount = 0;
    let inactiveCount = 0;
    let notCreatedCount = 0;
    let conflictCount = 0;
    let warningCount = 0;

    for (const fac of CANONICAL_FACILITIES) {
      const email = `facility_${fac.facilityId}@auth.local`;

      // Check Firebase Auth
      let authUser: { uid: string; disabled: boolean } | null = null;
      try {
        const u = await auth.getUserByEmail(email);
        authUser = { uid: u.uid, disabled: u.disabled };
      } catch (err: unknown) {
        const error = err as { code?: string };
        if (error.code !== "auth/user-not-found") {
          // If unexpected Auth error, log safely and treat as unknown
          console.warn(`Auth check warning for ${fac.facilityId}:`, error.code);
        }
      }

      // Check trusted Firestore profiles in named database
      const usersQuery = await db
        .collection("users")
        .where("facilityId", "==", fac.facilityId)
        .get();

      const matchingDocs = usersQuery.docs.map((doc) => ({
        uid: doc.id,
        role: doc.data()["role"] as string | undefined,
        facilityId: doc.data()["facilityId"] as string | undefined,
        active: doc.data()["active"] as boolean | undefined,
      }));

      // Multiple profiles claiming the same facilityId -> CONFLICT
      if (matchingDocs.length > 1) {
        results.push({
          facilityId: fac.facilityId,
          facilityName: fac.facilityName,
          category: fac.category,
          status: "CONFLICT",
          statusDetails: `CONFLICT: ${matchingDocs.length} trusted profiles claim facilityId '${fac.facilityId}'. Manual resolution required.`,
        });
        conflictCount++;
        continue;
      }

      const profile = matchingDocs.length === 1 ? matchingDocs[0] : null;

      let status: SafeFacilityAccountItem["status"] = "NOT_CREATED";
      let statusDetails = "Account does not exist.";

      if (authUser === null && profile === null) {
        status = "NOT_CREATED";
        statusDetails = "No Firebase Auth user or Firestore profile created.";
        notCreatedCount++;
      } else if (authUser !== null && profile !== null) {
        if (authUser.uid !== profile.uid) {
          status = "SECURITY_MISMATCH";
          statusDetails = "Auth UID does not match trusted profile UID.";
          warningCount++;
        } else if (profile.role !== "facility") {
          status = "SECURITY_MISMATCH";
          statusDetails = `Role mismatch: found '${profile.role}', expected 'facility'.`;
          warningCount++;
        } else if (profile.facilityId !== fac.facilityId) {
          status = "SECURITY_MISMATCH";
          statusDetails = "Profile facilityId does not match canonical facilityId.";
          warningCount++;
        } else if (authUser.disabled || profile.active === false) {
          status = "INACTIVE";
          statusDetails = "Facility account exists and is inactive.";
          inactiveCount++;
        } else {
          status = "ACTIVE";
          statusDetails = "Facility account exists and is active.";
          activeCount++;
        }
      } else if (authUser !== null && profile === null) {
        status = "PARTIAL_MISSING_PROFILE";
        statusDetails = "Firebase Auth user exists but trusted Firestore profile is missing.";
        warningCount++;
      } else if (authUser === null && profile !== null) {
        status = "PARTIAL_MISSING_AUTH";
        statusDetails = "Trusted Firestore profile exists but Firebase Auth user is missing.";
        warningCount++;
      }

      results.push({
        facilityId: fac.facilityId,
        facilityName: fac.facilityName,
        category: fac.category,
        status,
        statusDetails,
      });
    }

    return {
      facilities: results,
      totalCanonical: CANONICAL_FACILITIES.length,
      activeCount,
      inactiveCount,
      notCreatedCount,
      conflictCount,
      warningCount,
    };
  },
);
