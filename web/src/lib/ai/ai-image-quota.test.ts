import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_IMAGE_QUOTA,
  IMAGE_QUOTA_BY_PLAN,
  estimateImageCostUsd,
  imageQuotaForPlan,
  quotaDecision,
} from "./ai-image-quota";

test("imageQuotaForPlan maps known plans and falls back to free", () => {
  assert.equal(imageQuotaForPlan("free"), IMAGE_QUOTA_BY_PLAN.free);
  assert.equal(imageQuotaForPlan("studio"), IMAGE_QUOTA_BY_PLAN.studio);
  assert.equal(imageQuotaForPlan("agency"), IMAGE_QUOTA_BY_PLAN.agency);
  // unknown / null / undefined → the conservative free cap
  assert.equal(imageQuotaForPlan("enterprise"), DEFAULT_IMAGE_QUOTA);
  assert.equal(imageQuotaForPlan(null), DEFAULT_IMAGE_QUOTA);
  assert.equal(imageQuotaForPlan(undefined), DEFAULT_IMAGE_QUOTA);
});

test("caps are a real cost fuse: free < studio < agency and all bounded", () => {
  assert.ok(IMAGE_QUOTA_BY_PLAN.free < IMAGE_QUOTA_BY_PLAN.studio);
  assert.ok(IMAGE_QUOTA_BY_PLAN.studio < IMAGE_QUOTA_BY_PLAN.agency);
  // Even the top tier stays under ~$10/month at the estimated per-image cost.
  assert.ok(IMAGE_QUOTA_BY_PLAN.agency * estimateImageCostUsd() < 10);
});

test("quotaDecision allows under cap, blocks at/over cap, never negative remaining", () => {
  assert.deepEqual(quotaDecision(0, 3), { allowed: true, remaining: 3 });
  assert.deepEqual(quotaDecision(2, 3), { allowed: true, remaining: 1 });
  assert.deepEqual(quotaDecision(3, 3), { allowed: false, remaining: 0 });
  assert.deepEqual(quotaDecision(9, 3), { allowed: false, remaining: 0 });
  // defensive against bad inputs
  assert.deepEqual(quotaDecision(-5, 3), { allowed: true, remaining: 3 });
});
