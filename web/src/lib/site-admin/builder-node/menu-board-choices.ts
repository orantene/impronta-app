/**
 * TUL-1332 — pure helpers for the menu board's option and extras pickers.
 * The browser only ever holds ids; the server prices them.
 */

export type MenuChoiceOption = { id: string; label: string; amountCents: number | null };

export type MenuChoiceOffering = {
  id: string;
  amountCents: number | null;
  currency: string;
  options?: ReadonlyArray<MenuChoiceOption>;
  extras?: ReadonlyArray<MenuChoiceOption>;
};

export type MenuChoice = { variantId: string | null; addonIds: string[] };

/** A dish with options cannot be ordered until one is chosen (the server refuses it too). */
export function lineChoiceMissing(offering: Pick<MenuChoiceOffering, "options">, choice: MenuChoice | undefined): boolean {
  if (!offering.options || offering.options.length === 0) return false;
  return !choice?.variantId;
}

/** Keep only the option and extras that still exist on the (refreshed) offering. */
export function choiceFor(offering: Pick<MenuChoiceOffering, "options" | "extras">, choice: MenuChoice | undefined): MenuChoice {
  const options = new Set((offering.options ?? []).map((o) => o.id));
  const extras = new Set((offering.extras ?? []).map((o) => o.id));
  return {
    variantId: choice?.variantId && options.has(choice.variantId) ? choice.variantId : null,
    addonIds: (choice?.addonIds ?? []).filter((id) => extras.has(id)),
  };
}

/** "Small · $90.00", or just "Small" when the option carries no price of its own (never a $0). */
export function optionPriceLabel(
  option: MenuChoiceOption,
  currency: string,
  format: (cents: number, currency: string) => string,
): string {
  return option.amountCents == null ? option.label : `${option.label} · ${format(option.amountCents, currency)}`;
}

/**
 * TUL-1894: the cart's running total. Per line: the chosen option's price (else the dish's own)
 * plus every chosen extra that states a price, times the quantity. This is a DISPLAY figure; the
 * server prices the order from its own rows. Returns null when no line states a price, or when the
 * priced lines are in more than one currency (one number would be wrong), so the cart shows none.
 */
export function cartSubtotal(
  lines: ReadonlyArray<{ offering: MenuChoiceOffering; quantity: number; choice: MenuChoice }>,
): { amountCents: number; currency: string } | null {
  let total = 0;
  let currency: string | null = null;
  for (const { offering, quantity, choice } of lines) {
    const option = (offering.options ?? []).find((o) => o.id === choice.variantId);
    const unit = option?.amountCents ?? offering.amountCents;
    if (typeof unit !== "number" || !Number.isFinite(unit)) continue;
    const extras = (offering.extras ?? [])
      .filter((e) => choice.addonIds.includes(e.id))
      .reduce((sum, e) => sum + (typeof e.amountCents === "number" && Number.isFinite(e.amountCents) ? e.amountCents : 0), 0);
    const cur = offering.currency.toUpperCase();
    if (currency !== null && currency !== cur) return null;
    currency = cur;
    total += (unit + extras) * quantity;
  }
  return currency === null ? null : { amountCents: total, currency };
}
