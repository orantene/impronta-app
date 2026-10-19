import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceRoleClient } from "@/lib/supabase/admin";

import { talentPromoTenantId } from "../public-promos.server";
import { promoStatus } from "../quote";
import { loadTenantPromos, loadUsage, type PromoRow } from "../repo";
import { toWidgetPromo } from "./model";
import { EMPTY_PROMO_WIDGET_DATA, type PromoWidgetData, type WidgetPromo } from "./types";

/**
 * The ONE read behind every promo widget on a talent's site (TUL-1051 part B).
 *
 * Owner scoped, never by tenant alone: every hub talent shares one tenant, so a
 * tenant-wide read would hand one talent's offer to all of them. The owner-aware
 * `loadTenantPromos(admin, tenantId, { talentProfileId })` returns only this
 * talent's promos; the row-level check below is a second lock on the same door.
 *
 * What comes back: LIVE promos that are not personal. Whether a block shows a
 * promo is decided later, per block, by `pickWidgetPromos` (a chosen promo, or
 * the best one the talent put on their site). A failed read degrades to "no
 * promos": a widget never breaks a page, and an empty block renders hidden.
 */
export async function loadPromoWidgetDataWith(
  admin: SupabaseClient,
  tenantId: string,
  talentProfileId: string,
  now: Date,
): Promise<PromoWidgetData> {
  const empty: PromoWidgetData = { ...EMPTY_PROMO_WIDGET_DATA, nowMs: now.getTime() };
  const loaded = await loadTenantPromos(admin, tenantId, { talentProfileId });
  if (!loaded.ok) return empty;

  const rowById = new Map<string, PromoRow>();
  for (const r of loaded.rows) {
    const owner = (r as { talent_profile_id?: string | null }).talent_profile_id;
    // Present and someone else's, or agency-wide: never this talent's widget.
    if (owner !== undefined && owner !== talentProfileId) continue;
    rowById.set(r.id, r);
  }
  const mine = loaded.promos.filter((p) => rowById.has(p.id));
  const usage = (await loadUsage(admin, mine.map((p) => p.id), null, now)) ?? {};

  const items: WidgetPromo[] = [];
  for (const promo of mine) {
    if (promoStatus(promo, now, usage[promo.id]) !== "live") continue;
    const row = rowById.get(promo.id);
    if (!row) continue;
    const item = toWidgetPromo({
      promo,
      showCountdown: row.show_countdown === true,
      showOnSite: row.show_on_site === true,
      title: row.title_i18n ?? null,
      description: row.description_i18n ?? null,
      used: usage[promo.id]?.used ?? 0,
    });
    if (item) items.push(item);
  }
  return { items, nowMs: now.getTime() };
}

/** Talent site entry point: per-request cached by profile id. */
export const loadPromoWidgetData = cache(async (talentProfileId: string | null): Promise<PromoWidgetData> => {
  const now = new Date();
  const empty: PromoWidgetData = { ...EMPTY_PROMO_WIDGET_DATA, nowMs: now.getTime() };
  if (!talentProfileId) return empty;
  const admin = createServiceRoleClient();
  if (!admin) return empty;
  try {
    const tenantId = await talentPromoTenantId(admin, talentProfileId);
    return tenantId ? await loadPromoWidgetDataWith(admin, tenantId, talentProfileId, now) : empty;
  } catch {
    return empty;
  }
});
