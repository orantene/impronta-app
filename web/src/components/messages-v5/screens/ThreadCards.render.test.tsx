import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { createTranslator } from "@/i18n/messages";
import type { ThreadMessage } from "@/lib/messaging/types";

import { buildScreenCopy } from "./copy";
import { ThreadCard } from "./ThreadCards";

const COPY = buildScreenCopy(createTranslator("en"));
const NOW = new Date("2026-09-17T12:00:00.000Z");

function msg(kind: ThreadMessage["kind"], payload: Record<string, unknown> | null): ThreadMessage {
  return { id: "m1", inquiryId: "iq-1", kind, body: "", payload, senderUserId: "u-1", guestSessionId: null, createdAt: NOW.toISOString(), editedAt: null, deletedAt: null, thread: "private", internal: false, delivery: null };
}

function render(kind: ThreadMessage["kind"], payload: Record<string, unknown> | null) {
  const message = msg(kind, payload);
  return renderToStaticMarkup(
    <ThreadCard message={message} cardKind={kind as never} clientName="Diego" copy={COPY} variant="desktop" onAction={() => {}} onCopyText={() => {}} now={NOW} />,
  );
}

test("service_card variant table, held: TableCard with the hold countdown and Confirm table", () => {
  const html = render("service_card", {
    variant: "table",
    tables: [{ label: "Table 4", partySize: 4, startsAt: "2026-09-17T19:30:00.000Z" }],
    holdExpiresAt: "2026-09-17T12:10:00.000Z",
    offeringIds: [],
    labels: ["Table 4"],
    currency: "USD",
  });
  assert.match(html, /data-card="table"/);
  assert.match(html, /pill due">Held/);
  assert.match(html, /10 min left/);
  assert.match(html, /data-table-action="confirm"/);
});

test("service_card variant table, selected: Confirmed step, Open in Reservations", () => {
  const html = render("service_card", {
    state: "selected",
    variant: "table",
    tables: [{ label: "Table 4", partySize: 4, startsAt: "2026-09-17T19:30:00.000Z" }],
    offeringIds: [],
    labels: ["Table 4"],
    currency: "USD",
  });
  assert.match(html, /data-table-action="open_record"/);
});

test("service_card without a table variant falls back to the generic card", () => {
  const html = render("service_card", { offeringIds: ["o1"], labels: ["Massage"], currency: "USD" });
  assert.doesNotMatch(html, /data-card="table"/);
});

test("tickets_card, sent: Unpaid pill, seat hold countdown, Request payment", () => {
  const html = render("tickets_card", {
    eventId: "ev-1",
    title: "Friday night",
    tiers: [{ id: "t1", label: "General", priceCents: 5000 }],
    currency: "USD",
    holdExpiresAt: "2026-09-17T12:05:00.000Z",
  });
  assert.match(html, /pill due">Unpaid/);
  assert.match(html, /5 min left/);
  assert.match(html, /data-tickets-action="request_payment"/);
});

test("tickets_card, paid: Issued pill, door + link actions", () => {
  const html = render("tickets_card", { eventId: "ev-1", title: "Friday night", tiers: [{ id: "t1", label: "General", priceCents: 5000 }], currency: "USD", state: "paid" });
  assert.match(html, /pill money">Issued/);
  assert.match(html, /data-tickets-action="open_at_door"/);
});

test("tickets_card, checked in: N of M pill from capacity/checkedIn", () => {
  const html = render("tickets_card", { eventId: "ev-1", title: "Friday night", tiers: [{ id: "t1", label: "General", priceCents: 5000 }], currency: "USD", state: "selected", capacity: 2, checkedIn: 1 });
  assert.match(html, /Checked in 1 of 2/);
});

test("professional_times formats the slot in the payload timezone, not the browser zone", () => {
  const html = render("professional_times", { slots: [{ startsAt: "2026-09-20T15:00:00.000Z", professionalName: "Dani" }], timezone: "America/Mexico_City", state: "sent" });
  assert.match(html, /9:00 AM/);
  assert.doesNotMatch(html, /10:00 AM/);
});

test("professional_times, picked: countdown from holdExpiresAt (S2 states reused, not recomputed)", () => {
  const html = render("professional_times", { slots: [{ startsAt: "2026-09-18T10:00:00.000Z", professionalName: "Sofía" }], timezone: "UTC", state: "selected", holdExpiresAt: "2026-09-17T12:12:00.000Z" });
  assert.match(html, /held 15 min · 12 left/);
});

test("professional_times, hold ended: See alternatives label wired to send_times", () => {
  const html = render("professional_times", { slots: [], timezone: "UTC", state: "expired" });
  assert.match(html, /data-times-action="offer_new"[^>]*>See alternatives/);
});
