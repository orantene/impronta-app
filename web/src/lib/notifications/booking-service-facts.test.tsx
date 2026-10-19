/**
 * G1: booking emails carry the service facts (service, date and time with the
 * zone, address, duration, cancellation policy), one .ics is attached, the
 * reminders reach bookings with no source inquiry, and the Spanish says "reserva".
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { findCatalogEntryById } from "./catalog";
import {
  buildBookingCalendarAttachment,
  formatCancellationPolicy,
  formatDurationLabel,
  minutesBetween,
  pickAddress,
  timeZoneLabel,
} from "./booking-service-facts";
import type { NotificationEvent, ResolvedRecipient } from "./types";

const brandFor = (locale: "en" | "es") => ({
  wordmark: "TULALA",
  accountName: "Studio Luna",
  footerDomain: "tulala.digital",
  homeHref: "https://tulala.digital",
  locale,
});

const recipient: ResolvedRecipient = {
  userId: null,
  email: "guest@example.test",
  displayName: "Ana",
  locale: "es",
  isPlatformAdmin: false,
  role: "client",
  dedupeId: "g1",
};

const confirmedPayload = {
  bookingId: "11111111-1111-4111-8111-111111111111",
  contactName: "Ana",
  serviceName: "Corte de cabello",
  priceLabel: "$800 MXN",
  eventDate: "mié 14 oct, 13:30 - 14:30",
  eventLocation: "Calle 5 #12, Tulum",
  durationMinutes: 60,
  durationLabel: "1 h",
  policyLabel: "Cancelación gratis hasta 24 h antes.",
  timeZoneName: "GMT-5",
  startsAt: "2026-10-14T18:30:00.000Z",
  endsAt: "2026-10-14T19:30:00.000Z",
};

function confirmedEvent(payload: Record<string, unknown> = confirmedPayload): NotificationEvent {
  return {
    type: "booking.confirmed",
    tenantId: "t1",
    inquiryId: "inq-1",
    bookingId: "11111111-1111-4111-8111-111111111111",
    eventId: "booking-confirmed:11111111",
    payload,
  };
}

test("pure helpers: duration, window, policy, zone, address", () => {
  assert.equal(formatDurationLabel(45), "45 min");
  assert.equal(formatDurationLabel(60), "1 h");
  assert.equal(formatDurationLabel(90), "1 h 30 min");
  assert.equal(formatDurationLabel(0), null);
  assert.equal(formatDurationLabel(null), null);
  assert.equal(minutesBetween("2026-10-14T18:30:00Z", "2026-10-14T19:45:00Z"), 75);
  assert.equal(minutesBetween("2026-10-14T19:30:00Z", "2026-10-14T18:30:00Z"), null);
  assert.equal(formatCancellationPolicy(24, "es"), "Cancelación gratis hasta 1 día antes.");
  assert.equal(formatCancellationPolicy(48, "en"), "Free cancellation up to 2 days before.");
  assert.equal(formatCancellationPolicy(6, "es"), "Cancelación gratis hasta 6 h antes.");
  assert.equal(formatCancellationPolicy(null, "es"), null);
  assert.match(timeZoneLabel("2026-10-14T18:30:00Z", "America/Cancun", "es") ?? "", /GMT-5|EST|UTC-5/);
  assert.equal(timeZoneLabel("2026-10-14T18:30:00Z", "Not/AZone", "en"), null);
  assert.equal(pickAddress({ venueAddress: " ", venueLocationText: "Tulum", inquiryLocation: "x" }), "Tulum");
  assert.equal(pickAddress({}), null);
});

test("calendar file: one VEVENT in UTC with place, service and the policy", () => {
  const ics = buildBookingCalendarAttachment({
    bookingId: "b1",
    serviceName: "Corte de cabello",
    sellerName: "Studio Luna",
    startsAt: "2026-10-14T18:30:00.000Z",
    endsAt: null,
    durationMinutes: 45,
    address: "Calle 5 #12, Tulum",
    policyLabel: "Cancelación gratis hasta 1 día antes.",
    url: "https://x.test/b",
    locale: "es",
  });
  assert.ok(ics);
  assert.equal(ics.filename, "reserva.ics");
  assert.match(ics.contentType, /^text\/calendar/);
  const text = ics.content.toString("utf8");
  assert.equal((text.match(/BEGIN:VEVENT/g) ?? []).length, 1);
  assert.match(text, /DTSTART:20261014T183000Z/);
  assert.match(text, /DTEND:20261014T191500Z/);
  assert.match(text, /LOCATION:Calle 5 #12\\, Tulum/);
  assert.match(text, /SUMMARY:Corte de cabello · Studio Luna/);
  assert.match(text, /UID:b1@tulala\.digital/);
});

test("calendar file: no start time, no file", () => {
  const base = {
    bookingId: "b1", serviceName: null, sellerName: null, endsAt: null, durationMinutes: null,
    address: null, policyLabel: null, url: null, locale: "en",
  };
  assert.equal(buildBookingCalendarAttachment({ ...base, startsAt: null }), null);
  assert.equal(buildBookingCalendarAttachment({ ...base, startsAt: "nope" }), null);
});

test("client confirmation: ES email names service, date with zone, duration, address, policy", () => {
  const entry = findCatalogEntryById("booking.confirmed.client");
  assert.ok(entry?.email);
  const html = renderToStaticMarkup(
    entry.email.render({ event: confirmedEvent(), recipient, brand: brandFor("es") }),
  );
  assert.match(html, /Servicio/);
  assert.match(html, /Corte de cabello/);
  assert.match(html, /mié 14 oct, 13:30 - 14:30 \(GMT-5\)/);
  assert.match(html, /Duración/);
  assert.match(html, /1 h/);
  assert.match(html, /Dirección/);
  assert.match(html, /Calle 5 #12, Tulum/);
  assert.match(html, /Cancelación/);
  assert.match(html, /Cancelación gratis hasta 24 h antes\./);
  assert.match(html, /Adjuntamos el archivo de calendario/);
});

test("client confirmation: EN email carries the same facts", () => {
  const entry = findCatalogEntryById("booking.confirmed.client");
  assert.ok(entry?.email);
  const html = renderToStaticMarkup(
    entry.email.render({
      event: confirmedEvent({ ...confirmedPayload, policyLabel: "Free cancellation up to 1 day before." }),
      recipient: { ...recipient, locale: "en" },
      brand: brandFor("en"),
    }),
  );
  assert.match(html, /Duration/);
  assert.match(html, /Address/);
  assert.match(html, /Cancellation/);
  assert.match(html, /The calendar file is attached/);
});

test("client confirmation attaches exactly one .ics; the talent copy attaches none", () => {
  const client = findCatalogEntryById("booking.confirmed.client");
  const talent = findCatalogEntryById("booking.confirmed.talent");
  assert.ok(client?.email?.attachments);
  const files = client.email.attachments({ event: confirmedEvent(), recipient, brand: brandFor("es") });
  assert.equal(files.length, 1);
  assert.equal(files[0].filename, "reserva.ics");
  // A booking with no start time has no instant to put in a calendar: no file, no note.
  const noStart = confirmedEvent({ ...confirmedPayload, startsAt: null, endsAt: null });
  assert.equal(client.email.attachments({ event: noStart, recipient, brand: brandFor("es") }).length, 0);
  const html = renderToStaticMarkup(client.email.render({ event: noStart, recipient, brand: brandFor("es") }));
  assert.doesNotMatch(html, /archivo de calendario/);
  assert.equal(talent?.email?.attachments, undefined);
});

test("reminders: a booking with no source inquiry links to its own page and shows the service", () => {
  const entry = findCatalogEntryById("booking.day_of_reminder.client");
  assert.ok(entry?.email);
  const event: NotificationEvent = {
    type: "booking.day_of_reminder",
    tenantId: "t1",
    bookingId: "bk-9",
    eventId: "booking-reminder:bk-9",
    payload: { ...confirmedPayload, bookingId: "bk-9" },
  };
  const html = renderToStaticMarkup(entry.email.render({ event, recipient, brand: brandFor("es") }));
  assert.match(html, /\/client\/bookings\/bk-9/);
  assert.doesNotMatch(html, /\/client\/inquiries\/undefined/);
  assert.match(html, /Corte de cabello/);
  assert.match(html, /mié 14 oct, 13:30 - 14:30 \(GMT-5\)/);
  assert.match(html, /Dirección/);
});

test("reminders: the talent copy of an inquiry-less booking points at the talent inbox", () => {
  const entry = findCatalogEntryById("booking.day_of_reminder.talent");
  assert.ok(entry?.email);
  const event: NotificationEvent = {
    type: "booking.day_of_reminder",
    tenantId: "t1",
    bookingId: "bk-9",
    eventId: "booking-reminder:bk-9",
    payload: { ...confirmedPayload, bookingId: "bk-9" },
  };
  const html = renderToStaticMarkup(entry.email.render({ event, recipient, brand: brandFor("en") }));
  assert.match(html, /\/talent\/inbox/);
  assert.doesNotMatch(html, /undefined/);
});

test("Spanish reminder copy says reserva, never reservación", () => {
  const entry = findCatalogEntryById("booking.day_of_reminder.client");
  assert.ok(entry?.email);
  const event: NotificationEvent = {
    type: "booking.day_of_reminder",
    tenantId: "t1",
    inquiryId: "inq-1",
    eventId: "e1",
    payload: { eventDate: "2026-10-14" },
  };
  const html = renderToStaticMarkup(entry.email.render({ event, recipient, brand: brandFor("es") }));
  assert.doesNotMatch(html, /reservación/);
  assert.match(html, /reserva/);
});

test("wiring: the cron no longer drops bookings with no inquiry; the channel forwards attachments", () => {
  const route = fs.readFileSync(path.resolve(__dirname, "../../app/api/cron/booking-reminders/route.ts"), "utf8");
  assert.doesNotMatch(route, /row\.source_inquiry_id\s*&&/);
  assert.doesNotMatch(route, /source_inquiry_id as string/);
  const channel = fs.readFileSync(path.resolve(__dirname, "channels/email.ts"), "utf8");
  assert.match(channel, /cfg\.attachments/);
  assert.match(channel, /\.\.\.\(attachments/);
});
