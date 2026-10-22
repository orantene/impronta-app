/**
 * TUL-1899: the accept-and-pay path creates the booking and stamps
 * `inquiries.booked_at`, but when the engine's approval RPC still waits on a
 * party (or the guest accepted through the pay path) the offer stayed
 * `sent` and the inquiry `offer_pending`. The guest thread then kept
 * Accept / Decline on a paid offer. Once the booking exists, the offer is
 * accepted and the inquiry is booked. Idempotent: every write is guarded on
 * the state it expects, so a replay or a concurrent writer changes nothing.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { ENGINE_EVENT_TYPES, emitStandardEngineEvent } from "@/lib/inquiry/inquiry-events";
import { splitDirectAcceptApprovals, type PendingApproval } from "./offer-sender-approval";

/** Stamped on approval rows settled because their owner SENT the offer. */
export const IMPLICIT_ON_SEND_NOTE = "implicit_on_send";

/**
 * Which pending approvals does the offer's SENDER implicitly hold? The sender
 * is `inquiry_offers.created_by_user_id`. A row is the sender's when its
 * participant is that user, or (talent rows) its talent profile is owned by
 * that user. The client's row and every other party's row are never touched.
 * PURE.
 */
export function senderApprovalIds(
  rows: readonly PendingApproval[],
  senderUserId: string | null,
  talentOwners: ReadonlyMap<string, string | null>,
): string[] {
  if (!senderUserId) return [];
  const nonClient = rows.filter((r) => r.role !== "client");
  const talent = new Set(splitDirectAcceptApprovals(nonClient, senderUserId, talentOwners).settle);
  return nonClient.filter((r) => talent.has(r.id) || r.participantUserId === senderUserId).map((r) => r.id);
}

export type SettleStore = {
  /** Flip a `sent` offer to accepted. Returns true when this call changed it. */
  acceptSentOffer(offerId: string, at: string): Promise<boolean>;
  /** Inquiry row as it stands now. */
  loadInquiry(): Promise<{ status: string; version: number; currentOfferId: string | null } | null>;
  /** Mark the sender's own still-pending approvals accepted (source implicit_on_send). Returns rows changed. */
  settleSenderApprovals(offerId: string, at: string): Promise<number>;
  /** Engine event for the status change. Never throws. */
  emitStatusChange(offerId: string): Promise<void>;
  /** Move the inquiry to booked at the version read (compare-and-set, version + 1). */
  bookInquiry(expectedVersion: number): Promise<boolean>;
};

const BOOKABLE_FROM = new Set(["offer_pending", "approved"]);

export async function settleAcceptedOffer(store: SettleStore, input: { offerId: string; at?: string }): Promise<{ offerAccepted: boolean; inquiryBooked: boolean }> {
  const at = input.at ?? new Date().toISOString();
  const offerAccepted = await store.acceptSentOffer(input.offerId, at);
  // The sender approved by sending; other parties' rows stay as they are.
  await store.settleSenderApprovals(input.offerId, at);
  const inquiry = await store.loadInquiry();
  // Another offer is current (a newer revise): this one must not book the inquiry.
  if (!inquiry || !BOOKABLE_FROM.has(inquiry.status) || (inquiry.currentOfferId && inquiry.currentOfferId !== input.offerId)) {
    return { offerAccepted, inquiryBooked: false };
  }
  const inquiryBooked = await store.bookInquiry(inquiry.version);
  if (inquiryBooked) await store.emitStatusChange(input.offerId);
  return { offerAccepted, inquiryBooked };
}

function productionSettleStore(admin: SupabaseClient, tenantId: string, inquiryId: string): SettleStore {
  return {
    async acceptSentOffer(offerId, at) {
      const { data, error } = await tenantScopedQuery(admin, "inquiry_offers", tenantId)
        .update({ status: "accepted", accepted_at: at, updated_at: at })
        .eq("id", offerId)
        .eq("inquiry_id", inquiryId)
        .eq("status", "sent")
        .select("id")
        .maybeSingle();
      if (error) {
        logServerError("messaging.settleAcceptedOffer.offer", error);
        return false;
      }
      return Boolean(data);
    },
    async settleSenderApprovals(offerId, at) {
      const { data: offer } = await tenantScopedQuery(admin, "inquiry_offers", tenantId).select("created_by_user_id").eq("id", offerId).maybeSingle();
      const sender = ((offer ?? {}) as { created_by_user_id?: string | null }).created_by_user_id ?? null;
      if (!sender) return 0;
      const { data, error } = await tenantScopedQuery(admin, "inquiry_approvals", tenantId)
        .select("id, participant_id, inquiry_participants!inner(role, user_id, talent_profile_id)")
        .eq("offer_id", offerId)
        .eq("status", "pending");
      if (error) {
        logServerError("messaging.settleAcceptedOffer.approvals", error);
        return 0;
      }
      type Part = { role: string; user_id: string | null; talent_profile_id: string | null };
      const rows = ((data ?? []) as Array<{ id: string; inquiry_participants: Part | Part[] | null }>).map((r) => {
        const part = (Array.isArray(r.inquiry_participants) ? r.inquiry_participants[0] : r.inquiry_participants) ?? null;
        return { id: r.id, role: part?.role ?? "", participantUserId: part?.user_id ?? null, talentProfileId: part?.talent_profile_id ?? null };
      });
      const talentIds = rows.map((r) => r.talentProfileId).filter((x): x is string => Boolean(x));
      const owners = new Map<string, string | null>();
      if (talentIds.length > 0) {
        // eslint-disable-next-line ratchet/no-untenanted-from -- talent_profiles is a global table; the ids come from THIS inquiry's participants
        const { data: tps, error: tpErr } = await admin.from("talent_profiles").select("id, user_id").in("id", talentIds);
        if (tpErr) {
          logServerError("messaging.settleAcceptedOffer.talentOwners", tpErr);
          return 0;
        }
        for (const tp of (tps ?? []) as Array<{ id: string; user_id: string | null }>) owners.set(tp.id, tp.user_id);
      }
      const ids = senderApprovalIds(rows, sender, owners);
      if (ids.length === 0) return 0;
      const { data: done, error: upErr } = await tenantScopedQuery(admin, "inquiry_approvals", tenantId)
        .update({ status: "accepted", decided_at: at, updated_at: at, notes: IMPLICIT_ON_SEND_NOTE })
        .in("id", ids)
        .eq("status", "pending")
        .select("id");
      if (upErr) {
        logServerError("messaging.settleAcceptedOffer.approvalsWrite", upErr);
        return 0;
      }
      return (done ?? []).length;
    },
    async emitStatusChange(offerId) {
      try {
        await emitStandardEngineEvent(admin, {
          type: ENGINE_EVENT_TYPES.APPROVALS_COMPLETED,
          inquiryId,
          actorUserId: null,
          data: { offerId, source: "settle_accepted_offer" },
        });
      } catch (error) {
        logServerError("messaging.settleAcceptedOffer.event", error);
      }
    },
    async loadInquiry() {
      const { data, error } = await tenantScopedQuery(admin, "inquiries", tenantId).select("status, version, current_offer_id").eq("id", inquiryId).maybeSingle();
      if (error || !data) return null;
      const row = data as { status: string; version: number | string; current_offer_id: string | null };
      return { status: row.status, version: Number(row.version), currentOfferId: row.current_offer_id ?? null };
    },
    async bookInquiry(expectedVersion) {
      const { data, error } = await tenantScopedQuery(admin, "inquiries", tenantId)
        .update({ status: "booked", next_action_by: null, version: expectedVersion + 1 })
        .eq("id", inquiryId)
        .eq("version", expectedVersion)
        .in("status", [...BOOKABLE_FROM])
        .select("id")
        .maybeSingle();
      if (error) {
        logServerError("messaging.settleAcceptedOffer.inquiry", error);
        return false;
      }
      return Boolean(data);
    },
  };
}

export async function settleAcceptedOfferFor(admin: SupabaseClient, input: { tenantId: string; inquiryId: string; offerId: string }): Promise<void> {
  try {
    await settleAcceptedOffer(productionSettleStore(admin, input.tenantId, input.inquiryId), { offerId: input.offerId });
  } catch (error) {
    logServerError("messaging.settleAcceptedOffer", error);
  }
}
