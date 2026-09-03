/**
 * Line pricing for a purchase — pure, no I/O, integer cents throughout.
 *
 * ONE implementation of a rule that currently exists twice. `instant-book-engine`
 * resolves a price as `variant.amount_cents ?? offering.amountCents ?? …` and
 * builds add-on lines at :340-348; `menu-order-engine` re-derives its own
 * version at :140-160. Two copies of a pricing rule is one copy too many —
 * they have already drifted once (menu ignores variants entirely).
 *
 * WHY CENTS ALL THE WAY THROUGH. The offer spine stores money as NUMERIC major
 * units and converts at the commission boundary. Order lines are integer cents
 * from the moment the price leaves the catalog row, so there is no rounding step
 * between "what the client was shown" and "what the client is charged". The
 * conversion that does still exist — offer NUMERIC to order cents on the quoted
 * path — lives in exactly one place, `public.offer_major_to_cents`, for the same
 * reason.
 *
 * Prices are NEVER taken from the request. Everything here comes from catalog
 * rows loaded in the same request, which is also what stops an offering edited
 * mid-checkout from repricing a cart the client already agreed to.
 */

/** A catalog row, as loaded from the database. Never built from request input. */
export type PricedOffering = {
  offeringId: string;
  label: string;
  /** Base price in cents. Null when the offering has no fixed price. */
  amountCents: number | null;
  /** `custom` / quote-style offerings cannot be charged by construction. */
  priceType: string;
  /** XOR payee, carried through to the order line unchanged. */
  talentProfileId: string | null;
  ownerTenantId: string | null;
  /** What the payee receives per unit, in cents. */
  talentCostCents: number;
};

export type PricedVariant = {
  variantId: string;
  offeringId: string;
  label: string;
  /** Overrides the offering's base price when set. */
  amountCents: number | null;
};

export type PricedAddon = {
  addonId: string;
  offeringId: string;
  label: string;
  amountCents: number;
};

export type PricingRequestLine = {
  offeringId: string;
  units: number;
  variantId?: string | null;
  addonIds?: string[];
};

export type PricedLine = {
  offeringId: string;
  variantId: string | null;
  addonIds: string[];
  label: string;
  units: number;
  unitCents: number;
  totalCents: number;
  talentProfileId: string | null;
  ownerTenantId: string | null;
  talentCostCents: number;
};

export type PricingRefusal = {
  ok: false;
  reason:
    | "offering_not_priceable"
    | "variant_not_on_offering"
    | "addon_not_on_offering"
    | "amount_out_of_range";
  offeringId?: string;
  message: string;
};

export type PricingResult =
  | { ok: true; lines: PricedLine[]; subtotalCents: number }
  | PricingRefusal;

/** $50k. Matches the cap menu-order-engine already enforced; kept, not relaxed. */
export const MAX_ORDER_TOTAL_CENTS = 5_000_000;

export function pricePurchase(
  requestLines: readonly PricingRequestLine[],
  catalog: {
    offerings: ReadonlyMap<string, PricedOffering>;
    variants: ReadonlyMap<string, PricedVariant>;
    addons: ReadonlyMap<string, PricedAddon>;
  },
): PricingResult {
  const lines: PricedLine[] = [];

  for (const req of requestLines) {
    const offering = catalog.offerings.get(req.offeringId);
    if (!offering) {
      return {
        ok: false,
        reason: "offering_not_priceable",
        offeringId: req.offeringId,
        message: "That item is no longer available.",
      };
    }

    // A quote-style offering has no price to charge. This is the check that
    // stops "book now" appearing on something whose price is a conversation.
    if (offering.priceType === "custom") {
      return {
        ok: false,
        reason: "offering_not_priceable",
        offeringId: req.offeringId,
        message: "This one is quoted rather than booked online.",
      };
    }

    let unitCents: number | null = offering.amountCents;
    let label = offering.label;
    let variantId: string | null = null;

    if (req.variantId) {
      const variant = catalog.variants.get(req.variantId);
      // A variant that belongs to a DIFFERENT offering is refused, not ignored.
      // Ignoring it would silently charge the base price for the option the
      // client picked.
      if (!variant || variant.offeringId !== req.offeringId) {
        return {
          ok: false,
          reason: "variant_not_on_offering",
          offeringId: req.offeringId,
          message: "That option is no longer available.",
        };
      }
      variantId = variant.variantId;
      if (variant.amountCents != null) unitCents = variant.amountCents;
      if (variant.label) label = `${offering.label} — ${variant.label}`;
    }

    if (unitCents == null || !Number.isInteger(unitCents) || unitCents < 0) {
      return {
        ok: false,
        reason: "offering_not_priceable",
        offeringId: req.offeringId,
        message: "That item is not available at a fixed price.",
      };
    }

    // ADD-ONS ARE CHARGED ONCE PER LINE, NOT PER UNIT — and that is a
    // deliberate decision to preserve existing behaviour, not an oversight.
    //
    // `instant-book-engine` makes each chosen add-on its own offer line with
    // `units: 1` hardcoded (:503-513), while the base line carries
    // `units: quantity` (:492). So "3 haircuts + beard trim" bills THREE
    // haircuts and ONE beard trim today.
    //
    // Whether that is right is genuinely ambiguous and the catalog cannot say:
    // a "beard trim" add-on is plainly per-unit, a "travel fee" is plainly
    // per-booking, and `talent_offering_addons` has no column distinguishing
    // them. This is an UNMODELLED DISTINCTION, not a bug — which is why it is
    // being surfaced for a product decision rather than fixed here.
    //
    // I originally folded add-ons into the unit price, which is defensible and
    // would have TRIPLED an add-on charge on a 3-unit line. That is a
    // customer-facing money change shipped as a side effect of a refactor,
    // which is exactly what this track has argued against elsewhere. And of the
    // two ways to be wrong, overcharging a customer is worse than undercharging
    // a business, so the conservative reading also happens to be the kinder one.
    //
    // When the catalog gains a per-unit flag, this is the one place to change.
    const addonIds: string[] = [];
    let addonCents = 0;
    for (const addonId of req.addonIds ?? []) {
      const addon = catalog.addons.get(addonId);
      if (!addon || addon.offeringId !== req.offeringId) {
        return {
          ok: false,
          reason: "addon_not_on_offering",
          offeringId: req.offeringId,
          message: "That extra is no longer available.",
        };
      }
      addonIds.push(addon.addonId);
      addonCents += addon.amountCents;
      if (addon.label) label = `${label} + ${addon.label}`;
    }

    // Add-ons sit OUTSIDE the per-unit multiplication (see the note above).
    const totalCents = unitCents * req.units + addonCents;
    // The line's effective unit price, for display and for the commission
    // resolver, which now takes line totals with units: 1.
    const finalUnitCents = req.units > 0 ? Math.round(totalCents / req.units) : unitCents;

    if (!Number.isSafeInteger(totalCents) || totalCents < 0) {
      return {
        ok: false,
        reason: "amount_out_of_range",
        offeringId: req.offeringId,
        message: "That amount is not valid.",
      };
    }

    lines.push({
      offeringId: offering.offeringId,
      variantId,
      addonIds,
      label: label.slice(0, 300),
      units: req.units,
      unitCents: finalUnitCents,
      totalCents,
      talentProfileId: offering.talentProfileId,
      ownerTenantId: offering.talentProfileId ? null : offering.ownerTenantId,
      // The payee's cost scales with units but NOT with add-ons: an add-on is
      // the house's margin unless the catalog says otherwise, and inventing a
      // talent cost for it would pay out money the offering never promised.
      talentCostCents: offering.talentCostCents * req.units,
    });
  }

  const subtotalCents = lines.reduce((sum, l) => sum + l.totalCents, 0);

  if (subtotalCents > MAX_ORDER_TOTAL_CENTS) {
    return {
      ok: false,
      reason: "amount_out_of_range",
      message: "That order is too large to place online.",
    };
  }

  return { ok: true, lines, subtotalCents };
}

/**
 * What to charge now, given the resolved policy.
 *
 * Rounds the deposit DOWN. A deposit is a part payment against a known total,
 * so rounding up would collect more than the configured percentage and leave a
 * negative balance to explain.
 */
export function amountToCollectCents(
  subtotalCents: number,
  collect: "full" | "deposit" | "none",
  depositPct: number | null,
): number {
  if (collect === "none") return 0;
  if (collect === "full") return subtotalCents;
  if (depositPct == null || depositPct <= 0 || depositPct >= 100) return subtotalCents;
  return Math.floor((subtotalCents * depositPct) / 100);
}
