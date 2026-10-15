/** Helpers for seeding a composed site's header menu. */

import type { SupabaseClient } from "@supabase/supabase-js";

export type NavSeedItem = { label: string; href: string };

/** One row per destination: two roles that resolve to the same href (or label) must not repeat in the menu. */
export function dedupeNavItems(items: readonly NavSeedItem[]): NavSeedItem[] {
  const seenHref = new Set<string>();
  const seenLabel = new Set<string>();
  const out: NavSeedItem[] = [];
  for (const it of items) {
    const h = it.href.trim().toLowerCase();
    const l = it.label.trim().toLowerCase();
    if (seenHref.has(h) || seenLabel.has(l)) continue;
    seenHref.add(h);
    seenLabel.add(l);
    out.push(it);
  }
  return out;
}

/**
 * Seed the header menu once PER LOCALE (TUL-973: an EN page used to fall back to
 * the Spanish rows), deduplicated by destination (TUL-979).
 */
export async function ensureNav(admin: SupabaseClient, input: { tenantId: string; itemsByLocale: Record<string, NavSeedItem[]> }): Promise<void> {
  const { data: existing, error } = await admin.from("cms_navigation_items").select("locale").eq("tenant_id", input.tenantId).eq("zone", "header");
  if (error) return;
  const have = new Set((existing ?? []).map((r: { locale: string }) => r.locale));
  const rows = Object.entries(input.itemsByLocale)
    .filter(([loc]) => !have.has(loc))
    .flatMap(([loc, items]) =>
      dedupeNavItems(items).map((it, i) => ({ tenant_id: input.tenantId, locale: loc, zone: "header", label: it.label, href: it.href, sort_order: i, visible: true })),
    );
  if (rows.length > 0) await admin.from("cms_navigation_items").insert(rows);
}

