/**
 * TUL-1516: may this team invite still bring this person in?
 *
 * The redeem route used to look up the redeemer's membership among
 * active / invited / pending / suspended rows and flip whatever it found back to
 * `active`. A member an admin had suspended, or removed (a `removed` row was not even
 * looked up, so a fresh row went in), could walk back in with the invite link they were
 * sent before. The rule now:
 *
 *   - `suspended`: an invite never lifts a suspension. An admin does that.
 *   - `removed`: only an invite issued AFTER the removal counts. An invite created
 *     before `removed_at` (or with no removal time on record) is a stale credential.
 *   - anything else (no row, active, invited, pending_acceptance): fine.
 *
 * Pure: no database, no clock.
 */

export type InviteRedeemBlock = "suspended" | "removed_after_invite" | null;

export function inviteRedeemBlock(input: {
  membershipStatus: string | null | undefined;
  removedAt: string | null | undefined;
  inviteCreatedAt: string | null | undefined;
}): InviteRedeemBlock {
  const status = (input.membershipStatus ?? "").toLowerCase();
  if (status === "suspended") return "suspended";
  if (status !== "removed") return null;
  const removed = input.removedAt ? Date.parse(input.removedAt) : NaN;
  const issued = input.inviteCreatedAt ? Date.parse(input.inviteCreatedAt) : NaN;
  // A removed member with no usable timestamps fails closed.
  if (!Number.isFinite(removed) || !Number.isFinite(issued)) return "removed_after_invite";
  return issued > removed ? null : "removed_after_invite";
}
