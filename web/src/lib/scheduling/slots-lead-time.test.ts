/** TUL-1023: with "now" at 14:10 site time, nothing earlier than now + lead is offered. */
import test from "node:test";
import assert from "node:assert/strict";

import { generateSlots } from "./slots";
import { zonedLocalToUtc } from "./tz";
import type { BookingHours } from "./hours-types";

const DAY = [{ startMin: 9 * 60, endMin: 20 * 60 }];

function hoursFor(timezone: string, minNoticeMin: number, horizonDays = 2): BookingHours {
  return {
    timezone,
    weekly: { 0: DAY, 1: DAY, 2: DAY, 3: DAY, 4: DAY, 5: DAY, 6: DAY },
    exceptions: [],
    slotMinutes: 30,
    bufferBeforeMin: 0,
    bufferAfterMin: 0,
    minNoticeMin,
    horizonDays,
  };
}

const CASES: Array<{ name: string; tz: string; ymd: string }> = [
  { name: "Cancun (no DST)", tz: "America/Cancun", ymd: "2026-10-14" },
  { name: "New York, day after spring-forward (March DST week)", tz: "America/New_York", ymd: "2026-03-09" },
  { name: "New York, the spring-forward day itself", tz: "America/New_York", ymd: "2026-03-08" },
  { name: "Tokyo (non-Cancun, positive offset)", tz: "Asia/Tokyo", ymd: "2026-10-14" },
];

for (const c of CASES) {
  test(`TUL-1023: ${c.name}: now=14:10 site time offers nothing before now + lead`, () => {
    const now = zonedLocalToUtc(c.ymd, 14 * 60 + 10, c.tz);
    assert.ok(now);
    for (const lead of [60, 120]) {
      const slots = generateSlots({ hours: hoursFor(c.tz, lead), durationMinutes: 30, from: now });
      assert.ok(slots.length > 0);
      const floor = now.getTime() + lead * 60_000;
      for (const s of slots) {
        assert.ok(s.startsAt.getTime() >= floor, `${s.startsAt.toISOString()} is earlier than now+${lead}min`);
      }
      // 14:10 + 60 = 15:10 -> first grid start 15:30; + 120 = 16:10 -> 16:30.
      const first = zonedLocalToUtc(c.ymd, lead === 60 ? 15 * 60 + 30 : 16 * 60 + 30, c.tz);
      assert.equal(slots[0]!.startsAt.toISOString(), first!.toISOString());
    }
  });
}
