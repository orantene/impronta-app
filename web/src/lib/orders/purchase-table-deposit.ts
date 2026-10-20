/**
 * A venue's table deposit, priced into the order.
 *
 * The deposit for a table is `venue_service_rules.deposit_cents_per_person` x
 * party (`depositCentsForParty`), NOT a percentage of a catalog item. The
 * reservation order therefore carries exactly that amount as its single line,
 * collected in full: the charge, the order total and the figure the floor
 * shows are one number, and a deposit larger than the catalog price cannot
 * push the order past its total.
 *
 * Server-internal. `PurchaseInput.tableDeposit` is set only by
 * `lib/reservations/reserve.ts` from rules it loaded itself; no request field
 * reaches it.
 */
import { MAX_ORDER_TOTAL_CENTS, type PricingResult } from "@/lib/orders/purchase-pricing";

export type TableDeposit = { cents: number; currency: string };

export function withTableDeposit(priced: PricingResult, deposit: TableDeposit | undefined): PricingResult {
  if (!deposit || !priced.ok) return priced;
  const line = priced.lines[0];
  if (
    priced.lines.length !== 1 ||
    !line ||
    !Number.isSafeInteger(deposit.cents) ||
    deposit.cents <= 0 ||
    deposit.cents > MAX_ORDER_TOTAL_CENTS
  ) {
    return { ok: false, reason: "amount_out_of_range", offeringId: line?.offeringId, message: "That amount is not valid." };
  }
  return {
    ok: true,
    subtotalCents: deposit.cents,
    lines: [{ ...line, units: 1, unitCents: deposit.cents, totalCents: deposit.cents, addonIds: [], talentCostCents: 0 }],
  };
}
