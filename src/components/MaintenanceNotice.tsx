import React from "react";
import { Wrench, Clock } from "lucide-react";

export const MaintenanceNotice: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-6 text-slate-100 select-none">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl text-center space-y-6">
        {/* Animated Wrench Icon Badge */}
        <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
          <Wrench className="w-8 h-8 animate-pulse" />
        </div>

        {/* Title & Description */}
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold tracking-wide uppercase">
            <Clock className="w-3.5 h-3.5" />
            Temporary Maintenance Notice
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">System Under Maintenance</h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            IMCHSI is currently undergoing scheduled system updates and maintenance. Access to all
            facility portals and appointment workflows is temporarily paused.
          </p>
        </div>
      </div>
    </div>
  );
};
