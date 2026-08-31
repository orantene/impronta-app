/**
 * structure-model.ts — identity derived from which objects exist.
 *
 * THE RULE THIS ENFORCES
 * ──────────────────────
 * There is no user type. "Talent", "business" and "hybrid" are not things an
 * account IS; they are things you can observe about which objects it owns. A
 * user who owns a person-kind `talent_profiles` row and an `agency_memberships`
 * row with role=owner is a hybrid, and stops being one the moment either object
 * goes away. Nothing needs to be migrated for that to be true, and nothing can
 * fall out of sync with it.
 *
 * WHAT THIS REPLACES, AND WHAT IT DOESN'T
 * ───────────────────────────────────────
 * `profiles.app_role` is the forbidden user-type field. It holds
 * `super_admin | agency_staff | talent | client`, appears in 70-plus files, and
 * home-dashboard routing reads it — which is why a hybrid owner lands on
 * `/talent` with no way to reach their workspace. Deleting it is a migration
 * program, not a phase of this feature.
 *
 * So this module does not delete it. It:
 *   - derives every STRUCTURE decision from object existence, so no new identity
 *     meaning is ever written into `app_role`;
 *   - treats `app_role` as a home-dashboard PREFERENCE, nothing more;
 *   - reports when more than one home is legitimately valid, which is the case
 *     `app_role` cannot express and the reason the chooser exists.
 *
 * Capability checks stay where they correctly live, on membership plus
 * capability, per decision L10. This module answers "what is this account
 * shaped like", never "may this account do X".
 *
 * PERSON VS RESOURCE
 * ──────────────────
 * `talent_profiles.profile_kind` is load-bearing here. `resource` rows are
 * staff and chairs on a business workspace: `user_id` is NULL, they are hidden
 * from every public surface, a DB trigger refuses to ever attach a login, and
 * they do not consume roster seats. A salon owner with six of them is
 * workspace-only, not a hybrid with six identities. Only `person` counts.
 */

// ─── Inputs ───────────────────────────────────────────────────────────────────

export type WorkspaceRef = {
  tenantId: string;
  slug: string | null;
  displayName: string | null;
  planTier: string | null;
  /**
   * `talent` = roster-shaped (represents named people who can be booked by name).
   * `business` = staff-resource-shaped (roster and pitches are hidden entirely).
   * Not cosmetic: see `@/lib/saas/workspace-type`.
   */
  workspaceType: string | null;
  status: string | null;
};

export type RosterRef = {
  tenantId: string;
  isPrimary: boolean;
  /** `active` or `pending`. Removed rows are never loaded. */
  status: string;
};

/**
 * Everything observable about a user, and the ONLY input to identity.
 *
 * Deliberately a plain data bag with no methods and no DB handle, so the
 * derivation below is pure and every case in the product can be written as a
 * literal in a test.
 */
export type OwnedObjects = {
  /** A `profile_kind = 'person'` talent profile owned by this user. */
  talentProfileId: string | null;
  /** Active `owner`-role memberships. Ownership, not access. */
  ownedWorkspaces: WorkspaceRef[];
  /** Active non-owner staff memberships. Access to someone else's operation. */
  staffWorkspaces: WorkspaceRef[];
  /**
   * Workspaces representing this user's talent profile, EXCLUDING any workspace
   * they own. Being on your own roster is an implementation detail of solo
   * workspaces (`ensureSelfRoster`), not representation by an agency.
   */
  representedBy: RosterRef[];
};

export const EMPTY_OWNED_OBJECTS: OwnedObjects = {
  talentProfileId: null,
  ownedWorkspaces: [],
  staffWorkspaces: [],
  representedBy: [],
};

// ─── Derived structure ────────────────────────────────────────────────────────

/**
 * The structure vocabulary. A computed view, never a stored value.
 *
 * `unformed` is a real and common state, not an error: a brand-new account that
 * has finished auth and owns nothing yet. The intake exists precisely to move
 * someone out of it, so it must be nameable.
 */
export type Structure = "unformed" | "talent_only" | "workspace_only" | "hybrid";

export function hasTalentProfile(o: OwnedObjects): boolean {
  return o.talentProfileId !== null;
}

export function ownsWorkspace(o: OwnedObjects): boolean {
  return o.ownedWorkspaces.length > 0;
}

export function deriveStructure(o: OwnedObjects): Structure {
  const talent = hasTalentProfile(o);
  const workspace = ownsWorkspace(o);
  if (talent && workspace) return "hybrid";
  if (talent) return "talent_only";
  if (workspace) return "workspace_only";
  return "unformed";
}

/**
 * Is this user represented by someone else's workspace?
 *
 * Distinct from `ownsWorkspace`: a therapist on a spa's roster has a real
 * commercial relationship and no workspace of her own. Law 5 — being employed
 * or represented never disqualifies someone from being Talent — makes this a
 * property to observe rather than a reason to withhold a Talent Profile.
 */
export function isRepresented(o: OwnedObjects): boolean {
  return o.representedBy.length > 0;
}

/** The primary representing workspace, when there is one. */
export function primaryRepresentation(o: OwnedObjects): RosterRef | null {
  const active = o.representedBy.filter((r) => r.status === "active");
  return active.find((r) => r.isPrimary) ?? active[0] ?? null;
}

/**
 * Every workspace this user can act in, owned first.
 * Order is deliberate: an owner landing in someone else's workspace first would
 * read as a bug.
 */
export function reachableWorkspaces(o: OwnedObjects): WorkspaceRef[] {
  return [...o.ownedWorkspaces, ...o.staffWorkspaces];
}

// ─── Home dashboard ───────────────────────────────────────────────────────────

export type Home = "workspace" | "talent" | "client";

/**
 * Which dashboards would actually render for this user.
 *
 * This is the question `app_role` was answering badly. `app_role` holds exactly
 * one value, so a hybrid gets exactly one home and the other surface becomes
 * unreachable from the shell even though it exists and works.
 *
 * `client` is not derived from objects — a buyer account owns none of these —
 * so it is admitted only when the stored role says so and nothing else is
 * available. That keeps the derivation honest: this function reports what
 * exists, and only falls back to the stored role where no object can speak.
 */
export function validHomes(o: OwnedObjects, appRole: string | null): Home[] {
  const homes: Home[] = [];
  if (reachableWorkspaces(o).length > 0) homes.push("workspace");
  if (hasTalentProfile(o)) homes.push("talent");
  if (homes.length === 0 && appRole === "client") homes.push("client");
  return homes;
}

/**
 * True when the user has more than one valid home and has not chosen one.
 *
 * The condition the product currently cannot see. A hybrid owner is silently
 * routed by `app_role` and, because a workspace owner's role is a staff role
 * rather than `talent`, the route that gets picked is often the one they did not
 * want — with no control anywhere to change it.
 */
export function needsHomeChooser(
  o: OwnedObjects,
  appRole: string | null,
  storedPreference: Home | null,
): boolean {
  const homes = validHomes(o, appRole);
  if (homes.length < 2) return false;
  return storedPreference === null || !homes.includes(storedPreference);
}

/**
 * The home to route to, or null when the user should be asked.
 *
 * Precedence: an explicit stored preference that is still valid, then the only
 * valid home, then null. Note what is NOT here — no guessing between two valid
 * homes. Guessing is what produced the current bug, and a chooser shown once is
 * cheaper than a user who cannot find their own workspace.
 */
export function resolveHome(
  o: OwnedObjects,
  appRole: string | null,
  storedPreference: Home | null,
): Home | null {
  const homes = validHomes(o, appRole);
  if (homes.length === 0) return null;
  if (storedPreference && homes.includes(storedPreference)) return storedPreference;
  if (homes.length === 1) return homes[0] ?? null;
  return null;
}

export const HOME_PATH: Record<Home, string> = {
  workspace: "/admin",
  talent: "/talent",
  client: "/client",
};

export function isHome(value: unknown): value is Home {
  return value === "workspace" || value === "talent" || value === "client";
}

// ─── Structure the intake should create ───────────────────────────────────────

/**
 * What the intake still needs to create to satisfy a recommendation, given what
 * already exists.
 *
 * Called before provisioning so a returning user is never handed a second
 * Talent Profile, and so "recommend a workspace" against an existing workspace
 * becomes "you already have one" rather than a duplicate. The one-free-workspace
 * rule lives in `@/lib/saas/owned-free-workspace`; this only reports the gap.
 */
export function structureGap(
  existing: OwnedObjects,
  wanted: { talentProfile: boolean; workspace: boolean },
): { createTalentProfile: boolean; createWorkspace: boolean; alreadySatisfied: boolean } {
  const createTalentProfile = wanted.talentProfile && !hasTalentProfile(existing);
  const createWorkspace = wanted.workspace && !ownsWorkspace(existing);
  return {
    createTalentProfile,
    createWorkspace,
    alreadySatisfied: !createTalentProfile && !createWorkspace,
  };
}
