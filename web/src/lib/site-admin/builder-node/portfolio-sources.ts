import "server-only";

/**
 * Load live talent media for the W-12 `portfolio` widget.
 * Source of truth: approved `media_assets` owned by the talent (same as
 * starter/gallery hydrate). Service links come from `talent_offering_media`
 * (first offering wins per asset) plus optional editor shotBindings at render.
 */
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";

import { resolvePortfolioAlt, resolvePortfolioCaption } from "./portfolio-i18n";
import { captionMapField } from "./portfolio-caption-hint";
import { resolveLinkedOfferingTitle } from "./portfolio-offering-title";
import type { TalentPortfolioShot } from "./portfolio-types";

const BUCKET = "media-public";

export async function loadPortfolioSources(
  talentProfileId: string,
  opts?: {
    displayName?: string | null;
    limit?: number;
    /** Visitor locale: captions and alt text resolve to it (#187). */
    locale?: string | null;
    /** The page's primary locale: the second step of the caption fallback. */
    primaryLocale?: string | null;
  },
): Promise<{ talentPortfolioShots: TalentPortfolioShot[] }> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { talentPortfolioShots: [] };
  const trusted = createServiceRoleClient() ?? supabase;
  const limit = Math.min(Math.max(opts?.limit ?? 24, 1), 48);

  const { data: mediaRows, error } = await trusted
    .from("media_assets")
    .select("id, storage_path, alt, width, height, sort_order, variant_kind, metadata")
    .eq("owner_talent_profile_id", talentProfileId)
    .in("variant_kind", ["gallery", "public_watermarked", "hero"])
    .eq("approval_state", "approved")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .limit(limit);

  if (error) {
    logServerError("portfolio.loadMedia", error);
    return { talentPortfolioShots: [] };
  }

  const rows = (mediaRows ?? []) as Array<{
    id: string;
    storage_path: string;
    alt: string | null;
    width: number | null;
    height: number | null;
    sort_order: number | null;
    variant_kind: string;
    metadata: Record<string, unknown> | null;
  }>;

  // Prefer gallery variants; keep hero only as filler when gallery is thin.
  const galleryFirst = [
    ...rows.filter((r) => r.variant_kind === "gallery" || r.variant_kind === "public_watermarked"),
    ...rows.filter((r) => r.variant_kind === "hero"),
  ];
  const seen = new Set<string>();
  const deduped = galleryFirst.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  const mediaIds = deduped.map((r) => r.id);
  const offeringByMedia = new Map<string, { id: string; title: string }>();

  if (mediaIds.length > 0) {
    const { data: joins, error: joinErr } = await trusted
      .from("talent_offering_media")
      .select("media_asset_id, offering_id")
      .in("media_asset_id", mediaIds);

    if (joinErr) {
      logServerError("portfolio.loadOfferingMedia", joinErr);
    } else {
      const offeringIds = [
        ...new Set(
          (joins ?? [])
            .map((row) => (row as { offering_id: string }).offering_id)
            .filter(Boolean),
        ),
      ];
      const published = new Map<string, string>();
      if (offeringIds.length > 0) {
        const { data: offs, error: offErr } = await trusted
          .from("talent_offerings")
          .select("id, title, title_i18n")
          .in("id", offeringIds)
          .eq("status", "published")
          .eq("visibility", "public");
        if (offErr) {
          logServerError("portfolio.loadOfferings", offErr);
        } else {
          for (const o of offs ?? []) {
            const row = o as { id: string; title: string; title_i18n?: unknown };
            // The linked service's name in the visitor's language (title_i18n), not only the primary title.
            published.set(row.id, resolveLinkedOfferingTitle(row, opts?.locale, opts?.primaryLocale));
          }
        }
      }
      for (const row of joins ?? []) {
        const r = row as { media_asset_id: string; offering_id: string };
        if (offeringByMedia.has(r.media_asset_id)) continue;
        const title = published.get(r.offering_id);
        if (!title) continue;
        offeringByMedia.set(r.media_asset_id, { id: r.offering_id, title });
      }
    }
  }

  const shots: TalentPortfolioShot[] = deduped.map((r) => {
    const linked = offeringByMedia.get(r.id);
    const metaAlbum =
      typeof r.metadata?.albumId === "string" ? r.metadata.albumId.trim() : "";
    const caption = resolvePortfolioCaption(r.metadata, opts?.locale, opts?.primaryLocale);
    return {
      id: r.id,
      url: trusted.storage.from(BUCKET).getPublicUrl(r.storage_path).data.publicUrl,
      alt: resolvePortfolioAlt({
        metadata: r.metadata,
        alt: r.alt,
        caption,
        displayName: opts?.displayName,
        locale: opts?.locale,
        primaryLocale: opts?.primaryLocale,
      }),
      // Talent-written caption (media metadata), resolved for the visitor's language.
      caption,
      // TUL-15: the per-language captions, so the renderer can say when the
      // caption shown is not in the visitor's language. Absent when none.
      ...captionMapField(r.metadata),
      offeringId: linked?.id ?? null,
      offeringTitle: linked?.title ?? null,
      albumId: metaAlbum || null,
      width: r.width,
      height: r.height,
      sortOrder: r.sort_order ?? 0,
    };
  });

  return { talentPortfolioShots: shots };
}
