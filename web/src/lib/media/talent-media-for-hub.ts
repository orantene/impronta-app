import "server-only";

/**
 * talent-media-for-hub.ts — phase 2 of
 * `web/docs/media-ownership-and-brand-library-plan-2026-08-10.md` (§P3, §7).
 *
 * WHAT
 * ────
 * ONE resolver that answers "which photos represent this talent on THIS hub?".
 * Per the plan, per-hub presentation is a SELECTION, not a copy:
 *
 *   resolveTalentMediaForHub(tenantId | null, talentProfileIds):
 *     1. this tenant's curation — `agency_talent_overlays.cover_media_asset_id`
 *        then `agency_talent_media` rows (ordered, visible-only)
 *     2. else today's global rank (card → hero → public_watermarked → gallery
 *        → original) via `loadTalentCardThumbs`
 *
 * `tenantId === null` means the master surface (Tulala Digital / global
 * Discover): no hub curation applies, so step 2 answers alone.
 *
 * TWO-KEY RULE IS **NOT** ENFORCED HERE. Phase 3 adds `media_grants` and the
 * owner/subject predicate. Phase 2 deliberately keeps today's defaults so this
 * slice can ship without changing who can see what.
 *
 * KIND-AGNOSTIC
 * ─────────────
 * `tenantId` is opaque. This module never asks whether the org is an agency or
 * a hub (the M1 gate in `src/lib/saas/tenant-isolation.test.ts`): a hub that
 * curates a face gets the curated face, exactly like an agency.
 *
 * FLAGGED
 * ───────
 * Everything past the flag check is inert unless `MEDIA_PER_HUB_FACES_ENABLED`
 * is "1"/"true". With the flag OFF, `resolveTalentCardThumbsForHub` delegates
 * straight to `loadTalentCardThumbs` and returns a byte-identical Map — the
 * ~13 card call-sites can be swapped with zero visible change, then the flag
 * flipped after visual QA (the Card-Design cache lesson: verify with cold
 * keys, since card surfaces sit behind tenant-keyed `unstable_cache` layers).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  loadTalentCardThumbs,
  mediaPublicUrl,
} from "@/app/(workspace)/[tenantSlug]/_data-bridge/talent-card-thumbs";
import { tagFor } from "@/lib/site-admin/cache-tags";

/** Opaque tenant id, or `null` for the master (non-hub) surface. */
export type HubTenantId = string | null;

/** Env flag — default OFF. Only "1" / "true" turns per-hub faces on. */
export function isPerHubFacesEnabled(): boolean {
  const raw = process.env.MEDIA_PER_HUB_FACES_ENABLED;
  return raw === "1" || raw === "true";
}

/**
 * Cache tag for a (tenant, talent) media selection. ANY cache that memoizes a
 * per-hub face MUST key on this, never on the talent alone — a talent-only key
 * would serve Impronta's curated cover on every other hub (the exact class of
 * bug the `resolveCardDesign` cache produced). Curation writes bust it.
 */
export function hubTalentMediaTag(tenantId: string, talentProfileId: string): string {
  return tagFor(tenantId, "talent-media", { id: talentProfileId });
}

/** Row shapes the pure selection logic needs (kept structural for tests). */
export type HubOverlayRow = {
  talent_profile_id: string;
  cover_media_asset_id: string | null;
};
export type HubCurationRow = {
  talent_profile_id: string;
  agency_media_id: string;
  display_order: number | null;
};

/**
 * PURE — given this hub's overlay rows + curated media rows, which asset id is
 * each talent's face here?
 *
 * Precedence: the explicit overlay cover wins; otherwise the lowest
 * `display_order` curated row (stable on ties: first row wins). Talents with
 * neither are simply absent — the caller falls back to the global rank.
 */
export function pickHubCoverAssetIds(
  overlays: readonly HubOverlayRow[],
  curated: readonly HubCurationRow[],
): Map<string, string> {
  const out = new Map<string, string>();
  const bestOrder = new Map<string, number>();

  for (const row of curated) {
    const order = typeof row.display_order === "number" ? row.display_order : 100;
    const prev = bestOrder.get(row.talent_profile_id);
    if (prev === undefined || order < prev) {
      bestOrder.set(row.talent_profile_id, order);
      out.set(row.talent_profile_id, row.agency_media_id);
    }
  }

  // Overlay cover is the staff's explicit "this is the face" — it outranks
  // ordering, so apply it last.
  for (const row of overlays) {
    if (row.cover_media_asset_id) out.set(row.talent_profile_id, row.cover_media_asset_id);
  }

  return out;
}

/** The ordered per-hub media selection for one talent. */
export type HubTalentMedia = {
  /** Public URL of the face to render, or null (caller falls back to initials). */
  coverUrl: string | null;
  /** Curated asset ids in display order (empty when nothing is curated). */
  assetIds: string[];
  /** Where the face came from — useful in QA and in the curation UI. */
  source: "curation" | "default";
};

/**
 * The single per-hub media resolver (plan §7). Never throws: any query error
 * degrades to the default global rank, i.e. exactly today's behavior.
 */
export async function resolveTalentMediaForHub(
  client: SupabaseClient,
  input: { tenantId: HubTenantId; talentProfileIds: (string | null | undefined)[] },
): Promise<Map<string, HubTalentMedia>> {
  const ids = [...new Set(input.talentProfileIds.filter((x): x is string => !!x))];
  const out = new Map<string, HubTalentMedia>();
  if (ids.length === 0) return out;

  const curationOn = isPerHubFacesEnabled() && !!input.tenantId;
  const tenantId = input.tenantId;

  let coverByTalent = new Map<string, string>();
  let orderedByTalent = new Map<string, string[]>();

  if (curationOn && tenantId) {
    const curation = await loadHubCuration(client, tenantId, ids);
    coverByTalent = curation.coverByTalent;
    orderedByTalent = curation.orderedByTalent;
  }

  // Resolve the curated asset ids to public URLs in one round trip.
  const urlByAssetId = await loadAssetUrls(client, [...new Set(coverByTalent.values())]);

  const needsDefault: string[] = [];
  for (const id of ids) {
    const assetId = coverByTalent.get(id);
    const url = assetId ? urlByAssetId.get(assetId) : undefined;
    if (url) {
      out.set(id, {
        coverUrl: url,
        assetIds: orderedByTalent.get(id) ?? [assetId!],
        source: "curation",
      });
    } else {
      needsDefault.push(id);
    }
  }

  if (needsDefault.length > 0) {
    const fallback = await loadTalentCardThumbs(client, needsDefault);
    for (const id of needsDefault) {
      out.set(id, {
        coverUrl: fallback.get(id) ?? null,
        assetIds: orderedByTalent.get(id) ?? [],
        source: "default",
      });
    }
  }

  return out;
}

/**
 * Drop-in replacement for `loadTalentCardThumbs` at card call-sites: same
 * `Map<talentProfileId, url>` contract, plus the hub curation layer.
 *
 * With the flag OFF (or `tenantId === null`) this delegates to
 * `loadTalentCardThumbs` and is byte-identical to the pre-phase-2 output.
 */
export async function resolveTalentCardThumbsForHub(
  client: SupabaseClient,
  talentProfileIds: (string | null | undefined)[],
  tenantId: HubTenantId,
): Promise<Map<string, string>> {
  if (!isPerHubFacesEnabled() || !tenantId) {
    return loadTalentCardThumbs(client, talentProfileIds);
  }

  const resolved = await resolveTalentMediaForHub(client, { tenantId, talentProfileIds });
  const out = new Map<string, string>();
  for (const [id, media] of resolved) {
    if (media.coverUrl) out.set(id, media.coverUrl);
  }
  return out;
}

// ─── internals ──────────────────────────────────────────────────────────────

async function loadHubCuration(
  client: SupabaseClient,
  tenantId: string,
  ids: string[],
): Promise<{ coverByTalent: Map<string, string>; orderedByTalent: Map<string, string[]> }> {
  const [overlayRes, mediaRes] = await Promise.all([
    client
      .from("agency_talent_overlays")
      .select("talent_profile_id, cover_media_asset_id")
      .eq("tenant_id", tenantId)
      .in("talent_profile_id", ids),
    client
      .from("agency_talent_media")
      .select("talent_profile_id, agency_media_id, display_order")
      .eq("tenant_id", tenantId)
      .eq("is_visible_on_agency_site", true)
      .in("talent_profile_id", ids)
      .order("display_order", { ascending: true }),
  ]);

  const overlays = (overlayRes.data ?? []) as HubOverlayRow[];
  const curated = (mediaRes.data ?? []) as HubCurationRow[];

  const orderedByTalent = new Map<string, string[]>();
  for (const row of curated) {
    const list = orderedByTalent.get(row.talent_profile_id) ?? [];
    list.push(row.agency_media_id);
    orderedByTalent.set(row.talent_profile_id, list);
  }

  return { coverByTalent: pickHubCoverAssetIds(overlays, curated), orderedByTalent };
}

async function loadAssetUrls(
  client: SupabaseClient,
  assetIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (assetIds.length === 0) return out;

  const { data } = await client
    .from("media_assets")
    .select("id, storage_path")
    .in("id", assetIds)
    .is("deleted_at", null);

  for (const row of (data ?? []) as Array<{ id: string; storage_path: string | null }>) {
    if (!row.storage_path) continue;
    out.set(row.id, mediaPublicUrl(client, row.storage_path));
  }
  return out;
}
