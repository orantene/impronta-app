/**
 * TUL-1332 [MONEY] — turn the menu board's lines into purchase-pipeline lines.
 *
 * The chosen option (variant) and extras (add-ons) are sent as IDS ONLY. The
 * pipeline prices them from the catalog rows (`purchase-pricing.ts`), refuses a
 * variant or add-on that does not belong to the offering, and refuses a dish
 * that has options when none was chosen (`variant_required`). Nothing the
 * browser says about a price is read. Pure, so the mapping is testable.
 */

export type MenuOrderLine = {
  offeringId: string;
  quantity: number;
  variantId?: string | null;
  addonIds?: string[];
};

export type PurchaseMenuLine = {
  offeringId: string;
  units: number;
  variantId?: string;
  addonIds?: string[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_MENU_ADDONS = 20;

export function toPurchaseLines(lines: readonly MenuOrderLine[]): PurchaseMenuLine[] {
  return lines.map((l) => {
    const out: PurchaseMenuLine = { offeringId: l.offeringId, units: l.quantity };
    if (typeof l.variantId === "string" && UUID.test(l.variantId)) out.variantId = l.variantId;
    const addonIds = [...new Set((l.addonIds ?? []).filter((id) => typeof id === "string" && UUID.test(id)))].slice(0, MAX_MENU_ADDONS);
    if (addonIds.length > 0) out.addonIds = addonIds;
    return out;
  });
}
