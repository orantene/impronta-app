import "server-only";

import { cookies } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

export const ACTIVE_TALENT_TENANT_COOKIE = "tulala.talent.active_tenant_id";

export type ActiveTalentAgencyContext = {
  tenantId: string;
  slug: string;
  displayName: string;
  /**
   * True when this is the talent's EXCLUSIVE (primary) agency —
   * `agency_talent_roster.is_primary`. The runtime source of truth for
   * exclusivity: declining exclusivity flips this back to false. Consumers
   * that gate whitelabel branding on "exclusive to a whitelabel agency" read
   * this together with the agency's plan tier.
   */
  isPrimary: boolean;
};

type RosterAgencyRow = {
  tenant_id: string;
  is_primary: boolean | null;
  status: string;
  agencies: { slug: string; display_name: string | null } | { slug: string; display_name: string | null }[] | null;
};

function mapAgency(
  row: RosterAgencyRow,
): ActiveTalentAgencyContext | null {
  const agencies = row.agencies;
  const agency = Array.isArray(agencies) ? agencies[0] : agencies;
  if (!agency?.slug) return null;
  return {
    tenantId: row.tenant_id,
    slug: agency.slug,
    displayName: agency.display_name?.trim() || agency.slug,
    isPrimary: row.is_primary === true,
  };
}

async function loadRosterAgencies(
  talentProfileId: string,
): Promise<ActiveTalentAgencyContext[]> {
  const admin = createServiceRoleClient();
  if (!admin) return [];

  const { data, error } = await admin
    .from("agency_talent_roster")
    .select("tenant_id, is_primary, status, agencies!tenant_id ( slug, display_name )")
    .eq("talent_profile_id", talentProfileId)
    .in("status", ["active", "pending"])
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    logServerError("talent.activeAgency.roster", error);
    return [];
  }

  const out: ActiveTalentAgencyContext[] = [];
  for (const row of data ?? []) {
    const mapped = mapAgency(row as unknown as RosterAgencyRow);
    if (mapped) out.push(mapped);
  }
  return out;
}

export async function loadPrimaryTalentAgency(
  talentProfileId: string,
): Promise<ActiveTalentAgencyContext | null> {
  const roster = await loadRosterAgencies(talentProfileId);
  if (roster.length === 0) return null;
  return roster.find((r) => r) ?? roster[0] ?? null;
}

export async function getActiveTalentAgencyContext(
  talentProfileId: string,
): Promise<ActiveTalentAgencyContext | null> {
  const roster = await loadRosterAgencies(talentProfileId);
  if (roster.length === 0) return null;

  try {
    const cookieStore = await cookies();
    const preferred = cookieStore.get(ACTIVE_TALENT_TENANT_COOKIE)?.value?.trim();
    if (preferred) {
      const match = roster.find((r) => r.tenantId === preferred);
      if (match) return match;
    }
  } catch {
    // cookies() outside request scope
  }

  return roster[0] ?? null;
}

export async function listTalentAgencyContexts(
  talentProfileId: string,
): Promise<ActiveTalentAgencyContext[]> {
  return loadRosterAgencies(talentProfileId);
}
