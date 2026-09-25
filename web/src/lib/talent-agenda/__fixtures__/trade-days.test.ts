import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildTradeDayFixtures } from "./trade-days";
import { TRADE_WALK_KEYS } from "../trade-walk";
import { needsAttention, todayTotals } from "../derive";

describe("G4.1 per-trade day fixtures", () => {
  it("covers every trade walk key with a tradeSection", () => {
    const items = buildTradeDayFixtures();
    assert.equal(items.length, TRADE_WALK_KEYS.length);
    for (const item of items) {
      assert.ok(item.tradeSection?.kind, item.id);
      assert.ok(item.blocksTime);
    }
  });

  it("derive smoke: due money counts toward still-to-collect", () => {
    const items = buildTradeDayFixtures();
    const clock = new Date("2026-09-23T09:50:00-05:00");
    const t = todayTotals(items, clock, "2026-09-23");
    assert.ok(t.stillToCollectCents >= 10000);
    assert.ok(needsAttention(items, clock).length >= 0);
  });
});
