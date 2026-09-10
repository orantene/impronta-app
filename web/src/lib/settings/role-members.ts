/**
 * Grouping the workspace's people by the role they hold, for Settings ›
 * Roles & limits.
 *
 * AN INVITATION IS NOT A MEMBER. `TeamMember.status` is a real field —
 * `adaptBridgeTeamMember` maps the loader's `pending_acceptance` onto
 * `"invited"` — and somebody who has not accepted cannot sign in, so they
 * hold no role and reach no selling mode yet. Counting them under "3 members"
 * is a count taken correctly over the wrong rows: the number would be right
 * about the invitation list and wrong about who can open a register tomorrow
 * morning. They are still worth showing, so this returns them separately
 * rather than dropping them.
 *
 * Pure and import-free, so the grouping can be tested without React.
 */

export const SETTINGS_ROLE_ORDER = ["viewer", "editor", "manager", "admin", "owner"] as const;

export type SettingsRole = (typeof SETTINGS_ROLE_ORDER)[number];

export type RoleMember = {
  readonly id: string;
  readonly name: string;
  readonly role: SettingsRole;
  /** "invited" = the invitation has not been accepted; they cannot sign in yet. */
  readonly status: "active" | "invited";
};

export type RoleMembership = {
  /** People who hold this role today. This is what the member count counts. */
  readonly active: readonly RoleMember[];
  /** People invited into this role who have not accepted yet. */
  readonly invited: readonly RoleMember[];
};

/**
 * Every role in ladder order, each with its accepted and its pending people.
 * A role nobody holds is still present with two empty lists, so the card
 * renders the whole ladder rather than only the populated half of it.
 */
export function groupMembersByRole(
  members: readonly RoleMember[],
): ReadonlyMap<SettingsRole, RoleMembership> {
  const grouped = new Map<SettingsRole, { active: RoleMember[]; invited: RoleMember[] }>();
  for (const role of SETTINGS_ROLE_ORDER) grouped.set(role, { active: [], invited: [] });
  for (const member of members) {
    const bucket = grouped.get(member.role);
    if (!bucket) continue;
    if (member.status === "invited") bucket.invited.push(member);
    else bucket.active.push(member);
  }
  return grouped;
}
