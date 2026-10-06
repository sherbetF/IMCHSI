import { createFileRoute, redirect } from "@tanstack/react-router";
import { FacilityAccountManager } from "@/components/admin/FacilityAccountManager";
import { auth } from "@/lib/firebase";

export const Route = createFileRoute("/admin-facilities")({
  beforeLoad: async () => {
    // Basic client-side check, security boundary is on server
    const user = auth.currentUser;
    if (!user) {
      throw redirect({ to: "/" });
    }
  },
  component: FacilityAccountManager,
});
