import type { ServiceMenuItem } from "@/lib/talent/services-menu-types";

const KNOWN = new Set(["USD", "MXN", "EUR", "GBP", "CAD"]);

function honestCurrency(code: string | null | undefined): boolean {
  const cur = (code ?? "").trim().toUpperCase();
  return KNOWN.has(cur);
}

/**
 * D-MSG-417 after #2217: USD stays USD, MXN stays MXN (the storefront adds
 * the US$ line). A blank or unknown currency has no honest label, so the
 * amount is stripped rather than shown as dollars.
 *
 * Agency hosts keep eligibility-resolved prices unchanged.
 */
export function servicesMenuForPublicHost(
  items: readonly ServiceMenuItem[],
  hostKind: string,
): ServiceMenuItem[] {
  if (hostKind === "agency") return items.map((it) => ({ ...it }));
  return items.map((it) => {
    if (it.amountCents == null) return { ...it };
    if (honestCurrency(it.currency)) return { ...it };
    return { ...it, amountCents: null, pricingType: "custom" };
  });
}
