import assert from "node:assert/strict";
import { describe, it } from "node:test";

// Viewer browser = Madrid, talent = Cancun (UTC-5, no DST).
process.env.TZ = "Europe/Madrid";

import { itemsInTalentWallClock, talentWallClockToInstant, wallClockIn } from "./agenda-now";
import { occupiedInterval } from "./derive";
import { itemsOnDay } from "@/components/admin/shell/internal/talent/agenda/present";

const mins = (d: Date) => d.getHours() * 60 + d.getMinutes();
const item = (startsAt: string, endsAt: string) =>
  ({ id: "b1", startsAt, endsAt, where: {}, bufferAfterMin: 0 }) as never as {
    id: string;
    startsAt: string;
    endsAt: string;
    where: never;
    bufferAfterMin: number;
  };

describe("itemsInTalentWallClock (viewer Europe/Madrid, talent America/Cancun)", () => {
  it("viewer tz is really Madrid", () => {
    assert.equal(new Date("2026-10-07T12:00:00Z").getHours(), 14);
  });

  it("10:00 Cancun booking (15:00Z) sits at 10:00 top offset, not Madrid 17:00", () => {
    const [b] = itemsInTalentWallClock([item("2026-10-07T15:00:00Z", "2026-10-07T16:00:00Z")], "America/Cancun");
    const occ = occupiedInterval(b as never);
    assert.equal(mins(occ.startsAt), 10 * 60);
    assert.equal(mins(occ.endsAt) - mins(occ.startsAt), 60);
  });

  it("late-evening Cancun booking stays on the talent's day (Madrid would roll to next day)", () => {
    const items = itemsInTalentWallClock([item("2026-10-07T03:00:00Z", "2026-10-07T04:00:00Z")], "America/Cancun");
    // 22:00 Oct 6 in Cancun; Madrid says 05:00 Oct 7.
    assert.equal(itemsOnDay(items as never, new Date(2026, 9, 6)).length, 1);
    assert.equal(itemsOnDay(items as never, new Date(2026, 9, 7)).length, 0);
    assert.equal(mins(occupiedInterval(items[0] as never).startsAt), 22 * 60);
  });

  it("no timezone leaves items untouched", () => {
    const src = [item("2026-10-07T15:00:00Z", "2026-10-07T16:00:00Z")];
    assert.equal(itemsInTalentWallClock(src, null)[0].startsAt, src[0].startsAt);
  });
});

describe("talentWallClockToInstant (inverse)", () => {
  const roundTrip = (iso: string, tz: string) =>
    talentWallClockToInstant(wallClockIn(new Date(iso), tz), tz).toISOString();

  it("round-trips for Cancun", () => {
    assert.equal(roundTrip("2026-10-07T15:00:00.000Z", "America/Cancun"), "2026-10-07T15:00:00.000Z");
  });
  it("round-trips for New York around the DST switch (2026-11-01)", () => {
    for (const iso of ["2026-10-31T18:00:00.000Z", "2026-11-01T12:30:00.000Z", "2026-11-02T14:00:00.000Z", "2026-03-08T16:00:00.000Z"]) {
      assert.equal(roundTrip(iso, "America/New_York"), iso);
    }
  });
  it("is identity with no timezone", () => {
    const d = new Date(2026, 9, 7, 10, 0);
    assert.equal(talentWallClockToInstant(d, null), d);
  });
  it("viewer Madrid, talent Cancun: the 10:00 grid slot saves as 15:00Z", () => {
    // Same construction as AgendaCalendarPage's blockRange (grid wall-clock values).
    const start = new Date(2026, 9, 7, 10, 0);
    const end = new Date(2026, 9, 7, 11, 0);
    assert.equal(talentWallClockToInstant(start, "America/Cancun").toISOString(), "2026-10-07T15:00:00.000Z");
    assert.equal(talentWallClockToInstant(end, "America/Cancun").toISOString(), "2026-10-07T16:00:00.000Z");
  });
});
