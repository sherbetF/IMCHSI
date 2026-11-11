/**
 * Firebase Cloud Functions for HospitalHub
 *
 * Provides trusted backend callables for administrative facility and staff account
 * management, password resets, report downloads, and report replacement operations.
 *
 * NOTE: The three legacy onDocumentWritten authorization mirror triggers
 * (onUserDocumentWrittenSyncMirror, onOutsourceAppointmentWrittenSyncMirror,
 * onRheumatologyAppointmentWrittenSyncMirror) have been retired to prevent
 * stripped mirror payloads from overwriting full documents in (default).
 */

export { changeFacilityPassword } from "./changeFacilityPassword.js";
export { listFacilityAccounts } from "./listFacilityAccounts.js";
export { listManagedAccounts } from "./listManagedAccounts.js";
export { createManagedAccount } from "./createManagedAccount.js";
export { resetManagedAccountPassword } from "./resetManagedAccountPassword.js";
export { setManagedAccountActiveStatus } from "./setManagedAccountActiveStatus.js";
export {
  authorizePatientReportDownload,
  getReportDownloadSignedUrl,
  getRheumatologyAttachmentDownloadSignedUrl,
} from "./authorizePatientReportDownload.js";
export { replaceReportFile } from "./replaceReportFile.js";
export {
  reserveRheumatologyAttachmentSlot,
  releaseRheumatologyAttachmentSlot,
} from "./rheumatologyAttachmentReservation.js";
export { syncUserAuthorizationMirror } from "./syncAuthorizationMirror.js";
