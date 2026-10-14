import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { BookingHours } from "@/lib/scheduling/hours-types";
import { gridBounds, hm, hourRailMarks, normalizeBounds } from "./calendar-bounds";

const week = (win: { startMin: number; endMin: number }[]) =>
  ({ timezone: "America/Cancun", exceptions: [], weekly: [win, win, win, win, win, win, win] }) as unknown as BookingHours;
// Wed 2026-10-14, noon, so "now" does not stretch the range unless asked.
const days = [new Date(2026, 9, 14, 12, 0)];

describe("TUL-667 calendar hour range", () => {
  it("grid follows the talent's booking hours, not a fixed default", () => {
    const b = gridBounds(week([{ startMin: 12 * 60, endMin: 16 * 60 }]), days);
    assert.deepEqual(b, { startMin: 11 * 60, endMin: 17 * 60 });
  });

  it("default range only when no day in view has a window", () => {
    assert.deepEqual(gridBounds(null, days), { startMin: 9 * 60, endMin: 20 * 60 });
    assert.deepEqual(gridBounds(week([]), days), { startMin: 9 * 60, endMin: 20 * 60 });
  });

  it("rail labels equal the grid rows, no duplicates", () => {
    const b = gridBounds(week([{ startMin: 9 * 60, endMin: 18 * 60 }]), days);
    const labels = hourRailMarks(b).map(hm);
    assert.equal(labels[0], "08:00");
    assert.equal(labels.at(-1), "19:00");
    assert.equal(new Set(labels).size, labels.length);
    assert.equal(labels.length, (b.endMin - b.startMin) / 60 + 1);
  });

  it("an off-hour or fractional bound still yields unique whole-hour labels", () => {
    const labels = hourRailMarks({ startMin: 8 * 60 + 30, endMin: 18 * 60 + 30 }).map(hm);
    assert.equal(new Set(labels).size, labels.length);
    assert.ok(labels.every((l) => l.endsWith(":00")));
    assert.deepEqual(normalizeBounds({ startMin: 510, endMin: 1110 }), { startMin: 480, endMin: 1140 });
  });
});
