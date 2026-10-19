import "server-only";

import * as React from "react";
import BookingCanceled from "../../../emails/workspace/BookingCanceled";
import type { CatalogEntry, NotificationEvent, ResolvedRecipient } from "./types";
import { str } from "./catalog-audiences";
import {
  bookingConfirmedClient,
  bookingTalentAudience,
  coordinatorOrWorkspaceDefault,
  loadBookingConfirmedView,
} from "./catalog-audiences-booking";
import { bookingRefundLine, cancelledByLine } from "./booking-cancelled-copy";
import { inquiryPathForRole, pageUrl } from "./catalog-render";
import { normalizeEmailLocale } from "./email-copy";

/**
 * booking.cancelled (spec section 6.4, TUL-1268 item 3) -> the client, every
 * booked talent and the coordinator, email + in-app, EN + ES.
 *
 * Emitted from ONE place for every cancel path: `cancelBookingSet` (staff desk,
 * /manage token link, /account, talent agenda) through `notifyBookingSetCancelled`,
 * plus the staff pipeline cancel and the free-reserve expiry cron. All share
 * the stable eventId `booking-cancelled:<bookingId>`: the FIRST sender wins and
 * a cancel notifies once. Each sender therefore sends honest facts only: an
 * unknown paid amount drops the refund line, the talent never sees any refund
 * line, and the notice says who cancelled (or that it expired).
 *
 * A booking with no source inquiry is notified from the booking row (client
 * contact), `booking_talent` (talents) and the workspace default (coordinator).
 *
 * The refund line is DISPLAY ONLY: it restates the policy refund
 * `cancelBookingSet` already computed and never moves money.
 */

type Audience = "client" | "talent" | "workspace";

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

const localeOf = (event: NotificationEvent, recipient?: ResolvedRecipient, fallback?: string) =>
  normalizeEmailLocale(fallback ?? recipient?.locale ?? str(event.payload.locale));

function refundLineFor(event: NotificationEvent, audience: Audience, locale: string) {
  return bookingRefundLine({
    audience,
    locale,
    paidCents: num(event.payload.paidCents),
    refundCents: num(event.payload.refundCents),
    currency: str(event.payload.currency) ?? str(event.payload.currencyCode),
  });
}

const IN_APP = {
  en: {
    clientTitle: "Your booking was cancelled",
    otherTitle: "A booking was cancelled",
    your: "Your booking",
    someone: (c: string) => `${c}'s booking`,
    a: "A booking",
    forService: (w: string, s: string) => `${w} for ${s}`,
    on: (w: string, d: string) => `${w} on ${d} has been cancelled.`,
    plain: (w: string) => `${w} has been cancelled.`,
  },
  es: {
    clientTitle: "Tu reserva se canceló",
    otherTitle: "Se canceló una reserva",
    your: "Tu reserva",
    someone: (c: string) => `La reserva de ${c}`,
    a: "Una reserva",
    forService: (w: string, s: string) => `${w} de ${s}`,
    on: (w: string, d: string) => `${w} del ${d} se canceló.`,
    plain: (w: string) => `${w} se canceló.`,
  },
} as const;

function inAppTitle(audience: Audience, recipient: ResolvedRecipient, event: NotificationEvent): string {
  const c = IN_APP[localeOf(event, recipient)];
  return audience === "client" ? c.clientTitle : c.otherTitle;
}

function inAppBody(event: NotificationEvent, audience: Audience, recipient: ResolvedRecipient): string {
  const c = IN_APP[localeOf(event, recipient)];
  const contact = str(event.payload.contactName);
  const date = str(event.payload.eventDate);
  const service = str(event.payload.serviceName);
  const who = audience === "client" ? c.your : contact ? c.someone(contact) : c.a;
  const what = service ? c.forService(who, service) : who;
  return date ? c.on(what, date) : c.plain(what);
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
    resolveAudience: isClient
      ? bookingConfirmedClient
      : audience === "talent"
        ? bookingTalentAudience
        : coordinatorOrWorkspaceDefault,
    in_app: {
      kind: "booking",
      surface: audience,
      title: (event, recipient) => inAppTitle(audience, recipient, event),
      body: (event, recipient) => inAppBody(event, audience, recipient),
    },
    email: {
      templateId: `${audience === "workspace" ? "workspace" : audience}.booking_cancelled`,
      subject: () => (isClient ? "Your booking was cancelled" : "A booking was cancelled"),
      render: ({ event, recipient, brand, unsubscribeUrl }) => {
        const locale = localeOf(event, recipient, brand.locale);
        const bookingId = str(event.payload.bookingId);
        const hasInquiry = Boolean(event.inquiryId);
        const url = isClient
          ? hasInquiry
            ? `/client/inquiries/${event.inquiryId}`
            : `/client/bookings/${bookingId ?? ""}`
          : audience === "talent"
            ? hasInquiry
              ? inquiryPathForRole("talent", event.inquiryId)
              : "/talent/inbox"
            : hasInquiry
              ? `/admin/work/${event.inquiryId}`
              : "/admin";
        return React.createElement(BookingCanceled, {
          audience,
          recipientName: recipient.displayName ?? str(event.payload.contactName),
          contactName: str(event.payload.contactName),
          eventDate: str(event.payload.eventDate),
          serviceName: str(event.payload.serviceName),
          refundLine: refundLineFor(event, audience, locale),
          byLine: cancelledByLine({ audience, locale, by: str(event.payload.cancelledBy) }),
          inquiryUrl: pageUrl(brand, url),
          brand,
          unsubscribeUrl,
          categoryLabel: "booking",
        });
      },
    },
  };
}

export const BOOKING_CANCELLED_CATALOG_ENTRIES: CatalogEntry[] = [
  entry("client"),
  entry("talent"),
  entry("workspace"),
];
