/**
 * TUL-75 · back-fill plan for accounts created before the three onboarding
 * choices. Pure: classifies one user's records into the shape the dry-run
 * report counts. Nothing here writes; each shape names the writer a later,
 * approved back-fill would reuse.
 */

export const REAL_TALENT_CODES: ReadonlySet<string> = new Set(["TAL-93938"]);

export type SingleRoleFacts = {
  talentProfileId: string | null;
  profileCode: string | null;
  isDemo: boolean;
  ownSitePublished: boolean;
  ownedTenantIds: readonly string[];
  selfRosterTenantIds: readonly string[];
};

export type SingleRoleShape =
  | "excluded"
  | "talent_without_own_page"
  | "owner_profile_not_on_own_team"
  | "studio_owner_only"
  | "complete";

export const SHAPE_FIX: Record<SingleRoleShape, string> = {
  excluded: "never touched (demo or real talent)",
  talent_without_own_page: "ensureOwnTalentSite, the writer the 'myself' choice uses",
  owner_profile_not_on_own_team: "none automatic: the owner chooses in Settings > How you work",
  studio_owner_only: "none: a valid studio, 'Add me as a provider' stays available in Settings",
  complete: "none",
};

export function classifySingleRole(f: SingleRoleFacts): SingleRoleShape {
  if (f.isDemo || (f.profileCode && REAL_TALENT_CODES.has(f.profileCode))) return "excluded";
  const ownsWorkspace = f.ownedTenantIds.length > 0;
  if (!ownsWorkspace) return f.talentProfileId && !f.ownSitePublished ? "talent_without_own_page" : "complete";
  if (!f.talentProfileId) return "studio_owner_only";
  const onOwnTeam = f.ownedTenantIds.some((t) => f.selfRosterTenantIds.includes(t));
  return onOwnTeam ? "complete" : "owner_profile_not_on_own_team";
}
