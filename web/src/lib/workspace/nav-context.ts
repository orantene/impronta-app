/**
 * nav-context.ts — derive the navigation context from data the client ALREADY
 * has. No new column, no new fetch, no new bridge field.
 *
 * Two derivations live here:
 *
 *   PRESET — how this workspace works, in three shapes the nav cares about.
 *     Read off `agencies.settings.industry_preset`, which every workspace has
 *     had since the preset picker shipped, via `words/presets.ts`. A preset
 *     that sells a menu and books nobody is a `cafe`; one that books
 *     appointments and has at most one person is `solo`; everything else is
 *     `hybrid`. It fails OPEN to `hybrid`, the shape that hides nothing — an
 *     unrecognised preset must never make a live workspace's nav disappear.
 *
 *   HATS — who is looking. `owner` / `manager` / `assistant` collapse the five
 *     membership roles, and `professional` is a fourth, orthogonal hat: the
 *     signed-in person is bookable on this roster. A person can be both.
 *
 * NO INVENTED COLUMNS. A cashier hat and a host hat have nowhere to come from:
 * there is no per-membership job field anywhere in the schema, and a hat that
 * reads a column that does not exist is a hat that is always false. Both are
 * therefore folded into `assistant`, the bottom rung, which is what a cashier
 * or a host is on the role ladder today. When a real job field exists, widen
 * `WorkRole` here and nothing else changes.
 */

import { resolveIndustryPreset } from "@/lib/words/presets";
import { isKnownTenantRole, type TenantRoleKey } from "@/lib/access/roles";
import type { WorkRole, WorkspacePreset } from "./destinations";

export type PresetInput = {
  /** Raw `agencies.settings.industry_preset`. Anything unparseable is tolerated. */
  readonly industryPreset: unknown;
  /**
   * People on this workspace's roster or team. `solo` needs "at most one", so
   * an unknown count is NOT solo: it falls through to `hybrid`.
   */
  readonly teamMemberCount?: number;
};

/**
 * Which of the three shapes this workspace is.
 *
 * Order matters. `cafe` is checked first because a preset that sells a menu and
 * takes no appointments is a counter business however many people work there,
 * and `solo` is about one person's day, not about what is sold.
 */
export function derivePreset(input: PresetInput): WorkspacePreset {
  const features = resolveIndustryPreset(input.industryPreset).features;
  if (features.menu && !features.appointments) return "cafe";
  const count = input.teamMemberCount;
  const knownSmallTeam = typeof count === "number" && Number.isFinite(count) && count <= 1;
  if (features.appointments && knownSmallTeam) return "solo";
  return "hybrid";
}

/**
 * The five membership roles collapsed onto the three the nav distinguishes.
 *
 * Unknown fails to `assistant`, the least. This is the opposite direction from
 * `normalizeWorkspaceType`, and deliberately so: that one decides whether a
 * SURFACE exists and must not delete an agency's roster, this one decides
 * whether a person is shown a billing link.
 */
export function deriveWorkRole(rawRole: unknown): WorkRole {
  const value = typeof rawRole === "string" ? rawRole.trim().toLowerCase() : "";
  if (!isKnownTenantRole(value)) return "assistant";
  const role: TenantRoleKey = value;
  if (role === "owner") return "owner";
  if (role === "admin" || role === "manager") return "manager";
  // editor + viewer. A cashier and a host land here too — see the header.
  return "assistant";
}

export type HatsInput = {
  /** Raw `agency_memberships.role`. */
  readonly membershipRole: unknown;
  /** Does the signed-in person have a talent profile on THIS roster. */
  readonly hasTalentProfile?: boolean;
};

export type WorkHats = {
  readonly role: WorkRole;
  readonly professional: boolean;
};

export function deriveHats(input: HatsInput): WorkHats {
  return {
    role: deriveWorkRole(input.membershipRole),
    professional: input.hasTalentProfile === true,
  };
}

/**
 * Only an owner manages billing today. `roles.ts` puts `manage_billing` in
 * `OWNER_CAPS` alone, and this mirrors that rather than restating it: the
 * capability check is the authority, this is the nav's cheap local read of it.
 */
export function canManageBilling(role: WorkRole): boolean {
  return role === "owner";
}
