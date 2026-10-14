import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { pickTalentTenant } from "@/lib/saas/talent-self-tenant";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import { isAdvertisable, type DisplayPriceContext } from "./display-price";
import { promoStatus } from "./quote";
import { loadTenantPromos, loadUsage, type PromoRow } from "./repo";
import type { Promo, UsageMap } from "./types";

/**
 * The promos a talent's public site and hub profile may show: LIVE, auto,
 * not personal, and toggled "Show on my site". Read once per request.
 * A failed read degrades to "no promos" so a price never breaks a page.
 */

export type PublicPromo = {
  promo: Promo;
  showCountdown: boolean;
  title: Readonly<Record<string, string>> | null;
};

export type PublicPromos = {
  promos: readonly Promo[];
  usage: UsageMap;
  banners: readonly PublicPromo[];
  now: string;
};

export const EMPTY_PUBLIC_PROMOS: PublicPromos = { promos: [], usage: {}, banners: [], now: new Date(0).toISOString() };

/** Pure core, injectable for tests. */
export async function loadPublicPromosWith(
  admin: SupabaseClient,
  tenantId: string,
  now: Date,
): Promise<PublicPromos> {
  const loaded = await loadTenantPromos(admin, tenantId);
  if (!loaded.ok) return { ...EMPTY_PUBLIC_PROMOS, now: now.toISOString() };
  const rowById = new Map<string, PromoRow>(loaded.rows.map((r) => [r.id, r]));
  const candidates = loaded.promos.filter((p) => isAdvertisable(p) && rowById.get(p.id)?.show_on_site === true);
  const usage = (await loadUsage(admin, candidates.map((p) => p.id), null, now)) ?? {};
  const live = candidates.filter((p) => promoStatus(p, now, usage[p.id]) === "live");
  return {
    promos: live,
    usage,
    banners: live.map((p) => ({
      promo: p,
      showCountdown: rowById.get(p.id)?.show_countdown === true,
      title: rowById.get(p.id)?.title_i18n ?? null,
    })),
    now: now.toISOString(),
  };
}

/** Per-request cached: the service page, related links and hub share one read. */
export const loadPublicPromos = cache(async (tenantId: string | null): Promise<PublicPromos> => {
  const now = new Date();
  if (!tenantId) return { ...EMPTY_PUBLIC_PROMOS, now: now.toISOString() };
  const admin = createServiceRoleClient();
  if (!admin) return { ...EMPTY_PUBLIC_PROMOS, now: now.toISOString() };
  try {
    return await loadPublicPromosWith(admin, tenantId, now);
  } catch {
    return { ...EMPTY_PUBLIC_PROMOS, now: now.toISOString() };
  }
});

/** The talent's promo tenant, resolved the way the share kit does (oldest active roster row). */
export async function talentPromoTenantId(admin: SupabaseClient, talentProfileId: string): Promise<string | null> {
  const { data, error } = await admin
    .from("agency_talent_roster")
    .select("tenant_id")
    .eq("talent_profile_id", talentProfileId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) {
    logServerError("promos.public/tenant", error);
    return null;
  }
  return pickTalentTenant({
    scopeTenantId: null,
    rosterTenantIds: ((data ?? []) as { tenant_id: string }[]).map((r) => r.tenant_id),
  });
}

/** Talent site + hub profile entry point: per-request cached by profile id. */
export const loadPublicPromosForTalent = cache(async (talentProfileId: string | null): Promise<PublicPromos> => {
  const now = new Date();
  const empty = { ...EMPTY_PUBLIC_PROMOS, now: now.toISOString() };
  if (!talentProfileId) return empty;
  const admin = createServiceRoleClient();
  if (!admin) return empty;
  try {
    const tenantId = await talentPromoTenantId(admin, talentProfileId);
    return tenantId ? await loadPublicPromosWith(admin, tenantId, now) : empty;
  } catch {
    return empty;
  }
});

export function priceContext(p: PublicPromos, locale: string): DisplayPriceContext {
  return { promos: p.promos, usage: p.usage, now: p.now, locale };
}
