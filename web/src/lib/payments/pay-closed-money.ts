/**
 * Closed pay page: did money move? "Nothing was taken" is only true when no
 * Checkout session completed and nothing settled in the ledger (QA on Jor,
 * 2026-10-01: the page said it while Stripe had taken the card payment).
 * Unknown (a read failed) counts as "may have moved": never claim "nothing".
 */

import { boundSessionIsComplete } from "@/lib/payments/link-checkout";
import { retrieveCheckoutSessionLink } from "@/lib/payments/stripe-checkout";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = { from: (table: string) => any };

const SETTLED = ["paid", "payout_pending", "payout_sent"];

export async function moneyMayHaveMoved(
  admin: Admin,
  orderId: string | null,
  retrieve: Parameters<typeof boundSessionIsComplete>[2] = retrieveCheckoutSessionLink,
): Promise<boolean> {
  if (!orderId) return false;
  const { data: txns, error: txErr } = await admin
    .from("booking_transactions")
    .select("status")
    .eq("order_id", orderId);
  if (txErr) return true;
  if (((txns ?? []) as Array<{ status: string }>).some((r) => SETTLED.includes(r.status))) return true;
  const { data: links, error: linkErr } = await admin
    .from("payment_links")
    .select("reservation_id")
    .eq("order_id", orderId);
  if (linkErr) return true;
  for (const row of (links ?? []) as Array<{ reservation_id: string | null }>) {
    if (!row.reservation_id) continue;
    const done = await boundSessionIsComplete(admin as never, row.reservation_id, retrieve);
    if (done !== false) return true;
  }
  return false;
}
