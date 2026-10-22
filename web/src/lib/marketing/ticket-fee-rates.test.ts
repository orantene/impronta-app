import assert from "node:assert/strict";
import { test } from "node:test";
import { ticketFeeRate } from "./ticket-fee-rates";
import type { PassThroughDecision } from "@/lib/billing/pass-through-arming";

const row = {} as never;
const on = (platformBps: number, planFeeBps: Record<string, number> | null): PassThroughDecision => ({ mode: "on", row, platformBps, planFeeBps });

test("per-plan fees give a range across plans, customer-only", () => {
  assert.deepEqual(ticketFeeRate({ decision: on(150, { free: 150, pro: 100, studio: 0 }), legacyTakeBps: null }), { minBps: 0, maxBps: 150, customerOnly: true });
});
test("a plan with no stored fee pays the platform rate, so it counts in the range", () => {
  assert.deepEqual(ticketFeeRate({ decision: on(150, { pro: 100 }), legacyTakeBps: null }), { minBps: 100, maxBps: 150, customerOnly: true });
  assert.deepEqual(ticketFeeRate({ decision: on(150, null), legacyTakeBps: null }), { minBps: 150, maxBps: 150, customerOnly: true });
});
test("an invalid stored fee is ignored, never invented", () => {
  assert.deepEqual(ticketFeeRate({ decision: on(150, { a: 99999, b: -1, c: 1.5, d: 200 }), legacyTakeBps: null }), { minBps: 150, maxBps: 200, customerOnly: true });
});
test("unavailable shows no figure at all", () => {
  assert.equal(ticketFeeRate({ decision: { mode: "unavailable", detail: "x" }, legacyTakeBps: 600 }), null);
});
test("legacy mode states the live take; a missing or invalid take shows nothing, with no built-in default", () => {
  assert.deepEqual(ticketFeeRate({ decision: { mode: "off" }, legacyTakeBps: 600 }), { minBps: 600, maxBps: 600, customerOnly: false });
  assert.equal(ticketFeeRate({ decision: { mode: "off" }, legacyTakeBps: null }), null);
  assert.equal(ticketFeeRate({ decision: { mode: "off" }, legacyTakeBps: -5 }), null);
});
