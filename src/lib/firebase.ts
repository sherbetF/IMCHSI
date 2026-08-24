import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeFirestore, getFirestore, doc, getDocFromServer } from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";

const app = !getApps().length
  ? initializeApp({
      apiKey: firebaseConfig.apiKey,
      authDomain: firebaseConfig.authDomain,
      projectId: firebaseConfig.projectId,
      storageBucket: firebaseConfig.storageBucket,
      messagingSenderId: firebaseConfig.messagingSenderId,
      appId: firebaseConfig.appId,
    })
  : getApp();

function getOrCreateFirestore() {
  try {
    if (firebaseConfig.firestoreDatabaseId) {
      return initializeFirestore(
        app,
        { experimentalAutoDetectLongPolling: true },
        firebaseConfig.firestoreDatabaseId,
      );
    } else {
      return initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
    }
  } catch (error) {
    if (firebaseConfig.firestoreDatabaseId) {
      return getFirestore(app, firebaseConfig.firestoreDatabaseId);
    }
    return getFirestore(app);
  }
}

export const db = getOrCreateFirestore();

async function testConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("offline") || error.message.includes("unavailable"))
    ) {
      console.warn("Firestore connection check:", error.message);
    }
  }
}
testConnection();

export default app;
