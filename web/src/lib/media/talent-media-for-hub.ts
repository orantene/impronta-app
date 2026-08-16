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
 * TWO-KEY RULE (phase 3) — an asset appears on hub H only if the OWNER allows H
 * AND the SUBJECT allows H. The rule itself lives in ONE place, the SQL
 * function `media_asset_presentable_on_tenant()` (migration
 * 20261115000000_media_grants_two_key.sql); this module only calls it. Do not
 * re-derive the predicate here or anywhere else — the 2026-08
 * `is_publicly_listed` incidents are exactly what happens when readers
 * disagree.
 *
 * It filters BOTH paths: curated ids and the ranked default candidates. A
 * candidate that fails the rule falls through to the next-best variant rather
 * than blanking the card.
 *
 * WATERMARK-ON-RELEASE (phase 4) — a release approved with "require watermark"
 * may only be served as the baked derivative. That swap rides the same two
 * passes as the two-key filter and lives in `watermark-on-release.ts`; see its
 * header for why a missing derivative HIDES the photo instead of failing open.
 * It only runs while `MEDIA_TWO_KEY_GRANTS_ENABLED` is on, because a grant
 * that is not being enforced has no conditions to enforce either.
 *
 * KIND-AGNOSTIC
 * ─────────────
 * `tenantId` is opaque. This module never asks whether the org is an agency or
 * a hub (the M1 gate in `src/lib/saas/tenant-isolation.test.ts`): a hub that
 * curates a face gets the curated face, exactly like an agency.
 *
 * TWO FLAGS, BOTH DEFAULT OFF
 * ───────────────────────────
 * `MEDIA_PER_HUB_FACES_ENABLED` — phase 2 curation.
 * `MEDIA_TWO_KEY_GRANTS_ENABLED` — phase 3 grant enforcement.
 *
 * They are INDEPENDENT on purpose. Curation is a presentation change; the
 * two-key rule is a visibility change, and the two carry very different blast
 * radii. Flipping per-hub faces alone leaves output byte-identical to phase 2,
 * so the phase-2 flip can still be QA'd on its own merits without silently
 * dragging enforcement along with it.
 *
 * With BOTH flags off (production today) `resolveTalentCardThumbsForHub`
 * delegates straight to `loadTalentCardThumbs` and returns a byte-identical
 * Map — the ~13 card call-sites keep working with zero visible change.
 *
 * NON-BREAKING BY CONSTRUCTION: with enforcement ON and ZERO rows in
 * `media_grants`, today's media still renders, because the defaults are
 * IMPLICIT grants baked into the SQL predicate (owner's home hub, the managing
 * hub's representation of a rostered talent, and the subject's own master
 * profile all pass with no row). Grant rows are only ever needed to reach a
 * THIRD hub. See the predicate's header comment for the full table.
 *
 * A THIRD FLAG — `MEDIA_PRIVATE_ACCESS_ENABLED` (P0-1), ALSO DEFAULT OFF
 * ────────────────────────────────────────────────────────────────────
 * Everything above decides which URL is RENDERED. None of it decides who may
 * fetch the bytes: the bucket is world-readable, so a saved URL survives a
 * revocation forever. With the third flag on, the URLs this resolver emits
 * point at `/api/media/asset/<id>` instead of at storage, and the same
 * predicate runs again per request. See `private-access.ts`.
 *
 * It is deliberately subordinate to enforcement: gating is only applied on the
 * paths where `MEDIA_TWO_KEY_GRANTS_ENABLED` is already deciding something.
 * With enforcement off there is no rule for the gate to apply, and a proxy hop
 * that always answers "yes" is pure cost.
 *
 * FAIL-CLOSED ON THE PRIVACY PREDICATE (Batch A / A3)
 * ───────────────────────────────────────────────────
 * This module used to keep the unfiltered candidates when the predicate call
 * errored, on the "a broken query must never blank a storefront" reasoning the
 * rest of the resolver follows. That stance was backwards for THIS call. The
 * predicate is the only thing standing between an un-consented photo and a
 * third hub, and Supabase throttling is chronic on this project's tier — so
 * "fail open" meant a transient blip PUBLISHES photos nobody released, quietly
 * and with no way to notice after the fact.
 *
 * The cosmetic path (watermark substitution) still fails open, because the
 * worst case there is an unmarked photo on a surface that was already allowed
 * to show it. The privacy path fails closed: cards fall back to a default the
 * talent may show, or to initials. A blank card is recoverable; a leaked photo
 * is not.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  loadTalentCardThumbCandidates,
  loadTalentCardThumbs,
  mediaUrlForAsset,
  pickBestThumbs,
  type TalentThumbCandidate,
} from "@/app/(workspace)/[tenantSlug]/_data-bridge/talent-card-thumbs";
import { logServerError } from "@/lib/server/safe-error";
import { isPrivateMediaAccessEnabled } from "@/lib/platform/gated-media";
import { grantPredicateClient } from "@/lib/media/grant-predicate-client";
import { tagFor } from "@/lib/site-admin/cache-tags";
import {
  applyWatermarkPath,
  EMPTY_WATERMARK_POLICY,
  resolveWatermarkPolicy,
  type WatermarkPolicy,
} from "@/lib/media/watermark-on-release";

/** Opaque tenant id, or `null` for the master (non-hub) surface. */
export type HubTenantId = string | null;

/** Env flag — default OFF. Only "1" / "true" turns per-hub faces on. */
export function isPerHubFacesEnabled(): boolean {
  const raw = process.env.MEDIA_PER_HUB_FACES_ENABLED;
  return raw === "1" || raw === "true";
}

/** Env flag — default OFF. Only "1" / "true" enforces the two-key rule. */
export function isTwoKeyGrantsEnabled(): boolean {
  const raw = process.env.MEDIA_TWO_KEY_GRANTS_ENABLED;
  return raw === "1" || raw === "true";
}

/**
 * Filter asset ids to those the two-key rule permits on this surface, by
 * calling the ONE SQL predicate. `tenantId === null` = master surface.
 *
 * FAILS CLOSED (A3): on any error the result is EMPTY, not the input. See the
 * module header for why this one call does not follow the resolver's usual
 * fail-open stance. The caller degrades to a default photo or to initials.
 */
export async function filterPresentableAssetIds(
  client: SupabaseClient,
  assetIds: readonly string[],
  tenantId: HubTenantId,
): Promise<Set<string>> {
  if (assetIds.length === 0) return new Set();
  const all = new Set(assetIds);

  const { data, error } = await grantPredicateClient(client).rpc(
    "media_assets_presentable_on_tenant",
    {
      p_asset_ids: [...all],
      p_tenant_id: tenantId,
    },
  );

  if (error || !Array.isArray(data)) {
    // Loud on purpose: a fail-closed resolver degrades silently from the
    // outside (cards just look uncurated), so the only signal that the
    // predicate is down is this line.
    logServerError("talent-media-for-hub.filterPresentable", error ?? "predicate returned no rows");
    return new Set();
  }
  return new Set(
    (data as Array<{ asset_id: string } | string>).map((row) =>
      typeof row === "string" ? row : row.asset_id,
    ),
  );
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
  const enforcing = isTwoKeyGrantsEnabled();
  const tenantId = input.tenantId;

  // Resolved ONCE for the whole resolver and threaded down, so a page with 60
  // cards costs zero extra queries rather than 60. Only asked on the enforcing
  // path: that is the only path that passes a surface, and without a surface
  // `mediaUrlForAsset` returns the public URL whatever this says.
  const gatingEnabled = enforcing ? await isPrivateMediaAccessEnabled() : false;

  let coverByTalent = new Map<string, string>();
  let orderedByTalent = new Map<string, string[]>();

  if (curationOn && tenantId) {
    const curation = await loadHubCuration(client, tenantId, ids);
    coverByTalent = curation.coverByTalent;
    orderedByTalent = curation.orderedByTalent;
  }

  // Two-key pass 1 — a curated pick the rule forbids is dropped here, so the
  // talent falls through to a default they ARE allowed to show rather than to
  // a blank card. Staff curating a photo does not override the subject.
  if (enforcing && (coverByTalent.size > 0 || orderedByTalent.size > 0)) {
    const curatedIds = new Set<string>(coverByTalent.values());
    for (const list of orderedByTalent.values()) for (const id of list) curatedIds.add(id);

    const allowed = await filterPresentableAssetIds(client, [...curatedIds], tenantId);

    for (const [talentId, assetId] of [...coverByTalent]) {
      if (!allowed.has(assetId)) coverByTalent.delete(talentId);
    }
    for (const [talentId, list] of [...orderedByTalent]) {
      orderedByTalent.set(
        talentId,
        list.filter((assetId) => allowed.has(assetId)),
      );
    }
  }

  // Watermark-on-release (phase 4): a release approved with "require
  // watermark" may only be served as the baked derivative. Same shape as the
  // two-key pass — resolve once, substitute or drop.
  const curatedIds = [...new Set(coverByTalent.values())];
  const watermark = enforcing
    ? await resolveWatermarkPolicy(client, curatedIds, tenantId)
    : EMPTY_WATERMARK_POLICY;

  // Resolve the curated asset ids to renderable URLs in one round trip.
  const urlByAssetId = await loadAssetUrls(
    client,
    curatedIds,
    watermark,
    enforcing ? tenantId : undefined,
    gatingEnabled,
  );

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
    const fallback = await loadDefaultThumbs(
      client,
      needsDefault,
      tenantId,
      enforcing,
      gatingEnabled,
    );
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
 * Two-key pass 2 — the global rank, with forbidden candidates removed BEFORE
 * the rank picks a winner. Without enforcement this is `loadTalentCardThumbs`
 * unchanged (one query, same shape).
 */
async function loadDefaultThumbs(
  client: SupabaseClient,
  talentProfileIds: string[],
  tenantId: HubTenantId,
  enforcing: boolean,
  gatingEnabled: boolean,
): Promise<Map<string, string>> {
  if (!enforcing) return loadTalentCardThumbs(client, talentProfileIds);

  const candidates = await loadTalentCardThumbCandidates(client, talentProfileIds);
  if (candidates.length === 0) return new Map();

  const allowed = await filterPresentableAssetIds(
    client,
    candidates.map((c) => c.id),
    tenantId,
  );
  const permitted: TalentThumbCandidate[] = candidates.filter((c) => allowed.has(c.id));

  // Phase 4: swap in the baked derivative BEFORE the rank picks a winner, and
  // drop a candidate whose watermark was never baked, so the rank falls
  // through to the next-best photo instead of serving an unmarked original.
  const watermark = await resolveWatermarkPolicy(
    client,
    permitted.map((c) => c.id),
    tenantId,
  );
  const servable: TalentThumbCandidate[] = [];
  for (const candidate of permitted) {
    const path = applyWatermarkPath(watermark, candidate.id, candidate.storage_path);
    if (!path) continue;
    servable.push(path === candidate.storage_path ? candidate : { ...candidate, storage_path: path });
  }

  // Surface passed only on the enforcing path (the early return above covers
  // the other one): gating and the two-key rule are the same decision seen
  // from two sides, and a gate in front of a rule nobody is enforcing would
  // cost a Function invocation per image to answer "yes" every time.
  return pickBestThumbs(client, servable, tenantId, gatingEnabled);
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
  // Both flags off ⇒ the pre-phase-2 path, byte for byte. Note enforcement is
  // NOT gated on a tenant: the master surface has a two-key answer too
  // (an agency photo with visible_on_master_profile=false must not show there).
  if (!isTwoKeyGrantsEnabled() && (!isPerHubFacesEnabled() || !tenantId)) {
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
  watermark: WatermarkPolicy,
  surface: HubTenantId | undefined,
  gatingEnabled: boolean,
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
    // null = watermark required, none baked. Leaving it out of the map makes
    // the caller fall through to a default photo rather than serving the bare
    // original the workspace said may not travel unmarked.
    const path = applyWatermarkPath(watermark, row.id, row.storage_path);
    if (!path) continue;
    // The gated URL carries the ORIGINAL's id, not the derivative's: the route
    // re-runs the same watermark policy for the same surface and lands on the
    // same substitution, so the swap stays a per-request decision rather than
    // something baked into a URL that outlives the condition.
    out.set(
      row.id,
      mediaUrlForAsset(client, { assetId: row.id, storagePath: path, surface, gatingEnabled }),
    );
  }
  return out;
}
