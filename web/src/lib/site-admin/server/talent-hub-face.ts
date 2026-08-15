import "server-only";

/**
 * talent-hub-face.ts — the DB layer for "which photos represent this talent on
 * THIS hub" (media-ownership plan §6, "Roster drawer → Photos on this site").
 *
 * Phase 2 wires the two curation tables the schema has carried unused since
 * 20260601100600 / 20260907180000:
 *
 *   • `agency_talent_overlays.cover_media_asset_id` — the FACE on this hub.
 *   • `agency_talent_media`                        — the ordered SELECTION.
 *
 * Reads here feed the roster-drawer panel; the resolver that renders the
 * result on cards is `src/lib/media/talent-media-for-hub.ts`. One selection,
 * two consumers, no third re-derivation (the `is_publicly_listed` single-gate
 * lesson).
 *
 * Plain server module (NOT "use server"): every DB touch lives here so the
 * action file stays an auth + audit + cache-bust wrapper — same split as
 * brand-library.ts and media-ownership.ts, and the reason the action file
 * carries no raw `.from()`.
 *
 * KIND-AGNOSTIC: `tenantId` is opaque. A hub curating a face is handled by the
 * same code path as an agency (M1 gate).
 *
 * SECURITY: callers pass the request's RLS-bound staff client, and every query
 * still carries `tenant_id` at the application layer — a talent can sit on
 * several rosters, and a missing tenant filter would let one workspace read or
 * overwrite another's curation for the shared talent.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { isPerHubFacesEnabled, resolveTalentMediaForHub } from "@/lib/media/talent-media-for-hub";
import { logServerError } from "@/lib/server/safe-error";
import { listTalentScopedMediaLibrary } from "@/lib/site-admin/media/assets";

export type HubFaceResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** One pickable photo in the curation panel. */
export type HubFacePhoto = {
  assetId: string;
  url: string;
  alt: string | null;
  /** Selected for this hub (an `agency_talent_media` row exists). */
  selected: boolean;
  /** This hub's cover — the face cards render when the flag is on. */
  isCover: boolean;
  /** Position among the selected photos (1-based); null when not selected. */
  position: number | null;
  /**
   * Include/exclude toggle. A selected photo can stay in the curation list
   * (keeps its caption + order) while being hidden from the live site — the
   * resolver in `talent-media-for-hub.ts` gates on this column directly.
   * Meaningless (always `true`) when `selected` is `false`.
   */
  visible: boolean;
  /** Per-photo caption for this hub, or null. Meaningless when not selected. */
  caption: string | null;
};

export type HubFaceState = {
  coverAssetId: string | null;
  /** Selected asset ids in display order. */
  selectedAssetIds: string[];
  /** Everything staff can pick from, selected first, then the rest. */
  photos: HubFacePhoto[];
  /**
   * What this hub is ACTUALLY serving right now, straight from the storefront
   * resolver (`resolveTalentMediaForHub`) rather than re-derived here.
   *
   * `"default"` means nothing is curated and the site is showing the default
   * rank — which is NOT the same as an empty site. The panel used to print
   * "0 selected" for that case, which reads as "nothing on your site" and made
   * staff panic-curate (execution-plan-2026-08-15 §1 P0-3). One gate, one
   * source: the resolver already computes this and nothing consumed it.
   */
  source: "curation" | "default";
  /**
   * The asset the default rank is currently picking, when `source` is
   * `"default"` — so the panel can outline the tile the site is really using.
   * Null when the resolver served a different derivative (watermarked bake) or
   * nothing at all; the panel simply skips the outline in that case rather
   * than guessing.
   */
  defaultCoverAssetId: string | null;
  /**
   * `MEDIA_PER_HUB_FACES_ENABLED`. With the flag OFF every curation write
   * still succeeds, audits, busts caches and prints "Selection saved." while
   * the live site is byte-identical — the exact "save that looks like nothing
   * happened" class this program exists to kill (P0-4). The panel renders a
   * banner instead of pretending. The WRITES stay enabled on purpose: staff
   * can prepare a selection that applies the moment the flag flips.
   */
  perHubFacesEnabled: boolean;
};

type CurationRow = {
  id: string;
  agency_media_id: string;
  display_order: number | null;
  is_visible_on_agency_site: boolean | null;
  caption: string | null;
};

/** Reads this hub's current curation plus the pickable library, in one go. */
export async function loadHubFaceState(
  supabase: SupabaseClient,
  tenantId: string,
  talentProfileId: string,
): Promise<HubFaceResult<HubFaceState>> {
  try {
    const [overlayRes, curationRes, library, resolved] = await Promise.all([
      supabase
        .from("agency_talent_overlays")
        .select("cover_media_asset_id")
        .eq("tenant_id", tenantId)
        .eq("talent_profile_id", talentProfileId)
        .maybeSingle(),
      supabase
        .from("agency_talent_media")
        .select("id, agency_media_id, display_order, is_visible_on_agency_site, caption")
        .eq("tenant_id", tenantId)
        .eq("talent_profile_id", talentProfileId)
        .order("display_order", { ascending: true }),
      listTalentScopedMediaLibrary(supabase, talentProfileId, tenantId),
      // Ask the STOREFRONT resolver what this hub is actually serving, rather
      // than re-deriving it. Re-derivation is how "0 selected" came to
      // contradict the live site in the first place; the resolver never
      // throws and degrades to the default rank, so this is safe to await.
      resolveTalentMediaForHub(supabase, {
        tenantId,
        talentProfileIds: [talentProfileId],
      }),
    ]);

    if (overlayRes.error) {
      logServerError("loadHubFaceState/overlay", overlayRes.error);
      return { ok: false, error: "Could not load the photo selection." };
    }
    if (curationRes.error) {
      logServerError("loadHubFaceState/curation", curationRes.error);
      return { ok: false, error: "Could not load the photo selection." };
    }

    const rows = (curationRes.data ?? []) as CurationRow[];
    // Curation membership is row EXISTENCE, not the visibility flag — a hidden
    // photo stays in the selection (keeps its caption + order) so staff can
    // re-show it without re-picking it. See `HubFacePhoto.visible`.
    const selectedAssetIds = rows.map((r) => r.agency_media_id);
    const coverAssetId =
      (overlayRes.data as { cover_media_asset_id: string | null } | null)
        ?.cover_media_asset_id ?? null;

    const position = new Map(selectedAssetIds.map((id, i) => [id, i + 1]));
    const captionByAsset = new Map(rows.map((r) => [r.agency_media_id, r.caption ?? null]));
    const visibleByAsset = new Map(
      rows.map((r) => [r.agency_media_id, r.is_visible_on_agency_site !== false]),
    );
    const photos: HubFacePhoto[] = library.items
      .filter((item) => item.assetKind === "image")
      .map((item) => ({
        assetId: item.id,
        url: item.publicUrl,
        alt: item.alt,
        selected: position.has(item.id),
        isCover: item.id === coverAssetId,
        position: position.get(item.id) ?? null,
        caption: captionByAsset.get(item.id) ?? null,
        visible: visibleByAsset.get(item.id) ?? true,
      }))
      .sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999));

    // Which tile is the default rank picking? Matched by URL because the
    // resolver returns a renderable URL, not an id, and may have substituted a
    // watermarked derivative. No match ⇒ null, and the panel skips the
    // outline rather than pointing at the wrong photo.
    const live = resolved.get(talentProfileId);
    const source: "curation" | "default" = live?.source ?? "default";
    const defaultCoverAssetId =
      source === "default" && live?.coverUrl
        ? photos.find((p) => p.url === live.coverUrl)?.assetId ?? null
        : null;

    return {
      ok: true,
      data: {
        coverAssetId,
        selectedAssetIds,
        photos,
        source,
        defaultCoverAssetId,
        perHubFacesEnabled: isPerHubFacesEnabled(),
      },
    };
  } catch (err) {
    logServerError("loadHubFaceState", err);
    return { ok: false, error: "Could not load the photo selection." };
  }
}

/**
 * Sets (or clears, with `null`) this hub's cover. Upserts the overlay row —
 * this is the first write path to `agency_talent_overlays` in the app, so it
 * creates the row on demand rather than assuming staff authored one earlier.
 */
export async function setHubCoverAsset(
  supabase: SupabaseClient,
  tenantId: string,
  talentProfileId: string,
  assetId: string | null,
): Promise<HubFaceResult<{ coverAssetId: string | null }>> {
  try {
    if (assetId) {
      const usable = await assetIsUsableOnHub(supabase, tenantId, assetId);
      if (!usable) return { ok: false, error: "That photo is not available on this site." };
    }

    const { error } = await supabase
      .from("agency_talent_overlays")
      .upsert(
        {
          tenant_id: tenantId,
          talent_profile_id: talentProfileId,
          cover_media_asset_id: assetId,
        },
        { onConflict: "tenant_id,talent_profile_id" },
      );

    if (error) {
      logServerError("setHubCoverAsset", error);
      return { ok: false, error: "Could not save the cover photo." };
    }
    return { ok: true, data: { coverAssetId: assetId } };
  } catch (err) {
    logServerError("setHubCoverAsset", err);
    return { ok: false, error: "Could not save the cover photo." };
  }
}

/**
 * Replaces this hub's ordered selection with `orderedAssetIds`.
 *
 * Rows are reconciled, not wiped and re-inserted: an existing row keeps its id
 * (and its `caption` / `master_media_id` override, which staff may have set
 * elsewhere) and only moves position. Removed ids are deleted. If the cover no
 * longer sits in the selection it is cleared, so a hub can never render a face
 * that its own selection dropped.
 */
export async function setHubMediaSelection(
  supabase: SupabaseClient,
  tenantId: string,
  talentProfileId: string,
  orderedAssetIds: string[],
  actorUserId: string,
): Promise<HubFaceResult<{ selectedAssetIds: string[]; coverAssetId: string | null }>> {
  try {
    const wanted = [...new Set(orderedAssetIds)];

    for (const assetId of wanted) {
      const usable = await assetIsUsableOnHub(supabase, tenantId, assetId);
      if (!usable) return { ok: false, error: "One of those photos is not available on this site." };
    }

    const existingRes = await supabase
      .from("agency_talent_media")
      .select("id, agency_media_id")
      .eq("tenant_id", tenantId)
      .eq("talent_profile_id", talentProfileId);

    if (existingRes.error) {
      logServerError("setHubMediaSelection/read", existingRes.error);
      return { ok: false, error: "Could not save the photo selection." };
    }

    const existing = (existingRes.data ?? []) as Array<{ id: string; agency_media_id: string }>;
    const idByAsset = new Map(existing.map((r) => [r.agency_media_id, r.id]));

    const staleRowIds = existing.filter((r) => !wanted.includes(r.agency_media_id)).map((r) => r.id);
    if (staleRowIds.length > 0) {
      const { error } = await supabase
        .from("agency_talent_media")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("talent_profile_id", talentProfileId)
        .in("id", staleRowIds);
      if (error) {
        logServerError("setHubMediaSelection/delete", error);
        return { ok: false, error: "Could not save the photo selection." };
      }
    }

    for (let i = 0; i < wanted.length; i++) {
      const assetId = wanted[i];
      const displayOrder = (i + 1) * 10;
      const rowId = idByAsset.get(assetId);
      // Reordering/re-saving an EXISTING row only touches `display_order` — it
      // must never silently flip a photo staff hid back to visible, and it
      // must not clobber a caption they set on it (both live outside the
      // checkbox flow now, in `setHubMediaVisibility` / `setHubMediaCaption`).
      const { error } = rowId
        ? await supabase
            .from("agency_talent_media")
            .update({ display_order: displayOrder })
            .eq("id", rowId)
            .eq("tenant_id", tenantId)
            .eq("talent_profile_id", talentProfileId)
        : await supabase.from("agency_talent_media").insert({
            tenant_id: tenantId,
            talent_profile_id: talentProfileId,
            agency_media_id: assetId,
            display_order: displayOrder,
            is_visible_on_agency_site: true,
            created_by_user_id: actorUserId,
          });
      if (error) {
        logServerError("setHubMediaSelection/write", error);
        return { ok: false, error: "Could not save the photo selection." };
      }
    }

    // Keep the cover inside the selection.
    const overlayRes = await supabase
      .from("agency_talent_overlays")
      .select("cover_media_asset_id")
      .eq("tenant_id", tenantId)
      .eq("talent_profile_id", talentProfileId)
      .maybeSingle();
    const cover =
      (overlayRes.data as { cover_media_asset_id: string | null } | null)?.cover_media_asset_id ??
      null;

    if (cover && !wanted.includes(cover)) {
      const cleared = await setHubCoverAsset(supabase, tenantId, talentProfileId, null);
      if (!cleared.ok) return cleared;
      return { ok: true, data: { selectedAssetIds: wanted, coverAssetId: null } };
    }

    return { ok: true, data: { selectedAssetIds: wanted, coverAssetId: cover } };
  } catch (err) {
    logServerError("setHubMediaSelection", err);
    return { ok: false, error: "Could not save the photo selection." };
  }
}

/**
 * Sets (or clears, with `null`) one selected photo's caption for this hub.
 * Requires an existing `agency_talent_media` row — a photo must be added to
 * the site's selection (`setHubMediaSelection`) before it can be captioned,
 * so this never creates a row on its own.
 */
export async function setHubMediaCaption(
  supabase: SupabaseClient,
  tenantId: string,
  talentProfileId: string,
  assetId: string,
  caption: string | null,
): Promise<HubFaceResult<{ caption: string | null }>> {
  try {
    const { data, error } = await supabase
      .from("agency_talent_media")
      .update({ caption })
      .eq("tenant_id", tenantId)
      .eq("talent_profile_id", talentProfileId)
      .eq("agency_media_id", assetId)
      .select("id")
      .maybeSingle();

    if (error) {
      logServerError("setHubMediaCaption", error);
      return { ok: false, error: "Could not save the caption." };
    }
    if (!data) return { ok: false, error: "Add the photo to this site before captioning it." };
    return { ok: true, data: { caption } };
  } catch (err) {
    logServerError("setHubMediaCaption", err);
    return { ok: false, error: "Could not save the caption." };
  }
}

/**
 * Include/exclude toggle for one selected photo. Unlike removing a photo from
 * the selection (`setHubMediaSelection`, which deletes the row), this keeps
 * the row — and its caption + position — and only flips
 * `is_visible_on_agency_site`, which is exactly what the storefront resolver
 * (`talent-media-for-hub.ts`) gates on. Requires an existing row, same reason
 * as `setHubMediaCaption`.
 */
export async function setHubMediaVisibility(
  supabase: SupabaseClient,
  tenantId: string,
  talentProfileId: string,
  assetId: string,
  visible: boolean,
): Promise<HubFaceResult<{ visible: boolean }>> {
  try {
    const { data, error } = await supabase
      .from("agency_talent_media")
      .update({ is_visible_on_agency_site: visible })
      .eq("tenant_id", tenantId)
      .eq("talent_profile_id", talentProfileId)
      .eq("agency_media_id", assetId)
      .select("id")
      .maybeSingle();

    if (error) {
      logServerError("setHubMediaVisibility", error);
      return { ok: false, error: "Could not save the visibility." };
    }
    if (!data) return { ok: false, error: "Add the photo to this site before hiding it." };
    return { ok: true, data: { visible } };
  } catch (err) {
    logServerError("setHubMediaVisibility", err);
    return { ok: false, error: "Could not save the visibility." };
  }
}

/**
 * Re-numbers `display_order` for already-selected photos, one update per id.
 * A simple up/down reorder (no drag-drop, per the plan) always submits the
 * FULL current order, so this assigns dense `(i+1) * 10` gaps the same way
 * `setHubMediaSelection` does — the two never disagree on spacing. Ids
 * without an existing row are silently skipped rather than erroring: the
 * panel only ever offers reorder controls on photos already in the
 * selection, so a mismatch here would mean stale client state, not a real
 * failure worth blocking the rest of the reorder over.
 */
export async function setHubMediaOrder(
  supabase: SupabaseClient,
  tenantId: string,
  talentProfileId: string,
  orderedAssetIds: string[],
): Promise<HubFaceResult<{ orderedAssetIds: string[] }>> {
  try {
    const wanted = [...new Set(orderedAssetIds)];
    for (let i = 0; i < wanted.length; i++) {
      const { error } = await supabase
        .from("agency_talent_media")
        .update({ display_order: (i + 1) * 10 })
        .eq("tenant_id", tenantId)
        .eq("talent_profile_id", talentProfileId)
        .eq("agency_media_id", wanted[i]);
      if (error) {
        logServerError("setHubMediaOrder", error);
        return { ok: false, error: "Could not save the new order." };
      }
    }
    return { ok: true, data: { orderedAssetIds: wanted } };
  } catch (err) {
    logServerError("setHubMediaOrder", err);
    return { ok: false, error: "Could not save the new order." };
  }
}

/**
 * Guard: the asset must exist, be live, and belong to this tenant's library.
 * Without it a crafted request could point one hub's cover at another hub's
 * asset id — the selection layer is exactly where that must be refused.
 */
async function assetIsUsableOnHub(
  supabase: SupabaseClient,
  tenantId: string,
  assetId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("media_assets")
    .select("id")
    .eq("id", assetId)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    logServerError("assetIsUsableOnHub", error);
    return false;
  }
  return !!data;
}
