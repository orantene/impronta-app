import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bookingAssistantMonthlyCapCents,
  bookingAssistantMonthlyCapReached,
  bookingAssistantPlanBand,
  isHubCreditsTenant,
} from "./credits";

test("free / basic / null share the tight per-talent monthly cap", () => {
  assert.equal(bookingAssistantPlanBand(null), "free");
  assert.equal(bookingAssistantPlanBand("talent_basic"), "free");
  assert.equal(bookingAssistantMonthlyCapCents(null), 500);
  assert.equal(bookingAssistantMonthlyCapCents("talent_basic"), 500);
});

test("paid talent plans get a higher monthly cap", () => {
  assert.equal(bookingAssistantPlanBand("talent_pro"), "paid");
  assert.equal(bookingAssistantPlanBand("talent_portfolio"), "paid");
  assert.equal(bookingAssistantMonthlyCapCents("talent_pro"), 2000);
});

test("monthly cap reached is inclusive of the limit", () => {
  assert.equal(bookingAssistantMonthlyCapReached(499, "talent_basic"), false);
  assert.equal(bookingAssistantMonthlyCapReached(500, "talent_basic"), true);
  assert.equal(bookingAssistantMonthlyCapReached(2000, "talent_pro"), true);
});

test("hub tenant id must never be treated as billable talent credits", () => {
  assert.equal(isHubCreditsTenant("hub", "hub"), true);
  assert.equal(isHubCreditsTenant("agency-1", "hub"), false);
  assert.equal(isHubCreditsTenant(null, "hub"), false);
});

import {
  bookingAssistantRemainingCents,
  sumBookingAssistantSpendCents,
  utcMonthStartIso,
} from "./credits";

test("month reset boundary is the first instant of the UTC month", () => {
  assert.equal(utcMonthStartIso(new Date("2026-10-31T23:59:59.999Z")), "2026-10-01T00:00:00.000Z");
  assert.equal(utcMonthStartIso(new Date("2026-11-01T00:00:00.000Z")), "2026-11-01T00:00:00.000Z");
  assert.equal(utcMonthStartIso(new Date("2026-01-15T12:00:00Z")), "2026-01-01T00:00:00.000Z");
});

test("spend sum counts at least 1 cent per paid row and ignores bad rows", () => {
  assert.equal(
    sumBookingAssistantSpendCents([
      { context_jsonb: { cost_usd: 0.0004 } },
      { context_jsonb: { cost_usd: 0.25 } },
      { context_jsonb: { cost_usd: 0 } },
      { context_jsonb: { cost_usd: "x" } },
      { context_jsonb: { cost_usd: Number.NaN } },
      { context_jsonb: null },
      {},
    ]),
    26,
  );
});

test("remaining cents never goes negative", () => {
  assert.equal(bookingAssistantRemainingCents(120, "talent_basic"), 380);
  assert.equal(bookingAssistantRemainingCents(9999, "talent_basic"), 0);
  assert.equal(bookingAssistantRemainingCents(Number.NaN, "talent_pro"), 2000);
});
