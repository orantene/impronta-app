import test from "node:test";
import assert from "node:assert/strict";

import { EMPTY_ME, formatAmount, shapeMeData, type MeRow } from "./shape-me";

const NOW = Date.parse("2026-09-03T19:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function row(overrides: Partial<MeRow> = {}): MeRow {
  return {
    id: "i1",
    tenantId: "t1",
    status: "confirmed",
    title: "Dinner for 4",
    eventDate: new Date(NOW + DAY).toISOString(),
    eventLocation: "Tulum",
    createdAt: new Date(NOW - DAY).toISOString(),
    nextActionBy: null,
    booking: null,
    ...overrides,
  };
}

test("nothing in, empty out", () => {
  const shaped = shapeMeData([], NOW);
  assert.deepEqual(shaped, EMPTY_ME);
  assert.equal(shaped.isEmpty, true);
});

test("an event happening TODAY is upcoming, not past", () => {
  // The load-bearing case. A diner opening /me at 19:00 to check tonight's
  // table must not find it filed under history, which is what a naive
  // `eventDate < now` comparison does.
  const tonight = row({ eventDate: new Date(NOW - 3 * 60 * 60 * 1000).toISOString() });
  const shaped = shapeMeData([tonight], NOW);
  assert.equal(shaped.upcoming.length, 1);
  assert.equal(shaped.past.length, 0);
});

test("yesterday is past", () => {
  const shaped = shapeMeData([row({ eventDate: new Date(NOW - 2 * DAY).toISOString() })], NOW);
  assert.equal(shaped.past.length, 1);
  assert.equal(shaped.upcoming.length, 0);
});

test("a cancelled thing is past however future its date", () => {
  for (const status of ["cancelled", "CANCELLED", "declined", "expired", "closed", "archived"]) {
    const shaped = shapeMeData(
      [row({ status, eventDate: new Date(NOW + 30 * DAY).toISOString() })],
      NOW,
    );
    assert.equal(shaped.past.length, 1, `${status} must not read as upcoming`);
    assert.equal(shaped.upcoming.length, 0);
  }
});

test("the ball being in the customer's court outranks the date", () => {
  // A quote awaiting their approval is the thing they came to act on, whenever
  // the event itself happens.
  const shaped = shapeMeData([row({ nextActionBy: "client" })], NOW);
  assert.equal(shaped.waitingOnYou.length, 1);
  assert.equal(shaped.upcoming.length, 0);
});

test("but a cancelled thing never asks for action", () => {
  const shaped = shapeMeData([row({ status: "cancelled", nextActionBy: "client" })], NOW);
  assert.equal(shaped.past.length, 1);
  assert.equal(shaped.waitingOnYou.length, 0);
});

test("a row with no date is upcoming, not silently dropped", () => {
  // An open enquiry with no date agreed yet is live work. Filing it under past
  // (or nowhere) would hide the thing the customer is waiting on.
  const shaped = shapeMeData([row({ eventDate: null })], NOW);
  assert.equal(shaped.upcoming.length, 1);
});

test("an unparseable date is treated as undated rather than as 1970", () => {
  const shaped = shapeMeData([row({ eventDate: "not a date" })], NOW);
  assert.equal(shaped.upcoming.length, 1, "garbage must not sort a live row into 1970");
  assert.equal(shaped.past.length, 0);
});

test("upcoming is soonest first, past is most recent first", () => {
  const rows = [
    row({ id: "far", eventDate: new Date(NOW + 10 * DAY).toISOString() }),
    row({ id: "soon", eventDate: new Date(NOW + 2 * DAY).toISOString() }),
    row({ id: "old", eventDate: new Date(NOW - 10 * DAY).toISOString() }),
    row({ id: "recent", eventDate: new Date(NOW - 2 * DAY).toISOString() }),
  ];
  const shaped = shapeMeData(rows, NOW);
  assert.deepEqual(shaped.upcoming.map((r) => r.id), ["soon", "far"]);
  assert.deepEqual(shaped.past.map((r) => r.id), ["recent", "old"]);
});

test("every row lands in exactly one bucket", () => {
  const rows = [
    row({ id: "a" }),
    row({ id: "b", nextActionBy: "client" }),
    row({ id: "c", status: "cancelled" }),
    row({ id: "d", eventDate: new Date(NOW - 5 * DAY).toISOString() }),
    row({ id: "e", eventDate: null }),
  ];
  const shaped = shapeMeData(rows, NOW);
  const seen = [...shaped.upcoming, ...shaped.waitingOnYou, ...shaped.past].map((r) => r.id);
  assert.equal(seen.length, rows.length, "a row was dropped or duplicated");
  assert.equal(new Set(seen).size, rows.length);
});

test("money is formatted from integer cents, never a float", () => {
  assert.equal(formatAmount(6000, "USD"), "$60");
  assert.equal(formatAmount(6450, "USD"), "$64.50");
  assert.equal(formatAmount(6450, "MXN"), "MXN 64.50");
  assert.equal(formatAmount(null, "USD"), null);
  assert.equal(formatAmount(0, "USD"), "$0");
});
