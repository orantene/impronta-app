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
import type { PurchaseResult } from "@/lib/orders/purchase-types";

export type TableDeposit = { cents: number; currency: string };

export function withTableDeposit(
  priced: PricingResult,
  deposit: TableDeposit | undefined,
  /**
   * TUL-1876: a table with NO deposit due. The reservation item's catalog price is not a bill
   * (the meal is settled at the table), so the order owes nothing: one line at 0, never the
   * item's price shown as "pending payment" while the guest is told nothing is due.
   */
  noDeposit = false,
): PricingResult {
  if (!priced.ok) return priced;
  if (!deposit && noDeposit) {
    const only = priced.lines[0];
    if (priced.lines.length !== 1 || !only) {
      return { ok: false, reason: "amount_out_of_range", offeringId: only?.offeringId, message: "That amount is not valid." };
    }
    return {
      ok: true,
      subtotalCents: 0,
      lines: [{ ...only, units: 1, unitCents: 0, totalCents: 0, addonIds: [], talentCostCents: 0 }],
    };
  }
  if (!deposit) return priced;
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

const CODE = /^[A-Z]{3}$/;

export type TableDepositCurrency =
  | { ok: true; currency: string }
  | { ok: false; reason: "currency_mismatch"; currencies: string[] };

/**
 * The currency the table deposit is charged in.
 *
 * Every other order takes its currency from the offering (`resolveOrderCurrency`:
 * the offering is the truth). A table deposit is a venue rule priced in the
 * workspace's explicit display currency, so the two must AGREE: an offering
 * with its own currency that differs refuses the deposit rather than relabel
 * MXN cents as USD. An offering with no currency of its own takes the
 * workspace's. A malformed deposit currency is refused, never defaulted.
 */
export function tableDepositCurrency(
  depositCurrency: string,
  offeringCurrencies: readonly (string | null | undefined)[],
): TableDepositCurrency {
  const want = (depositCurrency ?? "").trim().toUpperCase();
  const seen = new Set<string>([want]);
  for (const c of offeringCurrencies) {
    const code = (c ?? "").trim().toUpperCase();
    if (code) seen.add(code);
  }
  if (!CODE.test(want) || seen.size !== 1) {
    return { ok: false, reason: "currency_mismatch", currencies: [...seen].filter(Boolean).sort() };
  }
  return { ok: true, currency: want };
}

/**
 * `createPurchase`'s guard: a table deposit whose reservation offering is priced in a different
 * currency from the workspace is refused (see `tableDepositCurrency`). Null when there is no
 * deposit or the currencies agree.
 */
export function tableDepositRefusal(
  deposit: TableDeposit | undefined,
  lineCurrencies: readonly (string | null | undefined)[],
): Extract<PurchaseResult, { ok: false }> | null {
  if (!deposit || tableDepositCurrency(deposit.currency, lineCurrencies).ok) return null;
  return {
    ok: false,
    reason: "invalid_units",
    error: "table_deposit_currency_mismatch: the reservation item is priced in a different currency from the workspace.",
  };
}
