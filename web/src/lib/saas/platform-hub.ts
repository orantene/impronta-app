import "server-only";

import { cache } from "react";

import { createServiceRoleClient } from "@/lib/supabase/admin";

export type PlatformHubTenant = {
  tenantId: string;
  slug: string;
  displayName: string;
};

/**
 * Resolves the platform's default network hub (kind='hub' + plan_tier='network').
 *
 * The marketing apex (tulala.digital) has no tenant of its own, but it IS the
 * public face of the in-house Tulala hub. Surfaces that need a tenant on the
 * platform — e.g. the guest-chat launcher routing a "message the platform"
 * inquiry — resolve it here. Read with the service-role client because the
 * anon caller can't see another tenant's `agencies` row. Request-cached.
 *
 * Returns null when no network hub exists, so callers degrade to rendering
 * nothing rather than crashing.
 */
export const getPlatformHubTenant = cache(
  async (): Promise<PlatformHubTenant | null> => {
    const admin = createServiceRoleClient();
    if (!admin) return null;
    const { data } = await admin
      .from("agencies")
      .select("id, slug, display_name")
      .eq("kind", "hub")
      .eq("plan_tier", "network")
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    const row = data as { id: string; slug: string; display_name: string | null };
    return {
      tenantId: row.id,
      slug: row.slug,
      displayName: row.display_name?.trim() || "Tulala",
    };
  },
);
