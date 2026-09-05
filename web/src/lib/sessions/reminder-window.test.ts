/**
 * UNIT TEST — reminder-window.ts.
 *
 * Runs in `test:sessions` (glob lane). `tsx --test` executes without
 * typechecking, so a pass here is not a claim that the branch compiles.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  decideSessionReminder,
  reminderQueryWindow,
  type RemindableSession,
} from "./reminder-window";

const CANCUN = "America/Cancun"; // UTC-5, no DST
const MADRID = "Europe/Madrid"; // UTC+1/+2, DST

function session(over: Partial<RemindableSession> = {}): RemindableSession {
  return {
    id: "s1",
    startsAt: "2027-06-16T01:00:00.000Z",
    status: "scheduled",
    timeZone: CANCUN,
    ...over,
  };
}

// ── The bug this file exists to not repeat ─────────────────────────────────

test("a 20:00 class in Cancun is NOT reminded a day early, though it is 01:00Z tomorrow", () => {
  // 2027-06-16T01:00Z is 2027-06-15 20:00 in Cancun. A UTC-based sweep run on
  // the 14th would see "the 16th" and call it two days out; run on the 15th it
  // would see tomorrow and remind — a day early for the venue.
  //
  // Correct: on the 14th LOCAL it is tomorrow; on the 15th local it is today.
  const onThe14thLocal = new Date("2027-06-14T18:00:00.000Z"); // 13:00 Cancun on the 14th
  const d = decideSessionReminder(session(), onThe14thLocal);
  assert.equal(d.send, true);
  if (!d.send) return;
  assert.equal(d.localDate, "2027-06-15");

  const onTheDayLocal = new Date("2027-06-15T18:00:00.000Z"); // 13:00 Cancun on the 15th
  const same = decideSessionReminder(session(), onTheDayLocal);
  assert.equal(same.send, false);
  assert.equal(same.send === false && same.reason, "not_tomorrow");
});

test("a 01:00 show in Madrid is not reminded a day LATE, though it is 23:00Z the day before", () => {
  // 2027-06-16T23:00Z is 2027-06-17 01:00 in Madrid (UTC+2 in June). A UTC
  // sweep reads the instant's date as the 16th and would fire a day late
  // relative to the venue's calendar.
  const s = session({ startsAt: "2027-06-16T23:00:00.000Z", timeZone: MADRID });
  const dayBeforeLocal = new Date("2027-06-16T10:00:00.000Z"); // 12:00 Madrid on the 16th
  const d = decideSessionReminder(s, dayBeforeLocal);
  assert.equal(d.send, true);
  if (!d.send) return;
  assert.equal(d.localDate, "2027-06-17");
});

test("two venues in different zones do NOT share a tomorrow", () => {
  // The same instant is a different local date in each, which is the whole
  // reason a single UTC sweep cannot serve both.
  const instant = "2027-06-16T01:00:00.000Z";
  const now = new Date("2027-06-14T18:00:00.000Z");
  const cancun = decideSessionReminder(session({ startsAt: instant, timeZone: CANCUN }), now);
  const madrid = decideSessionReminder(
    session({ id: "s2", startsAt: instant, timeZone: MADRID }),
    now,
  );
  assert.equal(cancun.send, true, "Cancun: 15 June local, tomorrow on the 14th");
  // In Madrid that instant is 03:00 on the 16th — two days out, not tomorrow.
  assert.equal(madrid.send, false);
  assert.equal(madrid.send === false && madrid.reason, "not_tomorrow");
});

// ── DST: a local day is not 24 hours ───────────────────────────────────────

test("tomorrow is a CALENDAR day across a spring-forward, not 24 hours", () => {
  // Madrid springs forward on 2027-03-28, so 27 March is 23 hours long. A
  // `now + 86_400_000` implementation lands on the wrong side of midnight.
  const s = session({ startsAt: "2027-03-28T16:00:00.000Z", timeZone: MADRID }); // 18:00 local on the 28th
  const dayBefore = new Date("2027-03-27T12:00:00.000Z"); // 13:00 Madrid on the 27th
  const d = decideSessionReminder(s, dayBefore);
  assert.equal(d.send, true);
  if (!d.send) return;
  assert.equal(d.localDate, "2027-03-28");
});

test("tomorrow is a calendar day across an autumn fall-back too", () => {
  // 31 October 2027 is 25 hours in Madrid.
  const s = session({ startsAt: "2027-10-31T17:00:00.000Z", timeZone: MADRID }); // 18:00 local
  const dayBefore = new Date("2027-10-30T12:00:00.000Z"); // 14:00 Madrid on the 30th
  const d = decideSessionReminder(s, dayBefore);
  assert.equal(d.send, true);
  if (!d.send) return;
  assert.equal(d.localDate, "2027-10-31");
});

// ── Refusals are not "not tomorrow" ────────────────────────────────────────

test("no confirmed zone REFUSES rather than guessing UTC, and says which problem it is", () => {
  // The commonest real case: every production venue is on the NOT NULL DEFAULT.
  // A reminder at a guessed hour is a plausible wrong answer.
  for (const tz of [null, "", "  "]) {
    const d = decideSessionReminder(session({ timeZone: tz }), new Date("2027-06-14T18:00:00.000Z"));
    assert.equal(d.send, false);
    assert.equal(d.send === false && d.reason, "timezone_unconfirmed");
  }
});

test("an unconfirmed zone and an UNKNOWN zone are different refusals", () => {
  // Two problems, two fixes: open the venue screen, versus that string is not a
  // zone. One label for both sends the operator to the wrong screen.
  const d = decideSessionReminder(
    session({ timeZone: "Mars/Olympus" }),
    new Date("2027-06-14T18:00:00.000Z"),
  );
  assert.equal(d.send === false && d.reason, "timezone_unknown");
});

test("a cancelled session never reminds", () => {
  // Telling somebody to turn up to a class that was called off is worse than
  // telling them nothing.
  const d = decideSessionReminder(
    session({ status: "cancelled" }),
    new Date("2027-06-14T18:00:00.000Z"),
  );
  assert.equal(d.send, false);
  assert.equal(d.send === false && d.reason, "not_scheduled");
});

test("an unparseable start refuses rather than resolving to something plausible", () => {
  const d = decideSessionReminder(
    session({ startsAt: "not-a-date" }),
    new Date("2027-06-14T18:00:00.000Z"),
  );
  assert.equal(d.send === false && d.reason, "invalid_start");
});

test("REFUSALS ARE DISTINCT FROM not_tomorrow, which is the whole reporting point", () => {
  // "Not tomorrow" is the normal answer for almost every row on almost every
  // run. A refusal means this session can NEVER be reminded about. Collapsing
  // them hides a silently un-remindable workspace inside a normal Tuesday.
  const now = new Date("2027-06-14T18:00:00.000Z");
  const normal = decideSessionReminder(session({ startsAt: "2027-12-01T18:00:00.000Z" }), now);
  assert.equal(normal.send === false && normal.reason, "not_tomorrow");
  const broken = decideSessionReminder(session({ timeZone: null }), now);
  assert.notEqual(
    normal.send === false && normal.reason,
    broken.send === false && broken.reason,
  );
});

// ── The query window ───────────────────────────────────────────────────────

test("the query window is WIDER than 24 hours, because zones span UTC-12 to UTC+14", () => {
  // Narrowing it to exactly a day would silently drop the venues furthest from
  // UTC — the same class of bug the file is named after, moved into the query.
  const now = new Date("2027-06-14T18:00:00.000Z");
  const w = reminderQueryWindow(now);
  const span = Date.parse(w.toIso) - Date.parse(w.fromIso);
  assert.ok(span > 26 * 3_600_000, `window too narrow: ${span / 3_600_000}h`);
  assert.ok(Date.parse(w.fromIso) < now.getTime());
  assert.ok(Date.parse(w.toIso) > now.getTime());
});
