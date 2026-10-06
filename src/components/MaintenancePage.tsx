import React from "react";
import { Hammer } from "lucide-react";

const MaintenancePage: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-slate-200">
        <div className="mb-6 flex justify-center">
          <div className="p-4 bg-amber-50 rounded-full border border-amber-100 text-amber-600">
            <Hammer size={48} className="animate-pulse" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-slate-900 mb-2">System Maintenance</h1>
        <p className="text-slate-600 mb-0 leading-relaxed">
          We are currently performing scheduled maintenance to improve our services.
          It will be back online shortly.
        </p>
      </div>
    </div>
  );
};

export default MaintenancePage;
