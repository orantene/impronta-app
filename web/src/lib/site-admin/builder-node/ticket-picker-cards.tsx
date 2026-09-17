"use client";

/**
 * ticket_picker v3: the tier cards. Inline at every width, every tier with
 * its price, badge, "includes" bullets, coarse availability and its OWN
 * quantity stepper, so a guest reads the prices before touching anything.
 *
 * One tier per order (that is the purchase contract: one line, one tier, one
 * night), so stepping a second card up moves the order to that card and the
 * first one returns to zero. The card whose quantity is above zero is the
 * chosen one (`data-on`), and the order bar beside the grid follows it.
 */

import type { TierAvailability } from "@/app/(public)/_events/ticket-picker-actions";
import { priceParts, type Locale } from "./ticket-picker-copy";
import { Stepper, type T } from "./ticket-picker-form";
import { maxUnits, purchasable, stepQty, tierMatchesRef, type TierView } from "./ticket-picker-steps";

export function TierCards({
  t, loc, currency, tiers, chosenId, qty, busy, queryTier, availabilityOf, onQty,
}: {
  t: T;
  loc: Locale;
  currency: string;
  tiers: ReadonlyArray<TierView>;
  chosenId: string | null;
  qty: number;
  busy: boolean;
  queryTier: string | null;
  availabilityOf: (variantId: string) => TierAvailability;
  /** Set the order to `qty` units of this tier (0 clears it). */
  onQty: (tier: TierView, qty: number) => void;
}) {
  return (
    <div className="tp-cards" role="group" aria-label={t("tier")}>
      {tiers.map((x) => {
        const on = chosenId === x.variantId && qty > 0;
        const avail = availabilityOf(x.variantId);
        const open = purchasable(x, avail);
        const price = priceParts(x.amountCents, currency, loc, t("free"));
        const linked = x.hidden && tierMatchesRef(x, queryTier);
        const mine = on ? qty : 0;
        const max = maxUnits(x);
        return (
          <div key={x.variantId} className="tp-card" data-on={on ? "1" : undefined} data-soldout={open ? undefined : "1"} data-tier-card={x.variantId} data-has-media={x.imageSrc ? "1" : undefined}>
            {/* The image column exists ONLY when the tier has an image (its own or
                the block's override). No placeholder glyph: an image-less tier is
                a clean text card. */}
            {x.imageSrc ? <img className="tp-card-media" src={x.imageSrc} alt="" loading="lazy" /> : null}
            <div className="tp-card-body">
              {/* Title and badge share the header row: the badge is never
                  absolutely positioned over the title. */}
              <span className="tp-card-head">
                <span className="tp-card-title">{x.label}</span>
                {x.badge ? <span className="tp-badge">{x.badge}</span> : null}
              </span>
              <span className="tp-card-price" data-free={x.amountCents === 0 ? "1" : undefined}>
                {price.amount}
                {price.code ? <small>{price.code}</small> : null}
              </span>
              {x.admitsPerUnit > 1 ? <span className="tp-card-meta">{t("admits").replace("{n}", String(x.admitsPerUnit))}</span> : null}
              {x.description ? <span className="tp-card-desc">{x.description}</span> : null}
              {x.includes.length > 0 ? <ul className="tp-includes">{x.includes.map((line) => <li key={line}>{line}</li>)}</ul> : null}
              {avail === "sold_out" ? <span className="tp-avail" data-level="sold_out">{t("soldOut")}</span>
                : !x.onSale ? <span className="tp-avail" data-level="sold_out">{t("tier_not_on_sale")}</span>
                : linked ? <span className="tp-avail" data-level="link">{t("byLink")}</span>
                : avail === "low" ? <span className="tp-avail" data-level="low">{t("low")}</span>
                : null}
              <div className="tp-qty-row">
                <Stepper
                  t={t}
                  qty={mine}
                  min={0}
                  max={open ? max : 0}
                  busy={busy || !open}
                  onChange={(next) => onQty(x, stepQty(x, mine, next > mine ? 1 : -1))}
                  size="card"
                />
                {open && x.maxPerOrder ? <span className="tp-qty-hint">{t("perOrderMax").replace("{n}", String(x.maxPerOrder))}</span> : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
