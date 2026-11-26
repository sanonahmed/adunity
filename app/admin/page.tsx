import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { AdminLogin } from "@/components/admin/admin-login";
import { getAdminConfig, hasAdminSession } from "@/lib/admin-auth";
import { listActivationKeys } from "@/lib/activation-key-store-postgres";
import type { ActivationKey } from "@/lib/activation-keys";
import { listBuyers } from "@/lib/market-store-postgres";
import type { BuyerRequest } from "@/lib/market";

/** Cookies + env are read per request; never cache the gate. */
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const configured = Boolean(getAdminConfig());
  if (!configured) return <AdminLogin configured={false} />;

  const authenticated = await hasAdminSession();
  if (!authenticated) return <AdminLogin configured />;

  /* Hydrate the dashboard with the current feed; client refreshes take over. */
  let initialBuyers: BuyerRequest[] | null = null;
  try {
    initialBuyers = await listBuyers("admin");
  } catch (error) {
    console.error("[admin] initial listing load failed", error);
  }

  /* Same for activation keys: a database hiccup hides the list, never the page. */
  let initialKeys: ActivationKey[] | null = null;
  try {
    initialKeys = await listActivationKeys();
  } catch (error) {
    console.error("[admin] activation key load failed", error);
  }

  return <AdminDashboard initialBuyers={initialBuyers} initialKeys={initialKeys} />;
}
