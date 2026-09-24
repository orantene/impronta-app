import type { ServiceMenuItem } from "@/lib/talent/services-menu-types";

/**
 * D-MSG-400 / D-MSG-417: hub (and any non-agency host) must not label menu
 * amounts as USD when `loadInstantBookEligibility` never ran. Money shown
 * wrong is worse than money missing — strip the amount so the list reads as
 * on-request rather than a lying currency.
 *
 * Agency hosts keep the eligibility-resolved currency (platform operating USD).
 * Never read `default_currency` here.
 */
export function servicesMenuForPublicHost(
  items: readonly ServiceMenuItem[],
  hostKind: string,
): ServiceMenuItem[] {
  if (hostKind === "agency") return items.map((it) => ({ ...it }));
  return items.map((it) => {
    if (it.amountCents == null) return { ...it };
    return { ...it, amountCents: null, pricingType: "custom" };
  });
}
