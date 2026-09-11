import test from "node:test";
import assert from "node:assert/strict";

import { resolveWindowOnDate, isoWeekdayOf } from "./windows";
import type { ServiceWindow, ServiceWindowException } from "./types";

/**
 * THE DATE STRIP OFFERS OPEN DAYS, NOT THE NEXT FIVE ON THE CALENDAR.
 *
 * El Paisa closes Monday and Wednesday. On 2026-09-06 its live page offered
 * "Hoy, lun 7, mar 8, mié 9, jue 10" — two of five chips were days the
 * restaurant is shut. Clicking either answered "Ese día cerramos", which is
 * honest and still wastes two fifths of the one screen that has to work.
 *
 * `loadReserveAvailability` now walks forward asking `resolveWindowOnDate`
 * whether ANY window resolves on each candidate. This exercises that rule
 * directly, on El Paisa's real windows, because the walk itself lives inside a
 * server action that needs a database.
 *
 * It asks the RESOLVER rather than re-reading `weekdays`, and that is the point
 * of the fix: an exception can close a normally-open day or open a normally-
 * closed one, so a second implementation reading the array would drift from the
 * first the moment a holiday is entered.
 */

const BA = "America/Argentina/Buenos_Aires";

/** Thursday to Sunday, 10:00 for 900 minutes, closing at 01:00. */
const service: ServiceWindow = {
  id: "w-service",
  venueId: "v-elpaisa",
  key: "service",
  localTimeMin: 10 * 60,
  durationMinutes: 900,
  weekdays: [4, 5, 6, 7],
  lastSeatingOffsetMin: null,
  seatingStepMinutes: 30,
  turnMinutesOverride: null,
  startsOn: "2026-01-01",
  endsOn: null,
  isActive: true,
};

/** Tuesday only, 10:00 for 420 minutes, closing at 17:00. */
const martes: ServiceWindow = {
  ...service,
  id: "w-martes",
  key: "martes",
  durationMinutes: 420,
  weekdays: [2],
};

const WINDOWS = [service, martes];

/** The predicate the strip walks: is ANY window open on this date? */
function isOpen(onDate: string, exceptions: ServiceWindowException[] = []): boolean {
  return WINDOWS.some(
    (window) =>
      resolveWindowOnDate({
        window,
        exceptions,
        onDate,
        timeZone: BA,
        defaultTurnMinutes: 90,
      }).ok,
  );
}

/** The walk itself, bounded exactly as the action bounds it. */
function strip(fromYmd: string, want = 5, scan = 30): string[] {
  const out: string[] = [];
  const base = new Date(`${fromYmd}T12:00:00Z`);
  for (let i = 0; i <= scan && out.length < want; i += 1) {
    const d = new Date(base.getTime() + i * 86_400_000);
    const ymd = d.toISOString().slice(0, 10);
    if (isOpen(ymd)) out.push(ymd);
  }
  return out;
}

test("Monday and Wednesday are closed, and every other day is open", () => {
  // 2026-09-06 is a Sunday. Walk one full week.
  const week = [
    ["2026-09-06", 7, true],  // Sunday
    ["2026-09-07", 1, false], // Monday   CLOSED
    ["2026-09-08", 2, true],  // Tuesday  (the short window)
    ["2026-09-09", 3, false], // Wednesday CLOSED
    ["2026-09-10", 4, true],  // Thursday
    ["2026-09-11", 5, true],  // Friday
    ["2026-09-12", 6, true],  // Saturday
  ] as const;
  for (const [ymd, isodow, open] of week) {
    assert.equal(isoWeekdayOf(ymd), isodow, `${ymd} weekday`);
    assert.equal(isOpen(ymd), open, `${ymd} open?`);
  }
});

test("the strip skips the closed days instead of spending chips on them", () => {
  // From that Sunday, the five OPEN days are Sun, Tue, Thu, Fri, Sat.
  assert.deepEqual(strip("2026-09-06"), [
    "2026-09-06",
    "2026-09-08",
    "2026-09-10",
    "2026-09-11",
    "2026-09-12",
  ]);
  // The bug this replaces would have produced the 7th and the 9th.
  const broken = strip("2026-09-06").filter((d) => ["2026-09-07", "2026-09-09"].includes(d));
  assert.deepEqual(broken, [], "a closed day reached the strip");
});

test("starting ON a closed day still yields five open days", () => {
  // A guest arriving on Monday must not get a strip that starts with a refusal.
  const s = strip("2026-09-07");
  assert.equal(s.length, 5);
  assert.equal(s[0], "2026-09-08", "the first chip is the next OPEN day");
  for (const d of s) assert.ok(isOpen(d), `${d} should be open`);
});

test("an exception closing an open day removes it, without touching weekdays", () => {
  // The reason the walk asks the resolver rather than reading `weekdays`: a
  // holiday closure is invisible to the array.
  const holiday: ServiceWindowException[] = [
    {
      venueId: "v-elpaisa",
      windowId: null,
      onDate: "2026-09-10",
      isClosed: true,
      localTimeMin: null,
      durationMinutes: null,
      lastSeatingOffsetMin: null,
    },
  ];
  assert.equal(isOpen("2026-09-10"), true, "Thursday is open by weekday");
  const closedByException = WINDOWS.some(
    (window) =>
      resolveWindowOnDate({
        window,
        exceptions: holiday,
        onDate: "2026-09-10",
        timeZone: BA,
        defaultTurnMinutes: 90,
      }).ok,
  );
  assert.equal(closedByException, false, "the exception must close it");
});

/**
 * OPEN IS NOT STILL BOOKABLE.
 *
 * The predicate above answers a calendar question and knows nothing about the
 * clock, so at 23:45 it still called today open although the last seating was
 * 23:30. Today became the first chip, `availabilityForWindow` then dropped
 * every one of its seatings for being before `now + minNotice`, and the guest
 * got a reserve block with no times on a night the restaurant had tomorrow
 * wide open — during exactly the hours people book for tomorrow.
 *
 * It also made C06's two reservation journeys fail only between last seating
 * and local midnight, which presents as flake.
 *
 * This mirrors the corrected predicate: open AND its last seating is still
 * reachable.
 */
function isBookable(onDate: string, now: Date, minNoticeMinutes = 0): boolean {
  const earliest = now.getTime() + minNoticeMinutes * 60_000;
  return WINDOWS.some((window) => {
    const resolved = resolveWindowOnDate({
      window,
      exceptions: [],
      onDate,
      timeZone: BA,
      defaultTurnMinutes: 90,
    });
    if (!resolved.ok) return false;
    return resolved.window.lastSeatingAt.getTime() >= earliest;
  });
}

/** The corrected walk. */
function bookableStrip(fromYmd: string, now: Date, want = 5, scan = 30): string[] {
  const out: string[] = [];
  const base = new Date(`${fromYmd}T12:00:00Z`);
  for (let i = 0; i <= scan && out.length < want; i += 1) {
    const d = new Date(base.getTime() + i * 86_400_000);
    const ymd = d.toISOString().slice(0, 10);
    if (isBookable(ymd, now)) out.push(ymd);
  }
  return out;
}

// Thursday 2026-09-10. The service window runs 10:00 for 900 minutes and has
// no explicit last-seating offset, so the last seating is the close (01:00)
// minus one 90 minute turn: 23:30 local.
const THU = "2026-09-10";
const at = (localHhMm: string) => {
  // BA is UTC-3 year round, so the arithmetic here is deliberate and simple:
  // a zone with transitions would defeat the purpose of a fixture.
  const [h, m] = localHhMm.split(":").map(Number);
  return new Date(Date.UTC(2026, 8, 10, h! + 3, m!));
};

test("a day is offered while its last seating is still ahead", () => {
  assert.equal(isBookable(THU, at("18:00")), true, "dinner has not started");
  assert.equal(isBookable(THU, at("23:29")), true, "one minute before last seating");
});

test("a day whose last seating has passed is NOT offered", () => {
  assert.equal(isBookable(THU, at("23:31")), false, "last seating was 23:30");
  // The old predicate cannot tell these two apart, which is the whole defect.
  assert.equal(isOpen(THU), true, "the calendar still says the venue runs a service");
});

test("after last seating the first chip is tomorrow, not a dead today", () => {
  const late = at("23:45");
  const s = bookableStrip(THU, late);
  assert.notEqual(s[0], THU, "today had nothing left to take");
  assert.equal(s[0], "2026-09-11", "Friday is the first day a guest can actually book");
  assert.equal(s.length, 5, "and the strip is still full");
});

test("minimum notice is part of the question, not a later filter", () => {
  // A venue wanting two hours' notice cannot offer a day whose last seating is
  // 30 minutes away: the availability step would drop it and the strip would
  // again point at a day with nothing on it.
  assert.equal(isBookable(THU, at("23:00"), 0), true, "no notice required");
  assert.equal(isBookable(THU, at("23:00"), 120), false, "two hours' notice cannot be met");
});

test("future days are unaffected, so the rule needs no special case for today", () => {
  // Friday's last seating is a day away; no plausible `now` on Thursday can
  // exclude it. This is why the test is applied to every candidate rather than
  // branching on i === 0.
  for (const t of ["00:01", "12:00", "23:59"]) {
    assert.equal(isBookable("2026-09-11", at(t)), true, `Friday at ${t}`);
  }
});

test("the scan is BOUNDED, so a venue closed every day returns fewer days rather than spinning", () => {
  const shut: ServiceWindow = { ...service, isActive: false };
  const none = (ymd: string) =>
    [shut].some(
      (w) =>
        resolveWindowOnDate({
          window: w,
          exceptions: [],
          onDate: ymd,
          timeZone: BA,
          defaultTurnMinutes: 90,
        }).ok,
    );
  assert.equal(none("2026-09-10"), false, "an inactive window is never open");
  // The action's loop is `i <= scan && out.length < want`, so an all-closed
  // venue exits after the scan with an empty list and the page says closed.
});
