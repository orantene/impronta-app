"use client";

/**
 * Portfolio shot → service link (W-12).
 *
 * Reuses the same CustomEvent contract as `OfferingCta` so a photo opens the
 * real booking / inquiry path for its linked offering. When the offering row
 * is missing from dataSources, falls back to scrolling to #servicios.
 *
 * A-06: the lightbox lives in `portfolio-lightbox.tsx` (portal, next/back).
 * "Book this look" there books the photo CURRENTLY shown, which may belong to
 * another link, so it dispatches `tulala:portfolio-book` with the shot id and
 * the link that owns that shot calls its own `book()`.
 */

import { intakeDetail } from "@/lib/talent/offering-intake";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import type { TalentOffering } from "@/lib/talent/offerings-types";
import {
  offeringWhereFromAttributes,
  type OfferingRequestDetail,
} from "@/lib/talent/offering-request-detail";
import { resolveOfferingCta } from "@/lib/talent/offerings-types";

import { PortfolioLightbox, type PortfolioLightboxLabels } from "./portfolio-lightbox";
import { PORTFOLIO_BOOK_EVENT, claimPortfolioBook, type PortfolioGallery } from "./portfolio-lightbox-logic";

/** The booking action for one offering, shared by the click path and the lightbox event. */
function offeringBooking(offering: TalentOffering, confirmsByHand: boolean) {
  const raw = resolveOfferingCta(offering);
  const cta =
    confirmsByHand && (raw === "book_now" || raw === "buy_now") ? "request_to_book" : raw;
  const instant = !confirmsByHand && (cta === "book_now" || cta === "buy_now");
  const slotEligible =
    cta === "request_to_book" &&
    offering.kind !== "product" &&
    (offering.durationMinutes ?? 0) > 0;

  const book = () => {
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
      ...intakeDetail(offering.attributes),
    };
    const eventName =
      instant || (confirmsByHand && raw !== "ask_quote")
        ? "tulala:offering-instant"
        : slotEligible
          ? "tulala:offering-slot"
          : "tulala:offering-request";
    window.dispatchEvent(new CustomEvent(eventName, { detail }));
  };
  return { cta, book };
}

export function PortfolioShotLink({
  offering,
  offeringId,
  shotId,
  confirmsByHand = false,
  className,
  style,
  ariaLabel,
  lightbox,
  children,
}: {
  offering?: TalentOffering | null;
  offeringId?: string | null;
  /** This shot's id: the lightbox's book button names it in `tulala:portfolio-book`. */
  shotId?: string;
  confirmsByHand?: boolean;
  className?: string;
  style?: CSSProperties;
  ariaLabel: string;
  /**
   * TUL-59 C: a tap opens the photo large with a secondary "Reserve this look"
   * button; booking opens only from that button. Absent = the old direct open.
   * A-06: `gallery` is every shot of this portfolio block, `gallery.index` this one.
   */
  lightbox?: PortfolioLightboxLabels & { gallery: PortfolioGallery };
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  // Book this shot's offering when the lightbox (showing this shot) asks for it.
  useEffect(() => {
    if (!offering || !shotId) return;
    const { book } = offeringBooking(offering, confirmsByHand);
    const onBook = (e: Event) => {
      if (claimPortfolioBook(e, shotId)) book();
    };
    window.addEventListener(PORTFOLIO_BOOK_EVENT, onBook);
    return () => window.removeEventListener(PORTFOLIO_BOOK_EVENT, onBook);
  }, [offering, shotId, confirmsByHand]);

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

  const { cta, book } = offeringBooking(offering, confirmsByHand);

  const onClick = lightbox ? () => setOpen(true) : book;

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        className={className}
        style={style}
        aria-label={ariaLabel}
        data-offering-cta={cta}
        data-offering-id={offering.id}
        data-portfolio-gallery-index={lightbox ? lightbox.gallery.index : undefined}
        data-portfolio-gallery-size={lightbox ? lightbox.gallery.items.length : undefined}
        data-portfolio-shot-link
      >
        {children}
      </button>
      {lightbox && open ? (
        <PortfolioLightbox gallery={lightbox.gallery} labels={lightbox} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}
