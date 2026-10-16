import { test } from "node:test";
import assert from "node:assert/strict";

import { effectiveStatus, planEndedCount } from "./plan-downgrade";
import type { Promo } from "./types";

const base = { id: "p", tz: "UTC", audience: "everyone", is_single_use: false, is_trial: false } as unknown as Promo;
const NOW = "2026-10-14T12:00:00Z";

test("paid plan changes nothing", () => {
  assert.equal(effectiveStatus(base, "live", "paid", NOW), "live");
});

test("free plan ends live and sold out promos, drafts scheduled ones", () => {
  assert.equal(effectiveStatus(base, "live", "free", NOW), "expired");
  assert.equal(effectiveStatus(base, "paused", "free", NOW), "expired");
  assert.equal(effectiveStatus(base, "scheduled", "free", NOW), "draft");
});

test("free plan keeps the trial promo and personal offers; finished promos stay as they are", () => {
  assert.equal(effectiveStatus({ ...base, is_trial: true }, "live", "free", NOW), "live");
  assert.equal(effectiveStatus({ ...base, audience: "one_client" } as Promo, "live", "free", NOW), "live");
  assert.equal(effectiveStatus(base, "expired", "free", NOW), "expired");
  assert.equal(effectiveStatus(base, "draft", "free", NOW), "draft");
});

test("planEndedCount sums ended and reverted, zero on paid", () => {
  const items = [{ promo: base, status: "live" as const }, { promo: base, status: "scheduled" as const }, { promo: { ...base, is_trial: true }, status: "live" as const }];
  assert.equal(planEndedCount(items, "free", NOW), 2);
  assert.equal(planEndedCount(items, "paid", NOW), 0);
});
