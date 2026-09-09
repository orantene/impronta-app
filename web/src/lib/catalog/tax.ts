/**
 * Tax structure only — operator-entered rates, no invented jurisdiction rule.
 */

export type TaxCategory = {
  id: string;
  code: string;
  label: string;
  /** Basis points. Null / missing → treat as zero (honest until configured). */
  rateBps: number | null;
};

export function lineTaxCents(input: {
  lineTotalCents: number;
  category: TaxCategory | null;
}): number {
  if (!input.category || input.category.rateBps == null || input.category.rateBps <= 0) {
    return 0;
  }
  if (!Number.isInteger(input.lineTotalCents) || input.lineTotalCents <= 0) return 0;
  return Math.floor((input.lineTotalCents * input.category.rateBps) / 10_000);
}

export function orderTaxCents(
  lines: ReadonlyArray<{ lineTotalCents: number; category: TaxCategory | null }>,
): number {
  return lines.reduce((sum, line) => sum + lineTaxCents(line), 0);
}
