import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
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
 * Current effective plan key for a talent — the materialized `talent_plan_key`.
 * Returns null on any failure. Unlike the snapshot path (which fails OPEN), the
 * public Max-site gate fails CLOSED on a null plan (`maxSitePublicGate` requires
 * an exact Max match), so a transient hiccup degrades to a 404 rather than
 * leaking a premium site to a possibly-lapsed talent.
 */
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
  const { data, error } = await admin
    .from("talent_pages")
    .select(
      "id, slug, title, nav_label, status, is_home, sort_order, blocks, theme",
    )
    .eq("talent_profile_id", talentProfileId)
    .order("sort_order", { ascending: true });
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
    theme: unknown;
  };
  return ((data ?? []) as PageDb[]).map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    navLabel: p.nav_label,
    status: p.status,
    isHome: p.is_home,
    sortOrder: p.sort_order,
    blocks: p.blocks,
    theme: p.theme,
  }));
}
