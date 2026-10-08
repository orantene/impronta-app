/**
 * What is still owed on ONE booking, from its payment ledger
 * (`booking_transactions`). Pure: no I/O.
 *
 * MONEY. `gross_amount_cents` of a CARD row is the FULL charge: service price
 * plus the client's platform fee and any processing fee. Subtracting it from the
 * service total would under-count what is owed, so each money-in row is
 * credited at its SERVICE PRINCIPAL:
 * - manual rows (cash, transfer, door; no client fees): `gross_amount_cents`.
 * - card rows: the commission snapshot's service subtotal for that charge
 *   (`gross_cents` against `gross_charged_cents`, see `cardServicePrincipal`).
 * Never `net_amount_cents`. Anything ambiguous returns `null` (show NO number).
 * Money-in statuses are the staff side's (`sumMoneyIn`): refunded and cancelled
 * rows never count.
 */

import { MONEY_IN_STATUSES } from "@/lib/bookings/manual-payment";

export type LedgerPaidRow = {
  grossCents: number;
  status: string;
  currency: string | null;
  refundOfTransactionId?: string | null;
  /** `manual` provider rows carry no client fees; everything else is a card charge. */
  kind: "manual" | "card";
  /** Service principal of a card row, from `cardServicePrincipal`; null when unknown. */
  serviceSubtotalCents?: number | null;
};

export type SnapshotMoney = {
  gross_cents: number;
  gross_charged_cents: number;
  base_reservation_fee_cents?: number | null;
};

/**
 * Service principal of ONE card charge of `chargeCents`, from the booking's
 * commission snapshots (summed over participants). Full charge: the service
 * subtotal (the `service_subtotal` fee line). Partial charge: the same share,
 * only when it divides exactly. A reservation fee, a zero total or a charge that
 * cannot be matched returns null.
 */
export function cardServicePrincipal(chargeCents: number, snaps: readonly SnapshotMoney[]): number | null {
  if (!snaps.length || !Number.isFinite(chargeCents) || chargeCents <= 0) return null;
  if (snaps.some((s) => (s.base_reservation_fee_cents ?? 0) > 0)) return null;
  const subtotal = snaps.reduce((n, s) => n + (Number(s.gross_cents) || 0), 0);
  const charged = snaps.reduce((n, s) => n + (Number(s.gross_charged_cents) || 0), 0);
  if (subtotal <= 0 || charged < subtotal || chargeCents > charged) return null;
  if (chargeCents === charged) return subtotal;
  const scaled = subtotal * chargeCents;
  return scaled % charged === 0 ? scaled / charged : null;
}

const MONEY_IN = new Set<string>(MONEY_IN_STATUSES);

export function balanceDueCents(
  totalCents: number | null | undefined,
  rows: readonly LedgerPaidRow[],
  currency?: string | null,
): number | null {
  if (typeof totalCents !== "number" || !Number.isFinite(totalCents) || totalCents <= 0) return null;
  if (rows.some((r) => r.refundOfTransactionId)) return null;
  const cur = currency?.trim().toUpperCase() || null;
  let paid = 0;
  for (const r of rows) {
    if (!MONEY_IN.has(r.status)) continue;
    if (cur && (r.currency?.trim().toUpperCase() || cur) !== cur) return null;
    if (r.kind === "manual") {
      paid += Math.max(0, Math.round(r.grossCents) || 0);
    } else {
      const p = r.serviceSubtotalCents;
      if (typeof p !== "number" || !Number.isFinite(p) || p < 0) return null;
      paid += Math.round(p);
    }
  }
  return Math.max(0, Math.round(totalCents) - paid);
}
