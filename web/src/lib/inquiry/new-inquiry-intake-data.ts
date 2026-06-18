import "server-only";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { enrichPickerTalents } from "@/lib/inquiry/picker-talent-guard";

/**
 * new-inquiry-intake-data — server loader for the admin "New inquiry" sheet
 * (web/src/components/admin/admin-new-inquiry-sheet.tsx).
 *
 * The sheet takes three lists: client accounts ("Work Location"), their
 * secondary contacts, and the represented-talent picker options. The talent
 * options are run through `enrichPickerTalents` so the picker can render the
 * exclusivity lock badge + availability dots + the two filter toggles. Before
 * this loader existed the sheet was never mounted on a live route, so the
 * enrichment helper was dead code — this is the data path that activates it.
 *
 * All three reads are tenant-scoped. The talent read self-elevates to
 * service-role for the same reason `loadWorkspaceRosterForCurrentTenant` does
 * (RLS collapses the `talent_profiles` embed to null for invited/hidden
 * talent even for the owning admin); the caller is already gated on
 * `agency.workspace.view` and every query pins `tenant_id`, so there is no
 * cross-tenant leak. `enrichPickerTalents` likewise needs service-role to see
 * OTHER tenants' roster rows (to detect exclusive-elsewhere) and the
 * RLS-bypassed Discover matview.
 */

export type IntakeAccountOption = { id: string; name: string };
export type IntakeContactOption = { id: string; client_account_id: string; label: string };
export type IntakeTalentOption = {
  id: string;
  profile_code: string;
  display_name: string | null;
  isExclusiveElsewhere?: boolean;
  nextAvailableDate?: string | null;
  availableDaysInNext30?: number | null;
  availabilityDots14d?: string | null;
};

export type NewInquiryIntakeData = {
  accounts: IntakeAccountOption[];
  contacts: IntakeContactOption[];
  talents: IntakeTalentOption[];
};

const EMPTY: NewInquiryIntakeData = { accounts: [], contacts: [], talents: [] };

/**
 * Load everything the New-Inquiry sheet needs for `tenantId`, with the talent
 * picker options enriched. Degrades to empty lists on any failure so the
 * hosting page never crashes — the sheet simply shows fewer options.
 */
export async function loadNewInquiryIntakeData(
  tenantId: string,
): Promise<NewInquiryIntakeData> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return EMPTY;

    // Service-role for the talent read (see module header) — RLS would null the
    // talent_profiles embed for invited/hidden talent. Falls back to the user
    // client when the service key isn't configured.
    const admin = createServiceRoleClient();
    const talentReadClient = admin ?? supabase;

    const [accountsRes, contactsRes, rosterRes] = await Promise.all([
      supabase
        .from("client_accounts")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .order("name", { ascending: true }),
      supabase
        .from("client_account_contacts")
        .select("id, client_account_id, full_name")
        .eq("tenant_id", tenantId)
        .is("archived_at", null)
        .order("full_name", { ascending: true }),
      talentReadClient
        .from("agency_talent_roster")
        .select("talent_profile_id, talent_profiles!talent_profile_id ( id, profile_code, display_name )")
        .eq("tenant_id", tenantId)
        .neq("status", "removed")
        .order("created_at", { ascending: true }),
    ]);

    if (accountsRes.error) {
      logServerError("inquiry.loadNewInquiryIntakeData.accounts", accountsRes.error);
    }
    if (contactsRes.error) {
      logServerError("inquiry.loadNewInquiryIntakeData.contacts", contactsRes.error);
    }
    if (rosterRes.error) {
      logServerError("inquiry.loadNewInquiryIntakeData.roster", rosterRes.error);
    }

    const accounts: IntakeAccountOption[] = (accountsRes.data ?? []).map((a) => ({
      id: a.id as string,
      name: (a.name as string | null) ?? "Untitled location",
    }));

    const contacts: IntakeContactOption[] = (contactsRes.data ?? []).map((c) => ({
      id: c.id as string,
      client_account_id: c.client_account_id as string,
      label: (c.full_name as string | null) ?? "Contact",
    }));

    // Flatten the roster → talent option list. The embed can arrive as a single
    // object or a one-element array depending on PostgREST inference; normalise.
    type RawRoster = {
      talent_profile_id: string;
      talent_profiles:
        | { id: string; profile_code: string | null; display_name: string | null }
        | { id: string; profile_code: string | null; display_name: string | null }[]
        | null;
    };
    const baseTalents: IntakeTalentOption[] = [];
    for (const raw of (rosterRes.data ?? []) as unknown as RawRoster[]) {
      const profile = Array.isArray(raw.talent_profiles)
        ? raw.talent_profiles[0]
        : raw.talent_profiles;
      if (!profile) continue;
      if (!profile.profile_code) continue; // picker keys + searches on profile_code
      baseTalents.push({
        id: profile.id,
        profile_code: profile.profile_code,
        display_name: profile.display_name,
      });
    }

    // Enrich with exclusivity + availability. Needs service-role to read other
    // tenants' roster rows + the RLS-bypassed matview; degrades to empty
    // enrichment (no badges/dots) when the key is absent.
    let talents = baseTalents;
    if (admin && baseTalents.length > 0) {
      const enrichment = await enrichPickerTalents(
        admin,
        tenantId,
        baseTalents.map((t) => t.id),
      );
      talents = baseTalents.map((t) => {
        const e = enrichment.get(t.id);
        if (!e) return t;
        return {
          ...t,
          isExclusiveElsewhere: e.isExclusiveElsewhere,
          nextAvailableDate: e.nextAvailableDate,
          availableDaysInNext30: e.availableDaysInNext30,
          availabilityDots14d: e.availabilityDots14d,
        };
      });
    }

    return { accounts, contacts, talents };
  } catch (err) {
    logServerError("inquiry.loadNewInquiryIntakeData", err);
    return EMPTY;
  }
}
