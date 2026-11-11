import React from "react";

export const MaintenanceNoticeScreen: React.FC = () => {
  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-6 text-slate-100 select-none">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-8 sm:p-12 shadow-2xl text-center space-y-6">

        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          🔧 WEBSITE UNDER MAINTENANCE
        </h1>

        <div className="space-y-4 text-sm sm:text-base text-slate-300 leading-relaxed">
          <p>
            We are currently upgrading our system to serve you better.
          </p>

          <p>
            Our website will be temporarily unavailable during this period.
          </p>

          <p>
            We apologise for the inconvenience. Please check back soon.
          </p>
        </div>

        <p className="text-white font-bold pt-2">
          Thank you for your patience.
        </p>

      </div>
    </div>
  );
};
