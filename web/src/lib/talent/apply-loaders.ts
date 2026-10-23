import "server-only";

import { cache } from "react";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { staffTalentClient } from "@/lib/talent/staff-talent-lookup";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Read-side helpers for the apply flow (PR-G).
 *
 * - `loadOpenAgenciesForTalent` — agencies a given talent could submit
 *   `talent_agency_applications` to: opt-in flag TRUE, talent not already
 *   on the roster, talent not under active exclusivity.
 * - `loadOpenHubsForTalent` — same shape for hubs (agency_domains.kind='hub').
 * - `loadTalentOwnApplications` — the talent's own pending + decided rows
 *   (both tables) for the "Pending applications" UI strip.
 * - `loadAgencyApplications` — admin-side listing for a tenant.
 *
 * RLS does the auth work; these loaders just shape data for the UI.
 */

export type OpenApplicableAgency = {
  tenantId: string;
  slug: string | null;
  displayName: string;
  city: string | null;
  rosterCount: number | null;
};

export type TalentApplicationRow = {
  id: string;
  kind: "agency" | "hub";
  tenantId: string;
  agencyName: string;
  agencySlug: string | null;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  message: string | null;
  decisionNote: string | null;
  submittedAt: string;
  decidedAt: string | null;
};

async function isTalentExclusive(talentProfileId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return false;
  const { data, error } = await supabase
    .from("agency_talent_roster")
    .select("id")
    .eq("talent_profile_id", talentProfileId)
    .eq("is_primary", true)
    .in("exclusivity_status", ["confirmed", "auto_assigned"])
    .not("status", "in", "(removed,rejected)")
    .limit(1);
  if (error) {
    logServerError("apply-loaders/exclusive_check", error);
    return false;
  }
  return (data ?? []).length > 0;
}

export const loadOpenAgenciesForTalent = cache(
  async (talentProfileId: string): Promise<OpenApplicableAgency[]> => {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    if (await isTalentExclusive(talentProfileId)) return [];

    // Tenants where this talent is already rostered — exclude.
    const { data: existingRoster, error: rosterError } = await supabase
      .from("agency_talent_roster")
      .select("tenant_id")
      .eq("talent_profile_id", talentProfileId)
      .not("status", "in", "(removed,rejected)");
    if (rosterError) {
      logServerError("apply-loaders/existing_roster", rosterError);
      return [];
    }
    const excludeTenantIds = new Set(
      ((existingRoster ?? []) as { tenant_id: string }[]).map((r) => r.tenant_id),
    );

    // Pending applications — also exclude (no double-submit).
    const { data: pending } = await supabase
      .from("talent_agency_applications")
      .select("tenant_id")
      .eq("talent_profile_id", talentProfileId)
      .eq("status", "pending");
    for (const r of ((pending ?? []) as { tenant_id: string }[])) {
      excludeTenantIds.add(r.tenant_id);
    }

    const { data: agencies, error } = await supabase
      .from("agencies")
      .select("id, slug, display_name")
      .eq("accepts_open_applications", true)
      .limit(50);
    if (error) {
      logServerError("apply-loaders/open_agencies", error);
      return [];
    }

    return ((agencies ?? []) as { id: string; slug: string | null; display_name: string }[])
      .filter((a) => !excludeTenantIds.has(a.id))
      .map((a) => ({
        tenantId: a.id,
        slug: a.slug,
        displayName: a.display_name,
        city: null,
        rosterCount: null,
      }));
  },
);

export const loadOpenHubsForTalent = cache(
  async (talentProfileId: string): Promise<OpenApplicableAgency[]> => {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];
    if (await isTalentExclusive(talentProfileId)) return [];

    const { data: existingRoster } = await supabase
      .from("agency_talent_roster")
      .select("tenant_id")
      .eq("talent_profile_id", talentProfileId)
      .not("status", "in", "(removed,rejected)");
    const excludeTenantIds = new Set(
      ((existingRoster ?? []) as { tenant_id: string }[]).map((r) => r.tenant_id),
    );

    const { data: pending } = await supabase
      .from("talent_hub_applications")
      .select("tenant_id")
      .eq("talent_profile_id", talentProfileId)
      .eq("status", "pending");
    for (const r of ((pending ?? []) as { tenant_id: string }[])) {
      excludeTenantIds.add(r.tenant_id);
    }

    const { data: hubs, error } = await supabase
      .from("agency_domains")
      .select("tenant_id, agencies!agency_domains_tenant_id_fkey ( id, slug, display_name )")
      .eq("kind", "hub")
      .not("tenant_id", "is", null)
      .limit(50);
    if (error) {
      logServerError("apply-loaders/open_hubs", error);
      return [];
    }

    type HubRow = {
      tenant_id: string;
      agencies: { id: string; slug: string | null; display_name: string } | null;
    };
    const seen = new Set<string>();
    const out: OpenApplicableAgency[] = [];
    for (const row of ((hubs ?? []) as unknown as HubRow[])) {
      if (!row.tenant_id) continue;
      if (excludeTenantIds.has(row.tenant_id)) continue;
      if (seen.has(row.tenant_id)) continue;
      seen.add(row.tenant_id);
      out.push({
        tenantId: row.tenant_id,
        slug: row.agencies?.slug ?? null,
        displayName: row.agencies?.display_name ?? "Hub",
        city: null,
        rosterCount: null,
      });
    }
    return out;
  },
);

export const loadTalentOwnApplications = cache(
  async (talentProfileId: string): Promise<TalentApplicationRow[]> => {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const [agencyRes, hubRes] = await Promise.all([
      supabase
        .from("talent_agency_applications")
        .select(
          "id, tenant_id, status, message, decision_note, submitted_at, decided_at, agencies!talent_agency_applications_tenant_id_fkey ( slug, display_name )",
        )
        .eq("talent_profile_id", talentProfileId)
        .order("submitted_at", { ascending: false }),
      supabase
        .from("talent_hub_applications")
        .select(
          "id, tenant_id, status, message, decision_note, submitted_at, decided_at, agencies!talent_hub_applications_tenant_id_fkey ( slug, display_name )",
        )
        .eq("talent_profile_id", talentProfileId)
        .order("submitted_at", { ascending: false }),
    ]);

    type Row = {
      id: string;
      tenant_id: string;
      status: "pending" | "approved" | "rejected" | "withdrawn";
      message: string | null;
      decision_note: string | null;
      submitted_at: string;
      decided_at: string | null;
      agencies: { slug: string | null; display_name: string } | null;
    };
    const out: TalentApplicationRow[] = [];
    for (const r of ((agencyRes.data ?? []) as unknown as Row[])) {
      out.push({
        id: r.id,
        kind: "agency",
        tenantId: r.tenant_id,
        agencyName: r.agencies?.display_name ?? "Agency",
        agencySlug: r.agencies?.slug ?? null,
        status: r.status,
        message: r.message,
        decisionNote: r.decision_note,
        submittedAt: r.submitted_at,
        decidedAt: r.decided_at,
      });
    }
    for (const r of ((hubRes.data ?? []) as unknown as Row[])) {
      out.push({
        id: r.id,
        kind: "hub",
        tenantId: r.tenant_id,
        agencyName: r.agencies?.display_name ?? "Hub",
        agencySlug: r.agencies?.slug ?? null,
        status: r.status,
        message: r.message,
        decisionNote: r.decision_note,
        submittedAt: r.submitted_at,
        decidedAt: r.decided_at,
      });
    }
    out.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    return out;
  },
);

export type AgencyApplicationAdminRow = {
  id: string;
  kind: "agency" | "hub";
  talentProfileId: string;
  talentDisplayName: string;
  talentProfileCode: string | null;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  message: string | null;
  decisionNote: string | null;
  submittedAt: string;
  decidedAt: string | null;
};

type ApplicationClient = SupabaseClient;

/**
 * TUL-1359: the applications are read with the caller's own session (RLS keeps
 * them to this tenant), but the applicant's name and code are read with the
 * SERVICE client, keyed by the talent ids those authorized rows carry.
 * Applicants are not on the roster and are often unpublished, so once
 * `talent_profiles` SELECT is roster-scoped a session-side embed would come
 * back empty and every applicant would render as "Talent". The caller
 * (admin/roster/applications/page.tsx) has already passed the tenant
 * capability check.
 */
export async function buildAgencyApplicationRows(
  supabase: ApplicationClient,
  talentClient: ApplicationClient,
  tenantId: string,
): Promise<AgencyApplicationAdminRow[]> {
  const [agencyRes, hubRes] = await Promise.all([
    supabase
      .from("talent_agency_applications")
      .select("id, talent_profile_id, status, message, decision_note, submitted_at, decided_at")
      .eq("tenant_id", tenantId)
      .order("submitted_at", { ascending: false }),
    supabase
      .from("talent_hub_applications")
      .select("id, talent_profile_id, status, message, decision_note, submitted_at, decided_at")
      .eq("tenant_id", tenantId)
      .order("submitted_at", { ascending: false }),
  ]);

  type Row = {
    id: string;
    talent_profile_id: string;
    status: "pending" | "approved" | "rejected" | "withdrawn";
    message: string | null;
    decision_note: string | null;
    submitted_at: string;
    decided_at: string | null;
  };
  const agencyRows = (agencyRes.data ?? []) as unknown as Row[];
  const hubRows = (hubRes.data ?? []) as unknown as Row[];

  const talentIds = [...new Set([...agencyRows, ...hubRows].map((r) => r.talent_profile_id))];
  const people = new Map<string, { display_name: string | null; profile_code: string | null }>();
  if (talentIds.length > 0) {
    const { data: profiles, error } = await talentClient
      .from("talent_profiles")
      .select("id, display_name, profile_code")
      .in("id", talentIds);
    if (error) logServerError("talent.applyLoaders.applicationTalent", error);
    for (const p of (profiles ?? []) as Array<{ id: string; display_name: string | null; profile_code: string | null }>) {
      people.set(p.id, { display_name: p.display_name, profile_code: p.profile_code });
    }
  }

  const out: AgencyApplicationAdminRow[] = [];
  for (const [kind, rows] of [["agency", agencyRows], ["hub", hubRows]] as const) {
    for (const r of rows) {
      const person = people.get(r.talent_profile_id);
      out.push({
        id: r.id,
        kind,
        talentProfileId: r.talent_profile_id,
        talentDisplayName: person?.display_name ?? "Talent",
        talentProfileCode: person?.profile_code ?? null,
        status: r.status,
        message: r.message,
        decisionNote: r.decision_note,
        submittedAt: r.submitted_at,
        decidedAt: r.decided_at,
      });
    }
  }
  out.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  return out;
}

export const loadAgencyApplications = cache(
  async (tenantId: string): Promise<AgencyApplicationAdminRow[]> => {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];
    return buildAgencyApplicationRows(supabase, await staffTalentClient(supabase), tenantId);
  },
);
