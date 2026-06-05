import "server-only";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  resolveEffectiveVisibility,
  type AgencyVisibility,
  type RepresentationEntry,
  type RosterStatus,
} from "@/lib/talent/representation";
import {
  agencyRosterProfileUrl,
  platformSelfProfileUrl,
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
    return a.name.localeCompare(b.name);
  });
}

export async function loadRepresentation(
  talentProfileId: string,
  profileCode: string | null,
): Promise<RepresentationLoadResult> {
  const empty: RepresentationLoadResult = { entries: [], globalHidden: false };

  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return empty;
    const trusted = createServiceRoleClient() ?? supabase;

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

    const rosterEntries: RepresentationEntry[] = ((data ?? []) as unknown as RosterRow[]).map(
      (row) => {
        const agency = Array.isArray(row.agencies) ? row.agencies[0] : row.agencies;
        const agencyVisibility = asAgencyVisibility(row.agency_visibility ?? "roster_only");
        const status = asRosterStatus(row.status);
        const talentSiteHidden = row.talent_site_hidden ?? false;
        const slug = agency?.slug ?? "";
        const kind = agency?.kind === "hub" ? "hub" : "agency";

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
          publicUrl:
            agencyRosterProfileUrl(slug, profileCode, kind === "hub") ??
            platformSelfProfileUrl(profileCode) ??
            "",
          effective: resolveEffectiveVisibility({
            status,
            agencyVisibility,
            talentSiteHidden,
            globalHidden,
          }),
        };
      },
    );

    const selfUrl = platformSelfProfileUrl(profileCode) ?? "";
    const selfEntry: RepresentationEntry = {
      tenantId: talentProfileId,
      slug: "self",
      name: "Your Tulala page",
      kind: "self_page",
      planTier: null,
      status: "active",
      agencyVisibility: "site_visible",
      talentSiteHidden: false,
      isPrimary: false,
      takeRatePct: null,
      joinedAt: null,
      publicUrl: selfUrl,
      effective: globalHidden ? "global_hidden" : "live",
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
