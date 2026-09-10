import "server-only";

/**
 * people-data.ts — the ONE read behind the People surface.
 *
 * It gathers the three hats for every human this workspace deals with, and
 * hands the pure model in `lib/people/hats.ts` the inputs it needs. No screen
 * queries Supabase directly, and nothing here decides whether a hat is on —
 * that stays with the model, which in turn calls the scheduling engine's own
 * gate.
 *
 * RESOURCES ARE NOT PEOPLE. `talent_profiles.profile_kind = 'resource'` is a
 * room, a chair or a piece of equipment. Those belong to Spaces; a chair has
 * no sign-in and no public profile, and listing it here is how the old roster
 * ended up mixing furniture with barbers.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { loadWorkspaceTeamMembers } from "../../_data-bridge/workspace-config";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import {
  NOT_EXCLUSIVE,
  resolveExclusivityByTalent,
  type ExclusivityRosterRow,
  type ExclusivityVerdict,
} from "@/lib/people/exclusivity";
import { parseTenantAppointmentSettings } from "@/lib/scheduling/appointment-policy";
import { logServerError } from "@/lib/server/safe-error";
import {
  accessHat,
  bookableHat,
  isAccessRole,
  mergePeople,
  publicProfileHat,
  type MembershipSide,
  type PersonRecord,
  type RosterSide,
} from "@/lib/people/hats";
import {
  hasPendingInvitationFor,
  loadPendingInvitationEmails,
} from "./people-invitations";

export type PeopleSurface = {
  readonly people: readonly PersonRecord[];
  /** True when `agencies.settings.appointments.enabled` is on. */
  readonly workspaceAppointmentsEnabled: boolean;
  /** Set when the read itself failed, so the screen says so instead of "no one". */
  readonly loadFailed: boolean;
};

const EMPTY: PeopleSurface = {
  people: [],
  workspaceAppointmentsEnabled: false,
  loadFailed: false,
};

type RosterQueryRow = {
  status: string | null;
  agency_visibility: string | null;
  is_primary: boolean | null;
  exclusivity_status: string | null;
  direct_booking_enabled: boolean | null;
  external_booking_released: boolean | null;
  talent_profiles: {
    id: string;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    user_id: string | null;
    profile_kind: string | null;
    invitation_email: string | null;
    booking_terms: unknown;
    deleted_at: string | null;
  } | null;
};

function displayName(p: {
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
}): string {
  const stage = p.display_name?.trim();
  if (stage) return stage;
  const joined = `${p.first_name?.trim() ?? ""} ${p.last_name?.trim() ?? ""}`.trim();
  return joined;
}

function optedIn(bookingTerms: unknown): boolean {
  if (typeof bookingTerms !== "object" || bookingTerms === null) return false;
  return (bookingTerms as Record<string, unknown>).directBookingOptIn === true;
}

/**
 * Read every person in this workspace, with all three hats resolved.
 *
 * A person with no name comes back with an EMPTY name rather than an English
 * placeholder: the screen has the translator, this module does not, and a
 * server-rendered "Unnamed person" would disagree with the operator's own
 * language on first paint.
 */
export async function loadPeopleSurface(tenantId: string): Promise<PeopleSurface> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ...EMPTY, loadFailed: true };
  const admin = createServiceRoleClient();
  const client = admin ?? supabase;

  // The membership side has a reader already: `loadWorkspaceTeamMembers` is
  // what the Team drawer uses, and it resolves the account email that
  // `public.profiles` does not carry. Writing a second query here is how the
  // same person ends up described two different ways.
  const [rosterRes, members, agencyRes, pendingInvitations] = await Promise.all([
    client
      .from("agency_talent_roster")
      .select(
        `status, agency_visibility, is_primary, exclusivity_status,
         direct_booking_enabled, external_booking_released,
         talent_profiles!talent_profile_id (
           id, display_name, first_name, last_name, user_id, profile_kind,
           invitation_email, booking_terms, deleted_at
         )`,
      )
      .eq("tenant_id", tenantId),
    loadWorkspaceTeamMembers(tenantId),
    client.from("agencies").select("settings").eq("id", tenantId).maybeSingle(),
    loadPendingInvitationEmails(client, tenantId),
  ]);

  // A failed read is not an empty workspace. Saying "no one works here" when
  // the query broke is the silent dead end this surface must never render.
  if (rosterRes.error || agencyRes.error) {
    logServerError("people.load", rosterRes.error ?? agencyRes.error);
    return { ...EMPTY, loadFailed: true };
  }

  const agency = agencyRes.data as { settings: unknown } | null;
  const appointments = parseTenantAppointmentSettings(agency?.settings ?? null);
  const workspaceAppointmentsEnabled = appointments?.enabled === true;
  const workspaceAllowsDirectBooking = appointments?.allowTalentDirectBooking === true;

  const rosterRows = ((rosterRes.data ?? []) as unknown as RosterQueryRow[]).filter(
    (row) =>
      row.talent_profiles != null
      && row.talent_profiles.deleted_at == null
      // Rooms, chairs and equipment are Spaces' business, not People's.
      && row.talent_profiles.profile_kind !== "resource",
  );

  const talentIds = rosterRows
    .map((row) => row.talent_profiles?.id)
    .filter((id): id is string => typeof id === "string");

  const [hoursIds, offeringIds, exclusivity] = await Promise.all([
    loadIdsWithRow(client, "talent_booking_hours", talentIds),
    loadIdsWithRow(client, "talent_offerings", talentIds),
    loadExclusivity(client, talentIds, tenantId),
  ]);

  const roster: RosterSide[] = rosterRows.map((row) => {
    const p = row.talent_profiles!;
    // The address this workspace holds for them, and the only one an
    // invitation from their record may be sent to. It is the same column the
    // roster editor writes and the roster bridge already reads as `email`.
    const email = p.invitation_email?.trim() || null;
    // The CONTRACT half is a cross-workspace fact: an exclusive primary in
    // ANOTHER workspace refuses booking here. See lib/people/exclusivity.ts.
    const claim = exclusivity.get(p.id) ?? NOT_EXCLUSIVE;
    const bookableInputs = {
      hasRosterRow: true,
      rosterStatus: row.status,
      // The engine reads exactly this: active + site_visible. `featured` is
      // NOT site_visible there, so it must not be here either.
      rosterSiteVisible: row.status === "active" && row.agency_visibility === "site_visible",
      workspaceAppointmentsEnabled,
      workspaceAllowsDirectBooking,
      rosterDirectBookingEnabled: row.direct_booking_enabled === true,
      personOptedIn: optedIn(p.booking_terms),
      isResource: false,
      isExclusive: claim.isExclusive,
      isExclusivePrimarySite: claim.isExclusivePrimarySite,
      externalBookingReleased: claim.externalBookingReleased,
      hasBookingHours: hoursIds.has(p.id),
      hasOfferings: offeringIds.has(p.id),
    };
    return {
      talentProfileId: p.id,
      accountId: p.user_id,
      name: displayName(p),
      email,
      avatarUrl: null,
      publicProfile: publicProfileHat({ hasRosterRow: true, rosterStatus: row.status }),
      bookable: bookableHat(bookableInputs),
      // No membership row on this side by definition — but an unaccepted
      // invitation is a real, different state, and the panel shows a different
      // control for it. A merged person's membership hat overwrites this.
      access: accessHat({
        hasMembership: false,
        membershipStatus: null,
        hasAccount: p.user_id != null,
        hasPendingInvitation: hasPendingInvitationFor(email, pendingInvitations),
      }),
    };
  });

  const memberships: MembershipSide[] = members.map((member) => ({
    accountId: member.id,
    name: member.name.trim(),
    email: member.email ?? null,
    avatarUrl: member.photoUrl ?? null,
    role: isAccessRole(member.role) ? member.role : null,
    access: accessHat({
      hasMembership: true,
      membershipStatus: member.status,
      // A membership row IS the account: profile_id is the auth user id.
      hasAccount: true,
      // A live membership outranks any token; the invite path marks the token
      // redeemed as it creates the row, so this is only ever false here.
      hasPendingInvitation: false,
    }),
  }));

  return {
    people: mergePeople(roster, memberships),
    workspaceAppointmentsEnabled,
    loadFailed: false,
  };
}

/** Which of these talent ids have a row in `table`. Empty set on any failure. */
async function loadIdsWithRow(
  client: SupabaseClient,
  table: "talent_booking_hours" | "talent_offerings",
  talentIds: readonly string[],
): Promise<Set<string>> {
  if (talentIds.length === 0) return new Set();
  const { data, error } = await client
    .from(table)
    .select("talent_profile_id")
    .in("talent_profile_id", [...talentIds]);
  if (error) {
    logServerError(`people.load.${table}`, error);
    return new Set();
  }
  const out = new Set<string>();
  for (const row of (data ?? []) as Array<{ talent_profile_id: string | null }>) {
    if (row.talent_profile_id) out.add(row.talent_profile_id);
  }
  return out;
}

/**
 * Exclusivity claims on these people, across EVERY workspace.
 *
 * This is deliberately not scoped to `tenantId`: the question "may this
 * workspace book this person" has an answer that lives in other workspaces'
 * roster rows, and the booking engine reads exactly this set. Nothing about
 * the other workspaces leaves this function; three booleans per person do.
 */
async function loadExclusivity(
  client: SupabaseClient,
  talentIds: readonly string[],
  tenantId: string,
): Promise<Map<string, ExclusivityVerdict>> {
  if (talentIds.length === 0) return new Map<string, ExclusivityVerdict>();
  const { data, error } = await client
    .from("agency_talent_roster")
    .select("talent_profile_id, tenant_id, is_primary, exclusivity_status, external_booking_released")
    .in("talent_profile_id", [...talentIds])
    .in("status", ["active", "pending"]);
  if (error) {
    logServerError("people.load.exclusivity", error);
    return new Map<string, ExclusivityVerdict>();
  }

  const rows: ExclusivityRosterRow[] = (
    (data ?? []) as Array<{
      talent_profile_id: string | null;
      tenant_id: string | null;
      is_primary: boolean | null;
      exclusivity_status: string | null;
      external_booking_released: boolean | null;
    }>
  )
    .filter((r) => r.talent_profile_id != null && r.tenant_id != null)
    .map((r) => ({
      talentProfileId: r.talent_profile_id!,
      tenantId: r.tenant_id!,
      isPrimary: r.is_primary === true,
      exclusivityStatus: r.exclusivity_status,
      externalBookingReleased: r.external_booking_released === true,
    }));

  const tenantIds = [...new Set(rows.map((r) => r.tenantId))];
  const planTierByTenant = new Map<string, string | null>();
  if (tenantIds.length > 0) {
    const { data: agencies, error: agencyErr } = await client
      .from("agencies")
      .select("id, plan_tier")
      .in("id", tenantIds);
    // A failed plan read would silently DROP every exclusive claim, which is
    // the wrong direction: it would show a person as bookable here when the
    // engine will refuse. Say so in the log and keep the claims we can prove.
    if (agencyErr) logServerError("people.load.exclusivity.plans", agencyErr);
    for (const a of (agencies ?? []) as Array<{ id: string; plan_tier: string | null }>) {
      planTierByTenant.set(a.id, a.plan_tier);
    }
  }

  return resolveExclusivityByTalent(rows, planTierByTenant, tenantId);
}

