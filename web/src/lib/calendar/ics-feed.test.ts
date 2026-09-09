/**
 * ics-feed.test.ts — defect 6, the read side.
 *
 * The thing this replaces was not a broken feature; it was a screen that
 * described one. So the properties worth pinning are the ones that make a
 * subscription behave over TIME, because a calendar feed's failures are all
 * second-fetch failures: a duplicated event, a cancellation that never arrives,
 * a made-up duration nobody can tell from a real one.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  CANCELLED_RETENTION_DAYS,
  buildIcsFeed,
  isFeedable,
  type FeedEvent,
} from "./ics-feed";

const ev = (over: Partial<FeedEvent> = {}): FeedEvent => ({
  uid: "booking-1",
  summary: "Editorial shoot",
  startsAt: "2026-03-01T15:00:00.000Z",
  endsAt: "2026-03-01T19:00:00.000Z",
  status: "confirmed",
  ...over,
});

const NOW = new Date("2026-02-01T09:00:00.000Z");

test("a feed is a well-formed VCALENDAR with CRLF line endings", () => {
  const ics = buildIcsFeed([ev()], { calendarName: "Tulala" }, NOW);
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.match(ics, /\r\nVERSION:2\.0\r\n/);
  assert.doesNotMatch(
    ics.replace(/\r\n/g, ""),
    /\n/,
    "a bare LF is not a valid RFC 5545 line break and some clients reject the file whole",
  );
});

test("times are emitted as UTC Z stamps", () => {
  const ics = buildIcsFeed([ev()], { calendarName: "Tulala" }, NOW);
  assert.match(ics, /DTSTART:20260301T150000Z/);
  assert.match(ics, /DTEND:20260301T190000Z/);
});

test("the UID is stable and namespaced, so a poll does not duplicate the event", () => {
  const a = buildIcsFeed([ev()], { calendarName: "Tulala" }, NOW);
  const b = buildIcsFeed([ev()], { calendarName: "Tulala" }, new Date(NOW.getTime() + 8.64e7));
  const uid = /UID:(.+)\r\n/.exec(a)?.[1];
  assert.equal(uid, "booking-1@tulala.digital");
  assert.equal(uid, /UID:(.+)\r\n/.exec(b)?.[1]);
});

test("a cancelled event ships as STATUS:CANCELLED rather than vanishing", () => {
  // Clients differ on whether a disappeared VEVENT is a deletion or a transport
  // glitch, and several keep the stale copy. An operator holding a cancelled
  // shoot on their phone with nothing saying it is off is worse than the
  // missing route this replaced, because it looks like it is working.
  const ics = buildIcsFeed([ev({ status: "cancelled" })], { calendarName: "Tulala" }, NOW);
  assert.match(ics, /STATUS:CANCELLED/);
});

test("SEQUENCE advances when the booking is edited", () => {
  const seq = (ics: string) => Number(/SEQUENCE:(\d+)/.exec(ics)?.[1]);
  const first = buildIcsFeed(
    [ev({ updatedAt: "2026-02-01T10:00:00.000Z" })],
    { calendarName: "Tulala" },
    NOW,
  );
  const second = buildIcsFeed(
    [ev({ updatedAt: "2026-02-01T11:00:00.000Z" })],
    { calendarName: "Tulala" },
    NOW,
  );
  assert.ok(seq(second) > seq(first), "a cached copy must be superseded, not tied");
});

test("SEQUENCE stays inside the 32-bit range clients still assume", () => {
  const ics = buildIcsFeed(
    [ev({ updatedAt: "2099-12-31T23:59:00.000Z" })],
    { calendarName: "Tulala" },
    NOW,
  );
  const seq = Number(/SEQUENCE:(\d+)/.exec(ics)?.[1]);
  assert.ok(seq > 0 && seq < 2 ** 31);
});

test("commas and semicolons in a venue name are escaped, not emitted raw", () => {
  const ics = buildIcsFeed(
    [ev({ location: "Casa Rizo, Sala 2; Piso 3" })],
    { calendarName: "Tulala" },
    NOW,
  );
  assert.match(ics, /LOCATION:Casa Rizo\\, Sala 2\\; Piso 3/);
});

test("a long summary is folded and never emitted as one over-length line", () => {
  const ics = buildIcsFeed(
    [ev({ summary: "x".repeat(300) })],
    { calendarName: "Tulala" },
    NOW,
  );
  for (const line of ics.split("\r\n")) {
    assert.ok(line.length <= 75, `content line too long: ${line.length}`);
  }
});

test("an event with no usable times is dropped, never given an invented duration", () => {
  // A guessed hour lands on an operator's real calendar indistinguishable from
  // a real block. A booking with no times is a booking with no times.
  assert.equal(isFeedable(ev({ startsAt: "", endsAt: "" })), false);
  assert.equal(isFeedable(ev({ endsAt: "2026-03-01T15:00:00.000Z" })), false, "zero length");
  assert.equal(isFeedable(ev({ endsAt: "2026-03-01T10:00:00.000Z" })), false, "ends before it starts");
  const ics = buildIcsFeed(
    [ev({ startsAt: "not a date" }), ev({ uid: "booking-2" })],
    { calendarName: "Tulala" },
    NOW,
  );
  assert.equal(ics.match(/BEGIN:VEVENT/g)?.length, 1);
});

test("an empty workspace produces a valid empty calendar, not an error", () => {
  // A new workspace subscribing before it has a single booking must get a
  // calendar that resolves. A 500 here is indistinguishable to the operator
  // from the dead URL this replaced.
  const ics = buildIcsFeed([], { calendarName: "Tulala" }, NOW);
  assert.ok(ics.includes("BEGIN:VCALENDAR"));
  assert.ok(!ics.includes("BEGIN:VEVENT"));
});

test("the calendar carries a name and both refresh hints", () => {
  const ics = buildIcsFeed([], { calendarName: "Casa Rizo", refreshMinutes: 15 }, NOW);
  assert.match(ics, /X-WR-CALNAME:Casa Rizo/);
  assert.match(ics, /REFRESH-INTERVAL;VALUE=DURATION:PT15M/);
  assert.match(ics, /X-PUBLISHED-TTL:PT15M/, "Outlook reads this spelling and not the other");
});

test("the refresh hint has a floor, so a bad value cannot ask for a poll storm", () => {
  const ics = buildIcsFeed([], { calendarName: "T", refreshMinutes: 0 }, NOW);
  assert.match(ics, /PT5M/);
});

test("cancelled retention is long enough to reach a phone left in a drawer", () => {
  assert.ok(CANCELLED_RETENTION_DAYS >= 14);
});
