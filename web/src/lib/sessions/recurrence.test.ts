/**
 * The DST tests are the reason this library exists.
 *
 * Several assert something the obvious implementation gets WRONG, and they say
 * so, because a test that only passes on correct code proves nothing about the
 * bug it was written for. `naiveWeekly` below is the implementation this library
 * replaces; where a test names it, it is demonstrating the failure rather than
 * decorating the pass.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  type SeriesSpec,
  expandSeries,
  isoWeekdayOf,
  localDateIn,
  localTimeIn,
  parseLocalTime,
  zonedWallClockToUtc,
} from "./recurrence";

const NY = "America/New_York";
// US DST in 2027: forward Sun 14 Mar, back Sun 7 Nov.
const SPRING_FORWARD = "2027-03-14";

function tuesdays(overrides: Partial<SeriesSpec> = {}): SeriesSpec {
  return {
    localTime: "18:00",
    timeZone: NY,
    weekdays: [2],
    durationMinutes: 60,
    startsOn: "2027-03-01",
    endsOn: "2027-03-31",
    ...overrides,
  };
}

const occDates = (occ: { localDate: string }[]) => occ.map((o) => o.localDate);

/** Next calendar date, for measuring how long a local day actually is. */
function addDay(localDate: string): string {
  const [y, m, d] = localDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** What this library replaces: add 7x24h to the previous occurrence. */
function naiveWeekly(firstIso: string, count: number): string[] {
  const out = [firstIso];
  for (let i = 1; i < count; i++) {
    out.push(new Date(Date.parse(out[i - 1]) + 7 * 86_400_000).toISOString());
  }
  return out;
}

test("parseLocalTime accepts the shapes a form produces and rejects nonsense", () => {
  assert.equal(parseLocalTime("18:00"), 18 * 60);
  assert.equal(parseLocalTime("18:00:00"), 18 * 60);
  assert.equal(parseLocalTime("09:05"), 9 * 60 + 5);
  assert.equal(parseLocalTime("00:00"), 0);
  for (const bad of ["24:00", "18:60", "6pm", "", "18", "-1:00"]) {
    assert.equal(parseLocalTime(bad), null, bad);
  }
});

test("isoWeekdayOf matches Postgres isodow, Sunday = 7", () => {
  assert.equal(isoWeekdayOf("2027-03-08"), 1, "Monday");
  assert.equal(isoWeekdayOf("2027-03-09"), 2, "Tuesday");
  assert.equal(isoWeekdayOf("2027-03-14"), 7, "Sunday");
  assert.equal(isoWeekdayOf("nope"), null);
});

test("EVERY occurrence stays at 18:00 local across a spring-forward boundary", () => {
  const occ = expandSeries(tuesdays(), "2027-03-01", "2027-03-31");
  assert.equal(occ.length, 5, "five Tuesdays in March 2027");
  for (const o of occ) {
    assert.equal(localTimeIn(new Date(o.startsAt), NY), "18:00", `${o.localDate} drifted`);
  }
  // And the boundary really is inside this range, or the test proves nothing.
  assert.ok(occ.some((o) => o.localDate < SPRING_FORWARD));
  assert.ok(occ.some((o) => o.localDate > SPRING_FORWARD));
});

test("the naive 7x24h expansion DOES drift — this is the bug being prevented", () => {
  const occ = expandSeries(tuesdays(), "2027-03-01", "2027-03-31");
  const naive = naiveWeekly(occ[0].startsAt, occ.length);

  // Before the transition the two agree...
  assert.equal(naive[1], occ[1].startsAt, "same before the boundary");
  // ...and after it they do not.
  assert.notEqual(naive[2], occ[2].startsAt, "naive must diverge after the boundary");
  assert.equal(localTimeIn(new Date(naive[2]), NY), "19:00", "naive puts the class an hour late");
  assert.equal(localTimeIn(new Date(occ[2].startsAt), NY), "18:00", "ours stays put");
});

test("the UTC offset genuinely changes mid-series, so this is not a same-offset illusion", () => {
  const occ = expandSeries(tuesdays(), "2027-03-01", "2027-03-31");
  const offsets = occ.map((o) => new Date(o.startsAt).getUTCHours());
  assert.equal(new Set(offsets).size, 2, "the UTC hour must differ either side of the boundary");
  assert.equal(offsets[0], 23, "EST: 18:00 local is 23:00Z");
  assert.equal(offsets.at(-1), 22, "EDT: 18:00 local is 22:00Z");
});

test("autumn fall-back holds too, in the other direction", () => {
  const occ = expandSeries(
    tuesdays({ startsOn: "2027-11-01", endsOn: "2027-11-30" }),
    "2027-11-01",
    "2027-11-30",
  );
  assert.ok(occ.length >= 4);
  for (const o of occ) {
    assert.equal(localTimeIn(new Date(o.startsAt), NY), "18:00", `${o.localDate} drifted`);
  }
});

test("a southern-hemisphere zone shifts the opposite way and still holds", () => {
  const tz = "Australia/Sydney";
  const occ = expandSeries(
    tuesdays({ timeZone: tz, startsOn: "2027-03-25", endsOn: "2027-04-20" }),
    "2027-03-25",
    "2027-04-20",
  );
  assert.ok(occ.length >= 3);
  for (const o of occ) {
    assert.equal(localTimeIn(new Date(o.startsAt), tz), "18:00", `${o.localDate} drifted`);
  }
});

test("a zone with NO dst is unaffected — Mexico abolished it in 2022", () => {
  const tz = "America/Cancun";
  const occ = expandSeries(tuesdays({ timeZone: tz }), "2027-03-01", "2027-03-31");
  const hours = new Set(occ.map((o) => new Date(o.startsAt).getUTCHours()));
  assert.equal(hours.size, 1, "a fixed-offset zone must not vary");
  for (const o of occ) assert.equal(localTimeIn(new Date(o.startsAt), tz), "18:00");
});

test("each occurrence's localDate is the day it actually falls on in the zone", () => {
  const occ = expandSeries(tuesdays(), "2027-03-01", "2027-03-31");
  for (const o of occ) {
    assert.equal(localDateIn(new Date(o.startsAt), NY), o.localDate);
  }
});

test("ends_at is the duration after starts_at, measured in real time", () => {
  const occ = expandSeries(tuesdays({ durationMinutes: 90 }), "2027-03-01", "2027-03-31");
  for (const o of occ) {
    assert.equal(Date.parse(o.endsAt) - Date.parse(o.startsAt), 90 * 60_000);
  }
});

test("the window clips both ways, and series bounds win over the query", () => {
  const spec = tuesdays({ startsOn: "2027-03-09", endsOn: "2027-03-16" });
  const occ = expandSeries(spec, "2027-03-01", "2027-03-31");
  assert.deepEqual(occ.map((o) => o.localDate), ["2027-03-09", "2027-03-16"]);
  // A query narrower than the series wins in the other direction.
  const narrow = expandSeries(spec, "2027-03-10", "2027-03-31");
  assert.deepEqual(narrow.map((o) => o.localDate), ["2027-03-16"]);
});

test("an open-ended series is bounded by the query, not by nothing", () => {
  const occ = expandSeries(tuesdays({ endsOn: null }), "2027-03-01", "2027-03-31");
  assert.equal(occ.length, 5);
});

test("several weekdays expand in date order, not weekday order", () => {
  const occ = expandSeries(
    tuesdays({ weekdays: [4, 2], startsOn: "2027-03-01", endsOn: "2027-03-14" }),
    "2027-03-01",
    "2027-03-14",
  );
  assert.deepEqual(
    occ.map((o) => o.localDate),
    ["2027-03-02", "2027-03-04", "2027-03-09", "2027-03-11"],
  );
});

test("a spring-forward GAP day still HAS its class — it does not vanish", () => {
  // The studio opens and the teacher turns up on the gap day, so the occurrence
  // must exist. Sessions pass gap:"next"; the resolver shifts the class forward by
  // the width of the gap rather than deleting it.
  //
  // The opposite policy — return null, skip the occurrence — is correct for an
  // APPOINTMENT SLOT and lives in the same function behind gap:"skip", which is
  // the default. Both are right for their caller, which is why the choice is
  // named at the call site instead of one silently winning.
  const at = zonedWallClockToUtc(SPRING_FORWARD, 2 * 60 + 30, NY);
  assert.ok(at, "the occurrence must exist, not be skipped");
  assert.equal(localDateIn(at, NY), SPRING_FORWARD, "on the intended day");
  assert.equal(localTimeIn(at, NY), "03:30", "shifted by the width of the gap");

  // A weekly class whose local time falls in the gap keeps every occurrence.
  const occ = expandSeries(
    tuesdays({ localTime: "02:30", weekdays: [7], startsOn: "2027-03-07", endsOn: "2027-03-21" }),
    "2027-03-07",
    "2027-03-21",
  );
  assert.deepEqual(occDates(occ), ["2027-03-07", SPRING_FORWARD, "2027-03-21"],
    "no Sunday may be missing, including the gap day");
});

test("garbage in returns nothing rather than throwing", () => {
  assert.deepEqual(expandSeries(tuesdays({ localTime: "6pm" }), "2027-03-01", "2027-03-31"), []);
  assert.deepEqual(expandSeries(tuesdays({ weekdays: [] }), "2027-03-01", "2027-03-31"), []);
  assert.deepEqual(expandSeries(tuesdays({ durationMinutes: 0 }), "2027-03-01", "2027-03-31"), []);
  assert.deepEqual(expandSeries(tuesdays({ timeZone: "Not/AZone" }), "2027-03-01", "2027-03-31"), []);
  assert.equal(zonedWallClockToUtc("2027-13-40", 0, NY), null);
});

test("an inverted window yields nothing rather than spinning", () => {
  assert.deepEqual(expandSeries(tuesdays(), "2027-03-31", "2027-03-01"), []);
});

test("autumn AMBIGUITY resolves to the first time the clock reads that hour", () => {
  // 2027-11-07, New York: the clock repeats 01:00 -> 02:00, so 01:30 happens
  // twice. Documented behaviour is "take the earlier"; untested documentation is
  // just a claim, so this pins it.
  const at = zonedWallClockToUtc("2027-11-07", 1 * 60 + 30, NY);
  assert.ok(at);
  assert.equal(localTimeIn(at, NY), "01:30", "must actually read 01:30");
  assert.equal(at.toISOString(), "2027-11-07T05:30:00.000Z", "the EDT one, 05:30Z, not 06:30Z");
  // Prove the later one is a real alternative and we deliberately did not pick it.
  assert.equal(localTimeIn(new Date("2027-11-07T06:30:00.000Z"), NY), "01:30");
});

test("a date that does not exist is rejected, not rolled over", () => {
  // Date.UTC rolls 2027-13-40 into 2028-02-09; a malformed date became a valid
  // instant a year away rather than an error.
  for (const bad of ["2027-13-40", "2027-02-30", "2027-00-10", "2027-01-00", "2027-1-5"]) {
    assert.equal(zonedWallClockToUtc(bad, 0, NY), null, bad);
    assert.equal(isoWeekdayOf(bad), null, bad);
  }
  // and a real leap day still works
  assert.equal(isoWeekdayOf("2028-02-29"), 2);
});

test("a LOCAL DAY IS NOT 24 HOURS, and date iteration must not care", () => {
  // Spaces & Seating's finding: Madrid's fall-back Sunday is 25 hours long and
  // its spring-forward Sunday is 23. A resolver that walked LOCAL time by
  // 86_400_000 ms would skip or duplicate a date on exactly those days.
  //
  // This one iterates calendar dates in UTC space — where a day is always 24
  // hours because UTC has no DST — and resolves each date's instant
  // independently. So the short and long days are structurally invisible to the
  // iteration. This test proves that rather than assuming it.
  const madrid = "Europe/Madrid";
  const daily = expandSeries(
    {
      localTime: "18:00",
      timeZone: madrid,
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      durationMinutes: 60,
      startsOn: "2027-03-26",
      endsOn: "2027-04-01",
    },
    "2027-03-26",
    "2027-04-01",
  );

  // EU spring forward 2027 is Sunday 28 March. Seven days requested, seven back,
  // none skipped and none repeated — including the 23-hour day.
  assert.deepEqual(occDates(daily), [
    "2027-03-26",
    "2027-03-27",
    "2027-03-28", // 23 hours long
    "2027-03-29",
    "2027-03-30",
    "2027-03-31",
    "2027-04-01",
  ]);
  for (const o of daily) {
    assert.equal(localTimeIn(new Date(o.startsAt), madrid), "18:00", `${o.localDate} drifted`);
  }

  // And the 25-hour day in autumn, which is where a naive walk duplicates.
  const autumn = expandSeries(
    {
      localTime: "18:00",
      timeZone: madrid,
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      durationMinutes: 60,
      startsOn: "2027-10-29",
      endsOn: "2027-11-02",
    },
    "2027-10-29",
    "2027-11-02",
  );
  assert.deepEqual(occDates(autumn), [
    "2027-10-29",
    "2027-10-30",
    "2027-10-31", // 25 hours long
    "2027-11-01",
    "2027-11-02",
  ]);
  assert.equal(new Set(occDates(autumn)).size, autumn.length, "no date may repeat");
});

test("the short and long days really are short and long, or the test above proves nothing", () => {
  const madrid = "Europe/Madrid";
  const dayLength = (date: string) => {
    const a = zonedWallClockToUtc(date, 0, madrid);
    const b = zonedWallClockToUtc(addDay(date), 0, madrid);
    return a && b ? (b.getTime() - a.getTime()) / 3_600_000 : null;
  };
  assert.equal(dayLength("2027-03-28"), 23, "spring forward: a 23-hour day");
  assert.equal(dayLength("2027-10-31"), 25, "fall back: a 25-hour day");
  assert.equal(dayLength("2027-03-27"), 24, "an ordinary day");
});
