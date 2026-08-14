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

import { logServerError } from "@/lib/server/safe-error";
import { listTalentScopedMediaLibrary } from "@/lib/site-admin/media/assets";

export type HubFaceResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** One pickable photo in the curation panel. */
export type HubFacePhoto = {
  assetId: string;
  url: string;
  alt: string | null;
  /** Selected for this hub (an `agency_talent_media` row exists and is visible). */
  selected: boolean;
  /** This hub's cover — the face cards render when the flag is on. */
  isCover: boolean;
  /** Position among the selected photos (1-based); null when not selected. */
  position: number | null;
};

export type HubFaceState = {
  coverAssetId: string | null;
  /** Selected asset ids in display order. */
  selectedAssetIds: string[];
  /** Everything staff can pick from, selected first, then the rest. */
  photos: HubFacePhoto[];
};

type CurationRow = {
  id: string;
  agency_media_id: string;
  display_order: number | null;
  is_visible_on_agency_site: boolean | null;
};

/** Reads this hub's current curation plus the pickable library, in one go. */
export async function loadHubFaceState(
  supabase: SupabaseClient,
  tenantId: string,
  talentProfileId: string,
): Promise<HubFaceResult<HubFaceState>> {
  try {
    const [overlayRes, curationRes, library] = await Promise.all([
      supabase
        .from("agency_talent_overlays")
        .select("cover_media_asset_id")
        .eq("tenant_id", tenantId)
        .eq("talent_profile_id", talentProfileId)
        .maybeSingle(),
      supabase
        .from("agency_talent_media")
        .select("id, agency_media_id, display_order, is_visible_on_agency_site")
        .eq("tenant_id", tenantId)
        .eq("talent_profile_id", talentProfileId)
        .order("display_order", { ascending: true }),
      listTalentScopedMediaLibrary(supabase, talentProfileId, tenantId),
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
    const selectedAssetIds = rows
      .filter((r) => r.is_visible_on_agency_site !== false)
      .map((r) => r.agency_media_id);
    const coverAssetId =
      (overlayRes.data as { cover_media_asset_id: string | null } | null)
        ?.cover_media_asset_id ?? null;

    const position = new Map(selectedAssetIds.map((id, i) => [id, i + 1]));
    const photos: HubFacePhoto[] = library.items
      .filter((item) => item.assetKind === "image")
      .map((item) => ({
        assetId: item.id,
        url: item.publicUrl,
        alt: item.alt,
        selected: position.has(item.id),
        isCover: item.id === coverAssetId,
        position: position.get(item.id) ?? null,
      }))
      .sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999));

    return { ok: true, data: { coverAssetId, selectedAssetIds, photos } };
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
      const { error } = rowId
        ? await supabase
            .from("agency_talent_media")
            .update({ display_order: displayOrder, is_visible_on_agency_site: true })
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
