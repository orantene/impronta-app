/**
 * TUL-1920: the Tulala service fee as its own line, before and after paying.
 *
 * In `processing_mode = 'pass_through'` the guest is charged the price plus a
 * platform surcharge (`pass_through_take_bps`, 1.5% today). The picker and the
 * receipt used to show only the price, so Stripe's USD 25.38 read as a mistake
 * against "USD 25". Same shape as the agenda's TUL-1906 rows: Subtotal, the fee
 * as a "+" line, Total. Pure and client-safe: it formats amounts the caller
 * already has (the server quote, or the charged transaction) and never prices.
 */

export type ServiceFeeRows = {
  subtotal: string;
  feeLabel: string;
  fee: string;
  totalLabel: string;
  total: string;
};

export function serviceFeeCopy(es: boolean): { subtotal: string; fee: string; total: string } {
  return es
    ? { subtotal: "Subtotal", fee: "Cargo por servicio de Tulala", total: "Total" }
    : { subtotal: "Subtotal", fee: "Tulala service fee", total: "Total" };
}

/** null when nothing was added on top of the price, so the surface renders exactly as before. */
export function serviceFeeRows(
  input: { subtotalCents: number; chargedCents: number },
  es: boolean,
  fmt: (cents: number) => string,
): ServiceFeeRows | null {
  const feeCents = input.chargedCents - input.subtotalCents;
  if (!(input.subtotalCents > 0) || !(feeCents > 0)) return null;
  const c = serviceFeeCopy(es);
  return {
    subtotal: fmt(input.subtotalCents),
    feeLabel: c.fee,
    fee: `+${fmt(feeCents)}`,
    totalLabel: c.total,
    total: fmt(input.chargedCents),
  };
}

/**
 * What a receipt should treat as "charged": the sum of the order's paid, non-refund
 * transactions' gross amounts. null when there is none, so the receipt keeps the order total.
 */
export function chargedGrossCents(
  rows: ReadonlyArray<{ status?: string | null; gross_amount_cents?: number | null; refund_of_transaction_id?: string | null }>,
): number | null {
  let sum = 0;
  let any = false;
  for (const r of rows) {
    if (r.status !== "paid" || r.refund_of_transaction_id) continue;
    const g = Number(r.gross_amount_cents ?? 0);
    if (Number.isFinite(g) && g > 0) {
      sum += g;
      any = true;
    }
  }
  return any ? sum : null;
}
