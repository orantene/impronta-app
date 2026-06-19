/**
 * rollout-ramp.test.ts — unit tests for the G8 timed-rollout pure logic: the
 * per-tick ramp-advance math (computeRampStep) and the auto-archive predicate
 * (shouldAutoArchive). The DB-backed cron + ramp-stamp action are not exercised
 * here; we test the deterministic helpers they delegate to.
 *
 * Runner: node:test + node:assert/strict (tsx --test).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  clampRollout,
  computeRampStep,
  shouldAutoArchive,
  DEFAULT_RAMP_STEP,
  ROLLOUT_MIN,
  ROLLOUT_MAX,
} from "./rollout-ramp";

describe("clampRollout", () => {
  it("rounds and clamps into [0,100]", () => {
    assert.equal(clampRollout(10.4), 10);
    assert.equal(clampRollout(10.6), 11);
    assert.equal(clampRollout(-5), ROLLOUT_MIN);
    assert.equal(clampRollout(150), ROLLOUT_MAX);
  });

  it("returns the min for non-finite input", () => {
    assert.equal(clampRollout(NaN), ROLLOUT_MIN);
    assert.equal(clampRollout(Infinity), ROLLOUT_MIN);
    assert.equal(clampRollout(-Infinity), ROLLOUT_MIN);
  });
});

describe("computeRampStep — up-ramp (canary 10% → 100%)", () => {
  it("advances by the default step toward the target", () => {
    const r = computeRampStep({ current: 10, target: 100 });
    assert.equal(r.next, 10 + DEFAULT_RAMP_STEP);
    assert.equal(r.complete, false);
    assert.equal(r.changed, true);
  });

  it("respects an explicit step size", () => {
    const r = computeRampStep({ current: 10, target: 100, step: 25 });
    assert.equal(r.next, 35);
    assert.equal(r.complete, false);
  });

  it("does not overshoot the target on the final tick", () => {
    const r = computeRampStep({ current: 95, target: 100, step: 10 });
    assert.equal(r.next, 100);
    assert.equal(r.complete, true);
    assert.equal(r.changed, true);
  });

  it("the weekend ramp reaches 100 over a sequence of ticks", () => {
    let pct = 10;
    let ticks = 0;
    let done = false;
    while (!done && ticks < 50) {
      const r = computeRampStep({ current: pct, target: 100 });
      pct = r.next;
      done = r.complete;
      ticks++;
    }
    assert.equal(pct, 100);
    assert.equal(done, true);
    assert.equal(ticks, 9); // 10→20→…→100 in 9 ten-point ticks
  });
});

describe("computeRampStep — down-ramp (100% → 10%)", () => {
  it("steps downward toward a lower target", () => {
    const r = computeRampStep({ current: 100, target: 10, step: 30 });
    assert.equal(r.next, 70);
    assert.equal(r.complete, false);
    assert.equal(r.changed, true);
  });

  it("does not undershoot the target", () => {
    const r = computeRampStep({ current: 15, target: 10, step: 30 });
    assert.equal(r.next, 10);
    assert.equal(r.complete, true);
  });
});

describe("computeRampStep — edge cases", () => {
  it("is immediately complete with no change when already at target", () => {
    const r = computeRampStep({ current: 100, target: 100 });
    assert.equal(r.next, 100);
    assert.equal(r.complete, true);
    assert.equal(r.changed, false);
  });

  it("clamps current and target into range before stepping", () => {
    const r = computeRampStep({ current: -5, target: 150, step: 10 });
    assert.equal(r.next, 10); // current clamps to 0, then +10
    assert.equal(r.complete, false);
  });

  it("coerces a non-positive / non-finite step to the default", () => {
    assert.equal(computeRampStep({ current: 0, target: 100, step: 0 }).next, DEFAULT_RAMP_STEP);
    assert.equal(computeRampStep({ current: 0, target: 100, step: -5 }).next, DEFAULT_RAMP_STEP);
    assert.equal(computeRampStep({ current: 0, target: 100, step: NaN }).next, DEFAULT_RAMP_STEP);
  });

  it("derives direction from current→target, not the step sign (negative step ⇒ default)", () => {
    // A negative step is treated as invalid and coerced to the default magnitude;
    // direction is current→target, so 100 toward 0 moves DOWN by the default step.
    const r = computeRampStep({ current: 100, target: 0, step: -20 });
    assert.equal(r.next, 100 - DEFAULT_RAMP_STEP);
  });

  it("rounds a fractional step", () => {
    const r = computeRampStep({ current: 0, target: 100, step: 12.6 });
    assert.equal(r.next, 13);
  });
});

describe("shouldAutoArchive", () => {
  const now = new Date("2026-06-18T12:00:00.000Z");

  it("archives when the expiry is in the past", () => {
    assert.equal(shouldAutoArchive("2026-06-17T12:00:00.000Z", now), true);
  });

  it("archives at the exact expiry instant (>= boundary)", () => {
    assert.equal(shouldAutoArchive("2026-06-18T12:00:00.000Z", now), true);
  });

  it("does not archive when the expiry is in the future", () => {
    assert.equal(shouldAutoArchive("2026-06-19T12:00:00.000Z", now), false);
  });

  it("never archives a null / undefined / empty expiry", () => {
    assert.equal(shouldAutoArchive(null, now), false);
    assert.equal(shouldAutoArchive(undefined, now), false);
    assert.equal(shouldAutoArchive("", now), false);
  });

  it("never archives an unparseable expiry (degrade safe)", () => {
    assert.equal(shouldAutoArchive("not-a-date", now), false);
  });
});
