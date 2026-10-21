/**
 * TUL-1809: resolve a `/w/<slug>` storefront slug to its tenant for the PUBLIC
 * slots route.
 *
 * The route used `getTenantPortalScopeBySlug`, which is a PORTAL resolver: it
 * proves the caller has a relationship to the tenant (staff, roster, client, or
 * a host bound to it). A signed-out guest on the hub host has none, so the slug
 * resolved to null and every `/w/<slug>` offering answered 404 ("no online
 * times"); only signed-in staff saw times. A storefront is public by design
 * (the page itself renders for anyone), so the public question is only "does
 * this slug name a live workspace?". The offering must still belong to the
 * tenant and pass the guest sellable rule, both enforced by the loader.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

const NOT_PUBLIC_STATUSES: ReadonlySet<string> = new Set([
  "cancelled",
  "archived",
  "suspended",
  "restricted",
]);

export async function resolvePublicWorkspaceTenantId(
  admin: SupabaseClient,
  slug: string | null,
): Promise<string | null> {
  const normalized = (slug ?? "").trim().toLowerCase();
  if (!normalized) return null;
  const { data, error } = await admin
    .from("agencies")
    .select("id, status")
    .eq("slug", normalized)
    .limit(1)
    .maybeSingle<{ id: string; status: string | null }>();
  if (error) {
    logServerError("scheduling.resolvePublicWorkspaceTenantId", error);
    return null;
  }
  // The storefront page itself 404s a suspended workspace (suspended-workspace-gate);
  // "restricted" is refused too so slots never outlive a page that is not served.
  if (!data || NOT_PUBLIC_STATUSES.has(data.status ?? "")) return null;
  return data.id;
}
