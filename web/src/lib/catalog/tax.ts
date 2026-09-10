/**
 * Tax structure only — operator-entered rates, no invented jurisdiction rule.
 *
 * THE SHAPE IS THE POINT. The first version of this file returned a number,
 * and returned `0` both for "the operator set this category to 0%" and for
 * "nobody has configured a rate yet". A surface reading that number renders
 * "0% tax" over an order whose tax is simply UNKNOWN, and an operator who then
 * gets a tax bill has been told, by us, that there was none.
 *
 * So absence is a different SHAPE, not a different value: `{ kind: "unset" }`
 * carries no cents at all, and only `{ kind: "taxed" }` carries a rate and an
 * amount. An operator-entered 0 is a taxed outcome with `rateBps: 0`, and it
 * still renders as 0%, because that one IS a decision somebody made.
 *
 * See `incident_a_function_that_answers_instead_of_refusing`: make absence
 * structurally distinct from a value.
 */

export type TaxCategory = {
  id: string;
  code: string;
  label: string;
  /** Basis points, operator-entered. Null means NOT CONFIGURED, not zero. */
  rateBps: number | null;
};

/** No category, or a category nobody has given a rate. Carries no cents. */
export type TaxUnset = { kind: "unset" };

/** A rate an operator entered, including a deliberate 0. */
export type TaxApplied = { kind: "taxed"; rateBps: number; cents: number };

export type LineTax = TaxUnset | TaxApplied;

export const TAX_UNSET: TaxUnset = { kind: "unset" };

function configuredRate(category: TaxCategory | null | undefined): number | null {
  if (!category) return null;
  const bps = category.rateBps;
  if (typeof bps !== "number" || !Number.isFinite(bps) || bps < 0) return null;
  return Math.round(bps);
}

export function lineTax(input: {
  lineTotalCents: number;
  category: TaxCategory | null;
}): LineTax {
  const rateBps = configuredRate(input.category);
  if (rateBps == null) return TAX_UNSET;
  const base = input.lineTotalCents;
  // A negative or non-integer base is not a reason to invent a rate; the rate
  // is still configured, and the honest amount on it is zero cents.
  if (!Number.isInteger(base) || base <= 0) return { kind: "taxed", rateBps, cents: 0 };
  return { kind: "taxed", rateBps, cents: Math.floor((base * rateBps) / 10_000) };
}

/**
 * The order's tax.
 *
 * `unset` when NOT ONE line had a configured category: there is no tax figure
 * to show, and showing 0 would be the lie above. Otherwise `taxed`, with
 * `unsetLines` counting the lines that contributed nothing because nobody has
 * categorised them, so a surface can say the figure is partial instead of
 * presenting it as complete.
 *
 * `rateBps` is deliberately absent from the order-level shape: several lines
 * may carry different rates and there is no single percentage to quote.
 */
export type OrderTax = TaxUnset | { kind: "taxed"; cents: number; unsetLines: number };

export function orderTax(
  lines: ReadonlyArray<{ lineTotalCents: number; category: TaxCategory | null }>,
): OrderTax {
  let cents = 0;
  let taxedLines = 0;
  let unsetLines = 0;
  for (const line of lines) {
    const tax = lineTax(line);
    if (tax.kind === "unset") {
      unsetLines += 1;
      continue;
    }
    taxedLines += 1;
    cents += tax.cents;
  }
  if (taxedLines === 0) return TAX_UNSET;
  return { kind: "taxed", cents, unsetLines };
}

/**
 * The only safe way to get a number out of a tax outcome: the caller has to
 * say what an unset outcome means AT THAT CALL SITE. A ledger write may treat
 * it as zero cents collected; a receipt line must not print a percentage.
 */
export function taxCentsOr(tax: LineTax | OrderTax, whenUnset: number): number {
  return tax.kind === "unset" ? whenUnset : tax.cents;
}
