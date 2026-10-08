import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { todayPrimaryAction } from "./today-view";
import { resolveTradeProfile } from "./trades";

describe("todayPrimaryAction", () => {
  it("is booking-first by default and for unknown trades", () => {
    assert.equal(todayPrimaryAction(undefined), "booking");
    assert.equal(todayPrimaryAction(null), "booking");
    assert.equal(todayPrimaryAction("pay_at_appointment"), "booking");
    assert.equal(todayPrimaryAction("deposit_long"), "booking");
    assert.equal(todayPrimaryAction(resolveTradeProfile(undefined).money.pattern), "booking");
  });
  it("keeps quote first for quote-based trades", () => {
    assert.equal(todayPrimaryAction("quote_deposit_balance"), "quote");
    assert.equal(todayPrimaryAction("quote_milestone"), "quote");
  });
});
