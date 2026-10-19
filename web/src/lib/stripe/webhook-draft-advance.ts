/**
 * lib/stripe/webhook-draft-advance.ts
 *
 * TUL-1268 M1 (Wave E1). `createPurchase` opens an order-backed card
 * transaction at `draft`, and the guest lanes that send it to hosted Checkout
 * (instant book, tickets, cart, class timetable, package, appointment picker)
 * never move it to `payment_requested`. `markPaid` and the database status
 * trigger both refuse `draft -> paid`, so a charge Stripe had already taken
 * was never recorded: the webhook retried for three days and gave up.
 *
 * When a settlement event for the row arrives, the payment WAS requested (the
 * guest paid it), so the row takes the one step the trigger allows,
 * `draft -> payment_requested`, and `markPaid` then settles it as for every
 * other lane. Status only: nothing else on the row is written.
 *
 * Race-safe and idempotent: a single update guarded on `status = 'draft'`.
 * A row that is not draft (already requested, paid, cancelled, missing) is
 * left alone and `markPaid` decides, exactly as before.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type DraftAdvanceResult = { ok: true; advanced: boolean } | { ok: false; error: string };

export async function advanceDraftForSettlement(
  sb: SupabaseClient,
  transactionId: string,
): Promise<DraftAdvanceResult> {
  const { data, error } = await sb
    .from("booking_transactions")
    .update({ status: "payment_requested", updated_at: new Date().toISOString() })
    .eq("id", transactionId)
    .eq("status", "draft")
    .select("id");
  if (error) return { ok: false, error: `draft advance failed for ${transactionId}: ${error.message}` };
  return { ok: true, advanced: Array.isArray(data) && data.length > 0 };
}
