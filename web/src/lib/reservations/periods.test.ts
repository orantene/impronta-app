import { test } from "node:test";
import assert from "node:assert/strict";
import { periodsToWindows } from "./periods";

test("periodsToWindows maps a dinner mask onto weekdays and duration", () => {
  const windows = periodsToWindows(
    [
      {
        id: "p1",
        location_id: "loc",
        name: "Dinner",
        weekday_mask: 31,
        starts_local: "19:00:00",
        ends_local: "23:00:00",
        turn_minutes: 90,
      },
    ],
    "venue-1",
  );
  assert.equal(windows.length, 1);
  assert.equal(windows[0]?.localTimeMin, 19 * 60);
  assert.equal(windows[0]?.durationMinutes, 4 * 60);
  assert.deepEqual(windows[0]?.weekdays, [1, 2, 3, 4, 5]);
  assert.equal(windows[0]?.turnMinutesOverride, 90);
});

test("periodsToWindows returns empty when no usable row exists so the store can fall back", () => {
  assert.deepEqual(periodsToWindows([], "venue-1"), []);
});
