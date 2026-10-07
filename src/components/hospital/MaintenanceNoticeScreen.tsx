import React from "react";
import { Wrench, ShieldAlert, Clock, AlertTriangle, Building2 } from "lucide-react";

export const MaintenanceNoticeScreen: React.FC = () => {
  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-6 text-slate-100 select-none">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl space-y-6 text-center relative overflow-hidden">
        {/* Glow background accent */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold tracking-wide uppercase">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          <span>Scheduled System Maintenance</span>
        </div>

        {/* Main Icon */}
        <div className="relative inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-slate-800 border border-slate-700 text-amber-400 shadow-inner my-2">
          <Wrench className="w-10 h-10 animate-pulse" />
          <div className="absolute -bottom-1 -right-1 p-1 bg-slate-900 rounded-full border border-slate-700 text-amber-400">
            <ShieldAlert className="w-4 h-4" />
          </div>
        </div>

        {/* Title & Body Description */}
        <div className="space-y-3">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            HospitalHub Maintenance in Progress
          </h1>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-md mx-auto">
            HospitalHub is currently undergoing scheduled platform updates and security maintenance.
            All system access is temporarily suspended.
          </p>
        </div>

        {/* Details Card */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 text-left space-y-3 text-xs sm:text-sm text-slate-400">
          <div className="flex items-center gap-2 text-slate-200 font-semibold border-b border-slate-800/80 pb-2">
            <Clock className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Estimated Window & Access Notice</span>
          </div>
          <div className="space-y-1.5 text-slate-300 leading-relaxed">
            <p>
              • System features (Referrals, Appointments, Attachments & Admin tools) are offline.
            </p>
            <p>
              • User login and facility portals are temporarily locked to protect data integrity.
            </p>
          </div>
        </div>

        {/* Emergency Notice */}
        <div className="bg-amber-950/30 border border-amber-800/40 rounded-2xl p-4 flex items-start gap-3 text-left text-xs text-amber-200/90">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-amber-300 uppercase tracking-wider">
              Urgent Clinical Emergency Notice
            </p>
            <p className="leading-relaxed">
              For urgent patient transfers or critical referral inquiries during this maintenance
              period, please contact Hospital Kota Tinggi Emergency Command Desk directly.
            </p>
          </div>
        </div>

        {/* Facility Branding Footer */}
        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 font-medium">
          <div className="flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
            <span>HospitalHub • Hospital Kota Tinggi</span>
          </div>
          <span>Ref: MAINT-LOCKED</span>
        </div>
      </div>
    </div>
  );
};
