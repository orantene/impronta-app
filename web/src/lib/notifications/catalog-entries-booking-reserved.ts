import "server-only";

import * as React from "react";
import BookingReserved from "../../../emails/notifications/BookingReserved";
import type { CatalogEntry, NotificationEvent, ResolvedRecipient } from "./types";
import { str } from "./catalog-audiences";
import {
  bookingConfirmedClient,
  bookingTalentAudience,
  loadBookingConfirmedView,
} from "./catalog-audiences-booking";
import { formatBookingPrice } from "./booking-confirmed-email";
import { inquiryPathForRole, pageUrl } from "./catalog-render";
import { normalizeEmailLocale } from "./email-copy";
import { minorUnitDivisor } from "@/lib/orders/money-format";
import { balanceCents } from "@/lib/orders/price/rules";

/**
 * booking.reserved (TUL-1268): a DEPOSIT reserves the booking ("Booking
 * reserved" / "Reserva apartada"), it does not confirm it. The client sees the
 * deposit paid and the balance still due (stored amounts only, never computed
 * into a charge); the talent gets the new-booking notice without client money.
 * The full `booking.confirmed` goes out when the balance is paid.
 */

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const loc = (e: NotificationEvent, r?: ResolvedRecipient, fallback?: string) =>
  normalizeEmailLocale(fallback ?? r?.locale ?? str(e.payload.locale));

/** Booking view + the balance still due (booking total minus the deposit just paid). */
export async function loadBookingReservedView(
  event: NotificationEvent,
  ctx: Parameters<typeof loadBookingConfirmedView>[1],
): Promise<Record<string, unknown>> {
  const base = await loadBookingConfirmedView(event, ctx);
  const total = num(base.totalCents);
  const deposit = num(event.payload.depositCents);
  const currency = str(event.payload.currency) ?? str(base.currencyCode);
  const locale = str(base.locale);
  // TUL-1305: what is still owed is the total minus what the deposit CREDITED (the principal). The gross
  // charge includes the card fee, so subtracting it understated the balance (69550, not 70000).
  const credited = num(event.payload.principalCents) ?? deposit;
  const balance = total != null && credited != null && total > credited ? balanceCents(total, credited) : null;
  const divisor = minorUnitDivisor(currency ?? "");
  return {
    ...base,
    depositLabel: deposit != null ? formatBookingPrice(deposit / divisor, currency, locale) : null,
    balanceLabel: balance != null ? formatBookingPrice(balance / divisor, currency, locale) : null,
  };
}

const IN_APP = {
  en: { title: "Booking reserved", client: "Your deposit was received and your booking is reserved.", talent: "A client reserved a time with you with a deposit." },
  es: { title: "Reserva apartada", client: "Recibimos tu anticipo y tu reserva quedó apartada.", talent: "Un cliente apartó un horario contigo con un anticipo." },
} as const;

function entry(audience: "client" | "talent"): CatalogEntry {
  const isClient = audience === "client";
  return {
    id: `booking.reserved.${audience}`,
    category: "bookings",
    defaultChannels: ["email", "in_app"],
    required: false,
    triggers: ["booking.reserved"],
    hydrate: loadBookingReservedView,
    resolveAudience: isClient ? bookingConfirmedClient : bookingTalentAudience,
    in_app: {
      kind: "booking",
      surface: audience,
      title: (event, r) => IN_APP[loc(event, r)].title,
      body: (event, r) => IN_APP[loc(event, r)][audience],
    },
    email: {
      templateId: `${audience}.booking_reserved`,
      subject: () => "Booking reserved",
      render: ({ event, recipient, brand, unsubscribeUrl }) => {
        const bookingId = str(event.payload.bookingId);
        const url = isClient
          ? event.inquiryId
            ? `/client/inquiries/${event.inquiryId}`
            : `/client/bookings/${bookingId ?? ""}`
          : event.inquiryId
            ? inquiryPathForRole("talent", event.inquiryId)
            : "/talent/inbox";
        return React.createElement(BookingReserved, {
          audience,
          recipientName: recipient.displayName ?? (isClient ? str(event.payload.contactName) : null),
          serviceName: str(event.payload.serviceName),
          eventDate: str(event.payload.eventDate),
          depositPaid: isClient ? str(event.payload.depositLabel) : null,
          balanceDue: isClient ? str(event.payload.balanceLabel) : null,
          url: pageUrl(brand, url),
          brand,
          unsubscribeUrl,
          categoryLabel: "booking",
        });
      },
    },
  };
}

export const BOOKING_RESERVED_CATALOG_ENTRIES: CatalogEntry[] = [entry("client"), entry("talent")];
