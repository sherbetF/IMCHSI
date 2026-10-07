import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
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

export const listManagedAccounts = onCall(
  {
    cors: true,
  },
  async (request: CallableRequest): Promise<ListManagedAccountsResponse> => {
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

    // 3. Process CONSUMER Accounts (84 Canonical Facilities)
    const consumers: ManagedConsumerItem[] = [];
    let activeConsumers = 0;
    let inactiveConsumers = 0;
    let notCreatedConsumers = 0;
    let conflictCount = 0;
    let warningCount = 0;

    for (const fac of CANONICAL_FACILITIES) {
      const email = `facility_${fac.facilityId}@auth.local`;

      let authUser: { uid: string; disabled: boolean } | null = null;
      try {
        const u = await auth.getUserByEmail(email);
        authUser = { uid: u.uid, disabled: u.disabled };
      } catch (err: unknown) {
        const error = err as { code?: string };
        if (error.code !== "auth/user-not-found") {
          console.warn(`Auth check warning for facility ${fac.facilityId}:`, error.code);
        }
      }

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

      // Conflict detection for multiple profiles claiming the same facilityId
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

      const profile = matchingDocs.length === 1 ? matchingDocs[0] : null;
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

    // 4. Process PARAMEDIC / NURSE Staff Accounts
    const staff: ManagedStaffItem[] = [];
    let activeStaff = 0;
    let inactiveStaff = 0;
    let notCreatedStaff = 0;

    for (const staffDef of MANAGED_STAFF_ACCOUNTS) {
      let authUser: { uid: string; disabled: boolean } | null = null;
      try {
        const u = await auth.getUserByEmail(staffDef.email);
        authUser = { uid: u.uid, disabled: u.disabled };
      } catch (err: unknown) {
        const error = err as { code?: string };
        if (error.code !== "auth/user-not-found") {
          console.warn(`Auth check warning for staff ${staffDef.accountKey}:`, error.code);
        }
      }

      const usersQuery = await db.collection("users").where("role", "==", staffDef.role).get();

      const matchingDocs = usersQuery.docs.map((doc) => ({
        uid: doc.id,
        role: doc.data()["role"] as string | undefined,
        active: doc.data()["active"] as boolean | undefined,
        displayName: doc.data()["displayName"] as string | undefined,
      }));

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

      const profile = matchingDocs.length === 1 ? matchingDocs[0] : null;
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
        try {
          await db.collection("users").doc(authUser.uid).set({
            role: staffDef.role,
            accountKey: staffDef.accountKey,
            displayName: staffDef.displayName,
            active: !authUser.disabled,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          status = authUser.disabled ? "INACTIVE" : "ACTIVE";
          statusDetails = authUser.disabled
            ? "Repaired missing profile (account is currently inactive)."
            : "Repaired missing profile (account is active).";
          if (authUser.disabled) inactiveStaff++;
          else activeStaff++;
        } catch (repairErr) {
          console.error("Failed to auto-repair missing staff profile:", repairErr);
          status = "PARTIAL_MISSING_PROFILE";
          statusDetails = "Firebase Auth user exists but trusted Firestore profile is missing.";
          warningCount++;
        }
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

    // 5. Process DYNAMIC DOCTOR Accounts
    const doctors: ManagedDoctorItem[] = [];
    let activeDoctors = 0;
    let inactiveDoctors = 0;

    const doctorProfilesQuery = await db.collection("users").where("role", "==", "doctor").get();

    // Map doctorId to frequency to detect CONFLICT (multiple profiles claiming same doctorId)
    const doctorIdCountMap = new Map<string, number>();
    for (const docSnap of doctorProfilesQuery.docs) {
      const p = docSnap.data();
      const rawDoctorId = p["doctorId"];
      if (typeof rawDoctorId === "string" && rawDoctorId.trim().length > 0) {
        const idKey = rawDoctorId.trim();
        doctorIdCountMap.set(idKey, (doctorIdCountMap.get(idKey) || 0) + 1);
      }
    }

    for (const docSnap of doctorProfilesQuery.docs) {
      const p = docSnap.data();
      const uid = docSnap.id;
      const rawDoctorId = p["doctorId"];
      const doctorId = typeof rawDoctorId === "string" ? rawDoctorId.trim() : "";
      const displayName =
        typeof p["displayName"] === "string" && p["displayName"].trim().length > 0
          ? p["displayName"].trim()
          : "Unknown Doctor";
      const active = p["active"] as boolean | undefined;

      let authUser: { uid: string; email?: string; disabled: boolean } | null = null;
      try {
        const u = await auth.getUser(uid);
        authUser = { uid: u.uid, email: u.email, disabled: u.disabled };
      } catch (err: unknown) {
        const error = err as { code?: string };
        if (error.code !== "auth/user-not-found") {
          console.warn(`Auth check warning for doctor ${uid}:`, error.code);
        }
      }

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
      } else if (p["role"] !== "doctor") {
        status = "SECURITY_MISMATCH";
        statusDetails = `Role mismatch: found '${p["role"]}', expected 'doctor'.`;
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
    };
  },
);
