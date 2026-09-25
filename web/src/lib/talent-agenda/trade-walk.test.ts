import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  TRADE_WALK_KEYS,
  TRADE_WALK_SCREENS,
  assertTradeWalkComplete,
  buildTradeWalkMatrix,
} from "./trade-walk";

describe("T9.1 trade walk", () => {
  it("covers 10 trades × 4 screens", () => {
    const matrix = buildTradeWalkMatrix();
    assert.equal(matrix.length, 40);
    assert.equal(TRADE_WALK_KEYS.length, 10);
    assert.equal(TRADE_WALK_SCREENS.length, 4);
    assert.doesNotThrow(() => assertTradeWalkComplete(matrix));
  });

  it("chef/dancer are event; design is project; beauty is slot", () => {
    const matrix = buildTradeWalkMatrix();
    assert.equal(matrix.find((c) => c.trade === "chef")?.kind, "event");
    assert.equal(matrix.find((c) => c.trade === "dancer")?.kind, "event");
    assert.equal(matrix.find((c) => c.trade === "design")?.kind, "project");
    assert.equal(matrix.find((c) => c.trade === "beauty")?.kind, "slot");
  });

  it("dancer overnight display is set", () => {
    const dancer = buildTradeWalkMatrix().find((c) => c.trade === "dancer");
    assert.ok(dancer?.calendar.overnightDisplayToHour);
  });
});
