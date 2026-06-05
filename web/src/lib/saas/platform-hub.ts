import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

export type PlatformHubTenant = {
  id: string;
  slug: string;
  displayName: string;
};

let cachedHub: PlatformHubTenant | null | undefined;

/**
 * Resolve the canonical platform network hub (kind=hub, plan_tier=network).
 * Never hardcode the hub UUID in app code — use this helper.
 */
export async function getPlatformHubTenant(): Promise<PlatformHubTenant | null> {
  if (cachedHub !== undefined) return cachedHub;

  const admin = createServiceRoleClient();
  if (!admin) {
    cachedHub = null;
    return null;
  }

  const { data, error } = await admin
    .from("agencies")
    .select("id, slug, display_name")
    .eq("kind", "hub")
    .eq("plan_tier", "network")
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    logServerError("platform-hub.resolve", error);
    cachedHub = null;
    return null;
  }

  if (!data) {
    cachedHub = null;
    return null;
  }

  cachedHub = {
    id: data.id,
    slug: data.slug,
    displayName: data.display_name,
  };
  return cachedHub;
}
