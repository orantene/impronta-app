import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { resolveCardDesign } from "@/lib/site-admin/server/card-design-resolver";

import { displayPrice, isAdvertisable } from "./display-price";
import { promoStatus } from "./quote";
import { PROMO_COLUMNS, rowToPromo, type PromoRow } from "./repo";
import type { TalentPromoBadge } from "./talent-promo-badge";
import { shouldShowTalentPromoBadges } from "./talent-promo-badge";

/**
 * Directory-card promo badges (TUL-1051 part C).
 *
 * ONE query for a whole page of cards, filtered by owner (`talent_profile_id`
 * IN ...): a talent's badge comes only from that talent's OWN promos, never
 * from the tenant's other promos and never from another talent's. The row is
 * checked again in code (second lock on the same door). A failed read degrades
 * to "no badges": a card never breaks over a promo.
 *
 * What may badge: live, auto, not personal, "show on my site", percent or
 * free-gift offers with no use cap. Fixed-amount offers have no honest "-N%"
 * for a whole card, and a capped offer would need a usage read (a second
 * query), so both are left off the card rather than shown wrong.
 */

type OwnedPromoRow = PromoRow & { talent_profile_id: string | null };

/** Directory pages are at most 48 cards; the cap keeps the IN list bounded. */
export const PROMO_BADGE_ID_CAP = 100;

/** A reference price that makes "N% off" exact: the badge never depends on a real price. */
const REFERENCE_LIST_CENTS = 100_000;

function titleLine(row: PromoRow, locale: string): string | null {
  const t = row.title_i18n;
  if (!t) return null;
  const pick = t[locale] ?? t.es ?? t.en ?? Object.values(t)[0];
  const line = typeof pick === "string" ? pick.trim() : "";
  return line ? line.slice(0, 48) : null;
}

export async function loadTalentPromoBadges(
  admin: SupabaseClient,
  talentProfileIds: readonly string[],
  now: Date,
  locale = "en",
): Promise<Map<string, TalentPromoBadge>> {
  const out = new Map<string, TalentPromoBadge>();
  const ids = [...new Set(talentProfileIds.filter(Boolean))].slice(0, PROMO_BADGE_ID_CAP);
  if (ids.length === 0) return out;

  const { data, error } = await admin
    .from("tenant_promo_codes")
    .select(`${PROMO_COLUMNS}, talent_profile_id`)
    .in("talent_profile_id", ids)
    .eq("show_on_site", true);
  if (error) {
    logServerError("promos.directory-badges/load", error);
    return out;
  }

  const wanted = new Set(ids);
  const best = new Map<string, { score: number; badge: TalentPromoBadge }>();
  for (const row of (data ?? []) as unknown as OwnedPromoRow[]) {
    const owner = row.talent_profile_id;
    if (!owner || !wanted.has(owner)) continue; // agency-wide, or someone else's
    const promo = rowToPromo(row);
    if (!isAdvertisable(promo)) continue;
    if (promo.offer_kind !== "percent" && promo.offer_kind !== "free_addon") continue;
    if (promo.max_uses != null) continue;
    if (promoStatus(promo, now) !== "live") continue;
    const shown = displayPrice(
      { id: "badge", list_cents: REFERENCE_LIST_CENTS, currency: promo.currency },
      { promos: [promo], now, locale },
    );
    if (!shown.hasPromo || !shown.badge) continue;
    const score = shown.badge.kind === "percent" ? shown.badge.percent : 0;
    const prev = best.get(owner);
    if (prev && (prev.score > score || (prev.score === score && prev.badge.promoId <= promo.id))) continue;
    best.set(owner, { score, badge: { label: shown.badge.label, line: titleLine(row, locale), promoId: promo.id } });
  }
  for (const [id, v] of best) out.set(id, v.badge);
  return out;
}

/**
 * Set `promoBadge` on the cards of one directory page when the surface allows
 * it: always on the hub (no tenant scope), only on agency hosts that opted in
 * through Card Design. The opt-in is read lazily so the hub pays nothing.
 */
export async function attachTalentPromoBadges(
  items: Array<{ id: string; promoBadge?: TalentPromoBadge | null }>,
  opts: {
    tenantScopeId: string | null;
    locale: string;
    now?: Date;
    admin?: SupabaseClient | null;
    agencyOptIn?: (tenantId: string) => Promise<boolean>;
  },
): Promise<void> {
  if (items.length === 0) return;
  try {
    const optIn =
      opts.tenantScopeId === null
        ? false
        : await (opts.agencyOptIn ?? agencyOptsIntoPromoBadges)(opts.tenantScopeId);
    if (!shouldShowTalentPromoBadges({ tenantScopeId: opts.tenantScopeId, agencyOptIn: optIn })) return;
    const admin = opts.admin === undefined ? createServiceRoleClient() : opts.admin;
    if (!admin) return;
    const badges = await loadTalentPromoBadges(admin, items.map((i) => i.id), opts.now ?? new Date(), opts.locale);
    for (const item of items) {
      const b = badges.get(item.id);
      if (b) item.promoBadge = b;
    }
  } catch (e) {
    logServerError("promos.directory-badges/attach", e);
  }
}

/** The agency's Card Design switch; only an explicit "on" opts in. */
export async function agencyOptsIntoPromoBadges(tenantId: string): Promise<boolean> {
  const design = await resolveCardDesign(tenantId);
  return design.showTalentPromoBadges === "on";
}
