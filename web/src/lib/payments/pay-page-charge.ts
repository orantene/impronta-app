/**
 * What the client was charged on /pay, as fee lines, so the paid page says it: service price +
 * service fee = the total the card was charged (before Pay, `pay-page.tsx` reads
 * `collectForOrderPrincipal` itself). Found in paid QA (2026-10-09):
 * the page showed "$1,000" while Stripe charged MX$1,015.00 and the thread then said "$1,000 paid".
 *
 * The pure builders are testable; the loader reads the paid money row(s) the receipt uses.
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { FeeLine } from "@/lib/billing/processing-fee-payer";
import { MONEY_IN_STATUSES } from "@/lib/bookings/manual-payment";
import { logServerError } from "@/lib/server/safe-error";

/** principal + fee = charge. [] when nothing is added on top (no fee line to show, never a guess). */
export function chargeFeeLines(input: { principalCents: number; chargeCents: number }): FeeLine[] {
  const principal = Math.round(input.principalCents);
  const charge = Math.round(input.chargeCents);
  if (!(principal > 0) || !(charge > principal)) return [];
  return [
    { code: "service_subtotal", cents: principal },
    { code: "platform_fee", cents: charge - principal },
    { code: "total_charged", cents: charge },
  ];
}

/** The charged total out of a set of lines (null when the page has no breakdown). */
export function chargedTotalCents(lines: readonly FeeLine[] | undefined | null): number | null {
  const total = lines?.find((l) => l.code === "total_charged");
  return total ? total.cents : null;
}

/** After Pay: what the card was charged, from the paid money row(s) of the order. */
export async function loadPaidChargeLines(admin: SupabaseClient, orderId: string): Promise<FeeLine[]> {
  try {
    const { data, error } = await admin
      .from("booking_transactions")
      .select("gross_amount_cents, net_amount_cents, status, refund_of_transaction_id")
      .eq("order_id", orderId)
      .in("status", [...MONEY_IN_STATUSES]);
    if (error) {
      logServerError("payments.payPageCharge.paid", error);
      return [];
    }
    const rows = ((data ?? []) as Array<{ gross_amount_cents: number | string | null; net_amount_cents: number | string | null; refund_of_transaction_id: string | null }>).filter((r) => !r.refund_of_transaction_id);
    const gross = rows.reduce((n, r) => n + (Number(r.gross_amount_cents) || 0), 0);
    const net = rows.reduce((n, r) => n + (Number(r.net_amount_cents) || 0), 0);
    return chargeFeeLines({ principalCents: net, chargeCents: gross });
  } catch (err) {
    logServerError("payments.payPageCharge.paid", err);
    return [];
  }
}
