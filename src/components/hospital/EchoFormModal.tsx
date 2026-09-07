import React from "react";
import { X, FileText, Download } from "lucide-react";
import { AppointmentRecord } from "../../services/firebaseAppointments";
import { downloadEchoPDFForm, generateEchoFormHTML } from "../../utils/echoFormGenerator";

interface EchoFormModalProps {
  request: AppointmentRecord;
  onClose: () => void;
}

export function EchoFormModal({ request, onClose }: EchoFormModalProps) {
  const htmlContent = generateEchoFormHTML(request);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative flex flex-col w-full max-w-4xl max-h-[92vh] rounded-2xl border border-border bg-background shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-5 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-heading">
                {request.procedureType?.includes("Stress Test")
                  ? "Exercise Stress Test Request Form"
                  : request.procedureType?.includes("Holter")
                    ? "24 Hours Holter Monitoring Request Form"
                    : "Echocardiogram Request Form"}
              </h3>
              <p className="text-xs text-muted-foreground">
                Patient:{" "}
                <span className="font-semibold text-foreground">{request.patientName}</span> (
                {request.mrn})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => downloadEchoPDFForm(request)}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
            >
              <Download className="h-4 w-4" />
              <span>Download PDF</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-2 text-muted-foreground hover:bg-muted/20 hover:text-foreground transition-colors ml-1"
              title="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Modal Body / Document Paper View */}
        <div className="flex-1 overflow-auto bg-neutral-200/60 dark:bg-neutral-900/80 p-4 sm:p-8 flex justify-center">
          <div className="w-full max-w-[210mm] bg-white text-black shadow-xl rounded-sm min-h-[297mm] p-6 sm:p-10 border border-neutral-300">
            <iframe
              srcDoc={htmlContent}
              title={`${request.procedureType || "Request"} Form Preview`}
              className="w-full h-[720px] sm:h-[800px] border-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
