"use server";

/**
 * people-actions.ts — the writes behind the three hats.
 *
 * NOTHING HERE IS A NEW ENGINE. Every write delegates to the action that
 * already owns that column, because a second writer is how the same person
 * ends up with two different answers:
 *
 *   • Bookable   → setRosterDirectBooking + setTalentDirectBookingOptIn
 *   • Access     → team-management's invite / promote / change / remove
 *   • Public     → agency_talent_roster.status, tenant-scoped
 *
 * WHY THE RESULTS ARE CODES, NOT SENTENCES. The engines answer in English.
 * This surface must speak the operator's language, so every refusal is
 * translated into a closed set of reason keys the screen looks up in
 * `messages/{en,es,fr}.json`. An unmapped engine failure becomes
 * `couldNotSave` and the engine's own text is logged, never rendered.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { checkTeamSeatAvailability } from "@/lib/saas/team-seat-limit";
import { staffMayWriteHours } from "@/lib/scheduling/hours-edit-policy";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { logServerError } from "@/lib/server/safe-error";
import {
  changeTeamMemberRole,
  inviteTeamMember,
  promoteRosterTalentToAdmin,
  removeTeamMember,
} from "@/lib/server-actions/team-management";
import { setRosterDirectBooking } from "@/lib/server-actions/roster-direct-booking";
import { setTalentDirectBookingOptIn } from "@/lib/server-actions/booking-hours";
import { parseTenantAppointmentSettings } from "@/lib/scheduling/appointment-policy";

/**
 * Every answer this surface can give. Each is a key under
 * `admin.people.result.*`, present in all three languages.
 */
export type PeopleReasonKey =
  | "notAuthorized"
  | "notAllowed"
  | "alreadyOnThisWorkspace"
  | "checkTheDetails"
  | "seatLimit"
  | "noAccountYet"
  | "notOnRoster"
  | "personSetsTheirOwnBooking"
  | "cannotChangeYourOwnRole"
  | "invitationSent"
  | "noEmailOnFile"
  | "workspaceBooksEveryone"
  | "couldNotSave";

export type PeopleActionResult =
  | { ok: true; note?: PeopleReasonKey }
  | { ok: false; reasonKey: PeopleReasonKey };

const ROLES = ["admin", "manager", "editor", "viewer"] as const;
type GrantableRole = (typeof ROLES)[number];

function isGrantableRole(value: string): value is GrantableRole {
  return (ROLES as readonly string[]).includes(value);
}

const uuid = z.string().uuid();

function mapReason(reason: string | undefined): PeopleReasonKey {
  switch (reason) {
    case "unauthenticated":
      return "notAuthorized";
    case "forbidden":
      return "notAllowed";
    case "already_exists":
      return "alreadyOnThisWorkspace";
    case "validation_failed":
      return "checkTheDetails";
    default:
      return "couldNotSave";
  }
}

// ── Bookable hat ──────────────────────────────────────────────────────

/**
 * The one Bookable toggle.
 *
 * Turning it ON writes the agency's own half (`direct_booking_enabled`) and,
 * when this workspace is allowed to answer for the person, their half too
 * (`booking_terms.directBookingOptIn`). When the person owns their own
 * sign-in, the workspace may not opt in on their behalf — the toggle still
 * does its half and the caller is told, in a sentence, what is still missing.
 *
 * Turning it OFF writes the agency's half, and that is enough WHILE THE
 * WORKSPACE-LEVEL SWITCH IS OFF: the gate is an AND, so the person leaves
 * "Pick a professional" immediately, and the workspace has not silently
 * un-said something the person said themselves.
 *
 * THE DEFECT THIS NOW REFUSES. The engine's agency gate is
 * `workspaceAllow OR roster.direct_booking_enabled`. With
 * `allowTalentDirectBooking` on for the workspace, the per-person column is
 * inert: this action wrote `false`, answered "Saved.", and the person stayed
 * bookable on the booking page and in the panel. Proven on the QA fixture.
 * So, when the workspace-level switch is on:
 *
 *   • a person the workspace may answer for (no sign-in of their own) is
 *     turned off through THEIR half as well, which is the same half the ON
 *     path already writes for them;
 *   • a person who holds their own sign-in is refused, in a sentence that
 *     names the switch that does govern, and nothing is written.
 */
export async function setPersonBookable(
  talentProfileId: string,
  on: boolean,
): Promise<PeopleActionResult> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, reasonKey: "notAuthorized" };
  if (!uuid.safeParse(talentProfileId).success) {
    return { ok: false, reasonKey: "checkTheDetails" };
  }

  if (!on) {
    const blanket = await workspaceAllowsDirectBooking(auth.tenantId);
    if (blanket) {
      const admin = createServiceRoleClient();
      if (!admin) return { ok: false, reasonKey: "couldNotSave" };
      const { data, error } = await admin
        .from("talent_profiles")
        .select("user_id, profile_kind")
        .eq("id", talentProfileId)
        .maybeSingle();
      if (error || !data) {
        if (error) logServerError("people.setBookable.readForOff", error);
        return { ok: false, reasonKey: "notOnRoster" };
      }
      const row = data as { user_id: string | null; profile_kind: string | null };
      const mayAnswerForThem = staffMayWriteHours({
        profileKind: row.profile_kind ?? "person",
        userId: row.user_id,
      });
      // Nothing this workspace can write turns them off. Say which switch
      // does, and write nothing: a partial write under a refusal is how the
      // next reader sees a state nobody asked for.
      if (!mayAnswerForThem) return { ok: false, reasonKey: "workspaceBooksEveryone" };

      const optOut = await setTalentDirectBookingOptIn(talentProfileId, false);
      if (!optOut.ok) {
        logServerError("people.setBookable.optOut", optOut.error);
        return { ok: false, reasonKey: "couldNotSave" };
      }
    }
  }

  const gate = await setRosterDirectBooking(talentProfileId, on);
  if (!gate.ok) {
    logServerError("people.setBookable.gate", gate.error);
    return { ok: false, reasonKey: "notOnRoster" };
  }
  if (!on) {
    revalidatePath(`/${auth.tenantSlug}/admin/people`);
    return { ok: true };
  }

  const admin = createServiceRoleClient();
  if (!admin) return { ok: true, note: "couldNotSave" };

  const { data, error } = await admin
    .from("talent_profiles")
    .select("user_id, profile_kind, booking_terms")
    .eq("id", talentProfileId)
    .maybeSingle();
  if (error || !data) {
    if (error) logServerError("people.setBookable.read", error);
    return { ok: true, note: "personSetsTheirOwnBooking" };
  }

  const row = data as {
    user_id: string | null;
    profile_kind: string | null;
    booking_terms: unknown;
  };
  const alreadyOptedIn =
    typeof row.booking_terms === "object"
    && row.booking_terms !== null
    && (row.booking_terms as Record<string, unknown>).directBookingOptIn === true;
  if (alreadyOptedIn) {
    revalidatePath(`/${auth.tenantSlug}/admin/people`);
    return { ok: true };
  }

  const mayAnswerForThem = staffMayWriteHours({
    profileKind: row.profile_kind ?? "person",
    userId: row.user_id,
  });
  if (!mayAnswerForThem) {
    // Their half is theirs. Say so instead of leaving a toggle that looks on
    // while the picker still refuses them.
    return { ok: true, note: "personSetsTheirOwnBooking" };
  }

  const optIn = await setTalentDirectBookingOptIn(talentProfileId, true);
  if (!optIn.ok) {
    logServerError("people.setBookable.optIn", optIn.error);
    return { ok: true, note: "personSetsTheirOwnBooking" };
  }
  revalidatePath(`/${auth.tenantSlug}/admin/people`);
  return { ok: true };
}

// ── Public profile hat ────────────────────────────────────────────────

/**
 * Take the Public profile hat off, or put it back on.
 *
 * This flips `agency_talent_roster.status` and NOTHING else. The talent
 * profile itself is never deleted: the same human may still hold the Access
 * hat, and may be re-added tomorrow with their profile intact.
 */
export async function setPersonPublicProfile(
  talentProfileId: string,
  on: boolean,
): Promise<PeopleActionResult> {
  const auth = await requireWorkspaceStaffAction({ capability: "agency.roster.edit" });
  if (!auth.ok) return { ok: false, reasonKey: "notAllowed" };
  if (!uuid.safeParse(talentProfileId).success) {
    return { ok: false, reasonKey: "checkTheDetails" };
  }

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reasonKey: "couldNotSave" };

  const { data: row, error: readErr } = await tenantScopedQuery(
    admin,
    "agency_talent_roster",
    auth.tenantId,
  )
    .select("id")
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();
  if (readErr || !row) {
    if (readErr) logServerError("people.setPublicProfile.read", readErr);
    return { ok: false, reasonKey: "notOnRoster" };
  }

  const patch = on
    ? { status: "active", removed_at: null, removed_by: null }
    : { status: "removed", removed_at: new Date().toISOString(), removed_by: auth.user.id };

  const { error } = await tenantScopedQuery(admin, "agency_talent_roster", auth.tenantId)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", (row as { id: string }).id);
  if (error) {
    logServerError("people.setPublicProfile.write", error);
    return { ok: false, reasonKey: "couldNotSave" };
  }

  revalidatePath(`/${auth.tenantSlug}/admin/people`);
  revalidatePath(`/${auth.tenantSlug}/admin/roster`);
  return { ok: true };
}

// ── Access hat ────────────────────────────────────────────────────────

/** Give a person on the roster a workspace role. Needs a claimed account. */
export async function grantPersonAccess(
  talentProfileId: string,
  role: string,
): Promise<PeopleActionResult> {
  if (!uuid.safeParse(talentProfileId).success) {
    return { ok: false, reasonKey: "checkTheDetails" };
  }
  if (!isGrantableRole(role)) {
    return { ok: false, reasonKey: "checkTheDetails" };
  }
  const seats = await seatCheck();
  if (seats) return { ok: false, reasonKey: seats };

  const result = await promoteRosterTalentToAdmin(talentProfileId, role);
  if (!result.ok) {
    logServerError("people.grantAccess", result.error);
    // The engine's only "no account" answer arrives as a validation failure;
    // this surface must not collapse it into "check the details", because the
    // recovery is completely different: the person has to sign up first.
    if (/account|claim/i.test(result.error)) return { ok: false, reasonKey: "noAccountYet" };
    return { ok: false, reasonKey: mapReason(result.reason) };
  }
  await revalidatePeople();
  return { ok: true };
}

/**
 * Invite a person on this workspace's record to sign in, at the email that
 * record carries.
 *
 * WHAT THIS DOES NOT DO, AND WHY THE CALLER MUST SAY SO. `inviteTeamMember`
 * writes a `team_invite_tokens` row and NO membership: the membership is
 * created later, by `/team-invite/[id]`, and only once the invited human signs
 * in with that address. So this cannot grant anyone access, and reporting a
 * plain "Saved" for it was the defect — the panel said the write had landed
 * while the person's Access hat stayed off, with no way to tell "invited" from
 * "never invited". The `invitationSent` note is the sentence the screen shows
 * instead, and `people-invitations.ts` is what makes the resulting state
 * readable on the record.
 *
 * The email is not free text from a box inside someone else's panel any more:
 * the screen passes the address it is displaying, and an empty one is refused
 * here as well as hidden there.
 */
export async function invitePersonAccess(
  email: string,
  role: string,
): Promise<PeopleActionResult> {
  if (!isGrantableRole(role)) {
    return { ok: false, reasonKey: "checkTheDetails" };
  }
  if (email.trim().length === 0) {
    return { ok: false, reasonKey: "noEmailOnFile" };
  }
  const seats = await seatCheck();
  if (seats) return { ok: false, reasonKey: seats };

  const result = await inviteTeamMember(email, role);
  if (!result.ok) {
    logServerError("people.invite", result.error);
    return { ok: false, reasonKey: mapReason(result.reason) };
  }
  await revalidatePeople();
  // An invitation, said out loud as an invitation. Never "Saved".
  return { ok: true, note: "invitationSent" };
}

/** Change what a person with the Access hat may do. */
export async function setPersonAccessRole(
  accountId: string,
  role: string,
): Promise<PeopleActionResult> {
  if (!uuid.safeParse(accountId).success) {
    return { ok: false, reasonKey: "checkTheDetails" };
  }
  if (!isGrantableRole(role)) {
    return { ok: false, reasonKey: "checkTheDetails" };
  }
  const result = await changeTeamMemberRole(accountId, role);
  if (!result.ok) {
    logServerError("people.setRole", result.error);
    if (/your own role/i.test(result.error)) {
      return { ok: false, reasonKey: "cannotChangeYourOwnRole" };
    }
    return { ok: false, reasonKey: mapReason(result.reason) };
  }
  await revalidatePeople();
  return { ok: true };
}

/** Take the Access hat off. The other two hats are untouched. */
export async function revokePersonAccess(accountId: string): Promise<PeopleActionResult> {
  if (!uuid.safeParse(accountId).success) {
    return { ok: false, reasonKey: "checkTheDetails" };
  }
  const result = await removeTeamMember(accountId);
  if (!result.ok) {
    logServerError("people.revokeAccess", result.error);
    return { ok: false, reasonKey: mapReason(result.reason) };
  }
  await revalidatePeople();
  return { ok: true };
}

// ── shared ────────────────────────────────────────────────────────────

/**
 * `agencies.settings.appointments.allowTalentDirectBooking`, read the way the
 * People reader and the engine read it. A failed read answers `false`, which
 * is the direction that still lets the agency half be written; the panel is
 * re-derived from the rows afterwards either way.
 */
async function workspaceAllowsDirectBooking(tenantId: string): Promise<boolean> {
  const admin = createServiceRoleClient();
  if (!admin) return false;
  const { data, error } = await admin
    .from("agencies")
    .select("settings")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) {
    logServerError("people.setBookable.workspaceSettings", error);
    return false;
  }
  const settings = (data as { settings: unknown } | null)?.settings ?? null;
  return parseTenantAppointmentSettings(settings)?.allowTalentDirectBooking === true;
}

/** `null` when there is room, otherwise the reason to refuse. */
async function seatCheck(): Promise<PeopleReasonKey | null> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return "notAuthorized";
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const seats = await checkTeamSeatAvailability(admin, auth.tenantId, 1);
  return seats.ok ? null : "seatLimit";
}

async function revalidatePeople(): Promise<void> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return;
  revalidatePath(`/${auth.tenantSlug}/admin/people`);
}
