/**
 * Which pending approvals on an offer may a direct (link-holder) accept ignore?
 *
 * `seedApprovalsForOffer` writes one pending approval for the client and one
 * per active rostered talent. When the talent herself SENDS the offer (a solo
 * talent site), her own approval row is pending forever: nobody else can
 * decide it, and `acceptDirect` used to refuse every client accept because of
 * it ("No puedes hacer eso desde aqui", e2e P0). The sender approving her own
 * offer is implicit in sending it, so her row is settled with the client's.
 *
 * Other talents' rows (a multi-talent offer) and staff rows still block: they
 * are real approvals the client cannot stand in for.
 *
 * PURE: no I/O. The caller supplies who sent the offer and who owns each talent.
 */

export type PendingApproval = {
  id: string;
  role: string;
  /** inquiry_participants.user_id */
  participantUserId: string | null;
  /** inquiry_participants.talent_profile_id */
  talentProfileId: string | null;
};

export type ApprovalSplit = {
  /** The client's own rows plus the sender's own rows: settled by this accept. */
  settle: string[];
  /** Rows that still need somebody else. */
  blocking: string[];
};

export function splitDirectAcceptApprovals(
  rows: readonly PendingApproval[],
  senderUserId: string | null,
  /** talent_profiles.id -> talent_profiles.user_id */
  talentOwners: ReadonlyMap<string, string | null>,
): ApprovalSplit {
  const settle: string[] = [];
  const blocking: string[] = [];
  for (const r of rows) {
    const isClient = r.role === "client";
    const isSender =
      r.role === "talent" &&
      senderUserId !== null &&
      (r.participantUserId === senderUserId ||
        (r.talentProfileId !== null && talentOwners.get(r.talentProfileId) === senderUserId));
    if (isClient || isSender) settle.push(r.id);
    else blocking.push(r.id);
  }
  return { settle, blocking };
}
