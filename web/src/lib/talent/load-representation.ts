import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  isEffectivelyVisible,
  resolveEffectiveVisibility,
  type AgencyVisibility,
  type EffectiveVisibility,
  type RepresentationEntry,
  type RepresentationKind,
  type RosterStatus,
} from "@/lib/talent/representation";
import { byName } from "@/lib/field-engine/sort-comparators";
import {
  agencyRosterProfileUrl,
  platformSelfProfileUrl,
  resolveAgencyPublicOrigins,
} from "@/lib/talent/agency-roster-profile-url";

export type RepresentationLoadResult = {
  entries: RepresentationEntry[];
  globalHidden: boolean;
};

type RosterRow = {
  status: string;
  created_at: string;
  is_primary: boolean;
  agency_visibility: string;
  talent_site_hidden: boolean | null;
  agencies: {
    id: string;
    display_name: string;
    slug: string;
    plan_tier: string | null;
    kind: string;
  } | {
    id: string;
    display_name: string;
    slug: string;
    plan_tier: string | null;
    kind: string;
  }[] | null;
};

function asAgencyVisibility(v: string): AgencyVisibility {
  if (v === "site_visible" || v === "featured") return v;
  return "roster_only";
}

function asRosterStatus(v: string): RosterStatus {
  if (v === "active" || v === "pending" || v === "inactive" || v === "removed") {
    return v;
  }
  return "active";
}

function sortEntries(entries: RepresentationEntry[]): RepresentationEntry[] {
  return [...entries].sort((a, b) => {
    if (a.kind === "self_page") return -1;
    if (b.kind === "self_page") return 1;
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    if (a.kind === "hub" && b.kind !== "hub") return -1;
    if (b.kind === "hub" && a.kind !== "hub") return 1;
    return byName(a, b);
  });
}

/**
 * Test-only injection seam: a caller may hand in a fully-fake Supabase client
 * instead of going through the real cookie/service-role clients. Production
 * code never passes this — see `agency-roster-profile-url` and
 * `load-representation.test.ts`.
 */
export type LoadRepresentationDeps = {
  client?: SupabaseClient;
};

export async function loadRepresentation(
  talentProfileId: string,
  profileCode: string | null,
  deps?: LoadRepresentationDeps,
): Promise<RepresentationLoadResult> {
  const empty: RepresentationLoadResult = { entries: [], globalHidden: false };

  try {
    const supabase = deps?.client ?? (await createSupabaseServerClient());
    if (!supabase) return empty;
    const trusted = deps?.client ?? createServiceRoleClient() ?? supabase;

    const { data: profileRow, error: profileErr } = await trusted
      .from("talent_profiles")
      .select("is_publicly_hidden")
      .eq("id", talentProfileId)
      .maybeSingle();

    if (profileErr) {
      logServerError("representation.load.profile", profileErr);
      return empty;
    }

    const globalHidden = profileRow?.is_publicly_hidden ?? false;

    const { data, error } = await trusted
      .from("agency_talent_roster")
      .select(`
        status,
        created_at,
        is_primary,
        agency_visibility,
        talent_site_hidden,
        agencies!tenant_id ( id, display_name, slug, plan_tier, kind )
      `)
      .eq("talent_profile_id", talentProfileId)
      .neq("status", "removed")
      .order("created_at", { ascending: true });

    if (error) {
      logServerError("representation.load.roster", error);
      return { entries: [], globalHidden };
    }

    // Batch-fetch workspace logos (agency_branding.theme_json.logo_url) for all
    // tenants in this talent's roster, so each row can show a brand square.
    const tenantIds = Array.from(
      new Set(
        ((data ?? []) as unknown as RosterRow[])
          .map((r) => (Array.isArray(r.agencies) ? r.agencies[0] : r.agencies)?.id)
          .filter((id): id is string => !!id),
      ),
    );
    const logoByTenant = new Map<string, string>();
    if (tenantIds.length > 0) {
      const { data: brandingRows } = await trusted
        .from("agency_branding")
        .select("tenant_id, theme_json")
        .in("tenant_id", tenantIds);
      for (const b of (brandingRows ?? []) as Array<{ tenant_id: string; theme_json: unknown }>) {
        const theme = (b.theme_json ?? {}) as Record<string, unknown>;
        const url = typeof theme.logo_url === "string" ? theme.logo_url.trim() : "";
        if (url) logoByTenant.set(b.tenant_id, url);
      }
    }

    // Real public origin per agency (custom domain, else branded subdomain),
    // resolved once for every tenant on this roster. Agencies with neither
    // fall back to the `/w/<slug>` path form inside `agencyRosterProfileUrl`.
    const originByTenant = await resolveAgencyPublicOrigins(trusted, tenantIds);

    const allRows = (data ?? []) as unknown as RosterRow[];

    // The platform hub is not a separate place the talent "appears" — it IS
    // the Tulala self page, and listing both showed the same /t/<code> URL
    // twice. Fold it into the self entry below. Only the FIRST hub row is
    // folded: the M0 migration asserts exactly one kind='hub' org today, but
    // if a second hub ever exists, that is a real, separate membership and it
    // must stay visible rather than be silently swallowed by the dedupe.
    let hubRow: RosterRow | null = null;
    const rows = allRows.filter((row) => {
      const agency = Array.isArray(row.agencies) ? row.agencies[0] : row.agencies;
      if (agency?.kind === "hub" && !hubRow) {
        hubRow = row;
        return false;
      }
      return true;
    });

    const rosterEntries: RepresentationEntry[] = rows.map((row) => {
      const agency = Array.isArray(row.agencies) ? row.agencies[0] : row.agencies;
      const agencyVisibility = asAgencyVisibility(row.agency_visibility ?? "roster_only");
      const status = asRosterStatus(row.status);
      const talentSiteHidden = row.talent_site_hidden ?? false;
      const slug = agency?.slug ?? "";
      const kind: RepresentationKind = agency?.kind === "hub" ? "hub" : "agency";

      const effective = resolveEffectiveVisibility({
        status,
        agencyVisibility,
        talentSiteHidden,
        globalHidden,
      });
      const resolvedOrigin = agency?.id ? originByTenant.get(agency.id) ?? null : null;
      const url =
        agencyRosterProfileUrl(slug, profileCode, kind === "hub", resolvedOrigin) ?? "";

      return {
        tenantId: agency?.id ?? row.created_at,
        slug,
        name: agency?.display_name ?? "Unknown agency",
        kind,
        planTier: agency?.plan_tier ?? null,
        status,
        agencyVisibility,
        talentSiteHidden,
        isPrimary: row.is_primary ?? false,
        takeRatePct: null,
        joinedAt: row.created_at,
        // A pending or otherwise non-visible entry's page on THAT agency host
        // 404s (`assertTalentVisibleOnAgencySurface`), so show the status the
        // `effective` field already carries instead of a link to a 404.
        publicUrl: isEffectivelyVisible(effective) ? url : "",
        logoUrl: agency?.id ? logoByTenant.get(agency.id) ?? null : null,
        effective,
      };
    });

    const selfUrl = platformSelfProfileUrl(profileCode) ?? "";
    const hub = hubRow as RosterRow | null;

    // Visibility TRUTH for the merged entry comes from the hub roster row —
    // that is what the talent and the hub actually toggled, and it is what the
    // chip must say.
    const selfEffective: EffectiveVisibility = hub
      ? resolveEffectiveVisibility({
          status: asRosterStatus(hub.status),
          agencyVisibility: asAgencyVisibility(hub.agency_visibility ?? "roster_only"),
          talentSiteHidden: hub.talent_site_hidden ?? false,
          globalHidden,
        })
      : globalHidden
        ? "global_hidden"
        : "live";

    // Whether the LINK resolves is a different question, and the apex answers
    // it differently from an agency host. `tulala.digital/t/<code>` is gated by
    // `talent_select_public`: `is_publicly_hidden = false` AND
    // `talent_has_public_roster()`, i.e. ANY active roster row with
    // site_visible/featured — not the hub row specifically, and
    // `talent_site_hidden` is not consulted at all. Deriving the self link from
    // `selfEffective` instead would hide a working link whenever the talent is
    // roster-only on the hub but site-visible at an agency (and vice versa).
    const selfPageResolves =
      !globalHidden &&
      allRows.some((row) => {
        const status = asRosterStatus(row.status);
        const visibility = asAgencyVisibility(row.agency_visibility ?? "roster_only");
        return status === "active" && visibility !== "roster_only";
      });

    const selfEntry: RepresentationEntry = {
      tenantId: hub
        ? (Array.isArray(hub.agencies) ? hub.agencies[0] : hub.agencies)?.id ?? talentProfileId
        : talentProfileId,
      slug: "self",
      name: "Your Tulala page",
      kind: "self_page",
      planTier: null,
      status: hub ? asRosterStatus(hub.status) : "active",
      agencyVisibility: hub ? asAgencyVisibility(hub.agency_visibility ?? "roster_only") : "site_visible",
      talentSiteHidden: hub ? hub.talent_site_hidden ?? false : false,
      isPrimary: hub ? hub.is_primary ?? false : false,
      takeRatePct: null,
      joinedAt: hub ? hub.created_at : null,
      publicUrl: selfPageResolves ? selfUrl : "",
      logoUrl: null,
      effective: selfEffective,
    };

    return {
      entries: sortEntries([selfEntry, ...rosterEntries]),
      globalHidden,
    };
  } catch (err) {
    logServerError("representation.load", err);
    return empty;
  }
}
