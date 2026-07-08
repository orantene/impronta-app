"use client";

/**
 * OfferingInstantMount — consumes "tulala:offering-instant" (a storefront
 * card's "Book now"/"Buy" click) and drives the generalized instant-book
 * action for the CHOSEN offering.
 *
 * Payment choice: card is the default (existing Payment Element rail via the
 * Messages Offer tab). When the offering allows pay-in-person, the client may
 * choose to pay at the appointment — the reservation is still created and
 * staff mark it paid (cash) later. Guests are routed to sign-in first.
 *
 * MVP confirm UX = native dialogs (mirrors the existing one-confirm instant
 * button); a styled sheet is a polish follow-up.
 */

import { useEffect, useState } from "react";
import { createInstantBookingAction } from "@/lib/server-actions/instant-book-action";
import type { OfferingRequestDetail } from "./OfferingCta";
import { formatOfferingPrice } from "@/lib/talent/offerings-types";

export function OfferingInstantMount({
  tenantId,
  sourcePage,
  locale,
}: {
  tenantId: string | null;
  sourcePage: string;
  locale: string;
}) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    const onInstant = async (e: Event) => {
      const d = (e as CustomEvent).detail as OfferingRequestDetail | undefined;
      if (!d || busy) return;

      const price =
        d.amountCents != null ? formatOfferingPrice(d.amountCents, d.currency, locale) : "";
      const es = locale === "es";
      const reserveLine =
        d.reserveMode === "free"
          ? es
            ? "Reserva sin pago — pagas después."
            : "Reserve now, pay later — nothing charged today."
          : d.reserveMode === "deposit" && d.depositPct && d.amountCents
            ? es
              ? `Hoy pagas un depósito del ${d.depositPct}% (~${formatOfferingPrice(Math.round((d.amountCents * d.depositPct) / 100), d.currency, locale)}); el resto después.`
              : `A ${d.depositPct}% deposit (~${formatOfferingPrice(Math.round((d.amountCents * d.depositPct) / 100), d.currency, locale)}) reserves it; balance later.`
            : es
              ? "El total final (con tarifas) se muestra al pagar."
              : "The final total (with fees) is shown at payment.";

      // Payment-method choice (only when the talent allows pay-in-person).
      let payInPerson = false;
      if (d.allowPayInPerson) {
        payInPerson = !window.confirm(
          es
            ? `Reservar "${d.title}" (${price}).\n\nOK = pagar con tarjeta ahora · Cancelar = pagar en persona en tu cita`
            : `Book "${d.title}" (${price}).\n\nOK = pay by card now · Cancel = pay in person at your appointment`,
        );
      } else if (
        !window.confirm(
          es
            ? `¿Reservar "${d.title}" por ${price}?\n\n${reserveLine}`
            : `Book "${d.title}" for ${price}?\n\n${reserveLine}`,
        )
      ) {
        return;
      }

      setBusy(true);
      try {
        const res = await createInstantBookingAction({
          talentProfileId: d.talentProfileId,
          tenantId,
          sourcePage,
          offeringId: d.offeringId,
          payInPerson,
        });
        if (!res.ok) {
          if (res.needsAuth) {
            window.location.href = `/login?next=${encodeURIComponent(sourcePage)}`;
            return;
          }
          window.alert(res.error);
          return;
        }
        window.location.href = res.redirectPath;
      } finally {
        setBusy(false);
      }
    };
    window.addEventListener("tulala:offering-instant", onInstant);
    return () => window.removeEventListener("tulala:offering-instant", onInstant);
  }, [tenantId, sourcePage, locale, busy]);

  return null;
}
