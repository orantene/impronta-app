/**
 * Role a team-invite redemption leaves an EXISTING member with (TUL-1269).
 *
 * The redeem route used to overwrite `role` with the invite's `target_role` whenever the
 * redeemer already had a membership row, so an owner or admin who redeemed (or was sent) a
 * lower-role invite was silently downgraded, and an owner row could be rewritten outright.
 * Redemption may only raise a role, and never touches an owner.
 */

const RANK: Record<string, number> = { viewer: 0, editor: 1, manager: 2, admin: 3, owner: 4 };

export function roleAfterRedeem(existingRole: string | null | undefined, targetRole: string): string {
  if (!existingRole) return targetRole;
  if (existingRole === "owner") return "owner";
  const have = RANK[existingRole];
  const want = RANK[targetRole];
  // An unknown existing role is kept as-is rather than guessed at.
  if (have === undefined) return existingRole;
  if (want === undefined) return existingRole;
  return want > have ? targetRole : existingRole;
}
