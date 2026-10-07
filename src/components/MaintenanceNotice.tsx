import React from "react";
import { Wrench } from "lucide-react";

export const MaintenanceNotice: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-slate-100 select-none">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
          <Wrench className="w-6 h-6 animate-pulse" />
        </div>
        <h1 className="text-xl font-semibold text-white">System Under Maintenance</h1>
        <p className="text-sm text-slate-400 leading-relaxed">
          The system is currently undergoing scheduled maintenance and will be back online shortly.
        </p>
      </div>
    </div>
  );
};
