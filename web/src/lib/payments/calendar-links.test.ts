/**
 * TUL-437: the .ics body and the Google link. Run: node_modules/.bin/tsx --test src/lib/payments/calendar-links.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { buildIcs, escapeIcsText, googleCalendarUrl } from "./calendar-links";

const ev = {
  uid: "order-1",
  title: "QA paid test, con Rosa",
  startsAt: "2026-10-09T22:30:00.000Z",
  endsAt: "2026-10-09T23:30:00.000Z",
  location: "Calle 1; Tulum",
  description: "Pagado a Rosa",
};

test("ics: UTC instants (so every app shows the viewer's local time), CRLF, escaped text", () => {
  const ics = buildIcs(ev, new Date("2026-10-08T20:00:00Z"))!;
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART:20261009T223000Z\r\n/);
  assert.match(ics, /DTEND:20261009T233000Z\r\n/);
  assert.match(ics, /SUMMARY:QA paid test\\, con Rosa\r\n/);
  assert.match(ics, /LOCATION:Calle 1\; Tulum\r\n/);
  assert.match(ics, /UID:order-1@tulala\.digital\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
  assert.doesNotMatch(ics.replace(/\r\n/g, ""), /\n/);
});

test("ics: lines over 75 octets are folded", () => {
  const ics = buildIcs({ ...ev, description: "x".repeat(200) })!;
  for (const line of ics.split("\r\n")) assert.ok(Buffer.byteLength(line, "utf8") <= 75, line);
});

test("a missing or backwards time gives no file and no link", () => {
  assert.equal(buildIcs({ ...ev, startsAt: "nope" }), null);
  assert.equal(buildIcs({ ...ev, endsAt: ev.startsAt }), null);
  assert.equal(googleCalendarUrl({ ...ev, endsAt: "2026-10-09T21:00:00Z" }), null);
});

test("google link carries the same instants, title and place", () => {
  const url = new URL(googleCalendarUrl(ev)!);
  assert.equal(url.origin + url.pathname, "https://calendar.google.com/calendar/render");
  assert.equal(url.searchParams.get("dates"), "20261009T223000Z/20261009T233000Z");
  assert.equal(url.searchParams.get("text"), ev.title);
  assert.equal(url.searchParams.get("location"), ev.location);
});

test("escaping", () => assert.equal(escapeIcsText("a,b;c\\d\ne"), "a\\,b\;c\\\\d\\ne"));
