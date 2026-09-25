import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { freeGaps, occupiedInterval } from "@/lib/talent-agenda/derive";
import { JOR_CLOCK, JOR_WEEK } from "@/lib/talent-agenda/__fixtures__/jor-week";

describe("T5.1 freeGaps and occupied intervals", () => {
  it("includes buffer after Camila gel set", () => {
    const camila = JOR_WEEK.find((i) => i.id === "jor-today-1")!;
    const occ = occupiedInterval(camila);
    assert.equal(
      occ.endsAt.getTime() - Date.parse(camila.endsAt),
      15 * 60_000,
    );
  });

  it("returns free gaps between today bookings inside studio hours", () => {
    const day = new Date("2026-09-23T00:00:00-05:00");
    const today = JOR_WEEK.filter((i) => i.id.startsWith("jor-today-"));
    const gaps = freeGaps(
      day,
      today,
      { windows: [{ startMin: 10 * 60, endMin: 19 * 60 }] },
      JOR_CLOCK,
    );
    // 09:50 clock → first gap starts at now, then between appointments.
    assert.ok(gaps.length >= 2);
    // After Camila (11:00 + 15 buffer) until Ana (12:00)
    const between = gaps.find(
      (g) =>
        g.startsAt.getHours() === 11 &&
        g.startsAt.getMinutes() === 15 &&
        g.endsAt.getHours() === 12,
    );
    assert.ok(between, "expected gap after Camila buffer before Ana");
  });
});
