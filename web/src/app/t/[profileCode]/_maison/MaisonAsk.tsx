"use client";

/**
 * MaisonAskButton — "ask a question" without committing to a time.
 *
 * Not every visitor is ready to pick a slot: she may want to know if her
 * natural lashes can take volume, whether a design is possible, or what to do
 * about a lifted nail. Today the page offers only "book", so that visitor
 * leaves. This routes her into the SAME Tulala inquiry thread the rest of the
 * profile uses, so the conversation lands in Messages with provenance instead
 * of in a WhatsApp number nobody has confirmed.
 *
 * Sheet Chat now / Ask uses `openCatalogBookingChat` (selection + visitor).
 *
 * WSF D fix: menu/closing Ask used to fire the offering only on the named
 * event, which nothing stores, then a bare `tulala:offering-request`, so the
 * clicked service was dropped. Ask now goes through the same hand-off as the
 * booking sheet: the offering lands in the shared pending-offering store and
 * shows as an UNSENT draft on the composer strip (never auto-sent), and the
 * chat-off inquiry form reads the same store. No offering → a clean dock.
 */

import type { TalentOffering } from "@/lib/talent/offerings-types";
import type { OfferingRequestDetail } from "@/lib/talent/offering-request-detail";
import {
  openCatalogBookingChat,
  type CatalogBookingChatHandoff,
} from "@/components/public-booking/catalog-booking-chat";
import { clearPendingOffering } from "@/app/t/[profileCode]/_chat/pending-offering-store";

export type MaisonAskContext = {
  talentName: string;
  sourcePage: string;
  /** The clicked/selected offering: a full CTA detail, or just id + title. */
  offering?: OfferingRequestDetail | Pick<TalentOffering, "id" | "title"> | null;
  /** "menu" · "sheet" · "visit" — where the visitor asked from. */
  from: string;
};

/** A minimal request detail for an offering known only by id + title. */
export function askOfferingDetail(
  offering: NonNullable<MaisonAskContext["offering"]>,
): OfferingRequestDetail {
  if ("offeringId" in offering) return { ...offering, intent: "request" };
  return {
    offeringId: offering.id,
    talentProfileId: null,
    title: offering.title,
    kind: "service",
    priceType: "custom",
    priceDisplay: "quote",
    amountCents: null,
    currency: "USD",
    durationMinutes: null,
    allowPayInPerson: false,
    reserveMode: "full",
    depositPct: null,
    imageUrl: null,
    intent: "request",
  };
}

export function askQuestion(ctx: MaisonAskContext) {
  if (ctx.offering) {
    const detail = askOfferingDetail(ctx.offering);
    // Same "Asking about" draft card as the selection dock's Ask (#2385):
    // pre-filled, never auto-sent.
    openCatalogBookingChat({
      detail,
      askAbout: [detail.title],
      from: ctx.from,
      sourcePage: ctx.sourcePage,
      talentName: ctx.talentName,
    });
    return;
  }
  // Nothing picked: open clean, never with a stale offering from earlier.
  clearPendingOffering();
  window.dispatchEvent(
    new CustomEvent("tulala:ask-question", {
      detail: {
        talentName: ctx.talentName,
        sourcePage: ctx.sourcePage,
        offeringId: null,
        offeringTitle: null,
        from: ctx.from,
      },
    }),
  );
}

/** Booking-sheet Ask / Chat now — carrying selection + Nombre + WhatsApp. */
export function askFromBookingSheet(handoff: CatalogBookingChatHandoff) {
  openCatalogBookingChat({
    ...handoff,
    from: handoff.from ?? "sheet",
  });
}

export function MaisonAskButton({
  label,
  context,
  variant = "quiet",
}: {
  label: string;
  context: MaisonAskContext;
  variant?: "quiet" | "link";
}) {
  return (
    <button
      type="button"
      className={variant === "link" ? "mn-ask-link" : "mn-btn mn-btn-quiet"}
      onClick={() => askQuestion(context)}
      data-mn-ask={context.from}
    >
      {label}
    </button>
  );
}
