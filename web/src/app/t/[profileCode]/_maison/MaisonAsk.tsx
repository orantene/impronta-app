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
 * Menu ask still fires `tulala:ask-question` + bare `tulala:offering-request`
 * so a clean dock opens when there is no offering detail yet.
 */

import type { TalentOffering } from "@/lib/talent/offerings-types";
import {
  openCatalogBookingChat,
  type CatalogBookingChatHandoff,
} from "@/components/public-booking/catalog-booking-chat";

export type MaisonAskContext = {
  talentName: string;
  sourcePage: string;
  offering?: Pick<TalentOffering, "id" | "title"> | null;
  /** "menu" · "sheet" · "visit" — where the visitor asked from. */
  from: string;
};

export function askQuestion(ctx: MaisonAskContext) {
  window.dispatchEvent(
    new CustomEvent("tulala:ask-question", {
      detail: {
        talentName: ctx.talentName,
        sourcePage: ctx.sourcePage,
        offeringId: ctx.offering?.id ?? null,
        offeringTitle: ctx.offering?.title ?? null,
        from: ctx.from,
      },
    }),
  );
  // The launcher's existing seam: no detail = open the chat with nothing
  // pre-attached. Harmless when the named event above is handled instead.
  window.dispatchEvent(new CustomEvent("tulala:offering-request"));
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
