import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminInstances } from "./adminAuthHelper.js";

export interface ReserveRheumatologyAttachmentSlotRequest {
  referralDocumentId: string;
  attachmentId: string;
}

export interface ReleaseRheumatologyAttachmentSlotRequest {
  referralDocumentId: string;
  attachmentId: string;
}

export interface AttachmentSlotResponse {
  success: boolean;
  attachmentId?: string;
  remainingSlots?: number;
  released?: boolean;
  message?: string;
}

function validateInputIds(
  referralDocumentId: unknown,
  attachmentId: unknown,
): {
  validReferralId: string;
  validAttachmentId: string;
} {
  if (typeof referralDocumentId !== "string" || !referralDocumentId.trim()) {
    throw new HttpsError(
      "invalid-argument",
      "Missing or invalid referralDocumentId: must be a non-empty string.",
    );
  }
  if (typeof attachmentId !== "string" || !attachmentId.trim()) {
    throw new HttpsError(
      "invalid-argument",
      "Missing or invalid attachmentId: must be a non-empty string.",
    );
  }

  const cleanReferralId = referralDocumentId.trim();
  const cleanAttachmentId = attachmentId.trim();

  if (cleanReferralId.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(cleanReferralId)) {
    throw new HttpsError(
      "invalid-argument",
      "Invalid referralDocumentId format: must contain only alphanumeric characters, underscores, or dashes (max 128 chars).",
    );
  }
  if (cleanAttachmentId.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(cleanAttachmentId)) {
    throw new HttpsError(
      "invalid-argument",
      "Invalid attachmentId format: must contain only alphanumeric characters, underscores, or dashes (max 128 chars).",
    );
  }

  return { validReferralId: cleanReferralId, validAttachmentId: cleanAttachmentId };
}

async function verifyFacilityCaller(request: CallableRequest, db: any) {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError(
      "unauthenticated",
      "Authentication required: Caller is not signed in with valid Firebase credentials.",
    );
  }

  const callerUid = request.auth.uid;
  const userSnap = await db.collection("users").doc(callerUid).get();

  if (!userSnap.exists) {
    throw new HttpsError(
      "permission-denied",
      "Authorization failed: Authenticated user profile does not exist.",
    );
  }

  const userData = userSnap.data();
  if (
    !userData ||
    userData["active"] !== true ||
    userData["role"] !== "facility" ||
    typeof userData["facilityId"] !== "string" ||
    !userData["facilityId"].trim()
  ) {
    throw new HttpsError(
      "permission-denied",
      "Authorization failed: Caller is not an active Healthcare Facility user.",
    );
  }

  const facilityId = userData["facilityId"].trim();
  return { callerUid, facilityId };
}

/**
 * Backend-owned atomic attachment slot reservation for Rheumatology referrals.
 * Guarantees a hard ceiling of 5 attachments even under concurrent client upload attempts.
 * Stale in-progress reservations older than 30 minutes without finalized metadata are automatically recovered.
 */
export const reserveRheumatologyAttachmentSlot = onCall(
  { cors: true },
  async (
    request: CallableRequest<ReserveRheumatologyAttachmentSlotRequest>,
  ): Promise<AttachmentSlotResponse> => {
    const { db } = getAdminInstances();
    const { callerUid, facilityId } = await verifyFacilityCaller(request, db);

    const data = request.data;
    if (!data) {
      throw new HttpsError("invalid-argument", "Request payload is required.");
    }

    const { validReferralId, validAttachmentId } = validateInputIds(
      data.referralDocumentId,
      data.attachmentId,
    );

    const referralRef = db.collection("rheumatology_appointments").doc(validReferralId);
    const controlRef = referralRef.collection("attachment_control").doc("summary");
    const attachmentsCol = referralRef.collection("attachments");

    const STALE_RESERVATION_MS = 30 * 60 * 1000; // 30 minutes
    const MAX_ATTACHMENTS = 5;

    return await db.runTransaction(async (transaction: any) => {
      // 1. Verify parent referral exists and belongs to caller's facility
      const referralSnap = await transaction.get(referralRef);
      if (!referralSnap.exists) {
        throw new HttpsError("not-found", "Parent Rheumatology referral record was not found.");
      }

      const referralData = referralSnap.data();
      if (referralData["facilityId"] !== facilityId) {
        throw new HttpsError(
          "permission-denied",
          "Cannot reserve attachment slots for a referral originating from another healthcare facility.",
        );
      }

      const allowedStatuses = ["Pending Doctor Review", "Returned to Facility"];
      if (!allowedStatuses.includes(referralData["status"])) {
        throw new HttpsError(
          "failed-precondition",
          `Cannot add attachments while referral status is '${referralData["status"]}'. Clinical documentation is locked.`,
        );
      }

      // 2. Read finalized attachments in transaction
      const attachmentsSnap = await transaction.get(attachmentsCol);
      const finalizedIds = new Set<string>();
      attachmentsSnap.forEach((docSnap: any) => finalizedIds.add(docSnap.id));

      // 3. Read control summary doc
      const controlSnap = await transaction.get(controlRef);
      const controlData = controlSnap.exists ? controlSnap.data() : null;

      const rawReservations =
        controlData &&
        typeof controlData.reservations === "object" &&
        controlData.reservations !== null
          ? controlData.reservations
          : {};

      const now = Date.now();
      const updatedReservations: Record<string, { uid: string; reservedAt: Timestamp }> = {};

      // 4. Stale reservation recovery & reconciliation
      for (const [resId, entry] of Object.entries(rawReservations)) {
        const e = entry as { uid?: string; reservedAt?: Timestamp };
        if (!e || typeof e.uid !== "string") continue;

        // If finalized metadata already exists, NEVER remove accounting
        if (finalizedIds.has(resId)) {
          updatedReservations[resId] = {
            uid: e.uid,
            reservedAt: e.reservedAt instanceof Timestamp ? e.reservedAt : Timestamp.now(),
          };
          continue;
        }

        // Check age if not yet finalized
        let reservedAtMillis = now;
        if (e.reservedAt && typeof e.reservedAt.toMillis === "function") {
          reservedAtMillis = e.reservedAt.toMillis();
        }

        const ageMs = now - reservedAtMillis;
        if (ageMs > STALE_RESERVATION_MS) {
          // Stale reservation (> 30 mins) without finalized metadata: abandoned, recover slot!
          continue;
        }

        // Within valid 30-min window: keep in-progress reservation
        updatedReservations[resId] = {
          uid: e.uid,
          reservedAt: e.reservedAt instanceof Timestamp ? e.reservedAt : Timestamp.now(),
        };
      }

      // 5. Idempotent check for same attachmentId
      if (updatedReservations[validAttachmentId]) {
        if (updatedReservations[validAttachmentId].uid === callerUid) {
          // Already reserved by this user: return success idempotently
          const activeSet = new Set([...finalizedIds, ...Object.keys(updatedReservations)]);
          return {
            success: true,
            attachmentId: validAttachmentId,
            remainingSlots: Math.max(0, MAX_ATTACHMENTS - activeSet.size),
            message: "Attachment slot already reserved.",
          };
        } else {
          // Reserved by another user
          throw new HttpsError(
            "permission-denied",
            "Attachment ID is already reserved by another user.",
          );
        }
      }

      // 6. Calculate total active slots (finalized + valid in-progress)
      const allActiveIds = new Set([...finalizedIds, ...Object.keys(updatedReservations)]);
      if (allActiveIds.size >= MAX_ATTACHMENTS) {
        throw new HttpsError(
          "resource-exhausted",
          `Maximum limit of ${MAX_ATTACHMENTS} attachments per referral reached.`,
        );
      }

      // 7. Add new reservation
      updatedReservations[validAttachmentId] = {
        uid: callerUid,
        reservedAt: Timestamp.now(),
      };

      allActiveIds.add(validAttachmentId);
      const activeAttachmentIds = Array.from(allActiveIds);

      transaction.set(
        controlRef,
        {
          reservations: updatedReservations,
          activeAttachmentIds,
          activeCount: activeAttachmentIds.length,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      return {
        success: true,
        attachmentId: validAttachmentId,
        remainingSlots: Math.max(0, MAX_ATTACHMENTS - activeAttachmentIds.length),
        message: "Attachment slot reserved successfully.",
      };
    });
  },
);

/**
 * Backend-owned release of an in-progress or deleted attachment slot.
 */
export const releaseRheumatologyAttachmentSlot = onCall(
  { cors: true },
  async (
    request: CallableRequest<ReleaseRheumatologyAttachmentSlotRequest>,
  ): Promise<AttachmentSlotResponse> => {
    const { db } = getAdminInstances();
    const { callerUid, facilityId } = await verifyFacilityCaller(request, db);

    const data = request.data;
    if (!data) {
      throw new HttpsError("invalid-argument", "Request payload is required.");
    }

    const { validReferralId, validAttachmentId } = validateInputIds(
      data.referralDocumentId,
      data.attachmentId,
    );

    const referralRef = db.collection("rheumatology_appointments").doc(validReferralId);
    const controlRef = referralRef.collection("attachment_control").doc("summary");
    const attachmentsCol = referralRef.collection("attachments");

    return await db.runTransaction(async (transaction: any) => {
      const referralSnap = await transaction.get(referralRef);
      if (!referralSnap.exists) {
        throw new HttpsError("not-found", "Parent Rheumatology referral record was not found.");
      }

      const referralData = referralSnap.data();
      if (referralData["facilityId"] !== facilityId) {
        throw new HttpsError(
          "permission-denied",
          "Cannot release attachment slots for a referral originating from another healthcare facility.",
        );
      }

      const controlSnap = await transaction.get(controlRef);
      if (!controlSnap.exists) {
        // Nothing to release, idempotent success
        return { success: true, released: false, message: "No active reservation to release." };
      }

      const controlData = controlSnap.data();
      const rawReservations =
        controlData &&
        typeof controlData.reservations === "object" &&
        controlData.reservations !== null
          ? controlData.reservations
          : {};

      if (!rawReservations[validAttachmentId]) {
        // Not reserved or already released, idempotent success
        return { success: true, released: false, message: "Reservation already absent." };
      }

      // Verify caller ownership
      if (rawReservations[validAttachmentId].uid !== callerUid) {
        throw new HttpsError(
          "permission-denied",
          "Cannot release a reservation owned by another user.",
        );
      }

      delete rawReservations[validAttachmentId];

      // Read finalized attachments to keep activeAttachmentIds accurate
      const attachmentsSnap = await transaction.get(attachmentsCol);
      const finalizedIds = new Set<string>();
      attachmentsSnap.forEach((docSnap: any) => finalizedIds.add(docSnap.id));

      const remainingActiveIds = Array.from(
        new Set([...finalizedIds, ...Object.keys(rawReservations)]),
      );

      transaction.set(
        controlRef,
        {
          reservations: rawReservations,
          activeAttachmentIds: remainingActiveIds,
          activeCount: remainingActiveIds.length,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      return {
        success: true,
        released: true,
        remainingSlots: Math.max(0, 5 - remainingActiveIds.length),
        message: "Attachment slot released successfully.",
      };
    });
  },
);
