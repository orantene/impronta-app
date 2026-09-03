import test from "node:test";
import assert from "node:assert/strict";
import {
  isoWeekdayOf,
  localLabel,
  resolveWallClock,
  resolveWindowOnDate,
  seatingTimesFor,
} from "./windows";
import type { ServiceWindow, ServiceWindowException } from "./types";

const MADRID = "Europe/Madrid";
const CANCUN = "America/Cancun";

// Europe/Madrid springs forward 2027-03-28 (02:00 -> 03:00) and falls back
// 2027-10-31 (03:00 -> 02:00). America/Cancun has observed no DST since 2015,
// which is why the restaurant cases use it and the hard cases use Madrid.

const dinner: ServiceWindow = {
  id: "w-dinner",
  venueId: "v1",
  key: "dinner",
  localTimeMin: 19 * 60,
  durationMinutes: 240, // 19:00 to 23:00
  weekdays: [1, 2, 3, 4, 5, 6, 7],
  lastSeatingOffsetMin: null,
  seatingStepMinutes: 30,
  turnMinutesOverride: null,
  startsOn: "2026-01-01",
  endsOn: null,
  isActive: true,
};

const resolve = (
  window: ServiceWindow,
  onDate: string,
  timeZone = CANCUN,
  exceptions: ServiceWindowException[] = [],
  defaultTurnMinutes = 90,
) => resolveWindowOnDate({ window, exceptions, onDate, timeZone, defaultTurnMinutes });

// ─── the shape of a window ───────────────────────────────────────────────────

test("isoWeekdayOf refuses a date that does not exist rather than rolling it over", () => {
  assert.equal(isoWeekdayOf("2026-09-03"), 4); // a Thursday
  assert.equal(isoWeekdayOf("2026-02-31"), null);
  assert.equal(isoWeekdayOf("nonsense"), null);
});

test("a window CROSSING MIDNIGHT is ordinary, which the weekly-hours shape cannot express", () => {
  // hours-types.ts refuses endMin > 1440, so 23:00 to 05:00 is unrepresentable
  // there. A start plus a length never has to name an end inside a civil day.
  const club: ServiceWindow = {
    ...dinner,
    id: "w-club",
    key: "club",
    localTimeMin: 23 * 60,
    durationMinutes: 360,
  };
  const r = resolve(club, "2026-09-05");
  assert.ok(r.ok);
  assert.equal(localLabel(r.window.startsAt, CANCUN), "23:00");
  assert.equal(localLabel(r.window.endsAt, CANCUN), "05:00");
  assert.ok(r.window.endsAt.getTime() > r.window.startsAt.getTime());
});

test("refusals are NAMED, because closed today and no such service are different answers", () => {
  const mondayOnly: ServiceWindow = { ...dinner, weekdays: [1] };
  assert.deepEqual(resolve(mondayOnly, "2026-09-05"), {
    ok: false,
    reason: "not_on_this_weekday",
  });
  assert.deepEqual(resolve({ ...dinner, isActive: false }, "2026-09-05"), {
    ok: false,
    reason: "inactive",
  });
  assert.deepEqual(resolve({ ...dinner, startsOn: "2027-01-01" }, "2026-09-05"), {
    ok: false,
    reason: "outside_series_dates",
  });
  assert.deepEqual(resolve({ ...dinner, endsOn: "2026-08-01" }, "2026-09-05"), {
    ok: false,
    reason: "outside_series_dates",
  });
});

// ─── exceptions ──────────────────────────────────────────────────────────────

test("a venue-wide closure shuts a window without naming it", () => {
  const closed: ServiceWindowException = {
    venueId: "v1",
    windowId: null,
    onDate: "2026-12-25",
    isClosed: true,
    localTimeMin: null,
    durationMinutes: null,
    lastSeatingOffsetMin: null,
  };
  assert.deepEqual(resolve(dinner, "2026-12-25", CANCUN, [closed]), {
    ok: false,
    reason: "closed_by_exception",
  });
  assert.ok(resolve(dinner, "2026-12-26", CANCUN, [closed]).ok, "the next day is unaffected");
});

test("a venue-wide closure BEATS a per-window override for the same date", () => {
  // "We are shut on the 25th" is a statement about the building, and a rule
  // about one service must not reopen it.
  const exceptions: ServiceWindowException[] = [
    {
      venueId: "v1",
      windowId: null,
      onDate: "2026-12-25",
      isClosed: true,
      localTimeMin: null,
      durationMinutes: null,
      lastSeatingOffsetMin: null,
    },
    {
      venueId: "v1",
      windowId: "w-dinner",
      onDate: "2026-12-25",
      isClosed: false,
      localTimeMin: 20 * 60,
      durationMinutes: 300,
      lastSeatingOffsetMin: null,
    },
  ];
  assert.deepEqual(resolve(dinner, "2026-12-25", CANCUN, exceptions), {
    ok: false,
    reason: "closed_by_exception",
  });
});

test("an override can OPEN a window on a day the rule does not cover", () => {
  // "Brunch only this Sunday." Testing the weekday before reading the exception
  // would refuse this before the override was ever seen.
  const weekdaysOnly: ServiceWindow = { ...dinner, id: "w-brunch", weekdays: [1, 2, 3, 4, 5] };
  const sunday = "2026-09-06";
  assert.equal(resolve(weekdaysOnly, sunday).ok, false);

  const open: ServiceWindowException = {
    venueId: "v1",
    windowId: "w-brunch",
    onDate: sunday,
    isClosed: false,
    localTimeMin: 11 * 60,
    durationMinutes: 180,
    lastSeatingOffsetMin: null,
  };
  const r = resolve(weekdaysOnly, sunday, CANCUN, [open]);
  assert.ok(r.ok);
  assert.equal(localLabel(r.window.startsAt, CANCUN), "11:00");
});

test("last seating: NULL means the end minus a turn, 0 means no seatings at all", () => {
  const inherited = resolve(dinner, "2026-09-05", CANCUN, [], 90);
  assert.ok(inherited.ok);
  assert.equal(localLabel(inherited.window.lastSeatingAt, CANCUN), "21:30");

  const none = resolve({ ...dinner, lastSeatingOffsetMin: 0 }, "2026-09-05");
  assert.ok(none.ok);
  assert.equal(
    none.window.lastSeatingAt.getTime(),
    none.window.startsAt.getTime(),
    "0 is a real offset, not an absent one",
  );
});

// ─── DST: the three rules ────────────────────────────────────────────────────

test("RULE 2a — a window BOUNDARY in the spring-forward gap resolves 'next', not refused", () => {
  // Refusing would close a restaurant whose doors are open.
  assert.equal(resolveWallClock("2027-03-28", 150, MADRID, "next")?.toISOString(),
    "2027-03-28T01:30:00.000Z");
  const gapWindow: ServiceWindow = { ...dinner, localTimeMin: 150, durationMinutes: 180 };
  const r = resolve(gapWindow, "2027-03-28", MADRID);
  assert.ok(r.ok, "the venue still has a service that night");
  assert.equal(localLabel(r.window.startsAt, MADRID), "03:30");
});

test("RULE 2b — a SEATING TIME in the gap is DROPPED, never moved", () => {
  assert.equal(resolveWallClock("2027-03-28", 150, MADRID, "skip"), null);
});

test("RULE 2c — no two offered seatings ever share one instant", () => {
  // A 02:30 seating moved to 03:30 would land on the real 03:30 seating, and
  // the page would offer one moment twice under two labels, with two parties
  // told different times.
  const overnight: ServiceWindow = {
    ...dinner,
    localTimeMin: 60, // 01:00
    durationMinutes: 300, // to 06:00
    seatingStepMinutes: 30,
    lastSeatingOffsetMin: 240,
  };
  const r = resolve(overnight, "2027-03-28", MADRID);
  assert.ok(r.ok);
  const options = seatingTimesFor({ resolved: r.window, timeZone: MADRID, turnMinutes: 90 });

  const instants = options.map((o) => o.startsAt.getTime());
  assert.equal(new Set(instants).size, instants.length, "one instant, one offer");

  const labels = options.map((o) => o.localLabel);
  assert.equal(new Set(labels).size, labels.length, "one label, one offer");
  assert.ok(!labels.includes("02:30"), "02:30 did not happen that night");
  assert.ok(!labels.includes("02:00"), "02:00 did not happen that night");
  assert.ok(labels.includes("03:30"), "03:30 did happen, exactly once");
});

test("RULE 3 — the turn is added to the INSTANT, never to the wall clock", () => {
  // Measured on this repo: a 90 minute turn from 01:30 on Madrid's
  // spring-forward night, computed as "wall clock plus 90 then resolve", holds
  // the table for 30 real minutes and frees it while the party is eating.
  const overnight: ServiceWindow = {
    ...dinner,
    localTimeMin: 60,
    durationMinutes: 300,
    seatingStepMinutes: 30,
    lastSeatingOffsetMin: 240,
  };
  const r = resolve(overnight, "2027-03-28", MADRID);
  assert.ok(r.ok);
  const options = seatingTimesFor({ resolved: r.window, timeZone: MADRID, turnMinutes: 90 });

  for (const option of options) {
    const heldMinutes = (option.endsAt.getTime() - option.startsAt.getTime()) / 60_000;
    assert.equal(heldMinutes, 90, `seating ${option.localLabel} held ${heldMinutes} minutes`);
  }

  const at0130 = options.find((o) => o.localLabel === "01:30");
  assert.ok(at0130, "01:30 is a real time that night");
  assert.equal(
    localLabel(at0130.endsAt, MADRID),
    "04:00",
    "90 real minutes from 01:30 reads as 04:00 on a night that loses an hour",
  );
});

test("RULE 3 also holds for the window's own end", () => {
  const gapWindow: ServiceWindow = { ...dinner, localTimeMin: 60, durationMinutes: 300 };
  const r = resolve(gapWindow, "2027-03-28", MADRID);
  assert.ok(r.ok);
  assert.equal(
    (r.window.endsAt.getTime() - r.window.startsAt.getTime()) / 60_000,
    300,
    "the window is five real hours long even on the night that loses one",
  );
});

test("fall-back: an ambiguous wall clock is offered once, at its first instant", () => {
  const overnight: ServiceWindow = {
    ...dinner,
    localTimeMin: 60,
    durationMinutes: 300,
    seatingStepMinutes: 30,
    lastSeatingOffsetMin: 240,
  };
  const r = resolve(overnight, "2027-10-31", MADRID);
  assert.ok(r.ok);
  const options = seatingTimesFor({ resolved: r.window, timeZone: MADRID, turnMinutes: 90 });
  const instants = options.map((o) => o.startsAt.getTime());
  assert.equal(new Set(instants).size, instants.length, "the repeated hour is offered once");
  assert.equal(options.filter((o) => o.localLabel === "02:30").length, 1);
});

// ─── the ordinary case ───────────────────────────────────────────────────────

test("a 90 minute turn makes 20:00 and 21:30 independent, because overlap is half-open", () => {
  const r = resolve(dinner, "2026-09-05");
  assert.ok(r.ok);
  const options = seatingTimesFor({ resolved: r.window, timeZone: CANCUN, turnMinutes: 90 });
  const at2000 = options.find((o) => o.localLabel === "20:00");
  const at2130 = options.find((o) => o.localLabel === "21:30");
  assert.ok(at2000 && at2130);
  assert.equal(
    at2000.endsAt.getTime(),
    at2130.startsAt.getTime(),
    "the table frees at exactly the moment the next party sits",
  );
});

test("the offered grid runs from the start to the last seating, and marks the last one", () => {
  const r = resolve(dinner, "2026-09-05", CANCUN, [], 90);
  assert.ok(r.ok);
  const options = seatingTimesFor({ resolved: r.window, timeZone: CANCUN, turnMinutes: 90 });
  assert.deepEqual(
    options.map((o) => o.localLabel),
    ["19:00", "19:30", "20:00", "20:30", "21:00", "21:30"],
  );
  assert.equal(options.filter((o) => o.isLastSeating).length, 1);
  assert.equal(options[options.length - 1]!.isLastSeating, true);
});

test("a window that takes no seatings offers exactly one, at its start", () => {
  const r = resolve({ ...dinner, lastSeatingOffsetMin: 0 }, "2026-09-05");
  assert.ok(r.ok);
  const options = seatingTimesFor({ resolved: r.window, timeZone: CANCUN, turnMinutes: 90 });
  assert.equal(options.length, 1);
  assert.equal(options[0]!.localLabel, "19:00");
});
