import "server-only";

/**
 * media-kit-source.ts — the IO half of the EPK.
 *
 * Reads the talent's own `talent_profiles` row plus their approved media, and
 * hands both to the pure `buildTalentMediaKitModel`. Nothing is shaped here;
 * this module only fetches.
 *
 * AUTHORIZATION IS THE CALLER'S JOB. This function takes a talent profile id
 * that the route has ALREADY proved belongs to the session (via
 * `requireTalentSelf`). It must never be reachable with an id straight off a
 * query string.
 */

import type { Locale } from "@/i18n/config";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { canonicalTalentUrl } from "@/lib/saas/canonical-hosts";
import {
  buildTalentMediaKitModel,
  type MediaKitPhoto,
  type MediaKitProfileRow,
  type TalentMediaKitModel,
} from "@/lib/talent/media-kit-model";

/** Variant kinds the kit will consider, in the same spirit as the public page. */
const KIT_VARIANTS = ["card", "hero", "gallery", "public_watermarked"] as const;

const PROFILE_SELECT = `
  id,
  profile_code,
  display_name,
  first_name,
  last_name,
  short_bio,
  bio_i18n,
  intro_italic,
  starting_from,
  services_menu,
  residence_city:locations!residence_city_id ( display_name_i18n, country_code ),
  legacy_location:locations!location_id ( display_name_i18n, country_code ),
  talent_profile_taxonomy (
    is_primary,
    taxonomy_terms ( id, kind, slug, name_i18n )
  )
`;

type MediaAssetRow = {
  id: string;
  bucket_id: string | null;
  storage_path: string | null;
  variant_kind: string | null;
  sort_order: number | null;
};

export type MediaKitSourceResult =
  | { ok: true; model: TalentMediaKitModel }
  | { ok: false; reason: "unavailable" | "profile_not_found" };

/**
 * Load everything the kit needs for ONE talent profile id.
 *
 * `locale` / `fallbackChain` drive the bio + taxonomy + city resolution;
 * `generatedAtISO` is injected so callers (and tests) control the clock.
 */
export async function loadTalentMediaKitModel(input: {
  talentProfileId: string;
  locale: Locale;
  fallbackChain: readonly Locale[];
  generatedAtISO: string;
}): Promise<MediaKitSourceResult> {
  const supabase = createServiceRoleClient();
  if (!supabase) return { ok: false, reason: "unavailable" };

  const { data: profileRow, error: profileErr } = await supabase
    .from("talent_profiles")
    .select(PROFILE_SELECT)
    .eq("id", input.talentProfileId)
    .is("deleted_at", null)
    .maybeSingle();

  if (profileErr || !profileRow) return { ok: false, reason: "profile_not_found" };

  const profile = profileRow as unknown as MediaKitProfileRow;

  // Media: approved, non-deleted, owned by THIS profile. `owner_talent_profile_id`
  // is the ownership column the media-ownership work established, so a stray
  // asset from another talent cannot land in someone else's kit.
  const { data: assetRows } = await supabase
    .from("media_assets")
    .select("id, bucket_id, storage_path, variant_kind, sort_order")
    .eq("owner_talent_profile_id", input.talentProfileId)
    .in("variant_kind", [...KIT_VARIANTS])
    .eq("approval_state", "approved")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true })
    .limit(24);

  const assets = (assetRows ?? []) as MediaAssetRow[];

  const toUrl = (row: MediaAssetRow): string | null => {
    const path = row.storage_path?.trim();
    if (!path) return null;
    if (path.startsWith("http")) return path;
    const bucket = row.bucket_id?.trim() || "media-public";
    return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl || null;
  };

  const cover = assets.find((a) => a.variant_kind === "card") ?? assets.find((a) => a.variant_kind === "hero");
  const headshotUrl = cover ? toUrl(cover) : null;

  const gallery: MediaKitPhoto[] = [];
  for (const row of assets) {
    if (row.variant_kind !== "gallery" && row.variant_kind !== "public_watermarked") continue;
    const url = toUrl(row);
    if (!url) continue;
    gallery.push({ id: row.id, url, variantKind: row.variant_kind });
  }

  const profileCode = profile.profile_code?.trim() || null;
  const profileUrl = profileCode ? await canonicalTalentUrl(profileCode) : null;

  return {
    ok: true,
    model: buildTalentMediaKitModel({
      profile,
      gallery,
      headshotUrl,
      locale: input.locale,
      fallbackChain: input.fallbackChain,
      profileUrl,
      generatedAtISO: input.generatedAtISO,
    }),
  };
}
