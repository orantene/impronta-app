"use client";

/**
 * Portfolio shot → service link (W-12).
 *
 * Reuses the same CustomEvent contract as `OfferingCta` so a photo opens the
 * real booking / inquiry path for its linked offering. When the offering row
 * is missing from dataSources, falls back to scrolling to #servicios.
 */

import type { CSSProperties, ReactNode } from "react";

import type { TalentOffering } from "@/lib/talent/offerings-types";
import {
  offeringWhereFromAttributes,
  type OfferingRequestDetail,
} from "@/lib/talent/offering-request-detail";
import { resolveOfferingCta } from "@/lib/talent/offerings-types";

export function PortfolioShotLink({
  offering,
  offeringId,
  confirmsByHand = false,
  className,
  style,
  ariaLabel,
  children,
}: {
  offering?: TalentOffering | null;
  offeringId?: string | null;
  confirmsByHand?: boolean;
  className?: string;
  style?: CSSProperties;
  ariaLabel: string;
  children: ReactNode;
}) {
  if (!offeringId) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  if (!offering) {
    return (
      <a
        href="#servicios"
        className={className}
        style={style}
        aria-label={ariaLabel}
        data-portfolio-offering={offeringId}
      >
        {children}
      </a>
    );
  }

  const raw = resolveOfferingCta(offering);
  const cta =
    confirmsByHand && (raw === "book_now" || raw === "buy_now") ? "request_to_book" : raw;
  const instant = !confirmsByHand && (cta === "book_now" || cta === "buy_now");
  const slotEligible =
    cta === "request_to_book" &&
    offering.kind !== "product" &&
    (offering.durationMinutes ?? 0) > 0;

  const onClick = () => {
    const where = offeringWhereFromAttributes(offering.attributes);
    const detail: OfferingRequestDetail = {
      offeringId: offering.id,
      talentProfileId: offering.talentProfileId,
      title: offering.title,
      kind: offering.kind,
      priceType: offering.priceType,
      priceDisplay: offering.priceDisplay,
      amountCents: offering.amountCents,
      currency: offering.currency,
      durationMinutes: offering.durationMinutes,
      allowPayInPerson: offering.allowPayInPerson,
      requireAccountToBook: offering.requireAccountToBook === true,
      reserveMode: offering.reserveMode,
      depositPct: offering.depositPct,
      cancellationHours: offering.cancellationHours,
      imageUrl: offering.imageUrls[0] ?? null,
      variants: offering.variants ?? [],
      addOns: offering.addOns ?? [],
      inventoryQty: offering.inventoryQty,
      capacityPoolId: offering.capacityPoolId,
      intent: instant ? "instant" : "request",
      description: offering.description,
      where: where.length ? where : undefined,
    };
    const eventName =
      instant || (confirmsByHand && raw !== "ask_quote")
        ? "tulala:offering-instant"
        : slotEligible
          ? "tulala:offering-slot"
          : "tulala:offering-request";
    window.dispatchEvent(new CustomEvent(eventName, { detail }));
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={className}
      style={style}
      aria-label={ariaLabel}
      data-offering-cta={cta}
      data-offering-id={offering.id}
      data-portfolio-shot-link
    >
      {children}
    </button>
  );
}
