import express from "express";
import cors from "cors";
import admin from "firebase-admin";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getAllCanonicalFacilities, getFacilityAccountStatus } from "./scripts/lib/facility-account-admin.js";
import { createServer as createViteServer } from 'vite';
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TARGET_DATABASE_ID = "ai-studio-hospitalhubdesig-7f7a6729-a1d2-48e8-ba86-ae6c290d754c";

// Initialize Admin SDK safely
function getAdminApp() {
  if (getApps().length === 0) {
    try {
      return initializeApp({
        credential: applicationDefault(),
        projectId: "outsource-f1e0f",
      });
    } catch (error) {
      console.warn("Firebase Admin SDK failed to initialize (this is expected in environments without credentials):", error.message);
      return null;
    }
  }
  return admin.app();
}

async function startServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Setup Vite in middleware mode
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
    configFile: 'vite.config.spa.ts'
  });

  // Auth middleware for API
  const authenticateAdmin = async (req: any, res: any, next: any) => {
    const adminApp = getAdminApp();
    if (!adminApp) {
      return res.status(500).send("Backend configuration error: Admin SDK not initialized");
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).send("Unauthorized");
    }
    const idToken = authHeader.split(" ")[1];
    try {
      const decodedToken = await getAuth(adminApp).verifyIdToken(idToken);
      const db = getFirestore(adminApp, TARGET_DATABASE_ID);
      const userDoc = await db.collection("users").doc(decodedToken.uid).get();
      if (!userDoc.exists || userDoc.data()?.role !== "admin" || userDoc.data()?.active !== true) {
        return res.status(403).send("Forbidden: Admins only");
      }
      req.adminUid = decodedToken.uid;
      next();
    } catch (error) {
      console.error("Auth middleware error:", error);
      return res.status(401).send("Unauthorized");
    }
  };

  // API Routes
  app.get("/api/admin/facility-accounts", authenticateAdmin, async (req: any, res: any) => {
    try {
      const facilities = getAllCanonicalFacilities();
      const facilityStatuses = await Promise.all(
        facilities.map(async (fac) => {
          const status = await getFacilityAccountStatus(fac.facilityId);
          return { ...fac, status };
        })
      );
      res.json(facilityStatuses);
    } catch (error) {
      console.error("Error fetching facility accounts:", error);
      res.status(500).send("Internal server error");
    }
  });

  app.post("/api/admin/reset-facility-password", authenticateAdmin, async (req: any, res: any) => {
    const { facilityId, newPassword } = req.body;
    if (!facilityId || !newPassword || newPassword.length < 12) {
      return res.status(400).send("Invalid input: facilityId and newPassword (min 12) required");
    }
    try {
      const adminApp = getAdminApp();
      if (!adminApp) throw new Error("Admin app not initialized");

      const facilities = getAllCanonicalFacilities();
      const facilityExists = facilities.some((f) => f.facilityId === facilityId);
      if (!facilityExists) return res.status(400).send("UNKNOWN_FACILITY");

      const status = await getFacilityAccountStatus(facilityId);
      if (status.state === "NOT_CREATED") return res.status(400).send("ACCOUNT_NOT_CREATED");
      if (status.state === "PARTIAL_MISSING_PROFILE" || status.state === "PARTIAL_MISSING_AUTH") return res.status(400).send("ACCOUNT_PARTIAL");
      if (status.state === "SECURITY_MISMATCH") return res.status(400).send("ACCOUNT_MALFORMED");
      if (status.state !== "EXISTS_ACTIVE") return res.status(400).send("ACCOUNT_INACTIVE_OR_CONFLICT");

      const auth = getAuth(adminApp);
      const authUser = await auth.getUserByEmail(status.email);
      if (authUser.uid !== status.uid) return res.status(400).send("UID_MISMATCH");

      await auth.updateUser(status.uid, { password: newPassword });
      const db = getFirestore(adminApp, TARGET_DATABASE_ID);
      await db.collection("admin_audit_logs").add({
        action: "FACILITY_PASSWORD_RESET",
        adminUid: req.adminUid,
        targetFacilityId: facilityId,
        targetUid: status.uid,
        timestamp: new Date().toISOString(),
        success: true,
      });
      res.status(200).send("Password reset successfully.");
    } catch (error) {
      console.error("Error in password reset:", error);
      res.status(500).send("Internal server error");
    }
  });

  // Vite middleware
  app.use(vite.middlewares);

  // Serve SPA index.html for all non-API routes
  app.use(async (req, res, next) => {
    if (req.originalUrl.startsWith("/api/")) return next();
    
    try {
      const template = fs.readFileSync(path.resolve(__dirname, "index.html"), "utf-8");
      const html = await vite.transformIndexHtml(req.originalUrl, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch (e) {
      if (e instanceof Error) {
        vite.ssrFixStacktrace(e);
      }
      next(e);
    }
  });

  const PORT = 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();

