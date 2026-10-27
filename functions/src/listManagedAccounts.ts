import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { CANONICAL_FACILITIES } from "./canonicalFacilities.js";
import { MANAGED_STAFF_ACCOUNTS } from "./managedStaffAccounts.js";
import {
  ListManagedAccountsResponse,
  ManagedConsumerItem,
  ManagedStaffItem,
  ManagedDoctorItem,
  ManagedAccountStatus,
} from "./accountTypes.js";

const TARGET_DATABASE_ID = "ai-studio-hospitalhubdesig-7f7a6729-a1d2-48e8-ba86-ae6c290d754c";

function getAdminInstances() {
  const apps = getApps();
  const app = apps.length > 0 ? apps[0]! : initializeApp();
  const auth = getAuth(app);
  const db = getFirestore(app, TARGET_DATABASE_ID);
  return { app, auth, db };
}

interface AuthUserSummary {
  uid: string;
  email?: string;
  disabled: boolean;
}

/**
 * Bulk-lists all Firebase Auth accounts using pageToken iteration.
 * Eliminates N+1 sequential getUserByEmail / getUser network round-trips.
 */
async function fetchAllAuthUsers(
  auth: import("firebase-admin/auth").Auth,
): Promise<AuthUserSummary[]> {
  const users: AuthUserSummary[] = [];
  let pageToken: string | undefined = undefined;

  do {
    const listResult = await auth.listUsers(1000, pageToken);
    for (const u of listResult.users) {
      users.push({
        uid: u.uid,
        email: u.email,
        disabled: u.disabled,
      });
    }
    pageToken = listResult.pageToken;
  } while (pageToken);

  return users;
}

export const listManagedAccounts = onCall(
  {
    cors: true,
  },
  async (request: CallableRequest): Promise<ListManagedAccountsResponse> => {
    const tTotalStart = performance.now();

    // 1. Caller Authentication Verification (Server-Side)
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError(
        "unauthenticated",
        "Authentication required: Must be signed in with valid Firebase credentials.",
      );
    }

    const callerUid = request.auth.uid;
    const { auth, db } = getAdminInstances();

    // 2. Caller Authorization Verification from Named Firestore Database
    const tAuthStart = performance.now();
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
    const authorizationMs = Math.round(performance.now() - tAuthStart);

    // 3. Facility Registry Access & Timing
    const tRegistryStart = performance.now();
    const facilityRegistryMs = Math.max(1, Math.round(performance.now() - tRegistryStart));

    // 4. High-Performance Bulk Data Loading
    // Instead of 84+ sequential Auth calls and 84+ sequential Firestore queries (N+1 pattern),
    // load the users collection once and list Auth users once, executing concurrently.
    let trustedProfilesMs = 0;
    let authUsersLoadMs = 0;

    const loadFirestorePromise = (async () => {
      const t0 = performance.now();
      const snap = await db.collection("users").get();
      trustedProfilesMs = Math.round(performance.now() - t0);
      return snap;
    })();

    const loadAuthPromise = (async () => {
      const t0 = performance.now();
      const users = await fetchAllAuthUsers(auth);
      authUsersLoadMs = Math.round(performance.now() - t0);
      return users;
    })();

    const [usersSnapshot, authUsers] = await Promise.all([loadFirestorePromise, loadAuthPromise]);

    const firestoreLoadMs = trustedProfilesMs;
    const tMatchingStart = performance.now();

    // 4. In-Memory Indexing for Auth Users
    const authUsersByEmail = new Map<string, AuthUserSummary>();
    const authUsersByUid = new Map<string, AuthUserSummary>();

    for (const u of authUsers) {
      if (u.email) {
        authUsersByEmail.set(u.email.toLowerCase(), u);
      }
      authUsersByUid.set(u.uid, u);
    }

    // 5. In-Memory Indexing for Firestore User Profiles
    interface IndexedUserProfile {
      uid: string;
      role?: string;
      facilityId?: string;
      active?: boolean;
      displayName?: string;
      accountKey?: string;
      doctorId?: string;
      data: FirebaseFirestore.DocumentData;
    }

    const consumerProfilesByFacilityId = new Map<string, IndexedUserProfile[]>();
    const staffProfilesByRole = new Map<string, IndexedUserProfile[]>();
    const doctorProfiles: IndexedUserProfile[] = [];

    for (const doc of usersSnapshot.docs) {
      const data = doc.data();
      const profile: IndexedUserProfile = {
        uid: doc.id,
        role: data["role"] as string | undefined,
        facilityId: data["facilityId"] as string | undefined,
        active: data["active"] as boolean | undefined,
        displayName: data["displayName"] as string | undefined,
        accountKey: data["accountKey"] as string | undefined,
        doctorId: data["doctorId"] as string | undefined,
        data,
      };

      // Index by facilityId for consumer facilities
      if (typeof profile.facilityId === "string" && profile.facilityId.trim()) {
        const facKey = profile.facilityId.trim();
        const existing = consumerProfilesByFacilityId.get(facKey);
        if (existing) {
          existing.push(profile);
        } else {
          consumerProfilesByFacilityId.set(facKey, [profile]);
        }
      }

      // Index by role for staff accounts
      if (typeof profile.role === "string" && profile.role.trim()) {
        const roleKey = profile.role.trim();
        const existing = staffProfilesByRole.get(roleKey);
        if (existing) {
          existing.push(profile);
        } else {
          staffProfilesByRole.set(roleKey, [profile]);
        }
      }

      // Collect doctors
      if (profile.role === "doctor") {
        doctorProfiles.push(profile);
      }
    }

    // 6. Process CONSUMER Accounts (84 Canonical Facilities) in Memory
    const consumers: ManagedConsumerItem[] = [];
    let activeConsumers = 0;
    let inactiveConsumers = 0;
    let notCreatedConsumers = 0;
    let conflictCount = 0;
    let warningCount = 0;

    for (const fac of CANONICAL_FACILITIES) {
      const email = `facility_${fac.facilityId}@auth.local`;
      const authUser = authUsersByEmail.get(email.toLowerCase()) || null;
      const matchingDocs = consumerProfilesByFacilityId.get(fac.facilityId) || [];

      // Conflict detection for multiple profiles claiming the same facilityId (e.g. KD Tiram Duku)
      if (matchingDocs.length > 1) {
        consumers.push({
          facilityId: fac.facilityId,
          facilityName: fac.facilityName,
          category: fac.category,
          accountType: "CONSUMER",
          status: "CONFLICT",
          statusDetails: `CONFLICT: ${matchingDocs.length} trusted profiles claim facilityId '${fac.facilityId}'. Manual resolution required.`,
        });
        conflictCount++;
        continue;
      }

      const profile = matchingDocs.length === 1 ? matchingDocs[0]! : null;
      let status: ManagedAccountStatus = "NOT_CREATED";
      let statusDetails = "Account does not exist.";

      if (authUser === null && profile === null) {
        status = "NOT_CREATED";
        statusDetails = "No Firebase Auth user or Firestore profile created.";
        notCreatedConsumers++;
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
          statusDetails = "Consumer facility account exists and is inactive.";
          inactiveConsumers++;
        } else {
          status = "ACTIVE";
          statusDetails = "Consumer facility account exists and is active.";
          activeConsumers++;
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

      consumers.push({
        facilityId: fac.facilityId,
        facilityName: fac.facilityName,
        category: fac.category,
        accountType: "CONSUMER",
        status,
        statusDetails,
      });
    }

    // 7. Process PARAMEDIC / NURSE Staff Accounts in Memory
    const staff: ManagedStaffItem[] = [];
    let activeStaff = 0;
    let inactiveStaff = 0;
    let notCreatedStaff = 0;

    for (const staffDef of MANAGED_STAFF_ACCOUNTS) {
      const authUser = authUsersByEmail.get(staffDef.email.toLowerCase()) || null;
      const matchingDocs = staffProfilesByRole.get(staffDef.role) || [];

      // Conflict if multiple profiles claim the paramedic_nurse role
      if (matchingDocs.length > 1) {
        staff.push({
          accountKey: staffDef.accountKey,
          displayName: staffDef.displayName,
          role: staffDef.role,
          accountType: "PARAMEDIC_NURSE",
          status: "CONFLICT",
          statusDetails: `CONFLICT: ${matchingDocs.length} profiles claim role '${staffDef.role}'. Manual review required.`,
        });
        conflictCount++;
        continue;
      }

      const profile = matchingDocs.length === 1 ? matchingDocs[0]! : null;
      let status: ManagedAccountStatus = "NOT_CREATED";
      let statusDetails = "Account does not exist.";

      if (authUser === null && profile === null) {
        status = "NOT_CREATED";
        statusDetails = "No Firebase Auth user or Firestore profile created.";
        notCreatedStaff++;
      } else if (authUser !== null && profile !== null) {
        if (authUser.uid !== profile.uid) {
          status = "SECURITY_MISMATCH";
          statusDetails = "Auth UID does not match trusted profile UID.";
          warningCount++;
        } else if (profile.role !== staffDef.role) {
          status = "SECURITY_MISMATCH";
          statusDetails = `Role mismatch: found '${profile.role}', expected '${staffDef.role}'.`;
          warningCount++;
        } else if (authUser.disabled || profile.active === false) {
          status = "INACTIVE";
          statusDetails = "Paramedic account exists and is inactive.";
          inactiveStaff++;
        } else {
          status = "ACTIVE";
          statusDetails = "Paramedic account exists and is active.";
          activeStaff++;
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

      staff.push({
        accountKey: staffDef.accountKey,
        displayName: staffDef.displayName,
        role: staffDef.role,
        accountType: "PARAMEDIC_NURSE",
        status,
        statusDetails,
      });
    }

    // 8. Process DYNAMIC DOCTOR Accounts in Memory
    const doctors: ManagedDoctorItem[] = [];
    let activeDoctors = 0;
    let inactiveDoctors = 0;

    // Map doctorId to frequency to detect CONFLICT (multiple profiles claiming same doctorId)
    const doctorIdCountMap = new Map<string, number>();
    for (const p of doctorProfiles) {
      const rawDoctorId = p.doctorId;
      if (typeof rawDoctorId === "string" && rawDoctorId.trim().length > 0) {
        const idKey = rawDoctorId.trim();
        doctorIdCountMap.set(idKey, (doctorIdCountMap.get(idKey) || 0) + 1);
      }
    }

    for (const p of doctorProfiles) {
      const uid = p.uid;
      const rawDoctorId = p.doctorId;
      const doctorId = typeof rawDoctorId === "string" ? rawDoctorId.trim() : "";
      const displayName =
        typeof p.displayName === "string" && p.displayName.trim().length > 0
          ? p.displayName.trim()
          : "Unknown Doctor";
      const active = p.active;

      const authUser = authUsersByUid.get(uid) || null;

      let status: ManagedAccountStatus = "ACTIVE";
      let statusDetails = "Doctor account is active and verified.";

      const isDuplicate = doctorId && (doctorIdCountMap.get(doctorId) || 0) > 1;

      if (isDuplicate) {
        status = "CONFLICT";
        statusDetails = `CONFLICT: Multiple profiles (${doctorIdCountMap.get(doctorId)}) claim doctorId '${doctorId}'. Manual resolution required.`;
        conflictCount++;
      } else if (!doctorId) {
        status = "SECURITY_MISMATCH";
        statusDetails = "Doctor profile is missing valid doctorId.";
        warningCount++;
      } else if (p.role !== "doctor") {
        status = "SECURITY_MISMATCH";
        statusDetails = `Role mismatch: found '${p.role}', expected 'doctor'.`;
        warningCount++;
      } else if (authUser === null) {
        status = "PARTIAL_MISSING_AUTH";
        statusDetails = "Firestore profile exists but Firebase Auth user is missing.";
        warningCount++;
      } else {
        const expectedEmail = `doctor_${doctorId.toLowerCase()}@auth.local`;
        if (authUser.email !== expectedEmail) {
          status = "SECURITY_MISMATCH";
          statusDetails = `Auth email mismatch: found '${authUser.email}', expected '${expectedEmail}'.`;
          warningCount++;
        } else if (authUser.uid !== uid) {
          status = "SECURITY_MISMATCH";
          statusDetails = "Auth UID does not match trusted profile UID.";
          warningCount++;
        } else if (!authUser.disabled && active === true) {
          status = "ACTIVE";
          statusDetails = "Doctor account is active and synchronized in both Auth and Firestore.";
          activeDoctors++;
        } else if (authUser.disabled && active === false) {
          status = "INACTIVE";
          statusDetails = "Doctor account is inactive and synchronized in both Auth and Firestore.";
          inactiveDoctors++;
        } else {
          status = "SECURITY_MISMATCH";
          statusDetails = `SECURITY_MISMATCH: Inconsistent active state between Auth (disabled: ${authUser.disabled}) and Firestore profile (active: ${active}).`;
          warningCount++;
        }
      }

      doctors.push({
        doctorId: doctorId || `INVALID_${uid}`,
        displayName,
        role: "doctor",
        accountType: "DOCTOR",
        status,
        statusDetails,
      });
    }

    const matchingMs = Math.round(performance.now() - tMatchingStart);

    // 6. Sorting / Final Assembly Timing
    const tSortingStart = performance.now();
    // Doctors sorted alphabetically by displayName for predictable display
    doctors.sort((a, b) => a.displayName.localeCompare(b.displayName));
    const sortingMs = Math.max(0, Math.round(performance.now() - tSortingStart));

    const totalMs = Math.round(performance.now() - tTotalStart);

    console.log(
      `[listManagedAccounts Timing] ` +
        `authorization: ${authorizationMs}ms | ` +
        `facilityRegistry: ${facilityRegistryMs}ms | ` +
        `trustedProfiles: ${trustedProfilesMs}ms (${usersSnapshot.size} docs) | ` +
        `authUsers: ${authUsersLoadMs}ms (${authUsers.length} users) | ` +
        `matching: ${matchingMs}ms | ` +
        `sorting: ${sortingMs}ms | ` +
        `total: ${totalMs}ms`,
    );

    return {
      consumers,
      staff,
      doctors,
      summary: {
        totalConsumers: CANONICAL_FACILITIES.length,
        totalStaff: MANAGED_STAFF_ACCOUNTS.length,
        totalDoctors: doctors.length,
        activeConsumers,
        activeStaff,
        activeDoctors,
        inactiveConsumers,
        inactiveStaff,
        inactiveDoctors,
        notCreatedConsumers,
        notCreatedStaff,
        conflictCount,
        warningCount,
      },
      diagnostics: {
        authorizationMs,
        facilityRegistryMs,
        trustedProfilesMs,
        firestoreLoadMs,
        authUsersLoadMs,
        matchingMs,
        sortingMs,
        totalMs,
      },
    };
  },
);
