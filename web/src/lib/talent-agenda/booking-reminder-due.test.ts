import test from "node:test";
import assert from "node:assert/strict";

import {
  decideTalentBookingReminders,
  talentReminderCandidateWindow,
  zoneForTalentBooking,
  type TalentBookingReminderRow,
} from "./booking-reminder-due";

function row(over: Partial<TalentBookingReminderRow> = {}): TalentBookingReminderRow {
  return {
    id: "tb-1",
    tenant_id: "t-1",
    talent_profile_id: "tp-1",
    inquiry_id: "inq-1",
    // 15:00Z on the 6th is 10:00 on the 6th in Cancun (UTC-5).
    starts_at: "2026-09-06T15:00:00.000Z",
    status: "confirmed",
    ...over,
  };
}

const CANCUN_8AM = new Date("2026-09-05T13:00:00.000Z"); // 08:00 Cancun on the 5th
const none = new Map<string, string | null>();
const CANCUN_TALENT = new Map<string, string | null>([["tp-1", "America/Cancun"]]);

test("due at the talent's own 8am when the booking is local tomorrow", () => {
  const d = decideTalentBookingReminders({
    now: CANCUN_8AM,
    rows: [row()],
    talentZones: CANCUN_TALENT,
    tenantZones: new Map([["t-1", "UTC"]]),
  });
  assert.deepEqual(d.due.map((r) => r.id), ["tb-1"]);
  assert.deepEqual(d.dueByZoneSource, { talent: 1, workspace: 0, utc: 0 });
});

test("not due at any other hour of the talent's day", () => {
  for (let h = 0; h < 24; h += 1) {
    if (h === 13) continue;
    const d = decideTalentBookingReminders({
      now: new Date(Date.UTC(2026, 8, 5, h)),
      rows: [row()],
      talentZones: CANCUN_TALENT,
      tenantZones: none,
    });
    assert.equal(d.due.length, 0, `hour ${h}`);
  }
});

test("reminded exactly once across a day of hourly ticks", () => {
  let n = 0;
  for (let h = 0; h < 24; h += 1) {
    n += decideTalentBookingReminders({
      now: new Date(Date.UTC(2026, 8, 5, h)),
      rows: [row()],
      talentZones: CANCUN_TALENT,
      tenantZones: none,
    }).due.length;
  }
  assert.equal(n, 1);
});

test("the talent's zone wins over the workspace's", () => {
  // The workspace in Madrid would be due at 06:00Z; the talent in Cancun is not.
  const d = decideTalentBookingReminders({
    now: new Date("2026-09-05T06:00:00.000Z"),
    rows: [row({ starts_at: "2026-09-06T08:00:00.000Z" })],
    talentZones: CANCUN_TALENT,
    tenantZones: new Map([["t-1", "Europe/Madrid"]]),
  });
  assert.equal(d.due.length, 0);
});

test("local tomorrow is decided in the talent's zone, not UTC", () => {
  // 03:00Z on the 6th is 22:00 on the 5th in Cancun: still local "today".
  const today = decideTalentBookingReminders({
    now: CANCUN_8AM,
    rows: [row({ starts_at: "2026-09-06T03:00:00.000Z" })],
    talentZones: CANCUN_TALENT,
    tenantZones: none,
  });
  assert.equal(today.due.length, 0);
  // 03:00Z on the 7th is 22:00 on the 6th in Cancun: local tomorrow.
  const tomorrow = decideTalentBookingReminders({
    now: CANCUN_8AM,
    rows: [row({ starts_at: "2026-09-07T03:00:00.000Z" })],
    talentZones: CANCUN_TALENT,
    tenantZones: none,
  });
  assert.equal(tomorrow.due.length, 1);
});

test("no saved talent zone falls back to the workspace zone, counted separately", () => {
  const d = decideTalentBookingReminders({
    now: CANCUN_8AM,
    rows: [row()],
    talentZones: new Map([["tp-1", null]]),
    tenantZones: new Map([["t-1", "America/Cancun"]]),
  });
  assert.equal(d.due.length, 1);
  assert.deepEqual(d.dueByZoneSource, { talent: 0, workspace: 1, utc: 0 });
});

test("an unparseable talent zone is not trusted, and no zone at all means UTC", () => {
  assert.deepEqual(
    zoneForTalentBooking(row(), new Map([["tp-1", "America/Europe/Madrid"]]), none),
    { timezone: "UTC", source: "utc" },
  );
  const d = decideTalentBookingReminders({
    now: new Date("2026-09-05T08:00:00.000Z"),
    rows: [row({ starts_at: "2026-09-06T12:00:00.000Z" })],
    talentZones: none,
    tenantZones: none,
  });
  assert.equal(d.due.length, 1);
  assert.deepEqual(d.dueByZoneSource, { talent: 0, workspace: 0, utc: 1 });
});

test("skips rows with no inquiry, a dead status, or no usable start, and counts them", () => {
  const d = decideTalentBookingReminders({
    now: CANCUN_8AM,
    rows: [
      row({ id: "a", inquiry_id: null }),
      row({ id: "b", status: "cancelled" }),
      row({ id: "c", starts_at: null }),
      row({ id: "d", starts_at: "not-a-date" }),
      row({ id: "e", status: "tentative" }),
      row({ id: "f", status: "in_progress" }),
    ],
    talentZones: CANCUN_TALENT,
    tenantZones: none,
  });
  assert.deepEqual(d.due.map((r) => r.id), ["e", "f"]);
  assert.equal(d.skippedNoInquiry, 1);
  assert.equal(d.skippedStatus, 1);
  assert.equal(d.skippedNoStart, 2);
  assert.equal(d.scanned, 6);
});

test("each talent is judged in their own zone in one run", () => {
  const d = decideTalentBookingReminders({
    now: CANCUN_8AM,
    rows: [
      row({ id: "cancun" }),
      row({ id: "madrid", talent_profile_id: "tp-2", starts_at: "2026-09-06T10:00:00.000Z" }),
    ],
    talentZones: new Map([
      ["tp-1", "America/Cancun"],
      ["tp-2", "Europe/Madrid"],
    ]),
    tenantZones: none,
  });
  assert.deepEqual(d.due.map((r) => r.id), ["cancun"]);
});

test("candidate window is the next 48 hours", () => {
  const w = talentReminderCandidateWindow(new Date("2026-09-05T13:00:00.000Z"));
  assert.equal(w.startIso, "2026-09-05T13:00:00.000Z");
  assert.equal(w.endIso, "2026-09-07T13:00:00.000Z");
});
