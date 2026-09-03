import test from "node:test";
import assert from "node:assert/strict";

import { bookingIsOnLocalDay, tenantsDueForSweep } from "./reminder-schedule";

const CANCUN = { tenantId: "t-cancun", timezone: "America/Cancun" }; // UTC-5, no DST
const MADRID = { tenantId: "t-madrid", timezone: "Europe/Madrid" }; // UTC+2 in Sept
const UTC = { tenantId: "t-utc", timezone: "UTC" };
const BROKEN = { tenantId: "t-broken", timezone: "Mars/Olympus_Mons" };

const ALL = [CANCUN, MADRID, UTC, BROKEN];

test("13:00Z is 8am in Cancun and nowhere else here", () => {
  const due = tenantsDueForSweep(new Date("2026-09-05T13:00:00.000Z"), ALL);
  assert.deepEqual(
    due.map((d) => d.tenantId),
    ["t-cancun"],
  );
});

test("06:00Z is 8am in Madrid", () => {
  const due = tenantsDueForSweep(new Date("2026-09-05T06:00:00.000Z"), ALL);
  assert.deepEqual(
    due.map((d) => d.tenantId),
    ["t-madrid"],
  );
});

test("08:00Z is 8am for a UTC workspace, which is exactly today's behaviour", () => {
  const due = tenantsDueForSweep(new Date("2026-09-05T08:00:00.000Z"), ALL);
  assert.deepEqual(
    due.map((d) => d.tenantId),
    ["t-utc"],
  );
});

test("a workspace is swept exactly once across a full day of hourly ticks", () => {
  let sweeps = 0;
  for (let hour = 0; hour < 24; hour += 1) {
    const now = new Date(Date.UTC(2026, 8, 5, hour, 0, 0));
    if (tenantsDueForSweep(now, [CANCUN]).length > 0) sweeps += 1;
  }
  assert.equal(sweeps, 1);
});

test("a workspace whose zone does not parse is dropped, never swept in UTC", () => {
  for (let hour = 0; hour < 24; hour += 1) {
    const now = new Date(Date.UTC(2026, 8, 5, hour, 0, 0));
    assert.equal(tenantsDueForSweep(now, [BROKEN]).length, 0);
  }
});

test("the local day reminded about is local tomorrow, not UTC tomorrow", () => {
  // 03:00Z on the 6th is still 22:00 on the 5th in Cancun, so a UTC-calendar
  // cron would already be reminding about the 7th while Cancun is on the 5th.
  // At Cancun's own 8am on the 5th, it reminds about the 6th.
  const [sweep] = tenantsDueForSweep(new Date("2026-09-05T13:00:00.000Z"), [CANCUN]);
  assert.equal(sweep?.tomorrowYmd, "2026-09-06");
});

test("the UTC window is the local day, and is exactly 24 hours here", () => {
  const [sweep] = tenantsDueForSweep(new Date("2026-09-05T13:00:00.000Z"), [CANCUN]);
  assert.ok(sweep);
  assert.equal(sweep.windowStart.toISOString(), "2026-09-06T05:00:00.000Z");
  assert.equal(sweep.windowEnd.toISOString(), "2026-09-07T05:00:00.000Z");
});

test("the window follows a DST shift instead of assuming 24 hours", () => {
  // Madrid falls back at 03:00 local on 2026-10-25, so that local day is 25
  // hours long. Nothing in this module assumes otherwise.
  const [sweep] = tenantsDueForSweep(new Date("2026-10-24T06:00:00.000Z"), [MADRID]);
  assert.ok(sweep);
  assert.equal(sweep.tomorrowYmd, "2026-10-25");
  const hours = (sweep.windowEnd.getTime() - sweep.windowStart.getTime()) / 3_600_000;
  assert.equal(hours, 25);
});

test("bookingIsOnLocalDay reads starts_at in the venue's zone, not in UTC", () => {
  // 2026-09-07T02:00Z is 21:00 on the 6th in Cancun: a dinner service. The UTC
  // reader calls that the 7th and reminds a day early.
  const row = { starts_at: "2026-09-07T02:00:00.000Z" };
  assert.equal(bookingIsOnLocalDay(row, "2026-09-06", "America/Cancun"), true);
  assert.equal(bookingIsOnLocalDay(row, "2026-09-07", "America/Cancun"), false);
  assert.equal(bookingIsOnLocalDay(row, "2026-09-07", "UTC"), true);
});

test("bookingIsOnLocalDay compares event_date as written, never converted", () => {
  // A bare date carries no time, so there is no instant to convert. Inventing
  // midnight and shifting it would move the booking a day in half the world.
  assert.equal(
    bookingIsOnLocalDay({ event_date: "2026-09-06" }, "2026-09-06", "America/Cancun"),
    true,
  );
  assert.equal(
    bookingIsOnLocalDay({ event_date: "2026-09-06T00:00:00Z" }, "2026-09-06", "Asia/Tokyo"),
    true,
  );
});

test("starts_at wins over event_date, and an unparseable one is not remindable", () => {
  assert.equal(
    bookingIsOnLocalDay(
      { starts_at: "2026-09-07T02:00:00.000Z", event_date: "2026-09-09" },
      "2026-09-06",
      "America/Cancun",
    ),
    true,
  );
  assert.equal(bookingIsOnLocalDay({ starts_at: "not a date" }, "2026-09-06", "UTC"), false);
  assert.equal(bookingIsOnLocalDay({}, "2026-09-06", "UTC"), false);
});
