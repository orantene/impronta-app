import test from "node:test";
import assert from "node:assert/strict";

import { doorVerdict, matchesGuest, splitTonight, venueClock } from "./door-model";

const ZONE = "America/Mexico_City";

test("venueClock prints the venue's clock and names the zone, never the machine's", () => {
  // 2026-09-12T10:10Z is 04:10 in Mexico City (CST, UTC-6, no DST since 2022).
  const c = venueClock("2026-09-12T10:10:45.456Z", ZONE, "en");
  assert.ok(c);
  assert.equal(c.time, "04:10");
  assert.equal(c.dayKey, "2026-09-12");
  assert.equal(c.zoneName, "CST");
  assert.match(c.date, /12/);
  // 01:30Z on the 13th is still the evening of the 12th at the venue.
  const late = venueClock("2026-09-13T01:30:00.000Z", ZONE, "en");
  assert.ok(late);
  assert.equal(late.time, "19:30");
  assert.equal(late.dayKey, "2026-09-12");
});

test("venueClock refuses rather than guessing on a bad instant or an unknown zone", () => {
  assert.equal(venueClock("not a date", ZONE), null);
  assert.equal(venueClock("2026-09-12T10:10:45.456Z", "Mars/Olympus"), null);
});

test("splitTonight files running and same-venue-day sessions under tonight, drops ended ones", () => {
  // Now: 2026-09-12 20:00 at the venue = 02:00Z on the 13th.
  const now = "2026-09-13T02:00:00.000Z";
  const sessions = [
    { id: "ended", startsAt: "2026-09-12T18:00:00.000Z", endsAt: "2026-09-12T20:00:00.000Z" },
    { id: "running", startsAt: "2026-09-13T01:00:00.000Z", endsAt: "2026-09-13T04:00:00.000Z" },
    // 23:30 tonight at the venue = 05:30Z on the 13th.
    { id: "late-tonight", startsAt: "2026-09-13T05:30:00.000Z", endsAt: "2026-09-13T08:00:00.000Z" },
    // 00:30 tomorrow at the venue = 06:30Z on the 13th: the calendar says tomorrow.
    { id: "tomorrow", startsAt: "2026-09-13T06:30:00.000Z", endsAt: "2026-09-13T09:00:00.000Z" },
    { id: "next-week", startsAt: "2026-09-19T02:00:00.000Z", endsAt: "2026-09-19T05:00:00.000Z" },
  ];
  const { tonight, later } = splitTonight(sessions, now, ZONE);
  assert.deepEqual(tonight.map((s) => s.id), ["running", "late-tonight"]);
  assert.deepEqual(later.map((s) => s.id), ["tomorrow", "next-week"]);
});

test("splitTonight orders by start even when the input is shuffled", () => {
  const now = "2026-09-13T02:00:00.000Z";
  const { later } = splitTonight(
    [
      { id: "b", startsAt: "2026-09-20T02:00:00.000Z", endsAt: "2026-09-20T05:00:00.000Z" },
      { id: "a", startsAt: "2026-09-19T02:00:00.000Z", endsAt: "2026-09-19T05:00:00.000Z" },
    ],
    now,
    ZONE,
  );
  assert.deepEqual(later.map((s) => s.id), ["a", "b"]);
});

test("doorVerdict goes green on admitted only, and every refusal is its own sentence", () => {
  const dateFor = (iso: string) => venueClock(iso, ZONE)?.date ?? null;
  const admitted = doorVerdict(
    { kind: "admitted", admitted: 1, admittedCount: 1, partySize: 1, remaining: 0, wasMarkedNoShow: false },
    dateFor,
  );
  assert.equal(admitted.key, "admitted");
  assert.equal(admitted.tone, "in");

  const party = doorVerdict(
    { kind: "admitted", admitted: 2, admittedCount: 2, partySize: 4, remaining: 2, wasMarkedNoShow: false },
    dateFor,
  );
  assert.equal(party.key, "admittedParty");
  assert.deepEqual(party.vars, { admitted: 2, party: 4 });

  const already = doorVerdict({ kind: "already_in", admittedCount: 1, partySize: 1 }, dateFor);
  assert.equal(already.key, "alreadyIn");
  assert.equal(already.tone, "refused");

  const wrongDated = doorVerdict(
    { kind: "wrong_session", ticketStartsAt: "2026-09-13T01:30:00.000Z" },
    dateFor,
  );
  assert.equal(wrongDated.key, "wrongNightDated");
  assert.match(String(wrongDated.vars.date), /12/);
  const wrongUndated = doorVerdict({ kind: "wrong_session", ticketStartsAt: null }, dateFor);
  assert.equal(wrongUndated.key, "wrongNight");

  assert.equal(doorVerdict({ kind: "not_valid", status: "refunded" }, dateFor).key, "refunded");
  assert.equal(doorVerdict({ kind: "not_valid", status: "void" }, dateFor).key, "cancelled");
  assert.equal(doorVerdict({ kind: "forged" }, dateFor).key, "forged");
  assert.equal(doorVerdict({ kind: "unknown_ticket" }, dateFor).key, "unknown");
  assert.equal(doorVerdict({ kind: "superseded" }, dateFor).key, "superseded");
  assert.equal(doorVerdict({ kind: "too_many", remaining: 1, requested: 3 }, dateFor).tone, "warn");
  // OUR failures never read as the holder's.
  assert.equal(doorVerdict({ kind: "door_misconfigured" }, dateFor).tone, "warn");
  assert.equal(doorVerdict({ kind: "engine_error", detail: "x" }, dateFor).tone, "warn");
});

test("matchesGuest finds by name, email or ticket id prefix, and an empty query keeps every row", () => {
  const row = { id: "abcd1234-0000-4000-8000-000000000000", holderName: "Ana Ruiz", holderEmail: "ana@x.test" };
  assert.ok(matchesGuest(row, ""));
  assert.ok(matchesGuest(row, "ruiz"));
  assert.ok(matchesGuest(row, "ANA@"));
  assert.ok(matchesGuest(row, "abcd12"));
  assert.ok(!matchesGuest(row, "beto"));
  assert.ok(!matchesGuest({ id: "zzz", holderName: null }, "ana"));
});
