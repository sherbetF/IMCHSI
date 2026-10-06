import React, { useState, useEffect, useRef } from "react";
import {
  FileText,
  Paperclip,
  Upload,
  Trash2,
  ExternalLink,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Image as ImageIcon,
  ShieldCheck,
  Plus,
} from "lucide-react";
import {
  RheumatologyAttachmentMetadata,
  ALLOWED_RHEUMATOLOGY_MIME_TYPES,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_ATTACHMENTS_PER_REFERRAL,
  formatAttachmentSize,
  subscribeToRheumatologyAttachments,
  uploadRheumatologyAttachment,
  deleteRheumatologyAttachment,
  getRheumatologyAttachmentDownloadUrl,
  RheumatologyAttachmentError,
} from "@/services/rheumatologyAttachmentsService";
import { RheumatologyStatus } from "@/services/rheumatologyService";
import { toast } from "sonner";

interface RheumatologyAttachmentsManagerProps {
  referralId: string;
  referralStatus: RheumatologyStatus;
  referralFacilityId: string;
  userFacilityId?: string;
  userRole?: string;
  isDoctor?: boolean;
  isAdmin?: boolean;
  isParamedicNurse?: boolean;
  isCompact?: boolean;
}

export function RheumatologyAttachmentsManager({
  referralId,
  referralStatus,
  referralFacilityId,
  userFacilityId,
  userRole,
  isDoctor,
  isAdmin,
  isParamedicNurse,
  isCompact = false,
}: RheumatologyAttachmentsManagerProps) {
  const [attachments, setAttachments] = useState<RheumatologyAttachmentMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isParamedic = isParamedicNurse || userRole === "paramedic_nurse";

  const isOwningFacility =
    userRole === "facility" && !!userFacilityId && userFacilityId === referralFacilityId;

  // Documents can only be added or removed while referral is in "Pending Doctor Review" or "Returned to Facility"
  const isMutableStatus =
    referralStatus === "Pending Doctor Review" || referralStatus === "Returned to Facility";

  const canManageAttachments = isOwningFacility && isMutableStatus;

  // Real-time listener for referral attachments
  useEffect(() => {
    if (isParamedic) return;

    setLoading(true);
    setErrorMessage(null);

    const unsub = subscribeToRheumatologyAttachments(
      referralId,
      (items) => {
        setAttachments(items);
        setLoading(false);
      },
      (err) => {
        console.warn("Attachments subscription warning:", err);
        setLoading(false);
        // If permission error, show user-friendly message
        if (err.message && err.message.includes("permission-denied")) {
          setErrorMessage("You do not have authorization to view attachments for this referral.");
        }
      },
    );

    return () => unsub();
  }, [referralId, isParamedic]);

  // Paramedics are strictly forbidden from viewing or querying clinical attachments
  if (isParamedic) {
    return null;
  }

  // Handle file selection and upload
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (attachments.length >= MAX_ATTACHMENTS_PER_REFERRAL) {
      toast.error(
        `Maximum limit of ${MAX_ATTACHMENTS_PER_REFERRAL} attachments per referral reached.`,
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const file = files[0];

    // Validate size (10 MB)
    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
      toast.error(
        `File "${file.name}" exceeds the 10 MB maximum limit (${formatAttachmentSize(file.size)}).`,
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // Validate MIME type
    const contentType = file.type.toLowerCase();
    if (!ALLOWED_RHEUMATOLOGY_MIME_TYPES.includes(contentType as any)) {
      toast.error(
        `File "${file.name}" format is not supported. Please upload PDF, JPEG, or PNG files only.`,
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploading(true);
    try {
      await uploadRheumatologyAttachment(referralId, file);
      toast.success(`Document "${file.name}" successfully attached.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: unknown) {
      const e = err as Error;
      console.error("Attachment upload failed:", err);
      toast.error(e.message || "Failed to upload document. Please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Handle document download / preview
  const handleViewDocument = async (attachment: RheumatologyAttachmentMetadata) => {
    setViewingId(attachment.attachmentId);
    try {
      const url = await getRheumatologyAttachmentDownloadUrl(referralId, attachment.attachmentId);
      // Open safely in new browser window/tab
      const newWindow = window.open(url, "_blank", "noopener,noreferrer");
      if (!newWindow) {
        // Fallback if popup blocker is active
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.click();
      }
    } catch (err: unknown) {
      const e = err as Error;
      console.error("Failed to view attachment:", err);
      toast.error(e.message || "Could not generate document link. You may lack permission.");
    } finally {
      setViewingId(null);
    }
  };

  // Handle document deletion
  const handleDeleteDocument = async (attachment: RheumatologyAttachmentMetadata) => {
    if (
      !window.confirm(
        `Are you sure you want to delete the clinical document "${attachment.originalFileName}"?`,
      )
    ) {
      return;
    }

    setDeletingId(attachment.attachmentId);
    try {
      await deleteRheumatologyAttachment(referralId, attachment.attachmentId);
      toast.success(`Document "${attachment.originalFileName}" removed.`);
    } catch (err: unknown) {
      const e = err as Error;
      console.error("Failed to delete attachment:", err);
      toast.error(e.message || "Failed to delete document.");
    } finally {
      setDeletingId(null);
    }
  };

  // Helper to format date safely
  const formatUploadDate = (ts: unknown): string => {
    if (!ts) return "—";
    if (
      typeof ts === "object" &&
      ts !== null &&
      "toDate" in ts &&
      typeof (ts as any).toDate === "function"
    ) {
      const d = (ts as any).toDate() as Date;
      return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    }
    return "Recently uploaded";
  };

  return (
    <div
      className={`rounded-xl border border-border bg-surface/30 p-3.5 sm:p-4 ${
        isCompact ? "text-xs" : "text-sm"
      }`}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
        <div className="flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-primary" />
          <h4 className="font-bold text-heading text-xs sm:text-sm flex items-center gap-1.5">
            Supporting Clinical Documents
            <span className="rounded-full bg-primary/10 px-2 py-0.2 text-[10px] font-bold text-primary font-mono">
              {attachments.length}/{MAX_ATTACHMENTS_PER_REFERRAL}
            </span>
          </h4>
        </div>

        {/* Upload Button for Facility */}
        {canManageAttachments && attachments.length < MAX_ATTACHMENTS_PER_REFERRAL && (
          <div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept=".pdf,image/jpeg,image/png"
              className="hidden"
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground shadow-xs hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Uploading...</span>
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" />
                  <span>Attach Document</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Notice / Guidance */}
      {canManageAttachments && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Attach referral letters, specialist summaries, or investigation reports (PDF, JPEG, PNG •
          max 10 MB each • max 5 documents).
        </p>
      )}

      {!canManageAttachments && !isMutableStatus && isOwningFacility && (
        <p className="mt-2 text-[11px] text-muted-foreground italic">
          Clinical documents are locked for modifications once doctor review has commenced.
        </p>
      )}

      {/* Error display */}
      {errorMessage && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span>Loading attached clinical documents...</span>
        </div>
      ) : attachments.length === 0 ? (
        <div className="py-4 text-center text-xs text-muted-foreground">
          <p>No supporting clinical documents attached.</p>
          {canManageAttachments && (
            <p className="mt-1 text-[11px]">
              Click &quot;Attach Document&quot; above to upload relevant lab reports or specialist
              letters.
            </p>
          )}
        </div>
      ) : (
        /* Attachments List */
        <div className="mt-3 space-y-2">
          {attachments.map((att) => {
            const isPdf =
              att.contentType === "application/pdf" || att.originalFileName.endsWith(".pdf");
            const isViewing = viewingId === att.attachmentId;
            const isDeleting = deletingId === att.attachmentId;

            return (
              <div
                key={att.attachmentId}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background px-3 py-2 transition-colors hover:bg-surface/60"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
                      isPdf
                        ? "bg-rose-100 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300"
                        : "bg-blue-100 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300"
                    }`}
                  >
                    {isPdf ? <FileText className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                  </div>

                  <div className="min-w-0">
                    <p
                      className="truncate text-xs font-semibold text-heading"
                      title={att.originalFileName}
                    >
                      {att.originalFileName}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      {formatAttachmentSize(att.size)} • {formatUploadDate(att.uploadedAt)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {/* View / Download button */}
                  <button
                    type="button"
                    disabled={isViewing || isDeleting}
                    onClick={() => handleViewDocument(att)}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-accent transition-colors disabled:opacity-50 cursor-pointer"
                    title="View / Download Document in new window"
                  >
                    {isViewing ? (
                      <Loader2 className="h-3 w-3 animate-spin text-primary" />
                    ) : (
                      <ExternalLink className="h-3 w-3 text-primary" />
                    )}
                    <span>View</span>
                  </button>

                  {/* Delete button (Owning Facility only, in mutable status) */}
                  {canManageAttachments && (
                    <button
                      type="button"
                      disabled={isDeleting || isViewing}
                      onClick={() => handleDeleteDocument(att)}
                      className="rounded-md p-1 text-muted-foreground hover:bg-rose-100 hover:text-rose-600 transition-colors disabled:opacity-50 dark:hover:bg-rose-950/50 dark:hover:text-rose-300 cursor-pointer"
                      title="Delete document attachment"
                    >
                      {isDeleting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-rose-600" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
