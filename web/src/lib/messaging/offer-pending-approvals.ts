import "server-only";

/**
 * Which `sent` offers still need somebody OTHER than the client (and the sender, whose approval is
 * implicit) to approve. The client Accept is hidden for these and acceptDirect refuses them with
 * `awaiting_approval`; both read the same rule (`splitDirectAcceptApprovals`).
 *
 * Kept out of client-link.ts on purpose: it reads the offer's author, an authorship column the
 * client-safe readers must never select. Only a set of offer ids leaves this module.
 */

import { splitDirectAcceptApprovals } from "@/lib/messaging/offer-sender-approval";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

type Part = { role: string; user_id: string | null; talent_profile_id: string | null };
type PendingRow = { id: string; offer_id: string; inquiry_participants: Part | Part[] | null };

export async function loadOffersAwaitingApproval(
  admin: Admin,
  input: { tenantId: string; offerIds: readonly string[] },
): Promise<Set<string>> {
  const out = new Set<string>();
  if (input.offerIds.length === 0) return out;
  const { data: pending, error } = await admin
    .from("inquiry_approvals")
    .select("id, offer_id, inquiry_participants!inner(role, user_id, talent_profile_id)")
    .eq("tenant_id", input.tenantId)
    .in("offer_id", [...input.offerIds])
    .neq("status", "accepted");
  // Fail OPEN on the flag only: acceptDirect still refuses a blocked accept, so the worst case of a
  // read error is the old behaviour (a visible Accept that answers "awaiting approval" on click).
  if (error || !pending) return out;
  const rows = pending as PendingRow[];
  if (rows.length === 0) return out;
  const partOf = (r: PendingRow): Part | null =>
    (Array.isArray(r.inquiry_participants) ? r.inquiry_participants[0] : r.inquiry_participants) ?? null;

  const { data: offers } = await admin
    .from("inquiry_offers")
    .select("id, created_by_user_id")
    .eq("tenant_id", input.tenantId)
    .in("id", [...new Set(rows.map((r) => r.offer_id))]);
  const senderByOffer = new Map<string, string | null>(
    ((offers ?? []) as Array<{ id: string; created_by_user_id: string | null }>).map((o) => [o.id, o.created_by_user_id]),
  );

  const talentIds = [...new Set(rows.map((r) => partOf(r)?.talent_profile_id).filter((x): x is string => Boolean(x)))];
  const owners = new Map<string, string | null>();
  if (talentIds.length > 0) {
    // eslint-disable-next-line ratchet/no-untenanted-from -- talent_profiles is a global table; the ids come from THIS inquiry's participants
    const { data: tps } = await admin.from("talent_profiles").select("id, user_id").in("id", talentIds);
    for (const tp of (tps ?? []) as Array<{ id: string; user_id: string | null }>) owners.set(tp.id, tp.user_id);
  }

  const byOffer = new Map<string, PendingRow[]>();
  for (const r of rows) byOffer.set(r.offer_id, [...(byOffer.get(r.offer_id) ?? []), r]);
  for (const [offerId, list] of byOffer) {
    const split = splitDirectAcceptApprovals(
      list.map((r) => ({
        id: r.id,
        role: partOf(r)?.role ?? "",
        participantUserId: partOf(r)?.user_id ?? null,
        talentProfileId: partOf(r)?.talent_profile_id ?? null,
      })),
      senderByOffer.get(offerId) ?? null,
      owners,
    );
    if (split.blocking.length > 0) out.add(offerId);
  }
  return out;
}
