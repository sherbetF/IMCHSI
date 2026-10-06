import React, { useState, useEffect } from "react";
import { auth } from "@/lib/firebase";
import { toast } from "sonner";
import { Search, AlertTriangle, CheckCircle2, XCircle, RefreshCw, X, Check } from "lucide-react";

export const FacilityAccountManager: React.FC = () => {
  const [facilities, setFacilities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [resetFac, setResetFac] = useState<any | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  useEffect(() => {
    fetchFacilities();
  }, []);

  const fetchFacilities = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;
      const idToken = await user.getIdToken();
      const response = await fetch("/api/admin/facility-accounts", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!response.ok) throw new Error("Failed to fetch");
      const data = await response.json();
      setFacilities(data);
    } catch (err) {
      toast.error("Failed to load facility accounts");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (newPassword.length < 12) {
      toast.error("Password must be at least 12 characters");
      return;
    }

    setResetLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("No user");
      const idToken = await user.getIdToken();
      const response = await fetch("/api/admin/reset-facility-password", {
        method: "POST",
        headers: { 
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ facilityId: resetFac.facilityId, newPassword }),
      });
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }
      toast.success("Password reset successfully.");
      setResetFac(null);
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast.error(`Reset failed: ${err.message}`);
    } finally {
      setResetLoading(false);
    }
  };

  const filtered = facilities.filter((f) => {
    const matchSearch =
      f.facilityName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.facilityId.toLowerCase().includes(searchQuery.toLowerCase());
    const matchCat = categoryFilter === "All" || f.category === categoryFilter;
    return matchSearch && matchCat;
  });

  if (loading) return <div>Loading...</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Facility Accounts</h2>
      </div>

      <div className="flex gap-4">
        <input
          placeholder="Search facility name or ID..."
          className="border p-2 rounded"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="border p-2 rounded"
        >
          <option value="All">All Categories</option>
          <option value="Hospital">Hospital</option>
          <option value="Klinik Kesihatan">Klinik Kesihatan</option>
          <option value="Klinik Desa">Klinik Desa</option>
        </select>
      </div>

      <table className="w-full border-collapse border">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-2 text-left">Name</th>
            <th className="border p-2 text-left">Category</th>
            <th className="border p-2 text-left">Facility ID</th>
            <th className="border p-2 text-left">Status</th>
            <th className="border p-2 text-left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((f) => (
            <tr key={f.facilityId} className="border-b">
              <td className="border p-2">{f.facilityName}</td>
              <td className="border p-2">{f.category}</td>
              <td className="border p-2">{f.facilityId}</td>
              <td className="border p-2 font-bold">{f.status.state}</td>
              <td className="border p-2">
                {f.status.state === "EXISTS_ACTIVE" ? (
                  <button
                    onClick={() => setResetFac(f)}
                    className="flex items-center gap-1 text-primary hover:text-primary/80 font-bold text-xs"
                  >
                    <RefreshCw className="h-3 w-3" /> Reset Password
                  </button>
                ) : (
                  <span className="text-muted-foreground text-xs italic">Unavailable</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {resetFac && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-lg max-w-sm w-full space-y-4">
            <h3 className="font-bold text-lg">Reset Password: {resetFac.facilityName}</h3>
            <p className="text-xs text-muted-foreground">Facility ID: {resetFac.facilityId}</p>
            <input
              type="password"
              placeholder="New Password (min 12 chars)"
              className="w-full border p-2 rounded"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <input
              type="password"
              placeholder="Confirm New Password"
              className="w-full border p-2 rounded"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setResetFac(null); setNewPassword(""); setConfirmPassword(""); }}
                className="px-4 py-2 text-sm border rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleReset}
                disabled={resetLoading}
                className="px-4 py-2 text-sm bg-primary text-white rounded disabled:opacity-50"
              >
                {resetLoading ? "Resetting..." : "Confirm Reset"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
