/**
 * Per-seller "who pays the processing fee" setting + the receipt/statement line
 * items each mode produces (pass_through mode, owner decision 2026-10-01).
 *
 *   'seller' (DEFAULT): client pays subtotal + platform fee; seller receives
 *      subtotal minus the actual processing fee.
 *   'client': client pays subtotal + platform fee + processing fee; seller
 *      receives 100% of the subtotal.
 *
 * Storage: `talent_profiles.processing_fee_payer` (independent talent) and
 * `agencies.processing_fee_payer` (workspace), both text, default 'seller'
 * (migration 20261231299600). The commission engine reads it through
 * `engine_processing_fee_payer(party_type, party_id)`.
 *
 * The functions below take a Supabase client and DO NOT authorize: the UI wraps
 * `setProcessingFeePayer` in a server action that has already proven the caller
 * owns the talent profile / is an owner-or-admin of the workspace.
 *
 * The line builders are PURE and return codes + signed cents, never copy, so the
 * UI owns wording and i18n.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { estimateProcessorFeeCents, type BookingCommissionSnapshot, type ProcessingFeePayer, type ProcessorFeeRates } from "./commission";
import { formatBpsPercent } from "./fee-config";

export type FeePayerParty = { kind: "talent" | "workspace"; id: string };

/** Anything that is not exactly 'client' is the default 'seller'. */
export function parseProcessingFeePayer(v: unknown): ProcessingFeePayer {
  return v === "client" ? "client" : "seller";
}

function tableFor(kind: FeePayerParty["kind"]): "talent_profiles" | "agencies" {
  return kind === "talent" ? "talent_profiles" : "agencies";
}

export async function getProcessingFeePayer(
  sb: SupabaseClient,
  party: FeePayerParty,
): Promise<ProcessingFeePayer> {
  const { data, error } = await sb
    .from(tableFor(party.kind))
    .select("processing_fee_payer")
    .eq("id", party.id)
    .maybeSingle();
  // A failed read is not "seller": surface it so the caller decides (the
  // settings action logs it and shows the default).
  if (error) throw error;
  return parseProcessingFeePayer((data as { processing_fee_payer?: unknown } | null)?.processing_fee_payer);
}

export async function setProcessingFeePayer(
  sb: SupabaseClient,
  party: FeePayerParty,
  payer: ProcessingFeePayer,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (payer !== "seller" && payer !== "client") return { ok: false, error: "invalid_payer" };
  const { error } = await sb.from(tableFor(party.kind)).update({ processing_fee_payer: payer }).eq("id", party.id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export type FeeLineCode =
  | "service_subtotal"
  | "base_reservation_fee"
  | "platform_fee"
  | "processing_fee"
  | "total_charged"
  /** Non-additive memo (after the total): the card fee already inside the price. */
  | "card_fee_memo"
  | "talent_quote"
  | "workspace_margin"
  | "channel_referral"
  | "net_payout";

/** `cents` is signed: a seller-side deduction is negative. */
export type FeeLine = { code: FeeLineCode; cents: number };

type SnapForLines = Pick<
  BookingCommissionSnapshot,
  | "gross_cents"
  | "gross_charged_cents"
  | "client_surcharge_cents"
  | "talent_net_cents"
  | "workspace_fee_cents"
  | "channel_referral_cents"
  | "seller_of_record"
> & {
  base_reservation_fee_cents?: number;
  processing_fee_payer?: ProcessingFeePayer;
  client_processing_fee_cents?: number;
  /** ACTUAL processing fee, once known (payout time). */
  processing_fee_cents?: number;
};

/** What the CLIENT sees on a quote / receipt. Sums to gross_charged. */
export function clientFeeLines(s: SnapForLines): FeeLine[] {
  const lines: FeeLine[] = [{ code: "service_subtotal", cents: s.gross_cents }];
  if ((s.base_reservation_fee_cents ?? 0) > 0) {
    lines.push({ code: "base_reservation_fee", cents: s.base_reservation_fee_cents ?? 0 });
  }
  lines.push({ code: "platform_fee", cents: s.client_surcharge_cents });
  if ((s.client_processing_fee_cents ?? 0) > 0) {
    lines.push({ code: "processing_fee", cents: s.client_processing_fee_cents ?? 0 });
  }
  lines.push({ code: "total_charged", cents: s.gross_charged_cents });
  return lines;
}

/**
 * What the SELLER sees on a payout statement. `actualFeeCents` is the real fee
 * share for this row (null until the charge settles => provisional, no fee
 * line yet). payer='client' never shows a seller-side fee.
 */
export function sellerFeeLines(s: SnapForLines, actualFeeCents: number | null): FeeLine[] {
  const payer = s.processing_fee_payer ?? "seller";
  const lines: FeeLine[] = [];
  if (s.seller_of_record === "talent") {
    lines.push({ code: "service_subtotal", cents: s.gross_cents });
    if (payer === "seller" && actualFeeCents != null) {
      lines.push({ code: "processing_fee", cents: -actualFeeCents });
    }
    lines.push({
      code: "net_payout",
      cents: payer === "seller" && actualFeeCents != null ? s.talent_net_cents - actualFeeCents : s.talent_net_cents,
    });
    return lines;
  }
  // Workspace is the seller: talent is whole; the workspace carries the fee.
  lines.push({ code: "talent_quote", cents: s.talent_net_cents });
  lines.push({ code: "workspace_margin", cents: s.workspace_fee_cents + s.channel_referral_cents });
  if (s.channel_referral_cents > 0) lines.push({ code: "channel_referral", cents: -s.channel_referral_cents });
  let ws = s.workspace_fee_cents;
  if (payer === "seller" && actualFeeCents != null) {
    const borne = Math.min(actualFeeCents, Math.max(ws, 0));
    lines.push({ code: "processing_fee", cents: -borne });
    ws -= borne;
  }
  lines.push({ code: "net_payout", cents: ws });
  return lines;
}

/**
 * Client fee lines for a whole booking (one snapshot row per participant):
 * sums each code across rows, keeping clientFeeLines' order. Returns [] unless
 * the summed total equals `chargeCents`, so a deposit or partial link never
 * shows a breakdown that does not add up to what is being charged.
 */
export function bookingClientFeeLines(
  rows: readonly SnapForLines[],
  chargeCents: number,
  opts?: {
    /**
     * Checkout card-fee display flag (fee-config checkoutCardFeeLineEnabled).
     * When set and the seller absorbs the card fee, a non-additive
     * `card_fee_memo` line follows the total, estimated from these (verified)
     * rates. null/absent = today's lines exactly.
     */
    cardFeeMemoRates?: ProcessorFeeRates | null;
  },
): FeeLine[] {
  const sums = new Map<FeeLineCode, number>();
  for (const row of rows) {
    for (const l of clientFeeLines(row)) sums.set(l.code, (sums.get(l.code) ?? 0) + l.cents);
  }
  if (!rows.length || sums.get("total_charged") !== chargeCents) return [];
  const out: FeeLine[] = [...sums].map(([code, cents]) => ({ code, cents }));
  const rates = opts?.cardFeeMemoRates;
  if (rates && !sums.has("processing_fee")) {
    const memo = estimateProcessorFeeCents(chargeCents, rates);
    if (memo > 0) out.push({ code: "card_fee_memo", cents: memo });
  }
  return out;
}

/**
 * "(1.5%)" label for the platform_fee line, only when the line really is the
 * configured percent of the service price (within one cent of rounding). A
 * floored or overridden fee returns null, so the label never states a rate the
 * charge did not use.
 */
export function platformFeePercentLabel(lines: readonly FeeLine[]): string | null {
  const service = lines.find((l) => l.code === "service_subtotal")?.cents ?? 0;
  const fee = lines.find((l) => l.code === "platform_fee")?.cents;
  if (fee == null || service <= 0) return null;
  // TUL-1366: the rate varies by plan, so it is read back from the charged
  // amounts, never inferred from a default. Only a clean whole-bps rate within
  // one cent of rounding is stated; anything else shows no percent.
  const bps = Math.round((fee * 10_000) / service);
  if (bps < 0 || bps > 2000) return null;
  return Math.abs(fee - Math.round((service * bps) / 10_000)) <= 1 ? formatBpsPercent(bps) : null;
}
