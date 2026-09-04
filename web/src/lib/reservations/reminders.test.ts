import test from "node:test";
import assert from "node:assert/strict";
import {
  dayBeforeRemindersDue,
  extendHold,
  soonRemindersDue,
  type RemindableReservation,
} from "./reminders";

const AT = new Date("2026-09-05T02:00:00Z"); // 20:00 Cancun
const min = (n: number) => new Date(AT.getTime() + n * 60_000);

const r = (over: Partial<RemindableReservation> = {}): RemindableReservation => ({
  admissionId: "a1",
  startsAt: AT,
  noShowAt: null,
  admittedCount: 0,
  status: "valid",
  ...over,
});

test("`soon` is due across the WHOLE window, not at one instant", () => {
  // The cron runs hourly. A test like `now === startsAt - 120min` is true for
  // an instant no tick ever lands on, so the reminder would fire NEVER and look
  // like a delivery problem rather than an arithmetic one.
  assert.equal(soonRemindersDue([r()], min(-121), 120).length, 0, "before the lead");
  assert.equal(soonRemindersDue([r()], min(-120), 120).length, 1, "exactly at the lead");
  assert.equal(soonRemindersDue([r()], min(-90), 120).length, 1, "an hour later, still due");
  assert.equal(soonRemindersDue([r()], min(-1), 120).length, 1, "a minute before");
});

test("`soon` stops at the seating, because a reminder after it reads as a late system", () => {
  assert.equal(soonRemindersDue([r()], AT, 120).length, 0);
  assert.equal(soonRemindersDue([r()], min(30), 120).length, 0);
});

test("the eventId is stable per reservation and kind, so firing once is the database's job", () => {
  const a = soonRemindersDue([r()], min(-60), 120)[0]!;
  const b = soonRemindersDue([r()], min(-30), 120)[0]!;
  assert.equal(a.eventId, b.eventId);
  assert.equal(a.eventId, "reservation-soon:a1");
  // A module that narrowed the window to avoid a second send would be choosing
  // between "fires twice" and "fires never", and the second is invisible.
});

test("nobody who is already sitting down gets reminded", () => {
  assert.equal(soonRemindersDue([r({ admittedCount: 1 })], min(-60), 120).length, 0);
  assert.equal(soonRemindersDue([r({ admittedCount: 4 })], min(-60), 120).length, 0);
});

test("a no-show and a cancelled booking are not reminded", () => {
  assert.equal(soonRemindersDue([r({ noShowAt: min(31) })], min(-60), 120).length, 0);
  assert.equal(soonRemindersDue([r({ status: "void" })], min(-60), 120).length, 0);
  assert.equal(soonRemindersDue([r({ status: "refunded" })], min(-60), 120).length, 0);
});

test("a nonsense lead yields nothing rather than a reminder at a guessed time", () => {
  for (const bad of [-5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(soonRemindersDue([r()], min(-60), bad).length, 0);
  }
});

test("the lead is added to the INSTANT, so a DST night does not shift it", () => {
  // Europe/Madrid springs forward 2027-03-28. A 01:30 local seating is
  // 00:30Z; two hours before it is 22:30Z the previous evening, whatever the
  // clock did in between.
  const startsAt = new Date("2027-03-28T00:30:00Z");
  const due = soonRemindersDue([r({ startsAt })], new Date("2027-03-27T22:30:00Z"), 120);
  assert.equal(due.length, 1);
  assert.equal(soonRemindersDue([r({ startsAt })], new Date("2027-03-27T22:29:00Z"), 120).length, 0);
});

// ─── the day-before sweep ────────────────────────────────────────────────────

test("the day-before window is half-open, so a midnight seating belongs to one day", () => {
  const start = new Date("2026-09-05T05:00:00Z"); // local midnight in Cancun
  const end = new Date("2026-09-06T05:00:00Z");
  assert.equal(dayBeforeRemindersDue([r({ startsAt: start })], { start, end }).length, 1);
  assert.equal(dayBeforeRemindersDue([r({ startsAt: end })], { start, end }).length, 0);
});

test("the day-before sweep skips seated, no-showed and cancelled the same way", () => {
  const start = new Date("2026-09-05T05:00:00Z");
  const end = new Date("2026-09-06T05:00:00Z");
  const inside = new Date("2026-09-05T14:00:00Z");
  const rows = [
    r({ admissionId: "ok", startsAt: inside }),
    r({ admissionId: "seated", startsAt: inside, admittedCount: 2 }),
    r({ admissionId: "gone", startsAt: inside, noShowAt: inside }),
    r({ admissionId: "cancelled", startsAt: inside, status: "void" }),
  ];
  assert.deepEqual(
    dayBeforeRemindersDue(rows, { start, end }).map((d) => d.admissionId),
    ["ok"],
  );
});

// ─── running late ────────────────────────────────────────────────────────────

test("running late extends the hold, but never past the turn they booked", () => {
  // One late party must not eat the next party's table: the second guest would
  // suffer for the first one's lateness, and they are the one who arrived.
  assert.equal(
    extendHold({ startsAt: AT, turnMinutes: 90, extraMinutes: 15, alreadyHeldUntil: null })
      .toISOString(),
    min(15).toISOString(),
  );
  assert.equal(
    extendHold({ startsAt: AT, turnMinutes: 90, extraMinutes: 120, alreadyHeldUntil: null })
      .toISOString(),
    min(90).toISOString(),
    "clamped to the turn",
  );
});

test("a second `running late` extends from the existing hold, not from the seating", () => {
  const once = extendHold({ startsAt: AT, turnMinutes: 90, extraMinutes: 15, alreadyHeldUntil: null });
  const twice = extendHold({ startsAt: AT, turnMinutes: 90, extraMinutes: 15, alreadyHeldUntil: once });
  assert.equal(twice.toISOString(), min(30).toISOString());
});

test("a negative extension does not shorten the hold", () => {
  assert.equal(
    extendHold({ startsAt: AT, turnMinutes: 90, extraMinutes: -30, alreadyHeldUntil: min(15) })
      .toISOString(),
    min(15).toISOString(),
  );
});
