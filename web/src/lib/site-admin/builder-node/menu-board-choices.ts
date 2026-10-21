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
