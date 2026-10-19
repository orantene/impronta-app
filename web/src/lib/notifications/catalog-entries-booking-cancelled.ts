import "server-only";

import * as React from "react";
import BookingCanceled from "../../../emails/workspace/BookingCanceled";
import type { CatalogEntry, NotificationEvent } from "./types";
import { assignedCoordinator, str } from "./catalog-audiences";
import { bookingConfirmedClient, bookingConfirmedTalent, loadBookingConfirmedView } from "./catalog-audiences-booking";
import { bookingRefundLine } from "./booking-cancelled-copy";
import { inquiryPathForRole, pageUrl } from "./catalog-render";

/**
 * booking.cancelled (spec section 6.4, TUL-1268 item 3) -> the client, every
 * booked talent and the assigned coordinator, email + in-app, EN + ES.
 *
 * Emitted from ONE place for every cancel path: `cancelBookingSet` (staff desk,
 * /manage token link, /account, talent agenda) through `notifyBookingSetCancelled`,
 * plus the legacy pipeline cancel. All share the stable eventId
 * `booking-cancelled:<bookingId>`, so a cancel notifies once.
 *
 * The notice names the service and the date (hydrated from the booking row) and
 * carries a refund line. The line is DISPLAY ONLY: it restates the policy
 * refund `cancelBookingSet` already computed and never moves money.
 */

type Audience = "client" | "talent" | "workspace";

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function refundLineFor(event: NotificationEvent, audience: Audience, locale: string | undefined) {
  return bookingRefundLine({
    audience,
    locale: locale ?? str(event.payload.locale),
    paidCents: num(event.payload.paidCents),
    refundCents: num(event.payload.refundCents),
    currency: str(event.payload.currency),
  });
}

function inAppBody(event: NotificationEvent, audience: Audience): string {
  const contact = str(event.payload.contactName);
  const date = str(event.payload.eventDate);
  const service = str(event.payload.serviceName);
  const who = audience === "client" ? "Your booking" : contact ? `${contact}'s booking` : "A booking";
  const what = service ? `${who} for ${service}` : who;
  return date ? `${what} on ${date} has been cancelled.` : `${what} has been cancelled.`;
}

function entry(audience: Audience): CatalogEntry {
  const isClient = audience === "client";
  return {
    id: `booking.cancelled.${audience === "workspace" ? "coordinator" : audience}`,
    category: "bookings",
    defaultChannels: ["email", "in_app"],
    required: false,
    triggers: ["booking.cancelled"],
    hydrate: loadBookingConfirmedView,
    resolveAudience: isClient ? bookingConfirmedClient : audience === "talent" ? bookingConfirmedTalent : assignedCoordinator,
    in_app: {
      kind: "booking",
      surface: audience,
      title: () => (isClient ? "Your booking was cancelled" : "A booking was cancelled"),
      body: (event) => inAppBody(event, audience),
    },
    email: {
      templateId: `${audience === "workspace" ? "workspace" : audience}.booking_cancelled`,
      subject: () => (isClient ? "Your booking was cancelled" : "A booking was cancelled"),
      render: ({ event, recipient, brand, unsubscribeUrl }) =>
        React.createElement(BookingCanceled, {
          audience,
          recipientName: recipient.displayName ?? str(event.payload.contactName),
          contactName: str(event.payload.contactName),
          eventDate: str(event.payload.eventDate),
          serviceName: str(event.payload.serviceName),
          refundLine: refundLineFor(event, audience, brand.locale),
          inquiryUrl: pageUrl(
            brand,
            isClient
              ? `/client/inquiries/${event.inquiryId}`
              : audience === "talent"
                ? inquiryPathForRole("talent", event.inquiryId)
                : `/admin/work/${event.inquiryId}`,
          ),
          brand,
          unsubscribeUrl,
          categoryLabel: "booking",
        }),
    },
  };
}

export const BOOKING_CANCELLED_CATALOG_ENTRIES: CatalogEntry[] = [
  entry("client"),
  entry("talent"),
  entry("workspace"),
];
