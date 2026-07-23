"use client";

/**
 * OfferingCta — the action button on a public storefront card.
 *
 * Resolves the CTA from the offering's BEHAVIOR (never its kind alone) and
 * dispatches a window CustomEvent that the profile's chat launcher /
 * instant-book mount consumes:
 *   - "tulala:offering-request"  → carry the offering into the inquiry/chat
 *   - "tulala:offering-instant"  → direct booking (generalized instant-book)
 *
 * The event contract is the ONLY coupling between the storefront render and
 * the money flows — the storefront itself never charges anything.
 */

import { resolveOfferingCta, type TalentOffering } from "@/lib/talent/offerings-types";
import { pickLocale } from "@/lib/i18n/pick-locale";

export type OfferingRequestDetail = {
  offeringId: string;
  talentProfileId: string;
  title: string;
  kind: string;
  priceType: string;
  amountCents: number | null;
  currency: string;
  durationMinutes: number | null;
  allowPayInPerson: boolean;
  reserveMode: "full" | "deposit" | "free";
  depositPct: number | null;
  cancellationHours?: number | null;
  imageUrl: string | null;
  /** D4 — selectable options (client picks one; null price = base applies). */
  variants?: { id: string; label: string; amountCents: number | null }[];
  /** D4 — stackable extras (client picks any). */
  addOns?: { id: string; label: string; amountCents: number }[];
  /** D5 — null = unlimited; products with stock cap the qty stepper. */
  inventoryQty?: number | null;
  /** 'request' → inquiry/chat · 'instant' → direct booking */
  intent: "request" | "instant";
};

const CTA_COPY: Record<string, { en: string; es: string }> = {
  book_now: { en: "Book now", es: "Reservar ya" },
  buy_now: { en: "Buy", es: "Comprar" },
  request_to_book: { en: "Book", es: "Reservar" },
  request: { en: "Request", es: "Solicitar" },
  ask_quote: { en: "Ask for quote", es: "Pedir cotización" },
};

export function OfferingCta({
  offering,
  locale,
  compact = false,
}: {
  offering: TalentOffering;
  locale: string;
  compact?: boolean;
}) {
  const cta = resolveOfferingCta(offering);
  const instant = cta === "book_now" || cta === "buy_now";
  const label = pickLocale(locale, CTA_COPY[cta]);

  const onClick = () => {
    const detail: OfferingRequestDetail = {
      offeringId: offering.id,
      talentProfileId: offering.talentProfileId,
      title: offering.title,
      kind: offering.kind,
      priceType: offering.priceType,
      amountCents: offering.amountCents,
      currency: offering.currency,
      durationMinutes: offering.durationMinutes,
      allowPayInPerson: offering.allowPayInPerson,
      reserveMode: offering.reserveMode,
      depositPct: offering.depositPct,
      cancellationHours: offering.cancellationHours,
      imageUrl: offering.imageUrls[0] ?? null,
      variants: offering.variants ?? [],
      addOns: offering.addOns ?? [],
      inventoryQty: offering.inventoryQty,
      intent: instant ? "instant" : "request",
    };
    window.dispatchEvent(
      new CustomEvent(instant ? "tulala:offering-instant" : "tulala:offering-request", { detail }),
    );
  };

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
