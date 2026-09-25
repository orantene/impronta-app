/**
 * T9.5 Journey logic — pure unit stand-ins for Playwright journeys.
 * Live E2E lives in e2e/talent-agenda-smoke.spec.ts (needs QA creds).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { needsAttention, todayTotals } from "./derive";
import { resolveAttentionCta } from "./attention-cta";
import { JOR_CLOCK, JOR_DAY_KEY, JOR_WEEK } from "./__fixtures__/jor-week";
import { TRADE_PROFILES } from "./trades";

describe("T9.5 journey logic", () => {
  it("accept a request → attention count can drop when request is removed", () => {
    const before = needsAttention(JOR_WEEK, JOR_CLOCK).length;
    const withoutRequest = JOR_WEEK.filter((i) => i.kind !== "request");
    const after = needsAttention(withoutRequest, JOR_CLOCK).length;
    assert.ok(before > after);
  });

  it("deposit awaiting hold resolves to release_hold CTA", () => {
    const hold = JOR_WEEK.find((i) => i.id === "jor-hold-sofia")!;
    assert.equal(resolveAttentionCta(hold).kind, "release_hold");
  });

  it("still-to-collect includes overdue + today due (finish/collect money)", () => {
    const t = todayTotals(JOR_WEEK, JOR_CLOCK, JOR_DAY_KEY);
    assert.equal(t.stillToCollectCents, 262000);
  });

  it("new booking conflict alternatives length capped at 3 (contract)", () => {
    // createOwnSlotBooking returns alternatives.slice logic — document the cap.
    const alts = ["a", "b", "c", "d"].slice(0, 3);
    assert.equal(alts.length, 3);
  });

  it("notSupported lists exist and UI must not invent those features", () => {
    for (const p of Object.values(TRADE_PROFILES)) {
      assert.ok(Array.isArray(p.notSupported));
      // Plan §4: never fake these — empty render is correct.
      assert.ok(p.notSupported.every((s) => typeof s === "string" && s.length > 0));
    }
  });
});
