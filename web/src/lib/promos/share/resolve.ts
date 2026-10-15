import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { pickTalentTenant } from "@/lib/saas/talent-self-tenant";
import { resolveTalentProfileCodeQuiet } from "@/lib/talent/profile-code-resolve.server";
import { loadTenantPromos, loadUsage, type PromoRow } from "@/lib/promos/repo";
import { promoStatus } from "@/lib/promos/quote";
import type { Promo } from "@/lib/promos/types";
import { classifyLanding, landingTarget, type Landing, type LandingTarget } from "./landing-core";
import { isValidPromoSlug } from "./links";
import { promoLinkSecret, verifyPersonalToken } from "./token";

/**
 * The one resolver for `/p/<slug>` (site) and `/t/<code>/p/<slug>` (hub).
 * host|profileCode + slug (+ token) -> promo + landing target.
 */
export type PromoScope =
  | { kind: "profile"; profileId: string }
  | { kind: "code"; profileCode: string };

export type PromoLinkResult = {
  landing: Landing;
  /** null for gone / personal_locked: those pages must show nothing about the promo. */
  promo: Promo | null;
  row: PromoRow | null;
  target: LandingTarget;
  talent: { profileId: string; profileCode: string; displayName: string } | null;
  /** Live, public, on-site promos to offer when this one is over. */
  alternatives: { promo: Promo; row: PromoRow }[];
  tokenOk: boolean;
};

const EMPTY_LANDING = classifyLanding({ promo: null, now: new Date(0), tokenOk: false });

export const UNAVAILABLE: PromoLinkResult = {
  landing: EMPTY_LANDING,
  promo: null,
  row: null,
  target: { kind: "home" },
  talent: null,
  alternatives: [],
  tokenOk: false,
};

export async function resolvePromoLink(
  scope: PromoScope,
  slug: string,
  token?: string | null,
  now: Date = new Date(),
): Promise<PromoLinkResult> {
  if (!isValidPromoSlug(slug)) return UNAVAILABLE;
  if (scope.kind === "profile" && !scope.profileId) return UNAVAILABLE;
  const admin = createServiceRoleClient();
  if (!admin) return UNAVAILABLE;

  let profileId: string;
  if (scope.kind === "profile") profileId = scope.profileId;
  else {
    const r = await resolveTalentProfileCodeQuiet(scope.profileCode);
    if (!r) return UNAVAILABLE;
    profileId = r.profileId;
  }

  const [{ data: prof, error: profErr }, { data: roster, error: rosterErr }] = await Promise.all([
    admin.from("talent_profiles").select("id, profile_code, display_name").eq("id", profileId).maybeSingle(),
    admin.from("agency_talent_roster").select("tenant_id").eq("talent_profile_id", profileId)
      .eq("status", "active").order("created_at", { ascending: true }),
  ]);
  if (profErr || rosterErr || !prof) {
    if (profErr || rosterErr) logServerError("promos.share/resolve-profile", profErr ?? rosterErr);
    return UNAVAILABLE;
  }
  const tenantId = pickTalentTenant({
    scopeTenantId: null,
    rosterTenantIds: ((roster ?? []) as { tenant_id: string }[]).map((r) => r.tenant_id),
  });
  if (!tenantId) return UNAVAILABLE;

  const loaded = await loadTenantPromos(admin, tenantId);
  if (!loaded.ok) return UNAVAILABLE;
  const talent = {
    profileId,
    profileCode: String((prof as { profile_code: string }).profile_code),
    displayName: String((prof as { display_name: string | null }).display_name ?? "").trim(),
  };

  const idx = loaded.rows.findIndex((r) => r.link_slug === slug);
  const row = idx >= 0 ? loaded.rows[idx]! : null;
  const promo = idx >= 0 ? loaded.promos[idx]! : null;
  const personal = promo ? promo.audience === "one_client" || !!promo.customer_id : false;
  const tokenOk = promo && personal ? await verifyPersonalToken(token, promoLinkSecret(), promo.id) : !personal;

  const usage = promo ? await loadUsage(admin, [promo.id], null, now) : null;
  const landing = classifyLanding({ promo, usage: promo ? usage?.[promo.id] ?? null : null, now, tokenOk });

  const hidden = landing.state === "gone" || landing.state === "personal_locked";
  const alternatives: PromoLinkResult["alternatives"] = [];
  if (landing.state !== "live") {
    for (let i = 0; i < loaded.rows.length && alternatives.length < 2; i += 1) {
      const p = loaded.promos[i]!;
      const r = loaded.rows[i]!;
      if (p.id === promo?.id || !r.show_on_site || p.unlock !== "auto" || p.audience !== "public") continue;
      if (promoStatus(p, now) === "live") alternatives.push({ promo: p, row: r });
    }
  }

  return {
    landing,
    promo: hidden ? null : promo,
    row: hidden ? null : row,
    target: promo && !hidden ? landingTarget(promo) : { kind: "home" },
    talent,
    alternatives,
    tokenOk,
  };
}
