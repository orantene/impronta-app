/**
 * tz.ts had no tests, and four features are about to depend on it.
 *
 * It is the single wall-clock resolver for Appointments, Sessions, Reservations
 * and Events — the module that decides what instant "18:00 on Tuesday" is. Its
 * DST policy is locked in the appointments plan and stated in its own header;
 * these tests pin that policy so a future change has to be deliberate.
 *
 * Written by the Capacity Engine Manager while wiring Sessions P1.1 onto it,
 * after finding a second resolver had been written (mine) with a CONTRADICTORY
 * gap policy. Deleting the duplicate is only safe if the survivor is pinned.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addUtcDays,
  isValidIanaTimeZone,
  minutesToHmm,
  resolveWallClock,
  utcToZonedHmm,
  utcToZonedYmd,
  weekdayUtc,
  zonedLocalToUtc,
  zonedWindow,
} from "./tz";

const NY = "America/New_York";
const MADRID = "Europe/Madrid";

test("resolves a wall clock to the right instant either side of a DST boundary", () => {
  // 18:00 local is 23:00Z under EST and 22:00Z under EDT. Same wall clock, two
  // different instants — which is the entire reason this module exists.
  assert.equal(zonedLocalToUtc("2027-03-09", 18 * 60, NY)?.toISOString(), "2027-03-09T23:00:00.000Z");
  assert.equal(zonedLocalToUtc("2027-03-16", 18 * 60, NY)?.toISOString(), "2027-03-16T22:00:00.000Z");
});

test("POLICY skip (default): a spring-forward gap returns null", () => {
  // 02:00 -> 03:00 on 2027-03-14, so 02:30 never happens. Every pre-existing
  // caller relies on this: you must not offer an appointment slot at a moment
  // that does not exist, and the next slot covers the gap.
  assert.equal(zonedLocalToUtc("2027-03-14", 2 * 60 + 30, NY), null);
  assert.equal(zonedLocalToUtc("2027-03-14", 2 * 60 + 30, NY, {}), null, "empty options = skip");
  assert.equal(zonedLocalToUtc("2027-03-14", 2 * 60 + 30, NY, { gap: "skip" }), null);
  // Hours either side of the gap are unaffected.
  assert.ok(zonedLocalToUtc("2027-03-14", 1 * 60 + 30, NY));
  assert.ok(zonedLocalToUtc("2027-03-14", 3 * 60 + 30, NY));
});

test("POLICY next: a gap resolves to the instant the clock reaches", () => {
  // The Sessions & Classes Manager's measurement, kept verbatim as the
  // regression fixture: Europe/Madrid, 2027-03-28, wall clock 02:30.
  const at = zonedLocalToUtc("2027-03-28", 2 * 60 + 30, MADRID, { gap: "next" });
  assert.ok(at, "must resolve rather than skip");
  assert.equal(utcToZonedYmd(at, MADRID), "2027-03-28", "must stay on the intended day");
  assert.equal(utcToZonedHmm(at, MADRID), "03:30", "shifted forward by the width of the gap");
  // Same day in New York, whose transition is a different date, is unaffected.
  assert.equal(utcToZonedHmm(zonedLocalToUtc("2027-03-14", 2 * 60 + 30, NY, { gap: "next" })!, NY), "03:30");
});

test("the two policies differ ONLY inside a gap", () => {
  // If they diverged anywhere else, naming the policy at the call site would be
  // hiding a second difference rather than exposing the one that matters.
  const probes: Array<[string, number, string]> = [
    ["2027-03-09", 18 * 60, NY],
    ["2027-03-16", 18 * 60, NY],
    ["2027-11-07", 1 * 60 + 30, NY],   // fall-back ambiguity
    ["2027-03-28", 12 * 60, MADRID],   // the gap DAY, outside the gap hour
    ["2027-10-31", 2 * 60 + 30, MADRID], // fall-back, both policies agree
    ["2027-07-04", 0, NY],
  ];
  for (const [ymd, min, tz] of probes) {
    const skip = zonedLocalToUtc(ymd, min, tz, { gap: "skip" });
    const next = zonedLocalToUtc(ymd, min, tz, { gap: "next" });
    assert.equal(skip?.toISOString() ?? null, next?.toISOString() ?? null, `${ymd} ${min} ${tz}`);
    assert.ok(skip, `${ymd} ${min} ${tz} should resolve under both`);
  }
});

test("POLICY: a fall-back ambiguity returns the FIRST occurrence, earliest UTC", () => {
  // 01:30 happens twice on 2027-11-07. Both are real; the earlier one wins.
  const at = zonedLocalToUtc("2027-11-07", 1 * 60 + 30, NY);
  assert.equal(at?.toISOString(), "2027-11-07T05:30:00.000Z");
  assert.equal(utcToZonedHmm(at!, NY), "01:30", "must genuinely read 01:30");
  // The later one also reads 01:30, so this is a real choice, not an accident.
  assert.equal(utcToZonedHmm(new Date("2027-11-07T06:30:00.000Z"), NY), "01:30");
});

test("an invalid calendar date REFUSES rather than rolling over", () => {
  // Date.UTC(2027, 12, 40) is 2028-02-09, so the shape check alone let
  // weekdayUtc answer 3 about a date that does not exist.
  for (const bad of ["2027-13-40", "2027-02-30", "2027-00-10", "2027-01-00", "2027-1-5", "nope"]) {
    assert.equal(weekdayUtc(bad), null, `weekdayUtc ${bad}`);
    assert.equal(addUtcDays(bad, 1), null, `addUtcDays ${bad}`);
    assert.equal(zonedLocalToUtc(bad, 0, NY), null, `zonedLocalToUtc ${bad}`);
  }
  // A real leap day still works, so the guard is not over-tight.
  assert.equal(weekdayUtc("2028-02-29"), 2);
  assert.equal(addUtcDays("2028-02-28", 1), "2028-02-29");
});

test("minutesOfDay is bounded, so 24:00 cannot become tomorrow", () => {
  assert.ok(zonedLocalToUtc("2027-03-09", 0, NY));
  assert.ok(zonedLocalToUtc("2027-03-09", 1439, NY));
  for (const bad of [-1, 1440, 1.5, Number.NaN]) {
    assert.equal(zonedLocalToUtc("2027-03-09", bad, NY), null, String(bad));
  }
});

test("an unknown zone refuses rather than silently using UTC", () => {
  assert.equal(isValidIanaTimeZone("Not/AZone"), false);
  assert.equal(isValidIanaTimeZone(""), false);
  assert.equal(zonedLocalToUtc("2027-03-09", 0, "Not/AZone"), null);
  assert.equal(utcToZonedYmd(new Date(0), "Not/AZone"), null);
});

test("addUtcDays walks CIVIL days, so a 23- or 25-hour local day cannot shift it", () => {
  // Madrid's spring-forward Sunday is 23 hours and its fall-back Sunday is 25.
  // These are calendar-date steps, deliberately independent of any zone.
  assert.equal(addUtcDays("2027-03-27", 1), "2027-03-28");
  assert.equal(addUtcDays("2027-03-28", 1), "2027-03-29");
  assert.equal(addUtcDays("2027-10-30", 1), "2027-10-31");
  assert.equal(addUtcDays("2027-10-31", 1), "2027-11-01");
  assert.equal(addUtcDays("2027-12-31", 1), "2028-01-01", "across a year");
  assert.equal(addUtcDays("2027-03-09", -1), "2027-03-08", "backwards");
});

test("those Madrid days really are 23 and 25 hours, or the test above proves nothing", () => {
  // MIDNIGHT to midnight, not noon to noon. Noon on the transition day to noon on
  // the next is 24 hours, because both are on the same side of the change — the
  // short and long days only appear when you span the transition itself. My first
  // version of this helper measured noon and reported 24, which would have made
  // the test above look proven while proving nothing.
  const len = (d: string) => {
    const a = zonedLocalToUtc(d, 0, MADRID);
    const b = zonedLocalToUtc(addUtcDays(d, 1)!, 0, MADRID);
    return a && b ? (b.getTime() - a.getTime()) / 3_600_000 : null;
  };
  assert.equal(len("2027-03-28"), 23);
  assert.equal(len("2027-10-31"), 25);
  assert.equal(len("2027-03-27"), 24);
});

test("round trip: an instant reads back as the wall clock it was built from", () => {
  for (const [d, m] of [["2027-03-09", 18 * 60], ["2027-07-04", 9 * 60 + 5], ["2027-12-25", 0]] as const) {
    const at = zonedLocalToUtc(d, m, NY);
    assert.ok(at, `${d} ${m}`);
    assert.equal(utcToZonedYmd(at, NY), d);
    assert.equal(utcToZonedHmm(at, NY), minutesToHmm(m));
  }
});

test("weekdayUtc is JS 0=Sunday, and callers converting to isodow must shift", () => {
  assert.equal(weekdayUtc("2027-03-14"), 0, "Sunday");
  assert.equal(weekdayUtc("2027-03-09"), 2, "Tuesday");
});

// ── resolveWallClock: the shift has to be visible ───────────────────────────

test("gap:next COLLAPSES two wall clocks onto one instant — the reason shift is reported", () => {
  // Found by the Reservations Manager, reproduced by Sessions & Classes, and
  // reproduced again here so the collapse is pinned rather than remembered.
  const at0230 = zonedLocalToUtc("2027-03-28", 2 * 60 + 30, MADRID, { gap: "next" })!;
  const at0330 = zonedLocalToUtc("2027-03-28", 3 * 60 + 30, MADRID, { gap: "next" })!;
  assert.equal(at0230.getTime(), at0330.getTime(), "two clocks, one instant");
  assert.equal(utcToZonedHmm(at0230, MADRID), "03:30");

  // A caller holding only Dates cannot tell these apart. resolveWallClock can:
  // the 02:30 one was SHIFTED out of the gap, the 03:30 one is EXACT. That is
  // the difference between a club selling one room twice on gap night and
  // refusing the second show.
  assert.equal(resolveWallClock("2027-03-28", 2 * 60 + 30, MADRID, { gap: "next" }).kind, "shifted");
  assert.equal(resolveWallClock("2027-03-28", 3 * 60 + 30, MADRID, { gap: "next" }).kind, "exact");
});

test("resolveWallClock names every outcome", () => {
  assert.equal(resolveWallClock("2027-03-09", 18 * 60, NY).kind, "exact");
  assert.equal(resolveWallClock("2027-11-07", 1 * 60 + 30, NY).kind, "ambiguous",
    "the clock reads 01:30 twice that day");
  assert.equal(resolveWallClock("2027-03-14", 2 * 60 + 30, NY, { gap: "skip" }).kind, "nonexistent");
  assert.equal(resolveWallClock("2027-03-14", 2 * 60 + 30, NY, { gap: "next" }).kind, "shifted");
  assert.equal(resolveWallClock("2027-13-40", 0, NY).kind, "nonexistent", "invalid date");
  assert.equal(resolveWallClock("2027-03-09", 0, "Not/AZone").kind, "nonexistent", "unknown zone");
});

test("the ambiguous instant is the EARLIER one, and it genuinely reads back", () => {
  const r = resolveWallClock("2027-11-07", 1 * 60 + 30, NY);
  assert.equal(r.kind, "ambiguous");
  if (r.kind !== "ambiguous") return;
  assert.equal(r.instant.toISOString(), "2027-11-07T05:30:00.000Z");
  assert.equal(utcToZonedHmm(r.instant, NY), "01:30");
});

test("zonedLocalToUtc stays the convenience wrapper and agrees with resolveWallClock", () => {
  const probes: Array<[string, number, string, "skip" | "next"]> = [
    ["2027-03-09", 18 * 60, NY, "skip"],
    ["2027-03-14", 2 * 60 + 30, NY, "skip"],
    ["2027-03-14", 2 * 60 + 30, NY, "next"],
    ["2027-11-07", 1 * 60 + 30, NY, "skip"],
    ["2027-03-28", 2 * 60 + 30, MADRID, "next"],
  ];
  for (const [ymd, min, tz, gap] of probes) {
    const r = resolveWallClock(ymd, min, tz, { gap });
    const d = zonedLocalToUtc(ymd, min, tz, { gap });
    assert.equal(d?.toISOString() ?? null, r.kind === "nonexistent" ? null : r.instant.toISOString(),
      `${ymd} ${min} ${tz} ${gap}`);
  }
});

// ── zonedWindow: a duration is added to the INSTANT, never to the clock ─────

test("a 90-minute turn is 90 REAL minutes on a spring-forward day", () => {
  // The Reservations Manager's case, kept as the regression fixture. Computing
  // an end WALL CLOCK and resolving it releases the table an hour early and
  // frees its capacity unit while the party is still eating — and the arithmetic
  // is correct throughout, so there is no anomaly to find afterwards.
  const w = zonedWindow("2027-03-28", 1 * 60 + 30, 90, MADRID, { gap: "next" });
  assert.ok(w);
  assert.equal((w.endsAt.getTime() - w.startsAt.getTime()) / 60_000, 90, "ninety REAL minutes");
  assert.equal(utcToZonedHmm(w.startsAt, MADRID), "01:30");
  assert.equal(utcToZonedHmm(w.endsAt, MADRID), "04:00", "the clock jumped an hour under it");

  // The wrong way, demonstrated so the test proves the bug and not just the fix.
  const wrongEnd = zonedLocalToUtc("2027-03-28", 1 * 60 + 30 + 90, MADRID, { gap: "next" })!;
  assert.equal((wrongEnd.getTime() - w.startsAt.getTime()) / 60_000, 30,
    "wall clock + 90m holds the table THIRTY minutes");
});

test("an ordinary day is unaffected, so the fix is not a special case", () => {
  const w = zonedWindow("2027-03-27", 19 * 60, 90, MADRID);
  assert.ok(w);
  assert.equal((w.endsAt.getTime() - w.startsAt.getTime()) / 60_000, 90);
  assert.equal(utcToZonedHmm(w.startsAt, MADRID), "19:00");
  assert.equal(utcToZonedHmm(w.endsAt, MADRID), "20:30");
});

test("zonedWindow carries the START's resolution, so a shifted start stays visible", () => {
  assert.equal(zonedWindow("2027-03-28", 2 * 60 + 30, 60, MADRID, { gap: "next" })?.kind, "shifted");
  assert.equal(zonedWindow("2027-03-27", 19 * 60, 60, MADRID)?.kind, "exact");
  assert.equal(zonedWindow("2027-11-07", 1 * 60 + 30, 60, NY)?.kind, "ambiguous");
});

test("zonedWindow refuses rather than inventing a window", () => {
  assert.equal(zonedWindow("2027-03-28", 2 * 60 + 30, 60, MADRID, { gap: "skip" }), null,
    "a start that does not exist has no window");
  for (const bad of [0, -30, 1.5, Number.NaN]) {
    assert.equal(zonedWindow("2027-03-27", 19 * 60, bad, MADRID), null, `duration ${bad}`);
  }
  assert.equal(zonedWindow("2027-13-40", 0, 60, MADRID), null, "invalid date");
});

test("a fall-back day's window crosses the repeated hour and is still its full length", () => {
  // 01:30 + 90m on the 25-hour day. The clock reads 02:00 at the end, not 03:00,
  // because an hour is lived twice underneath it.
  const w = zonedWindow("2027-10-31", 1 * 60 + 30, 90, MADRID);
  assert.ok(w);
  assert.equal((w.endsAt.getTime() - w.startsAt.getTime()) / 60_000, 90);
  assert.equal(utcToZonedHmm(w.endsAt, MADRID), "02:00");
});

// ── not every DST shift is an hour ─────────────────────────────────────────

test("a THIRTY-MINUTE fall-back is detected, and still returns the earliest", () => {
  // Australia/Lord_Howe shifts by 30 minutes. Probing a hardcoded 3_600_000 ms
  // could not see the overlap, so a genuinely ambiguous 01:45 was reported
  // "exact" AND returned the LATER instant — silently breaking the earliest-UTC
  // rule this module documents as unconditional. Found in review by the
  // Sessions & Classes Manager.
  const LH = "Australia/Lord_Howe";

  // First prove the overlap is real, or the rest of the test asserts nothing.
  assert.equal(utcToZonedHmm(new Date("2027-04-03T14:45:00.000Z"), LH), "01:45");
  assert.equal(utcToZonedHmm(new Date("2027-04-03T15:15:00.000Z"), LH), "01:45");

  const r = resolveWallClock("2027-04-04", 1 * 60 + 45, LH);
  assert.equal(r.kind, "ambiguous", "a 30-minute overlap is still an overlap");
  if (r.kind !== "ambiguous") return;
  assert.equal(r.instant.toISOString(), "2027-04-03T14:45:00.000Z", "the EARLIER of the two");

  // A time outside the overlap on the same day is still exact.
  assert.equal(resolveWallClock("2027-04-04", 2 * 60, LH).kind, "exact");
});

test("an ordinary day is EXACT, not ambiguous — the dedupe is load-bearing", () => {
  // Both day-samples give the same offset on an ordinary day, so the two
  // candidates are the same instant. Without deduping, `matching.length` is 2
  // and every ordinary time reports ambiguous. Caught by an existing test when
  // the dedupe was briefly dropped.
  assert.equal(resolveWallClock("2027-03-09", 18 * 60, NY).kind, "exact");
  assert.equal(resolveWallClock("2027-07-04", 12 * 60, MADRID).kind, "exact");
  assert.equal(resolveWallClock("2027-01-15", 9 * 60, "Australia/Lord_Howe").kind, "exact");
});

test("the gap answer is the later candidate in BOTH offset signs", () => {
  // Math.max reads as "pick the later", which is right in a positive-offset zone
  // by construction and not obviously right in a negative one. It is: the later
  // candidate is built from the pre-transition offset, which is the side the
  // requested clock falls off, in either hemisphere.
  const ny = resolveWallClock("2027-03-14", 2 * 60 + 30, NY, { gap: "next" });
  assert.equal(ny.kind, "shifted");
  if (ny.kind === "shifted") assert.equal(utcToZonedHmm(ny.instant, NY), "03:30");

  const madrid = resolveWallClock("2027-03-28", 2 * 60 + 30, MADRID, { gap: "next" });
  assert.equal(madrid.kind, "shifted");
  if (madrid.kind === "shifted") assert.equal(utcToZonedHmm(madrid.instant, MADRID), "03:30");
});
