/**
 * guest-menu-options.ts — size / option choice on the table QR menu
 * (TUL-1348). Pure. The SERVER prices the chosen variant (`addLine`); these
 * helpers only decide what the guest sees and when the + must ask first.
 */

export type GuestMenuOption = { id: string; label: string; amountCents: number | null };

export type GuestMenuOptionItem = {
  id: string;
  title: string;
  /** null = no base price: only the options price this item. */
  amountCents: number | null;
  options: GuestMenuOption[];
};

/** Tapping + must open the picker first: the item has no price of its own. */
export function needsOption(item: GuestMenuOptionItem): boolean {
  return item.amountCents == null && item.options.length > 0;
}

/**
 * The unit price of a line, or null when the line is not valid (an option-only
 * item with no/unknown option). Mirrors the server: an option with its own
 * price replaces the base, one without keeps the base.
 */
export function lineUnitCents(item: GuestMenuOptionItem, optionId: string | null): number | null {
  if (optionId == null) return item.amountCents == null ? null : item.amountCents;
  const opt = item.options.find((o) => o.id === optionId);
  if (!opt) return null;
  if (opt.amountCents != null) return opt.amountCents;
  return item.amountCents == null ? null : item.amountCents;
}

export type GuestPriceLabel =
  | { kind: "fixed"; cents: number }
  | { kind: "from"; cents: number }
  | { kind: "none" };

export function guestPriceLabel(item: GuestMenuOptionItem): GuestPriceLabel {
  if (item.amountCents != null) return { kind: "fixed", cents: item.amountCents };
  const priced = item.options.map((o) => o.amountCents).filter((c): c is number => c != null);
  if (priced.length === 0) return { kind: "none" };
  return { kind: "from", cents: Math.min(...priced) };
}

export type GuestOptionCopy = { choose: string; from: string; cancel: string; standard: string };

export const GUEST_OPTION_COPY: Record<"en" | "es", GuestOptionCopy> = {
  en: { choose: "Choose an option", from: "From", cancel: "Cancel", standard: "Regular" },
  es: { choose: "Elige una opción", from: "Desde", cancel: "Cancelar", standard: "Normal" },
};

export function guestOptionCopy(locale: string): GuestOptionCopy {
  return locale.toLowerCase().startsWith("es") ? GUEST_OPTION_COPY.es : GUEST_OPTION_COPY.en;
}
