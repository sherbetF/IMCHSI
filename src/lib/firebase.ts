import { initializeApp, getApps, getApp } from "firebase/app";
import {
  initializeFirestore,
  getFirestore,
  connectFirestoreEmulator,
  doc,
  getDocFromServer,
} from "firebase/firestore";
import {
  getAuth,
  setPersistence,
  browserSessionPersistence,
  connectAuthEmulator,
} from "firebase/auth";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import firebaseConfig from "../../firebase-applet-config.json";

const LOCAL_TEST = import.meta.env["VITE_HOSPITALHUB_LOCAL_TEST"] === "true";

if (LOCAL_TEST && import.meta.env.PROD) {
  throw new Error("Local Firebase test mode must not run in a production build.");
}

const effectiveConfig = LOCAL_TEST
  ? {
      apiKey: "demo-api-key",
      authDomain: "demo-hospitalhub-local.firebaseapp.com",
      projectId: "demo-hospitalhub-local",
      storageBucket: "demo-hospitalhub-local.firebasestorage.app",
      messagingSenderId: "123456789",
      appId: "1:123456789:web:demo",
    }
  : {
      apiKey: firebaseConfig.apiKey,
      authDomain: firebaseConfig.authDomain,
      projectId: firebaseConfig.projectId,
      storageBucket: firebaseConfig.storageBucket,
      messagingSenderId: firebaseConfig.messagingSenderId,
      appId: firebaseConfig.appId,
    };

const app = !getApps().length
  ? initializeApp(effectiveConfig)
  : getApp();

if (LOCAL_TEST && app.options.projectId !== "demo-hospitalhub-local") {
  throw new Error("Blocked: Firebase app is not using the local demo project.");
}

function getOrCreateFirestore() {
  const databaseId = firebaseConfig.firestoreDatabaseId;

  if (LOCAL_TEST) {
    return databaseId
      ? initializeFirestore(
          app,
          { experimentalForceLongPolling: true },
          databaseId,
        )
      : initializeFirestore(app, { experimentalForceLongPolling: true });
  }

  try {
    if (databaseId) {
      return initializeFirestore(
        app,
        { experimentalForceLongPolling: true },
        databaseId,
      );
    }

    return initializeFirestore(app, { experimentalForceLongPolling: true });
  } catch (error) {
    if (databaseId) {
      return getFirestore(app, databaseId);
    }
    return getFirestore(app);
  }
}

export const db = getOrCreateFirestore();
export const auth = getAuth(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

if (LOCAL_TEST) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", {
    disableWarnings: true,
  });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);

  console.info("HospitalHub LOCAL Firebase emulator mode enabled.");
}

// Enforce session-only authentication persistence for all facility and admin logins
setPersistence(auth, browserSessionPersistence).catch((err) => {
  console.warn("Failed to set Firebase Auth browserSessionPersistence:", err);
});

// Hardened Firestore error handler
export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
  userId?: string | null | undefined;
  email?: string | null | undefined;
  emailVerified?: boolean | null | undefined;
  isAnonymous?: boolean | null | undefined;
  tenantId?: string | null | undefined;
  providerInfo?: {
    providerId?: string | null | undefined;
    email?: string | null | undefined;
  }[];
};
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default app;
