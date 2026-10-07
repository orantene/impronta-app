"use client";

/**
 * Portfolio shot → service link (W-12).
 *
 * Reuses the same CustomEvent contract as `OfferingCta` so a photo opens the
 * real booking / inquiry path for its linked offering. When the offering row
 * is missing from dataSources, falls back to scrolling to #servicios.
 */

import { intakeDetail } from "@/lib/talent/offering-intake";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

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
  lightbox,
  children,
}: {
  offering?: TalentOffering | null;
  offeringId?: string | null;
  confirmsByHand?: boolean;
  className?: string;
  style?: CSSProperties;
  ariaLabel: string;
  /**
   * TUL-59 C: a tap opens the photo large with a secondary "Reserve this look"
   * button; booking opens only from that button. Absent = the old direct open.
   */
  lightbox?: { src: string; alt: string; bookLabel: string; closeLabel: string };
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const swipeX = useRef<number | null>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
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
        data-portfolio-shot-link
      >
        {children}
      </button>
      {lightbox && open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.alt}
          data-portfolio-lightbox
          onClick={() => setOpen(false)}
          onTouchStart={(e) => {
            swipeX.current = e.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(e) => {
            const end = e.changedTouches[0]?.clientX ?? null;
            if (swipeX.current !== null && end !== null && Math.abs(end - swipeX.current) > 60) setOpen(false);
            swipeX.current = null;
          }}
          style={{ position: "fixed", inset: 0, zIndex: 2147483000, background: "rgba(8,8,10,0.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 16 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- public CDN URL */}
          <img src={lightbox.src} alt={lightbox.alt} style={{ maxWidth: "100%", maxHeight: "74vh", objectFit: "contain", borderRadius: 12 }} />
          <button
            type="button"
            data-portfolio-lightbox-book
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              book();
            }}
            style={{ minHeight: 48, padding: "0 24px", borderRadius: 999, border: 0, background: "#fff", color: "#121212", font: "inherit", fontWeight: 600, cursor: "pointer" }}
          >
            {lightbox.bookLabel}
          </button>
          <button
            type="button"
            aria-label={lightbox.closeLabel}
            onClick={() => setOpen(false)}
            style={{ position: "absolute", top: 12, right: 12, width: 44, height: 44, borderRadius: "50%", border: 0, background: "rgba(255,255,255,.16)", color: "#fff", fontSize: 22, cursor: "pointer" }}
          >
            <span aria-hidden>×</span>
          </button>
        </div>
      ) : null}
    </>
  );
}
