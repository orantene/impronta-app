/**
 * The resolver, tested at the hours it actually gets scanned.
 *
 * Every case here is a real scan: a guest at a table at 23:30, someone at the
 * door at 19:00 on a Friday, a phone held up at 02:00 when the window that
 * covers it started yesterday. The rule list is configuration a user writes, so
 * the tests that matter most are the ones where the user wrote something
 * slightly wrong and a guest is the one who finds out.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  isWithinWindow,
  resolveTarget,
  validateTargets,
  zonedNowIn,
  type TargetRule,
  type ZonedNow,
} from "./resolve-target";

const TICKETS = { to: "/events/tonight", label: "tickets" };
const MENU = { to: "/menu", label: "menu" };
const RESERVE = { to: "/reserve", label: "reserve" };

const at = (hour: number, minute = 0, weekday: ZonedNow["weekday"] = 5): ZonedNow => ({
  minuteOfDay: hour * 60 + minute,
  weekday,
});

// ── The exit proof for Q1 ────────────────────────────────────────────────────

test("the door code sells tickets at 19:00 and the menu at 23:30, from one printed code", () => {
  const doorCode: TargetRule[] = [
    { when: "event_before_doors", to: TICKETS },
    { when: "event_after_doors", to: MENU },
    { when: "always", to: RESERVE },
  ];
  const eventNight = { eventTonight: { doorsAtMinute: 20 * 60 } };

  const early = resolveTarget(doorCode, at(19), eventNight);
  assert.deepEqual(early, { ok: true, destination: TICKETS });

  const late = resolveTarget(doorCode, at(23, 30), eventNight);
  assert.deepEqual(late, { ok: true, destination: MENU });

  // Same code, no event on: neither event rule matches and the default answers.
  const quietNight = resolveTarget(doorCode, at(23, 30), { eventTonight: null });
  assert.deepEqual(quietNight, { ok: true, destination: RESERVE });
});

// ── Refusing rather than guessing ────────────────────────────────────────────

test("a rule list with no default is refused, not resolved to something plausible", () => {
  const noDefault: TargetRule[] = [{ when: "event_before_doors", to: TICKETS }];
  assert.deepEqual(resolveTarget(noDefault, at(19), { eventTonight: { doorsAtMinute: 1200 } }), {
    ok: false,
    reason: "no_default",
  });
});

test("an empty rule list is refused", () => {
  assert.deepEqual(resolveTarget([], at(12)), { ok: false, reason: "no_default" });
});

test("a default that is not last is refused, because the rules after it are unreachable", () => {
  const wrongOrder: TargetRule[] = [
    { when: "always", to: MENU },
    { when: "event_before_doors", to: TICKETS },
  ];
  assert.deepEqual(resolveTarget(wrongOrder, at(19)), { ok: false, reason: "no_default" });
  assert.equal(validateTargets(wrongOrder).ok, false);
});

// ── The unknown is not a "no" ────────────────────────────────────────────────

test("an events read that FAILED falls to the default instead of claiming nothing is on", () => {
  // `undefined` = we could not find out. If this matched `nothing_on`, a failed
  // read would quietly send a sold-out crowd to the reservations page while the
  // show they came for was selling inside.
  const doorCode: TargetRule[] = [
    { when: "nothing_on", to: RESERVE },
    { when: "always", to: MENU },
  ];
  assert.deepEqual(resolveTarget(doorCode, at(19), {}), { ok: true, destination: MENU });

  // Whereas a KNOWN quiet night does match it.
  assert.deepEqual(resolveTarget(doorCode, at(19), { eventTonight: null }), {
    ok: true,
    destination: RESERVE,
  });
});

// ── Midnight, the hour these links exist for ─────────────────────────────────

test("a window that crosses midnight is one window, not an empty one", () => {
  // 22:00 to 02:00 — the hours a nightclub's code matters most.
  assert.equal(isWithinWindow(23 * 60, 22 * 60, 2 * 60), true);
  assert.equal(isWithinWindow(0, 22 * 60, 2 * 60), true);
  assert.equal(isWithinWindow(60, 22 * 60, 2 * 60), true);
  assert.equal(isWithinWindow(3 * 60, 22 * 60, 2 * 60), false);
  assert.equal(isWithinWindow(21 * 60, 22 * 60, 2 * 60), false);
});

test("windows are half-open, so two adjacent windows never both claim the boundary", () => {
  // If this were closed, "18:00-22:00" and "22:00-02:00" would both match
  // 22:00 and first-match would silently pick one. Which one would depend on
  // the order the user happened to drag them into.
  assert.equal(isWithinWindow(22 * 60, 18 * 60, 22 * 60), false);
  assert.equal(isWithinWindow(22 * 60, 22 * 60, 2 * 60), true);
  assert.equal(isWithinWindow(18 * 60, 18 * 60, 22 * 60), true);
});

test("a zero-width window matches nothing rather than everything", () => {
  assert.equal(isWithinWindow(12 * 60, 12 * 60, 12 * 60), false);
  assert.equal(isWithinWindow(0, 12 * 60, 12 * 60), false);
});

test("a scan at 01:00 hits the window that started at 22:00 yesterday", () => {
  const lateNight: TargetRule[] = [
    { when: "time_of_day", fromMinute: 22 * 60, toMinute: 2 * 60, to: MENU },
    { when: "always", to: RESERVE },
  ];
  assert.deepEqual(resolveTarget(lateNight, at(1)), { ok: true, destination: MENU });
  assert.deepEqual(resolveTarget(lateNight, at(3)), { ok: true, destination: RESERVE });
});

// ── Weekdays ─────────────────────────────────────────────────────────────────

test("a weekday-restricted window ignores the other days", () => {
  const weekendOnly: TargetRule[] = [
    { when: "time_of_day", fromMinute: 20 * 60, toMinute: 23 * 60, days: [5, 6], to: TICKETS },
    { when: "always", to: MENU },
  ];
  assert.deepEqual(resolveTarget(weekendOnly, at(21, 0, 5)), { ok: true, destination: TICKETS });
  assert.deepEqual(resolveTarget(weekendOnly, at(21, 0, 6)), { ok: true, destination: TICKETS });
  assert.deepEqual(resolveTarget(weekendOnly, at(21, 0, 2)), { ok: true, destination: MENU });
});

test("an empty days array means every day, not no day", () => {
  // A user who opens the day picker and unticks everything has expressed
  // nothing, not "never". Treating it as "never" would make the rule silently
  // dead while still showing in the editor as configured.
  const rules: TargetRule[] = [
    { when: "time_of_day", fromMinute: 20 * 60, toMinute: 23 * 60, days: [], to: TICKETS },
    { when: "always", to: MENU },
  ];
  assert.deepEqual(resolveTarget(rules, at(21, 0, 3)), { ok: true, destination: TICKETS });
});

// ── First match wins ─────────────────────────────────────────────────────────

test("the first matching rule wins, so order is the user's tie-break", () => {
  const rules: TargetRule[] = [
    { when: "time_of_day", fromMinute: 0, toMinute: 1439, to: TICKETS },
    { when: "time_of_day", fromMinute: 0, toMinute: 1439, to: MENU },
    { when: "always", to: RESERVE },
  ];
  assert.deepEqual(resolveTarget(rules, at(12)), { ok: true, destination: TICKETS });
});

test("a rule shape from a newer deploy is skipped, not crashed on", () => {
  // An old server serving a link a new server edited. Skipping the unknown and
  // falling to the default keeps the code working through a rolling deploy.
  const rules = [
    { when: "phase_of_moon", to: TICKETS },
    { when: "always", to: MENU },
  ] as unknown as TargetRule[];
  assert.deepEqual(resolveTarget(rules, at(12)), { ok: true, destination: MENU });
});

test("an out-of-range minute makes its own rule not match, and does not poison the list", () => {
  const rules = [
    { when: "time_of_day", fromMinute: 99 * 60, toMinute: 2 * 60, to: TICKETS },
    { when: "always", to: MENU },
  ] as TargetRule[];
  assert.deepEqual(resolveTarget(rules, at(1)), { ok: true, destination: MENU });
});

// ── validateTargets, the save-time gate ──────────────────────────────────────

test("validateTargets accepts a well-formed list", () => {
  assert.deepEqual(
    validateTargets([
      { when: "event_before_doors", to: TICKETS },
      { when: "always", to: MENU },
    ]),
    { ok: true },
  );
});

test("validateTargets refuses a destination with nowhere to point", () => {
  const broken = [{ when: "always", to: { to: "", label: "menu" } }] as TargetRule[];
  assert.equal(validateTargets(broken).ok, false);
});

test("validateTargets refuses an unnamed destination, because the scan record needs the label", () => {
  const broken = [{ when: "always", to: { to: "/menu", label: "" } }] as TargetRule[];
  assert.equal(validateTargets(broken).ok, false);
});

test("validateTargets refuses a window that starts and ends at the same time", () => {
  const broken: TargetRule[] = [
    { when: "time_of_day", fromMinute: 720, toMinute: 720, to: TICKETS },
    { when: "always", to: MENU },
  ];
  assert.equal(validateTargets(broken).ok, false);
});

test("validateTargets refuses an empty list with a message a user can act on", () => {
  const result = validateTargets([]);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /at least one/i);
});

// ── The wall clock ───────────────────────────────────────────────────────────

test("zonedNowIn reads the VENUE's wall clock, not the server's", () => {
  // 2026-09-04T02:00:00Z is 21:00 on Thursday 3 September in Cancun (UTC-5),
  // and 04:00 on Friday 4 September in Madrid. One instant, two different
  // answers to "is it before doors" — which is the whole reason the clock is
  // an argument.
  const instant = new Date("2026-09-04T02:00:00Z");

  const cancun = zonedNowIn(instant, "America/Cancun");
  assert.equal(cancun.minuteOfDay, 21 * 60);
  assert.equal(cancun.weekday, 4); // Thursday

  const madrid = zonedNowIn(instant, "Europe/Madrid");
  assert.equal(madrid.minuteOfDay, 4 * 60);
  assert.equal(madrid.weekday, 5); // Friday
});

test("zonedNowIn renders local midnight as minute 0, never as 1440", () => {
  // Some ICU versions format midnight as hour "24" under hour12:false. Left
  // unnormalised that is minute 1440, which is outside every window and would
  // make a code dead for exactly one minute a night.
  const midnightInCancun = new Date("2026-09-04T05:00:00Z");
  assert.equal(zonedNowIn(midnightInCancun, "America/Cancun").minuteOfDay, 0);
});

test("a link resolved across a DST boundary uses the local clock on each side", () => {
  // Madrid leaves DST at 03:00 local on 25 October 2026. 00:30Z is 02:30 local
  // (still CEST); 02:30Z is 03:30 local (now CET). A code with a 02:00-04:00
  // window must match both, and would not if we had added a fixed offset.
  const rules: TargetRule[] = [
    { when: "time_of_day", fromMinute: 2 * 60, toMinute: 4 * 60, to: MENU },
    { when: "always", to: RESERVE },
  ];
  const before = zonedNowIn(new Date("2026-10-25T00:30:00Z"), "Europe/Madrid");
  const after = zonedNowIn(new Date("2026-10-25T02:30:00Z"), "Europe/Madrid");
  assert.deepEqual(resolveTarget(rules, before), { ok: true, destination: MENU });
  assert.deepEqual(resolveTarget(rules, after), { ok: true, destination: MENU });
});
