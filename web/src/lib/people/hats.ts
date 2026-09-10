/**
 * hats.ts — one person, up to three independent hats.
 *
 * THE MODEL
 * ─────────
 * A workspace deals with humans wearing any combination of three hats:
 *
 *   • Public profile — the talent profile engine. `agency_talent_roster`
 *     joins the tenant to a `talent_profiles` row. Untouched by this module:
 *     the existing profile drawer stays the editor.
 *   • Bookable — what the calendar, the booking page and the point of sale
 *     read when they ask "who can perform this". Its truth is NOT one column;
 *     it is the surface gate in `scheduling/appointment-policy.ts`.
 *   • Access — sign-in and role. `agency_memberships`.
 *
 * The hats are independent: removing one leaves the others, and the same
 * human must never be entered twice. That is what `mergePeople` is for.
 *
 * WHY THIS FILE DOES NOT RE-IMPLEMENT THE BOOKING RULE
 * ───────────────────────────────────────────────────
 * `resolveSurfaceGate` already decides whether a person may be booked on a
 * workspace's own site, and the slots API and the reservation submit path
 * both go through it. A second copy of that AND-chain here would drift, and
 * the screen would promise a booking the engine then refuses. So the gate is
 * CALLED, not copied; this module adds only the thing the engine has no
 * opinion about — WHICH input was false, in words a person can act on.
 *
 * PURITY: no server imports, no React. Node-testable as-is.
 */

import { resolveSurfaceGate } from "@/lib/scheduling/appointment-policy";

// ── The vocabulary ────────────────────────────────────────────────────

export const PERSON_HATS = ["publicProfile", "bookable", "access"] as const;
export type PersonHat = (typeof PERSON_HATS)[number];

/**
 * Every reason a hat is off. Each one is a message key under
 * `admin.people.reason.*` in all three languages, because a refusal the
 * screen cannot say out loud is a blank box.
 */
export const HAT_BLOCK_REASONS = [
  // Public profile
  "noRosterRow",
  "rosterRemoved",
  // Bookable
  "workspaceAppointmentsOff",
  "personHasNotOptedIn",
  "agencyGateOff",
  "notSiteVisible",
  "exclusiveNotReleased",
  // Access
  "noMembership",
  "membershipRemoved",
  "invitationPending",
  "noAccount",
] as const;
export type HatBlockReason = (typeof HAT_BLOCK_REASONS)[number];

/** Not a refusal: the hat is on, but something will disappoint a guest. */
export const HAT_WARNINGS = ["noBookingHours", "noOfferings"] as const;
export type HatWarning = (typeof HAT_WARNINGS)[number];

export type HatState = {
  readonly on: boolean;
  /** Empty when `on`. Ordered most-actionable first. */
  readonly blockedBy: readonly HatBlockReason[];
  readonly warnings: readonly HatWarning[];
};

// ── Public profile hat ────────────────────────────────────────────────

export type PublicProfileInputs = {
  /** A row exists in `agency_talent_roster` for this tenant + profile. */
  readonly hasRosterRow: boolean;
  /** `agency_talent_roster.status`. */
  readonly rosterStatus: string | null;
};

export function publicProfileHat(input: PublicProfileInputs): HatState {
  if (!input.hasRosterRow) {
    return { on: false, blockedBy: ["noRosterRow"], warnings: [] };
  }
  if (input.rosterStatus === "removed") {
    return { on: false, blockedBy: ["rosterRemoved"], warnings: [] };
  }
  return { on: true, blockedBy: [], warnings: [] };
}

// ── Bookable hat ──────────────────────────────────────────────────────

export type BookableInputs = {
  readonly hasRosterRow: boolean;
  readonly rosterStatus: string | null;
  /** `agency_visibility` is one of site_visible / featured. */
  readonly rosterSiteVisible: boolean;
  /** `agencies.settings.appointments.enabled`. */
  readonly workspaceAppointmentsEnabled: boolean;
  /** `agencies.settings.appointments.allowTalentDirectBooking`. */
  readonly workspaceAllowsDirectBooking: boolean;
  /** `agency_talent_roster.direct_booking_enabled`. */
  readonly rosterDirectBookingEnabled: boolean;
  /** `talent_profiles.booking_terms.directBookingOptIn` — the person's half. */
  readonly personOptedIn: boolean;
  /** `talent_profiles.profile_kind === "resource"`. Rooms and chairs. */
  readonly isResource: boolean;
  readonly isExclusive: boolean;
  readonly isExclusivePrimarySite: boolean;
  readonly externalBookingReleased: boolean;
  /** A `talent_booking_hours` row exists. */
  readonly hasBookingHours: boolean;
  /** At least one `talent_offerings` row this workspace can sell. */
  readonly hasOfferings: boolean;
};

/**
 * The bookable hat, decided by the engine's own gate.
 *
 * `blockedBy` is built from the same inputs the gate read, so the sentence
 * the screen shows names the switch that is actually off. The final
 * consistency check is deliberate: if the gate ever says "no" and this
 * module can name no reason, that is a defect worth a visible reason of
 * last resort rather than an empty box.
 */
export function bookableHat(input: BookableInputs): HatState {
  const onRoster = input.hasRosterRow && input.rosterStatus !== "removed";
  const allowDirect =
    input.workspaceAllowsDirectBooking || input.rosterDirectBookingEnabled;

  const allowed =
    onRoster
    && resolveSurfaceGate({
      surface: "workspace_site",
      tenantEnabled: input.workspaceAppointmentsEnabled,
      allowDirect,
      talentOptIn: input.personOptedIn,
      isResource: input.isResource,
      isExclusive: input.isExclusive,
      isExclusivePrimarySite: input.isExclusivePrimarySite,
      externalBookingReleased: input.externalBookingReleased,
      rosterSiteVisible: input.rosterSiteVisible,
    }).allowed;

  if (allowed) {
    const warnings: HatWarning[] = [];
    if (!input.hasBookingHours) warnings.push("noBookingHours");
    if (!input.hasOfferings) warnings.push("noOfferings");
    return { on: true, blockedBy: [], warnings };
  }

  const blockedBy: HatBlockReason[] = [];
  if (!input.hasRosterRow) blockedBy.push("noRosterRow");
  else if (input.rosterStatus === "removed") blockedBy.push("rosterRemoved");
  if (!input.workspaceAppointmentsEnabled) blockedBy.push("workspaceAppointmentsOff");
  if (!input.isResource && !input.personOptedIn) blockedBy.push("personHasNotOptedIn");
  if (!input.isResource && !allowDirect) blockedBy.push("agencyGateOff");
  if (onRoster && !input.rosterSiteVisible) blockedBy.push("notSiteVisible");
  if (
    input.isExclusive
    && !input.isExclusivePrimarySite
    && !input.externalBookingReleased
  ) {
    blockedBy.push("exclusiveNotReleased");
  }
  // A refusal with no sentence is the defect this whole module exists to
  // prevent. Name the roster row rather than render nothing.
  if (blockedBy.length === 0) blockedBy.push("noRosterRow");
  return { on: false, blockedBy, warnings: [] };
}

// ── Access hat ────────────────────────────────────────────────────────

/** Workspace membership roles, weakest first. `owner` is transfer-only. */
export const ACCESS_ROLES = ["viewer", "editor", "manager", "admin", "owner"] as const;
export type AccessRole = (typeof ACCESS_ROLES)[number];

export function isAccessRole(value: string | null | undefined): value is AccessRole {
  return typeof value === "string" && (ACCESS_ROLES as readonly string[]).includes(value);
}

export type AccessInputs = {
  /** A row exists in `agency_memberships` for this tenant. */
  readonly hasMembership: boolean;
  /** `agency_memberships.status`. */
  readonly membershipStatus: string | null;
  /** The membership resolves to a real account that can sign in. */
  readonly hasAccount: boolean;
};

export function accessHat(input: AccessInputs): HatState {
  if (!input.hasMembership) {
    return { on: false, blockedBy: ["noMembership"], warnings: [] };
  }
  if (input.membershipStatus === "removed") {
    return { on: false, blockedBy: ["membershipRemoved"], warnings: [] };
  }
  // An invitation is not access. Until it is accepted the person cannot sign
  // in, so the hat must read OFF and `holdsMoneyPermissions` must say no,
  // whatever role the invitation names.
  if (
    input.membershipStatus === "invited"
    || input.membershipStatus === "pending_acceptance"
  ) {
    return { on: false, blockedBy: ["invitationPending"], warnings: [] };
  }
  if (!input.hasAccount) {
    return { on: false, blockedBy: ["noAccount"], warnings: [] };
  }
  return { on: true, blockedBy: [], warnings: [] };
}

// ── The person record ─────────────────────────────────────────────────

export type PersonRecord = {
  /** Stable key for this human inside this workspace. See `personKey`. */
  readonly key: string;
  readonly name: string;
  /** `talent_profiles.id` when this human has a profile at all. */
  readonly talentProfileId: string | null;
  /** `agency_memberships.profile_id` (= the auth user id) when signed up. */
  readonly accountId: string | null;
  readonly email: string | null;
  readonly avatarUrl: string | null;
  readonly role: AccessRole | null;
  readonly publicProfile: HatState;
  readonly bookable: HatState;
  readonly access: HatState;
};

/**
 * The key that decides "same human".
 *
 * `talent_profiles.user_id` and `agency_memberships.profile_id` are the SAME
 * id — the auth user. When both sides carry it, the two rows are one person
 * and must merge into one card. When neither does (an admin-created profile
 * nobody has claimed, or a member with no profile), the row stands alone
 * under its own namespace so two unrelated humans never collapse into one.
 */
export function personKey(input: {
  accountId?: string | null;
  talentProfileId?: string | null;
}): string {
  const account = input.accountId?.trim();
  if (account) return `account:${account}`;
  const talent = input.talentProfileId?.trim();
  if (talent) return `talent:${talent}`;
  return "unknown";
}

export type RosterSide = {
  readonly talentProfileId: string;
  readonly accountId: string | null;
  readonly name: string;
  readonly email: string | null;
  readonly avatarUrl: string | null;
  readonly publicProfile: HatState;
  readonly bookable: HatState;
};

export type MembershipSide = {
  readonly accountId: string;
  readonly name: string;
  readonly email: string | null;
  readonly avatarUrl: string | null;
  readonly role: AccessRole | null;
  readonly access: HatState;
};

const HAT_OFF_NO_ROSTER: HatState = {
  on: false,
  blockedBy: ["noRosterRow"],
  warnings: [],
};
const HAT_OFF_NO_MEMBERSHIP: HatState = {
  on: false,
  blockedBy: ["noMembership"],
  warnings: [],
};

/**
 * One card per human. A roster row and a membership row that share an account
 * id become ONE record wearing both hats — that is the whole point of the
 * model, and the reason the old Roster list and Team drawer showed the same
 * barber twice.
 */
export function mergePeople(
  roster: readonly RosterSide[],
  memberships: readonly MembershipSide[],
): PersonRecord[] {
  const byKey = new Map<string, PersonRecord>();

  for (const r of roster) {
    const key = personKey({ accountId: r.accountId, talentProfileId: r.talentProfileId });
    byKey.set(key, {
      key,
      name: r.name,
      talentProfileId: r.talentProfileId,
      accountId: r.accountId,
      email: r.email,
      avatarUrl: r.avatarUrl,
      role: null,
      publicProfile: r.publicProfile,
      bookable: r.bookable,
      access: HAT_OFF_NO_MEMBERSHIP,
    });
  }

  for (const m of memberships) {
    const key = personKey({ accountId: m.accountId });
    const existing = byKey.get(key);
    if (existing) {
      byKey.set(key, {
        ...existing,
        // A claimed profile's own display name wins; the account name is the
        // fallback, never an overwrite.
        name: existing.name || m.name,
        email: existing.email ?? m.email,
        avatarUrl: existing.avatarUrl ?? m.avatarUrl,
        role: m.role,
        access: m.access,
      });
      continue;
    }
    byKey.set(key, {
      key,
      name: m.name,
      talentProfileId: null,
      accountId: m.accountId,
      email: m.email,
      avatarUrl: m.avatarUrl,
      role: m.role,
      publicProfile: HAT_OFF_NO_ROSTER,
      bookable: HAT_OFF_NO_ROSTER,
      access: m.access,
    });
  }

  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// ── The rules the screens must obey ───────────────────────────────────

/**
 * "Only the Bookable hat puts a person in Pick a professional."
 * A public profile alone is never bookable; access alone never performs.
 */
export function pickAProfessional(people: readonly PersonRecord[]): PersonRecord[] {
  return people.filter((p) => p.bookable.on);
}

/**
 * The money permissions a person holds. Derived from the ACCESS hat alone:
 * being bookable, or having a public profile, grants nothing here. F16's
 * contract — "Bookable never grants money permissions" — is this function.
 */
export const MONEY_ROLES: readonly AccessRole[] = ["owner", "admin", "manager"];

export function holdsMoneyPermissions(person: PersonRecord): boolean {
  if (!person.access.on) return false;
  return person.role != null && MONEY_ROLES.includes(person.role);
}

/**
 * What is left after a hat is taken off. Removing a hat NEVER removes the
 * person: the screen that says "remove" must say which hat, and this is the
 * answer it shows.
 */
export function hatsAfterRemoving(
  person: PersonRecord,
  hat: PersonHat,
): readonly PersonHat[] {
  const worn: PersonHat[] = [];
  if (person.publicProfile.on) worn.push("publicProfile");
  if (person.bookable.on) worn.push("bookable");
  if (person.access.on) worn.push("access");
  return worn.filter((h) => h !== hat);
}

/**
 * Taking off the Public profile hat also takes off Bookable, because the
 * bookable gate reads the roster row. Saying so BEFORE the click is the
 * difference between a warning and a surprise.
 */
export function hatRemovalAlsoRemoves(
  person: PersonRecord,
  hat: PersonHat,
): readonly PersonHat[] {
  if (hat !== "publicProfile") return [];
  return person.bookable.on ? ["bookable"] : [];
}

// ── Who performs (W31) ────────────────────────────────────────────────

export type PerformerSkill = {
  readonly skillSlug: string;
  /** `talent_profile_taxonomy.verified_at` — null means claimed, not proven. */
  readonly verified: boolean;
};

export type PerformerCandidate = {
  readonly person: PersonRecord;
  readonly skills: readonly PerformerSkill[];
  /** Skill slugs this person has said a hard no to, from their Limits. */
  readonly hardNos: readonly string[];
};

export type PerformerEligibility =
  | { readonly eligible: true; readonly verified: boolean }
  | { readonly eligible: false; readonly reason: "notBookable" | "hardNo" | "skillMissing" };

/**
 * Can this person be assigned to a service that needs `skillSlug`?
 *
 * Three distinct answers, never one generic "no":
 *   • not bookable — the hat is off, so they are not a professional here;
 *   • hard no — their own Limits refuse this work. A refusal, not a warning:
 *     the assignment cannot be made;
 *   • skill missing — nothing in their taxonomy matches.
 * An unverified skill match is ELIGIBLE and marked, never hidden.
 */
export function performerEligibility(
  candidate: PerformerCandidate,
  skillSlug: string,
): PerformerEligibility {
  if (!candidate.person.bookable.on) return { eligible: false, reason: "notBookable" };
  if (candidate.hardNos.includes(skillSlug)) return { eligible: false, reason: "hardNo" };
  const match = candidate.skills.find((s) => s.skillSlug === skillSlug);
  if (!match) return { eligible: false, reason: "skillMissing" };
  return { eligible: true, verified: match.verified };
}
