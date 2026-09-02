import assert from "node:assert/strict";
import { test } from "node:test";

import { estimateCostUsd, rateForModel } from "./ai-model-costs";

/**
 * Rates verified against Anthropic's published pricing on 2026-09-02.
 *
 * This file exists because `claude-sonnet-5` sat at $3/$15 — the Sonnet 4.6
 * rate — while the model actually costs $2/$10. Nothing caught it: a wrong
 * number here does not break a build, fail a request or surface an error. It
 * silently overstated spend by 50%, which made the $25 monthly cap trip a third
 * early, and would have been read as "the AI is expensive" rather than "the
 * table is wrong".
 *
 * Pinning the rates does not make them true — only a human checking the pricing
 * page does that. What it buys is that changing one is now a deliberate edit
 * with a date attached, instead of a number nobody ever looks at again.
 */
const VERIFIED_2026_09_02: Array<{ model: string; inputPerM: number; outputPerM: number }> = [
  { model: "claude-opus-5", inputPerM: 5, outputPerM: 25 },
  { model: "claude-opus-4-8", inputPerM: 5, outputPerM: 25 },
  { model: "claude-sonnet-5", inputPerM: 2, outputPerM: 10 },
  { model: "claude-haiku-4-5", inputPerM: 1, outputPerM: 5 },
  { model: "claude-fable-5-1", inputPerM: 10, outputPerM: 50 },
];

for (const row of VERIFIED_2026_09_02) {
  test(`${row.model} is billed at $${row.inputPerM}/$${row.outputPerM} per MTok`, () => {
    const rate = rateForModel(row.model);
    assert.equal(rate.inputPerM, row.inputPerM, `${row.model} input rate drifted`);
    assert.equal(rate.outputPerM, row.outputPerM, `${row.model} output rate drifted`);
  });
}

test("Sonnet 5 is cheaper than Sonnet 4.6 — the specific prefix must win", () => {
  // Longest-prefix matching means row ORDER is load-bearing. If the generic
  // "claude-sonnet" row were moved above "claude-sonnet-5", every Sonnet 5 call
  // would silently bill at the older, higher 4.6 rate — which is exactly the
  // bug this file was written for.
  const five = rateForModel("claude-sonnet-5");
  const generic = rateForModel("claude-sonnet-4-6");
  assert.ok(
    five.inputPerM < generic.inputPerM,
    "claude-sonnet-5 resolved to the generic Sonnet rate — check row order",
  );
});

test("a dated snapshot id resolves to its family rate", () => {
  // Ids can arrive with a date suffix from the provider response.
  assert.deepEqual(rateForModel("claude-sonnet-5-20260101"), rateForModel("claude-sonnet-5"));
});

test("an unknown model falls back rather than costing zero", () => {
  // A zero rate would under-report spend and let a cap never trip, which is the
  // more dangerous direction of being wrong.
  const rate = rateForModel("some-model-we-have-never-seen");
  assert.ok(rate.inputPerM > 0 && rate.outputPerM > 0);
});

test("null and empty model ids do not throw", () => {
  assert.ok(rateForModel(null).inputPerM > 0);
  assert.ok(rateForModel(undefined).inputPerM > 0);
  assert.ok(rateForModel("").inputPerM > 0);
});

test("estimateCostUsd matches hand arithmetic for a real support answer", () => {
  // A typical guest answer: ~2k input tokens of grounding + thread, ~300 out.
  // On Sonnet 5 that is 2000/1e6*2 + 300/1e6*10 = 0.004 + 0.003 = $0.007.
  const cost = estimateCostUsd("claude-sonnet-5", 2000, 300);
  assert.ok(Math.abs(cost - 0.007) < 1e-9, `expected ~$0.007, got $${cost}`);
});

test("estimateCostUsd treats missing token counts as zero, not NaN", () => {
  assert.equal(estimateCostUsd("claude-sonnet-5", null, null), 0);
  assert.equal(estimateCostUsd("claude-sonnet-5", undefined, undefined), 0);
});
