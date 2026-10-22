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

export type SettleStore = {
  /** Flip a `sent` offer to accepted. Returns true when this call changed it. */
  acceptSentOffer(offerId: string, at: string): Promise<boolean>;
  /** Inquiry row as it stands now. */
  loadInquiry(): Promise<{ status: string; version: number; currentOfferId: string | null } | null>;
  /** Move the inquiry to booked at the version read (compare-and-set, version + 1). */
  bookInquiry(expectedVersion: number): Promise<boolean>;
};

const BOOKABLE_FROM = new Set(["offer_pending", "approved"]);

export async function settleAcceptedOffer(store: SettleStore, input: { offerId: string; at?: string }): Promise<{ offerAccepted: boolean; inquiryBooked: boolean }> {
  const offerAccepted = await store.acceptSentOffer(input.offerId, input.at ?? new Date().toISOString());
  const inquiry = await store.loadInquiry();
  // Another offer is current (a newer revise): this one must not book the inquiry.
  if (!inquiry || !BOOKABLE_FROM.has(inquiry.status) || (inquiry.currentOfferId && inquiry.currentOfferId !== input.offerId)) {
    return { offerAccepted, inquiryBooked: false };
  }
  return { offerAccepted, inquiryBooked: await store.bookInquiry(inquiry.version) };
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
