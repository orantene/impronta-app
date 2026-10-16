import { test } from "node:test";
import assert from "node:assert/strict";

import {
  bookingAssistantRemainingCents,
  sumBookingAssistantSpendCents,
  utcMonthStartIso,
} from "./spend";

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
