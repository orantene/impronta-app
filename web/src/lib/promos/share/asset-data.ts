import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { loadUsage, PROMO_COLUMNS, rowToPromo, type PromoRow } from "@/lib/promos/repo";
import { isPersonalPromo } from "./landing-core";
import { isUuid } from "./cookies";
import { buildPromoLink, type ViaTag } from "./links";
import type { Promo } from "@/lib/promos/types";

export type ShareAssetData = {
  promo: Promo;
  row: PromoRow;
  slug: string;
  talentName: string;
  profileCode: string;
  /** `talent_profiles.talent_plan_key` of the tenant's talent (paid-only assets gate on it). */
  talentPlanKey: string | null;
  /** Spots left, when the promo has a cap. */
  spotsLeft: number | null;
  /** The shareable link with the given source tag. */
  linkFor(via: ViaTag | null): string;
};

/**
 * Data behind the share images, the card PDF and the share sheet.
 *
 * The link host is the request origin's hub URL unless `host` is a registered
 * `agency_domains` hostname (any Tulala-served host is safe to put in a QR;
 * an arbitrary string never is). Personal, draft and archived promos have no
 * public share assets.
 */
export async function loadShareAssetData(input: {
  promoId: string;
  origin: string;
  host?: string | null;
}): Promise<ShareAssetData | null> {
  if (!isUuid(input.promoId)) return null;
  const admin = createServiceRoleClient();
  if (!admin) return null;

  const { data, error } = await admin
    .from("tenant_promo_codes").select(PROMO_COLUMNS).eq("id", input.promoId).maybeSingle();
  if (error) { logServerError("promos.share/asset-load", error); return null; }
  const row = data as unknown as PromoRow | null;
  if (!row || row.is_draft || row.archived_at || !row.link_slug) return null;
  const promo = rowToPromo(row);
  if (isPersonalPromo(promo)) return null;

  const { data: roster, error: rosterErr } = await admin
    .from("agency_talent_roster").select("talent_profile_id")
    .eq("tenant_id", row.tenant_id).eq("status", "active").order("created_at", { ascending: true }).limit(1);
  if (rosterErr) { logServerError("promos.share/asset-roster", rosterErr); return null; }
  const profileId = (roster as { talent_profile_id: string }[] | null)?.[0]?.talent_profile_id;
  if (!profileId) return null;
  const { data: prof, error: profErr } = await admin
    .from("talent_profiles").select("profile_code, display_name, talent_plan_key").eq("id", profileId).maybeSingle();
  if (profErr) { logServerError("promos.share/asset-profile", profErr); return null; }
  if (!prof) return null;
  const p = prof as { profile_code: string; display_name: string | null; talent_plan_key: string | null };

  let siteOrigin: string | null = null;
  const host = input.host?.trim().toLowerCase();
  if (host && /^[a-z0-9.-]+$/.test(host)) {
    // supabase-read-unchecked-ok: a failed host check falls back to the hub link, the same as an unknown host
    const { data: d } = await admin.from("agency_domains").select("hostname").eq("hostname", host).maybeSingle();
    if (d) siteOrigin = `https://${host}`;
  }

  const usage = row.max_redemptions ? await loadUsage(admin, [row.id], null) : null;
  const spotsLeft = row.max_redemptions ? Math.max(0, row.max_redemptions - (usage?.[row.id]?.used ?? 0)) : null;
  const slug = row.link_slug;
  return {
    promo, row, slug, spotsLeft,
    talentName: (p.display_name ?? "").trim() || p.profile_code,
    profileCode: p.profile_code,
    talentPlanKey: p.talent_plan_key ?? null,
    linkFor: (via) =>
      buildPromoLink({
        origin: siteOrigin ?? input.origin, slug, via,
        profileCode: siteOrigin ? null : p.profile_code,
      }),
  };
}
