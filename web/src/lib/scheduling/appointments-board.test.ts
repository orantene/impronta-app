/**
 * appointments-board.test.ts — the board's two decisions, and the one place
 * they are allowed to disagree with the database.
 *
 * WHY THE STATUS LIST IS ASSERTED AGAINST THE MIGRATION. `nextActionFor` only
 * offers "Move it" for the statuses `reschedule_booking_set` will actually
 * move. A second hand-kept copy of that list is exactly the drift that puts a
 * button on a row the RPC refuses when pressed, so the test reads the SQL and
 * compares. If somebody widens the RPC's gate and not this constant, or the
 * reverse, this goes red rather than the screen going quietly wrong.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  APPOINTMENT_BUCKET_ORDER,
  RESCHEDULABLE_BOOKING_STATUSES,
  bucketForStart,
  compareAppointments,
  groupAppointments,
  nextActionFor,
  parseLocalDateTime,
  type AppointmentRow,
} from "./appointments-board";

const MIGRATIONS = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..", "..", "..", "..", "supabase", "migrations",
);

function row(over: Partial<AppointmentRow> & { id: string }): AppointmentRow {
  return {
    title: "A booking",
    status: "confirmed",
    startsAt: null,
    endsAt: null,
    customerName: null,
    servedBy: [],
    places: [],
    timeZone: "UTC",
    bucket: "upcoming",
    nextAction: { kind: "reschedule" },
    ...over,
  };
}

test("the reschedulable statuses are the RPC's own gate, not a second list", () => {
  const sql = readFileSync(join(MIGRATIONS, "20261231010200_reschedule_booking_set.sql"), "utf8");
  const match =
    /v_booking\.status::text NOT IN \(([^)]+)\)/.exec(sql);
  assert.ok(match, "could not read the status gate from reschedule_booking_set");
  const fromSql = [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(
    [...RESCHEDULABLE_BOOKING_STATUSES].sort(),
    fromSql,
    "the board offers Move for a different set of statuses than the RPC will move",
  );
});

test("today is the VENUE's day, not the reader's", () => {
  // One instant, two venues, two different answers, and both are right.
  // now is 2027-03-01 20:00 in Mexico City (UTC-6) and 2027-03-02 03:00 in
  // Madrid (UTC+1), so "today" is a different calendar day in each.
  const now = new Date("2027-03-02T02:00:00Z");

  // 04:00 on the 2nd in Mexico City: tomorrow there, later today in Madrid.
  assert.equal(bucketForStart("2027-03-02T10:00:00Z", now, "America/Mexico_City"), "upcoming");
  assert.equal(bucketForStart("2027-03-02T10:00:00Z", now, "Europe/Madrid"), "today");

  // 14:00 on the 1st in Mexico City: today there, yesterday evening in Madrid.
  assert.equal(bucketForStart("2027-03-01T20:00:00Z", now, "America/Mexico_City"), "today");
  assert.equal(bucketForStart("2027-03-01T20:00:00Z", now, "Europe/Madrid"), "earlier");
});

test("a booking with no date is undated, never buried in the past", () => {
  const now = new Date("2027-03-02T02:00:00Z");
  assert.equal(bucketForStart(null, now, "UTC"), "undated");
  assert.equal(bucketForStart("not a date", now, "UTC"), "undated");
  // And undated sorts FIRST, because it is the group that needs a decision.
  assert.equal(APPOINTMENT_BUCKET_ORDER[0], "undated");
});

test("an unreadable zone falls back to the instant rather than reclassifying", () => {
  const now = new Date("2027-03-02T02:00:00Z");
  assert.equal(bucketForStart("2027-03-01T00:00:00Z", now, "Mars/Olympus"), "earlier");
  assert.equal(bucketForStart("2027-03-05T00:00:00Z", now, "Mars/Olympus"), "upcoming");
});

test("only a status the RPC would move gets a Move button", () => {
  for (const status of RESCHEDULABLE_BOOKING_STATUSES) {
    assert.deepEqual(nextActionFor({ status, bucket: "today" }), { kind: "reschedule" });
  }
  assert.deepEqual(nextActionFor({ status: "cancelled", bucket: "today" }), {
    kind: "none",
    because: "cancelled",
  });
  assert.deepEqual(nextActionFor({ status: "completed", bucket: "upcoming" }), {
    kind: "none",
    because: "completed",
  });
  // A status nobody has heard of is not offered a control that would fail.
  assert.deepEqual(nextActionFor({ status: "archived", bucket: "today" }), { kind: "open" });
});

test("a booking that already happened is opened, not moved from a list", () => {
  assert.deepEqual(nextActionFor({ status: "confirmed", bucket: "earlier" }), { kind: "open" });
});

test("groups keep their order and sort undated first inside a bucket", () => {
  const rows: AppointmentRow[] = [
    row({ id: "b", bucket: "today", startsAt: "2027-03-02T12:00:00Z" }),
    row({ id: "a", bucket: "today", startsAt: "2027-03-02T09:00:00Z" }),
    row({ id: "c", bucket: "undated" }),
  ];
  const grouped = groupAppointments(rows);
  assert.deepEqual(grouped.map((g) => g.bucket), ["undated", "today"]);
  assert.deepEqual(grouped[1]!.rows.map((r) => r.id), ["a", "b"]);
});

test("two bookings at the same minute keep one order across reloads", () => {
  const a = row({ id: "aaa", startsAt: "2027-03-02T09:00:00Z" });
  const b = row({ id: "bbb", startsAt: "2027-03-02T09:00:00Z" });
  assert.ok(compareAppointments(a, b) < 0);
  assert.ok(compareAppointments(b, a) > 0);
});

test("a datetime-local value is split, never handed to new Date()", () => {
  assert.deepEqual(parseLocalDateTime("2027-03-14T09:30"), {
    ymd: "2027-03-14",
    minutesOfDay: 9 * 60 + 30,
  });
  // The seconds a browser may append are ignored, not rejected.
  assert.deepEqual(parseLocalDateTime("2027-03-14T09:30:00"), {
    ymd: "2027-03-14",
    minutesOfDay: 570,
  });
  for (const bad of ["", "2027-03-14", "14/03/2027 09:30", "2027-03-14T99:30"]) {
    assert.equal(parseLocalDateTime(bad), null, `"${bad}" should not parse`);
  }
});
