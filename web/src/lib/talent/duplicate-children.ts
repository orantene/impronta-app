/**
 * TUL-1271 #8 — what Duplicate copies besides the row: its options (variants)
 * and extras (add-ons), as the replace-all writers take them. Ids are never
 * carried, so the copy gets rows of its own. Null when there is nothing to copy.
 */
import type { OfferingAddOn, OfferingVariant } from "@/lib/talent/offerings-types";
import type { OfferingChildrenInput } from "@/lib/talent/offerings-children";

export function childrenInputFromItem(item: {
  variants?: readonly OfferingVariant[];
  addOns?: readonly OfferingAddOn[];
}): OfferingChildrenInput | null {
  const variants = (item.variants ?? []).map((v) => ({
    label: v.label,
    amountCents: v.amountCents,
    ...(v.labelI18n ? { labelI18n: v.labelI18n } : {}),
  }));
  const addOns = (item.addOns ?? []).map((a) => ({
    label: a.label,
    amountCents: a.amountCents,
    ...(a.labelI18n ? { labelI18n: a.labelI18n } : {}),
    ...(a.durationMinutes !== undefined ? { durationMinutes: a.durationMinutes } : {}),
  }));
  if (variants.length === 0 && addOns.length === 0) return null;
  return { variants, addOns };
}
