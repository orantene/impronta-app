/**
 * TUL-1366 (consultant P1-2): freeze the Tulala service fee when an inquiry
 * OFFER is sent, because an inquiry booking has no order to carry it. The fee of
 * each seller's CURRENT plan at send time is written to
 * inquiry_offers.service_fee_by_party; the commission engine reads it when the
 * offer is converted to a booking, so quote and charge cannot differ and a later
 * fee or plan change never moves an offer already sent.
 *
 * Fails closed: when the fee is on and cannot be confirmed the offer is NOT sent
 * (the caller returns the plain retry message). Off (legacy / kill switch /
 * before the migration): nothing is written.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { moneyOwningParty } from "@/lib/inquiry/owning-party-resolver";
import { logServerError } from "@/lib/server/safe-error";
import { decidePassThrough, FEE_UNAVAILABLE_MESSAGE } from "./pass-through-arming";
import { loadSellerPassThroughBps, type PassThroughSeller } from "./pass-through-rate";

export type FreezeOfferFeeResult = { ok: true; frozen: boolean } | { ok: false; error: string };

export async function freezeOfferServiceFee(
  supabase: SupabaseClient,
  input: { inquiryId: string; tenantId: string; offerId: string },
): Promise<FreezeOfferFeeResult> {
  const decision = await decidePassThrough(supabase as unknown as Parameters<typeof decidePassThrough>[0]);
  if (decision.mode === "off") return { ok: true, frozen: false };
  if (decision.mode === "unavailable") {
    logServerError("offer-service-fee/decision", decision.detail);
    return { ok: false, error: FEE_UNAVAILABLE_MESSAGE };
  }
  try {
    const { data, error } = await supabase
      .from("inquiry_participants")
      .select("talent_profile_id, owning_party_type, owning_party_id")
      .eq("inquiry_id", input.inquiryId)
      .eq("tenant_id", input.tenantId)
      .eq("role", "talent")
      .eq("status", "active");
    if (error) throw error;

    const sellers = new Map<string, PassThroughSeller>();
    for (const r of (data ?? []) as Array<{ talent_profile_id: string | null; owning_party_type: string; owning_party_id: string }>) {
      // Same mapping the engine uses: a talent selling in her own workspace is the merchant.
      const money = await moneyOwningParty(
        supabase,
        { type: r.owning_party_type as "agency" | "workspace" | "talent", id: r.owning_party_id },
        r.talent_profile_id,
      );
      sellers.set(money.id, money.type === "talent" ? { kind: "talent", partyId: money.id } : { kind: "workspace", partyId: money.id });
    }
    // An offer with no talent line is the workspace's own sale.
    if (sellers.size === 0) sellers.set(input.tenantId, { kind: "workspace", partyId: input.tenantId });

    const byParty: Record<string, number> = {};
    for (const seller of sellers.values()) {
      byParty[seller.partyId] = await loadSellerPassThroughBps(supabase, {
        platformBps: decision.platformBps,
        planFeeBps: decision.planFeeBps,
        seller,
      });
    }
    const { error: wErr } = await supabase
      .from("inquiry_offers")
      .update({ service_fee_by_party: byParty })
      .eq("id", input.offerId)
      .eq("tenant_id", input.tenantId);
    if (wErr) throw wErr;
    return { ok: true, frozen: true };
  } catch (err) {
    logServerError("offer-service-fee/freeze", err);
    return { ok: false, error: FEE_UNAVAILABLE_MESSAGE };
  }
}
