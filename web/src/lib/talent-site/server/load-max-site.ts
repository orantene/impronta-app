import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { isTalentThemeGalleryEnabled } from "@/lib/access/talent-theme-gallery";
import { talentOffersInstantBooking } from "@/lib/scheduling/talent-booking-mode";
import { resolveSiteCtaMode, type SiteCtaMode } from "@/lib/talent-site/design-label-locale";
import type {
  MaxSitePageRow,
  MaxSiteRow,
} from "@/lib/talent-site/resolve-max-site-core";

/**
 * Talent Max Site — server LOADS (service-role reads).
 *
 * The public Max-site render needs to read a talent's site record + ALL its
 * pages (including the home flag + nav metadata) by site slug or profile id.
 * RLS on `talent_pages` exposes only `status='published'` rows to anon, but the
 * site render must ALSO see the home flag / sort order to build nav, and the
 * owner draft-preview path must see drafts — so these reads use the SERVICE-ROLE
 * client, scoped to ONE talent_profile_id, and the PURE core re-applies the
 * publish gate (`selectMaxSitePage` / `buildMaxSiteNav` filter to published for
 * the public path). This never widens what a visitor sees: the page-status gate
 * is enforced in the pure core, and the plan gate in `maxSitePublicGate`.
 *
 * Every loader returns null / [] on any failure so the render degrades to a 404
 * rather than throwing to the visitor.
 */

type TalentSiteRowDb = {
  talent_profile_id: string;
  site_slug: string | null;
  shell_tree: unknown;
  shell_published: unknown;
  logo_url: string | null;
  site_published_at: string | null;
};

function mapSiteRow(row: TalentSiteRowDb): MaxSiteRow {
  return {
    talentProfileId: row.talent_profile_id,
    siteSlug: row.site_slug,
    shellTree: row.shell_tree,
    shellPublished: row.shell_published,
    logoUrl: row.logo_url,
    sitePublishedAt: row.site_published_at,
  };
}

const SITE_COLUMNS =
  "talent_profile_id, site_slug, shell_tree, shell_published, logo_url, site_published_at";

/** Load a talent's site record by its globally-unique `site_slug`. */
export async function loadMaxSiteBySlug(
  siteSlug: string,
): Promise<MaxSiteRow | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("talent_sites")
    .select(SITE_COLUMNS)
    .eq("site_slug", siteSlug)
    .maybeSingle();
  if (error) {
    logServerError("talentMaxSite.load.bySlug", error);
    return null;
  }
  if (!data) return null;
  return mapSiteRow(data as TalentSiteRowDb);
}

/** Load a talent's site record by `talent_profile_id` (custom-domain path). */
export async function loadMaxSiteByProfileId(
  talentProfileId: string,
): Promise<MaxSiteRow | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("talent_sites")
    .select(SITE_COLUMNS)
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();
  if (error) {
    logServerError("talentMaxSite.load.byProfileId", error);
    return null;
  }
  if (!data) return null;
  return mapSiteRow(data as TalentSiteRowDb);
}

/**
 * The site-level THEME tokens (theme gallery Look layer) for a talent's site:
 * `design_tokens` for the public render, `design_tokens_draft` for the owner
 * draft preview. Returns `{}` WITHOUT querying while
 * TALENT_THEME_GALLERY_ENABLED is off, and `{}` on any failure (including the
 * columns not existing yet), so the render falls back to today's cascade.
 * Deliberately a separate read: `SITE_COLUMNS` stays untouched, so a site load
 * can never fail because of these columns.
 */
export async function loadMaxSiteThemeTokens(
  talentProfileId: string,
  opts: { draft: boolean },
): Promise<Record<string, string>> {
  if (!isTalentThemeGalleryEnabled()) return {};
  const admin = createServiceRoleClient();
  if (!admin) return {};
  const column = opts.draft ? "design_tokens_draft" : "design_tokens";
  const { data, error } = await admin
    .from("talent_sites")
    .select(column)
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();
  if (error) {
    logServerError("talentMaxSite.load.themeTokens", error);
    return {};
  }
  const raw = (data as Record<string, unknown> | null)?.[column];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

/**
 * The catalog Design the site wears (`theme_design_slug`), for the design
 * token defaults (`design-type-system.ts`). Null on any failure: the site then renders
 * without Design defaults, never broken.
 */
export async function loadMaxSiteDesignSlug(talentProfileId: string): Promise<string | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("talent_sites")
    .select("theme_design_slug")
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();
  if (error) {
    logServerError("talentMaxSite.load.designSlug", error);
    return null;
  }
  const slug = (data as { theme_design_slug?: unknown } | null)?.theme_design_slug;
  return typeof slug === "string" && slug.trim() ? slug.trim() : null;
}

/**
 * Current effective plan key for a talent — the materialized `talent_plan_key`.
 * Returns null on any failure. Unlike the snapshot path (which fails OPEN), the
 * public Max-site gate fails CLOSED on a null plan (`maxSitePublicGate` requires
 * an exact Max match), so a transient hiccup degrades to a 404 rather than
 * leaking a premium site to a possibly-lapsed talent.
 */
/**
 * The talent's raw `selling_defaults` (booking posture for seeded site CTAs).
 * A failed read returns null; the caller then renders the legacy instant copy.
 */
export async function loadTalentSellingDefaults(talentProfileId: string): Promise<unknown> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("talent_profiles")
    .select("selling_defaults")
    .eq("id", talentProfileId)
    .maybeSingle();
  if (error) {
    logServerError("talentSite.loadSellingDefaults", error);
    return null;
  }
  return (data as { selling_defaults?: unknown } | null)?.selling_defaults ?? null;
}

/**
 * Site-wide CTA mode for seeded action copy (Folio footer line, Frame
 * "Book a session", ...): booking posture with the plan ceiling applied.
 */
export async function loadTalentSiteCtaMode(
  talentProfileId: string,
  planKey: string | null,
): Promise<SiteCtaMode> {
  return resolveSiteCtaMode({
    sellingDefaults: await loadTalentSellingDefaults(talentProfileId),
    confirmsByHand: !talentOffersInstantBooking(planKey),
  });
}

export async function loadTalentPlanKey(
  talentProfileId: string,
): Promise<string | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("talent_profiles")
    .select("talent_plan_key, is_publicly_hidden")
    .eq("id", talentProfileId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as {
    talent_plan_key: string | null;
    is_publicly_hidden: boolean | null;
  };
  // A hidden talent's site never serves publicly.
  if (row.is_publicly_hidden) return null;
  return row.talent_plan_key ?? null;
}

/** Resolve `talent_profiles.user_id` for owner-only draft preview gating. */
export async function loadTalentOwnerUserId(
  talentProfileId: string,
): Promise<string | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("talent_profiles")
    .select("user_id")
    .eq("id", talentProfileId)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { user_id: string | null }).user_id ?? null;
}

/**
 * The managing agency tenant for a talent (`created_by_agency_id`) — the
 * section-embed render-context tenant for the page body. May be null (an
 * unrostered talent); section embeds then fall back to their placeholder.
 */
export async function loadTalentManagingTenantId(
  talentProfileId: string,
): Promise<string | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("talent_profiles")
    .select("created_by_agency_id")
    .eq("id", talentProfileId)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { created_by_agency_id: string | null }).created_by_agency_id ?? null;
}

/** Load ALL of a talent's site pages (the pure core filters for nav/render). */
export async function loadMaxSitePages(
  talentProfileId: string,
): Promise<MaxSitePageRow[]> {
  const admin = createServiceRoleClient();
  if (!admin) return [];
  // SEO-2 — widened to carry the SEO-1 per-page SEO columns through the
  // render path. All SEO fields are nullable so a not-yet-populated page
  // degrades to undefined SEO and never throws.
  const BASE_COLS =
    "id, slug, title, nav_label, status, is_home, sort_order, blocks, theme, meta_title, meta_description, og_title, og_description, og_image_url, canonical_url, noindex, json_ld";
  const selectPages = (cols: string) =>
    admin
      .from("talent_pages")
      .select(cols)
      .eq("talent_profile_id", talentProfileId)
      .order("sort_order", { ascending: true });
  // `blocks_published` is the live body visitors see (`blocks` is the draft).
  // Selected on a graceful path: a database without the migration errors the
  // whole query, so fall back to the base list, which renders `blocks` as before.
  let { data, error } = await selectPages(`${BASE_COLS}, blocks_published`);
  if (error) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console -- dev-only signal for a missing migration
      console.warn(
        `[talentMaxSite.load.pages] blocks_published unreadable (${error.message}); serving draft bodies. Apply 20261231289000_talent_pages_blocks_published.sql.`,
      );
    }
    ({ data, error } = await selectPages(BASE_COLS));
  }
  if (error) {
    logServerError("talentMaxSite.load.pages", error);
    return [];
  }
  type PageDb = {
    id: string;
    slug: string;
    title: string;
    nav_label: string | null;
    status: string;
    is_home: boolean;
    sort_order: number;
    blocks: unknown;
    blocks_published?: unknown;
    theme: unknown;
    meta_title: string | null;
    meta_description: string | null;
    og_title: string | null;
    og_description: string | null;
    og_image_url: string | null;
    canonical_url: string | null;
    noindex: boolean | null;
    json_ld: unknown;
  };
  return ((data ?? []) as unknown as PageDb[]).map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    navLabel: p.nav_label,
    status: p.status,
    isHome: p.is_home,
    sortOrder: p.sort_order,
    blocks: p.blocks,
    blocksPublished: p.blocks_published,
    theme: p.theme,
    metaTitle: p.meta_title ?? null,
    metaDescription: p.meta_description ?? null,
    ogTitle: p.og_title ?? null,
    ogDescription: p.og_description ?? null,
    ogImageUrl: p.og_image_url ?? null,
    canonicalUrl: p.canonical_url ?? null,
    noindex: p.noindex ?? null,
    jsonLd: p.json_ld ?? null,
  }));
}

/**
 * SEO-2 — the talent's PUBLIC identity for the site's JSON-LD + OG image.
 *
 * Reads the display name + name parts + timestamps for a talent_profile_id. Used
 * by the render path to populate the shared `buildTalentProfileJsonLd` (with the
 * SITE's own canonical, not the /t/[code] profile) and by the OG-image route.
 * Service-role, scoped to one id; returns null on any miss so SEO degrades to
 * the page title / site slug rather than throwing.
 */
export interface TalentSiteIdentity {
  name: string;
  firstName: string | null;
  lastName: string | null;
  profileCode: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export async function loadTalentSiteIdentity(
  talentProfileId: string,
): Promise<TalentSiteIdentity | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("talent_profiles")
    .select(
      "display_name, first_name, last_name, profile_code, created_at, updated_at",
    )
    .eq("id", talentProfileId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as {
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    profile_code: string;
    created_at: string | null;
    updated_at: string | null;
  };
  const composed = [row.first_name, row.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const name = row.display_name?.trim() || composed || row.profile_code;
  return {
    name,
    firstName: row.first_name,
    lastName: row.last_name,
    profileCode: row.profile_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
