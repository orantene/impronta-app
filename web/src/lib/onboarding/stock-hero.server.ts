import "server-only";

/**
 * DS-60 · IO half of `stock-hero.ts`. After the onboarding build published the
 * talent's site, fill an EMPTY hero with a platform-stock photo for her type
 * and publish that one change. Best effort: every failure is logged and the
 * build goes on (a stock-less hero is the state it was in before this ran).
 *
 *   own photo?   any non-deleted `media_assets` row she owns → nothing happens
 *   hero slot    the "Hero photo" image of the draft HOME page (`talent_pages.blocks`)
 *   writer       `writeSiteDraft` (the same atomic draft writer the builder
 *                uses, CAS on `draft_rev`), then `publishMaxSiteAction`
 *   pool         `queryLifestyleStockForType` (platform_stock_images, tenant `tulala`)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { queryLifestyleStockForType } from "@/lib/media/platform-stock";
import { logServerError } from "@/lib/server/safe-error";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { writeSiteDraft } from "@/lib/talent-site/history/writer";
import { publishMaxSiteAction } from "@/lib/talent-site/server/site-management-actions";

import { planStockHero, primaryTypeOf, stockQueryForTalentType, withStockHero, type StockHeroSkip, type TalentTypeRow } from "./stock-hero";

export type StockHeroOutcome = { changed: false; reason: StockHeroSkip | "error" } | { changed: true; level: string };

async function fillDraftHero(admin: SupabaseClient, talentProfileId: string, locale: "en" | "es"): Promise<StockHeroOutcome> {
  // Fail closed: if we cannot tell she has a photo, we do not put a stranger's picture on her page.
  const { data: own, error: ownErr } = await admin.from("media_assets").select("id").eq("owner_talent_profile_id", talentProfileId).is("deleted_at", null).limit(1);
  if (ownErr) {
    logServerError("onboarding.stockHero.ownPhoto", ownErr);
    return { changed: false, reason: "error" };
  }
  if ((own ?? []).length > 0) return { changed: false, reason: "owner_photo" };

  const [siteRes, pageRes, typeRes] = await Promise.all([
    admin.from("talent_sites").select("id, draft_rev").eq("talent_profile_id", talentProfileId).maybeSingle(),
    admin.from("talent_pages").select("blocks").eq("talent_profile_id", talentProfileId).eq("is_home", true).maybeSingle(),
    admin.from("talent_profile_taxonomy").select("is_primary, display_order, taxonomy_terms ( kind, slug, name_i18n )").eq("talent_profile_id", talentProfileId),
  ]);
  const failed = siteRes.error ?? pageRes.error ?? typeRes.error;
  if (failed) {
    logServerError("onboarding.stockHero.read", failed);
    return { changed: false, reason: "error" };
  }
  const site = siteRes.data as { id: string; draft_rev: number | null } | null;
  const blocks = (pageRes.data as { blocks?: unknown } | null)?.blocks;
  if (!site || !Array.isArray(blocks)) return { changed: false, reason: "no_hero_slot" };
  const homeTree = blocks as BuilderNode[];

  const query = stockQueryForTalentType(primaryTypeOf(typeRes.data as unknown as TalentTypeRow[] | null));
  const photos = await queryLifestyleStockForType(admin, { businessType: query.businessType, family: query.family });
  const plan = planStockHero({ hasOwnPhoto: false, homeTree, photos, query });
  if (plan.action === "skip") return { changed: false, reason: plan.reason };

  const res = await writeSiteDraft(admin, {
    siteId: site.id,
    expectedDraftRev: typeof site.draft_rev === "number" ? site.draft_rev : null,
    pages: [{ home: true, patch: { blocks: withStockHero(homeTree, plan.nodeId, plan.pick, locale) } }],
    history: {
      kind: "edit",
      actor: "system",
      summaryEn: "Added a placeholder hero photo",
      summaryEs: "Se agregó una foto de portada de ejemplo",
    },
  });
  if (!res.ok) {
    logServerError("onboarding.stockHero.write", new Error(`${res.code}: ${res.error}`));
    return { changed: false, reason: "error" };
  }
  return { changed: true, level: plan.pick.level };
}

/** Fill the empty hero and publish it. Never throws; returns what happened for the log. */
export async function ensureStockHero(admin: SupabaseClient, input: { talentProfileId: string; locale: "en" | "es" }): Promise<StockHeroOutcome> {
  try {
    const filled = await fillDraftHero(admin, input.talentProfileId, input.locale);
    if (!filled.changed) return filled;
    const published = await publishMaxSiteAction();
    if (!published.ok) {
      logServerError("onboarding.stockHero.publish", new Error(published.error));
      return { changed: false, reason: "error" };
    }
    return filled;
  } catch (err) {
    logServerError("onboarding.stockHero", err);
    return { changed: false, reason: "error" };
  }
}
