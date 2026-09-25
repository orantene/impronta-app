import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TRADE_PROFILES, allTradeTypeSlugs, resolveTradeProfile } from "./trades";

describe("TRADE_PROFILES", () => {
  it("has ten trades", () => {
    assert.equal(Object.keys(TRADE_PROFILES).length, 10);
  });

  it("every trade has EN and ES words", () => {
    for (const p of Object.values(TRADE_PROFILES)) {
      assert.ok(p.words.noun[0] && p.words.noun[1], p.key);
      assert.ok(p.words.newLabel[0] && p.words.newLabel[1], p.key);
      assert.ok(p.words.person[0] && p.words.person[1], p.key);
    }
  });

  it("resolves known slugs", () => {
    assert.equal(resolveTradeProfile("barber").key, "barber");
    assert.equal(resolveTradeProfile("chef").kind, "event");
    assert.equal(resolveTradeProfile("designer").kind, "project");
    assert.equal(resolveTradeProfile("unknown-xyz").key, "beauty");
  });

  it("indexes every slug", () => {
    assert.ok(allTradeTypeSlugs().length >= 10);
  });
});
