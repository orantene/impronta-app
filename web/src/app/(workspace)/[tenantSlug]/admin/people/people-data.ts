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
import { loadWorkspaceRosterForCurrentTenant } from "@/components/admin/shell/internal/data-bridge";
import type { TalentProfile } from "@/components/admin/shell/internal/state/types";
import { parseBookingHours } from "@/lib/scheduling/hours-types";
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
  type PersonFacts,
  type PersonHoursSummary,
  type PersonOffering,
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
  /**
   * True when `agencies.settings.appointments.allowTalentDirectBooking` is on.
   *
   * THE SCREEN NEEDS THIS TO TELL THE TRUTH ABOUT "TURN OFF". The engine's
   * agency gate is `workspaceAllow OR roster.direct_booking_enabled`, so while
   * the workspace-level switch is on, the per-person column the Bookable hat
   * writes cannot turn anyone off. A button that writes it anyway and reports
   * "Saved." is a control that does nothing; the panel needs to know when
   * that is the case so it can say so instead.
   */
  readonly workspaceAllowsDirectBooking: boolean;
  /** Set when the read itself failed, so the screen says so instead of "no one". */
  readonly loadFailed: boolean;
};

const EMPTY: PeopleSurface = {
  people: [],
  workspaceAppointmentsEnabled: false,
  workspaceAllowsDirectBooking: false,
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
export async function loadPeopleSurface(
  tenantId: string,
  viewerAccountId: string | null = null,
): Promise<PeopleSurface> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ...EMPTY, loadFailed: true };
  const admin = createServiceRoleClient();
  const client = admin ?? supabase;

  // The membership side has a reader already: `loadWorkspaceTeamMembers` is
  // what the Team drawer uses, and it resolves the account email that
  // `public.profiles` does not carry. Writing a second query here is how the
  // same person ends up described two different ways.
  // THE ROSTER'S OWN CARD READER draws the Talent cards (W27): code, state,
  // city, types, headshot. Calling it here rather than re-selecting the same
  // joins is how the People cards and the roster grid stay one description.
  const [rosterRes, members, agencyRes, pendingInvitations, cards] = await Promise.all([
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
    loadWorkspaceRosterForCurrentTenant(tenantId),
  ]);
  const cardById = new Map<string, TalentProfile>(cards.map((c) => [c.id, c]));

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

  const [hoursById, offeringsById, exclusivity] = await Promise.all([
    loadHoursSummaries(client, talentIds),
    loadOfferings(client, talentIds),
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
      hasBookingHours: hoursById.has(p.id),
      hasOfferings: (offeringsById.get(p.id)?.length ?? 0) > 0,
    };
    const card = cardById.get(p.id);
    const facts: Partial<PersonFacts> = {
      profileCode: card?.profileCode ?? null,
      profileState: card?.state ?? null,
      city: card?.city ?? null,
      types: cardTypes(card),
      siteVisible: bookableInputs.rosterSiteVisible,
      offerings: offeringsById.get(p.id) ?? [],
      hours: hoursById.get(p.id) ?? null,
      isYou: p.user_id != null && p.user_id === viewerAccountId,
    };
    return {
      talentProfileId: p.id,
      accountId: p.user_id,
      name: displayName(p),
      email,
      avatarUrl: card?.thumb ?? null,
      facts,
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
    facts: {
      membershipStatus: member.status,
      isYou: member.id === viewerAccountId,
    },
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
    workspaceAllowsDirectBooking,
    loadFailed: false,
  };
}

/** The category chips the roster card draws: parent category first, then the secondaries. */
function cardTypes(card: TalentProfile | undefined): string[] {
  if (!card) return [];
  const out: string[] = [];
  if (card.parentCategory?.labelEn) out.push(card.parentCategory.labelEn);
  for (const chip of card.secondaryTypes ?? []) {
    if (chip.labelEn && !out.includes(chip.labelEn)) out.push(chip.labelEn);
  }
  return out;
}

/**
 * A one-line summary of each person's `talent_booking_hours` row, for the
 * Bookable table's "Locations · hours" cell. The full row stays with the
 * hours editor (`loadBookingHours`); this reads only what the cell shows.
 * Empty map on any failure, logged.
 */
async function loadHoursSummaries(
  client: SupabaseClient,
  talentIds: readonly string[],
): Promise<Map<string, PersonHoursSummary>> {
  const out = new Map<string, PersonHoursSummary>();
  if (talentIds.length === 0) return out;
  const { data, error } = await client
    .from("talent_booking_hours")
    .select(
      "talent_profile_id, timezone, weekly, exceptions, slot_minutes, buffer_before_min, buffer_after_min, min_notice_min, horizon_days",
    )
    .in("talent_profile_id", [...talentIds]);
  if (error) {
    logServerError("people.load.talent_booking_hours", error);
    return out;
  }
  for (const row of (data ?? []) as Array<{ talent_profile_id: string | null } & Record<string, unknown>>) {
    if (!row.talent_profile_id) continue;
    const parsed = parseBookingHours(row);
    if (!parsed) continue;
    const openDays = ([0, 1, 2, 3, 4, 5, 6] as const).filter((d) => parsed.weekly[d].length > 0);
    out.set(row.talent_profile_id, {
      timezone: parsed.timezone,
      openDays,
      bufferBeforeMin: parsed.bufferBeforeMin,
      minNoticeMin: parsed.minNoticeMin,
    });
  }
  return out;
}

/** Each person's own `talent_offerings`, the "Services here" the boards list. */
async function loadOfferings(
  client: SupabaseClient,
  talentIds: readonly string[],
): Promise<Map<string, PersonOffering[]>> {
  const out = new Map<string, PersonOffering[]>();
  if (talentIds.length === 0) return out;
  const { data, error } = await client
    .from("talent_offerings")
    .select("id, talent_profile_id, title, price_display, visibility, booking_mode, status, sort_order")
    .in("talent_profile_id", [...talentIds])
    .neq("status", "archived")
    .order("sort_order", { ascending: true });
  if (error) {
    logServerError("people.load.talent_offerings", error);
    return out;
  }
  for (const row of (data ?? []) as Array<{
    id: string;
    talent_profile_id: string | null;
    title: string;
    price_display: string | null;
    visibility: string | null;
    booking_mode: string | null;
    status: string | null;
  }>) {
    if (!row.talent_profile_id) continue;
    const list = out.get(row.talent_profile_id) ?? [];
    list.push({
      id: row.id,
      title: row.title,
      priceDisplay: row.price_display ?? "",
      visibility: row.visibility ?? "public",
      bookingMode: row.booking_mode ?? "request",
      status: row.status ?? "draft",
    });
    out.set(row.talent_profile_id, list);
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

