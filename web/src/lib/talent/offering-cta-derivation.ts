/**
 * offering-cta-derivation.ts — THE one derivation of a public offering's
 * action (WSF-B). Used by the catalog widget (services-catalog-filter.tsx),
 * catalogRowCtaLabel (CatalogBookingSheet rows) and OfferingCta (profile
 * page). PURE.
 *
 * The mode comes from resolveEffectiveBookingMode (the resolver the server
 * enforces in instant-purchase.ts), so the page never promises a path the
 * server refuses and never hides one it accepts:
 *   - a service with its own instant mode books instantly even when the
 *     talent default is inquiry (§1 rule 2; replaces forceRequestIntent);
 *   - a service that inherits (null) follows the talent default;
 *   - `confirmsByHand` (plan ceiling: Free / Pro confirm by hand) still turns
 *     an instant path into a request, as before.
 */

import { resolveEffectiveBookingMode } from "@/lib/scheduling/instant-book-gates";
import {
  resolveOfferingCta,
  type OfferingCtaKind,
  type TalentOffering,
} from "@/lib/talent/offerings-types";

export type DerivedOfferingCta = {
  /** CTA from the offering's effective mode, before the plan ceiling. */
  raw: OfferingCtaKind;
  /** CTA after the plan ceiling (instant → request_to_book when confirmsByHand). */
  cta: OfferingCtaKind;
  effectiveMode: "instant" | "request" | "inquiry" | "closed";
  /** Sheet / event intent. */
  intent: "instant" | "request";
  instant: boolean;
  eventName: "tulala:offering-instant" | "tulala:offering-slot" | "tulala:offering-request";
  /**
   * WSF-C §8: the talent's switches leave this service no route (set by the
   * public loader, withPublicAvailability). Surfaces render no button.
   */
  hidden: boolean;
};

type CtaOffering = Pick<
  TalentOffering,
  "kind" | "bookingMode" | "priceType" | "priceDisplay" | "amountCents" | "visibility"
> & { durationMinutes?: number | null; publicCtaHidden?: boolean };

export function deriveOfferingCta(input: {
  offering: CtaOffering;
  /** Raw selling_defaults or `{ bookingPosture }` from the sheet settings. */
  defaults?: unknown;
  confirmsByHand?: boolean;
}): DerivedOfferingCta {
  const { offering } = input;
  const eff = resolveEffectiveBookingMode({ offering, defaults: input.defaults ?? {} });
  const effectiveMode = eff.mode;
  const modeForCta = effectiveMode === "closed" ? "inquiry" : effectiveMode;
  const raw = resolveOfferingCta({ ...offering, bookingMode: modeForCta });
  const confirmsByHand = input.confirmsByHand === true;
  const cta = confirmsByHand && (raw === "book_now" || raw === "buy_now") ? "request_to_book" : raw;
  const instant = cta === "book_now" || cta === "buy_now";
  const slotEligible =
    cta === "request_to_book" && offering.kind !== "product" && (offering.durationMinutes ?? 0) > 0;
  let eventName: DerivedOfferingCta["eventName"];
  if (instant) eventName = "tulala:offering-instant";
  // Plan ceiling: the sheet opens in request intent (unchanged). An
  // inquiry-mode service goes to the conversation instead.
  else if (confirmsByHand && raw !== "ask_quote" && effectiveMode !== "inquiry") {
    eventName = "tulala:offering-instant";
  }
  else if (slotEligible) eventName = "tulala:offering-slot";
  else eventName = "tulala:offering-request";
  return {
    raw,
    cta,
    effectiveMode,
    intent: instant ? "instant" : "request",
    instant,
    eventName,
    hidden: offering.publicCtaHidden === true,
  };
}

/**
 * A quote or inquiry service has no slots to pick: its only route is the ask
 * flow (an unsent "Asking about" draft in the dock). It must never open the
 * booking sheet, which would show "no times available" over the chat.
 */
export function opensAskFlowOnly(cta: OfferingCtaKind): boolean {
  return cta === "ask_quote" || cta === "request";
}

/**
 * Unified public labels (EN + ES tú). Instant keeps the menu "Seleccionar" /
 * "Select" in the catalog and "Reservar" / "Book" on a profile card button.
 */
export function offeringCtaLabel(
  cta: OfferingCtaKind,
  locale: string,
  surface: "catalog" | "card" = "card",
): string {
  const es = locale.toLowerCase().startsWith("es");
  switch (cta) {
    case "ask_quote":
      return es ? "Pedir cotización" : "Request a quote";
    case "request":
      return es ? "Consultar" : "Ask about this";
    case "request_to_book":
      return es ? "Solicitar cita" : "Request appointment";
    case "buy_now":
      return es ? "Comprar" : "Buy";
    case "book_now":
    default:
      if (surface === "catalog") return es ? "Seleccionar" : "Select";
      return es ? "Reservar" : "Book";
  }
}

/**
 * Chat dock row button (guest dock catalog). Short labels from the same
 * derived CTA: instant selects, request asks for an appointment, quote asks
 * for a price, inquiry asks. Never "Buy now" for a service.
 */
export function offeringDockCtaLabel(cta: OfferingCtaKind, locale: string): string {
  const es = locale.toLowerCase().startsWith("es");
  switch (cta) {
    case "ask_quote":
      return es ? "Pedir cotización" : "Request a quote";
    case "request":
      return es ? "Consultar" : "Ask";
    case "request_to_book":
      return es ? "Solicitar cita" : "Request";
    case "buy_now":
      return es ? "Comprar" : "Buy";
    case "book_now":
    default:
      return es ? "Seleccionar" : "Select";
  }
}
