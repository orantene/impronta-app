"use client";

/**
 * OfferingCta — the action button on a public storefront card.
 *
 * Resolves the CTA from the offering's BEHAVIOR (never its kind alone) and
 * dispatches a window CustomEvent that the profile's chat launcher /
 * instant-book mount consumes:
 *   - "tulala:offering-request"  → carry the offering into the inquiry/chat
 *   - "tulala:offering-slot"     → open the SlotPicker for this offering
 *   - "tulala:offering-instant"  → direct booking (generalized instant-book)
 *
 * The event contract is the ONLY coupling between the storefront render and
 * the money flows — the storefront itself never charges anything.
 */

import { buildOfferingRequestDetail } from "@/lib/talent-site/offering-request-detail-build";
import { useEffect } from "react";

import { registerSlotOffering } from "@/lib/talent-site/next-free-slot";
import { type TalentOffering } from "@/lib/talent/offerings-types";
import { deriveOfferingCta, offeringCtaLabel } from "@/lib/talent/offering-cta-derivation";

export type { OfferingRequestDetail } from "@/lib/talent/offering-request-detail";

export function OfferingCta({
  offering,
  locale,
  compact = false,
  confirmsByHand = false,
  label: labelOverride,
  sellingDefaults,
}: {
  offering: TalentOffering;
  locale: string;
  compact?: boolean;
  /** Free and Pro confirm by hand. Book opens the chooser, not a charge. */
  confirmsByHand?: boolean;
  /** Widget override (e.g. Seleccionar). Empty keeps the behavior label. */
  label?: string;
  /**
   * Talent selling_defaults, for an offering that still inherits (null mode).
   * Public loaders already resolve the mode (withEffectiveBookingMode).
   */
  sellingDefaults?: unknown;
}) {
  // One derivation with the catalog widget and the server (WSF-B).
  const { cta, instant, eventName, hidden } = deriveOfferingCta({
    offering,
    defaults: sellingDefaults,
    confirmsByHand,
  });
  const label = labelOverride?.trim() || offeringCtaLabel(cta, locale, "card");

  // TUL-232: the sheet resolves this offering when something opens booking at a slot.
  useEffect(() => {
    if (!hidden && (cta === "book_now" || cta === "request_to_book")) {
      registerSlotOffering(offering, buildOfferingRequestDetail(offering, instant));
    }
  });

  const onClick = () => {
    const detail = buildOfferingRequestDetail(offering, instant);
    window.dispatchEvent(new CustomEvent(eventName, { detail }));
  };

  // WSF-C §8: the talent's switches leave this service no route.
  if (hidden) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      data-offering-cta={cta}
      data-offering-id={offering.id}
      className={`inline-flex shrink-0 items-center justify-center rounded-[10px] font-medium transition-opacity hover:opacity-85 ${
        compact ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-[0.8125rem]"
      }`}
      style={
        instant
          ? { background: "var(--plt-ink)", color: "var(--plt-bg, #fff)" }
          : {
              background: "transparent",
              color: "var(--plt-ink)",
              border: "1px solid var(--plt-hairline-strong)",
            }
      }
    >
      {label}
    </button>
  );
}
