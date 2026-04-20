/**
 * Phase 5 / M2 — cached public + uncached staff reads for navigation.
 *
 * `loadPublicNavigationMenu` — storefront read, cached with tenant-scoped
 * tag `tenant:${id}:navigation`. Returns the PUBLISHED snapshot or `null`
 * if the tenant has never published a menu for that (zone, locale).
 *
 * `loadDraftNavigationItems` — admin editor read, uncached, scoped to the
 * caller's staff Supabase client (RLS is_staff_of_tenant).
 *
 * Both functions accept `tenantId` explicitly so they can be called from
 * non-request contexts (tests, GC jobs) without relying on `headers()`.
 */

import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { tagFor } from "@/lib/site-admin";
import type { Locale } from "@/lib/site-admin/locales";

import type { NavItemRow, NavMenuRow } from "./navigation";
import type { NavZone } from "@/lib/site-admin/forms/navigation";

const ITEM_COLUMNS = `
  id,
  tenant_id,
  zone,
  locale,
  parent_id,
  label,
  href,
  sort_order,
  visible,
  version,
  created_at,
  updated_at
`;

const MENU_COLUMNS = `
  id,
  tenant_id,
  zone,
  locale,
  tree_json,
  version,
  published_at,
  published_by,
  created_at,
  updated_at
`;

/**
 * Cached storefront read of a published navigation menu. Returns `null`
 * when no row exists or when the row has not been published yet (publish
 * policy requires `published_at IS NOT NULL`).
 */
export function loadPublicNavigationMenu(
  tenantId: string,
  zone: NavZone,
  locale: Locale,
): Promise<NavMenuRow | null> {
  if (!tenantId) return Promise.resolve(null);

  return unstable_cache(
    async (): Promise<NavMenuRow | null> => {
      const supabase = createPublicSupabaseClient();
      if (!supabase) return null;
      const { data, error } = await supabase
        .rpc("cms_public_navigation_menu_for_tenant", {
          p_tenant_id: tenantId,
          p_zone: zone,
          p_locale: locale,
        })
        .maybeSingle<NavMenuRow>();
      if (error) {
        console.warn("[site-admin/navigation-reads] public menu load failed", {
          tenantId,
          zone,
          locale,
          error: error.message,
        });
        return null;
      }
      return data ?? null;
    },
    ["site-admin:navigation:public", tenantId, zone, locale],
    { tags: [tagFor(tenantId, "navigation")] },
  )();
}

/**
 * Uncached staff read of the DRAFT item set for a (tenant, zone, locale).
 * Ordered by `sort_order` so the caller can feed it straight into
 * `buildTreeFromRows` or render an editable list.
 */
export async function loadDraftNavigationItems(
  supabase: SupabaseClient,
  tenantId: string,
  zone: NavZone,
  locale: Locale,
): Promise<NavItemRow[]> {
  const { data, error } = await supabase
    .from("cms_navigation_items")
    .select(ITEM_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("zone", zone)
    .eq("locale", locale)
    .order("sort_order", { ascending: true });
  if (error) {
    console.warn("[site-admin/navigation-reads] staff draft load failed", {
      tenantId,
      zone,
      locale,
      error: error.message,
    });
    return [];
  }
  return (data ?? []) as NavItemRow[];
}

/**
 * Uncached staff read of the current menu row (version, published_at, etc.).
 * Useful for the admin editor to render "last published" metadata and to
 * seed `expectedMenuVersion` on the publish form.
 */
export async function loadMenuForStaff(
  supabase: SupabaseClient,
  tenantId: string,
  zone: NavZone,
  locale: Locale,
): Promise<NavMenuRow | null> {
  const { data, error } = await supabase
    .from("cms_navigation_menus")
    .select(MENU_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("zone", zone)
    .eq("locale", locale)
    .maybeSingle<NavMenuRow>();
  if (error) {
    console.warn("[site-admin/navigation-reads] staff menu load failed", {
      tenantId,
      zone,
      locale,
      error: error.message,
    });
    return null;
  }
  return data ?? null;
}
