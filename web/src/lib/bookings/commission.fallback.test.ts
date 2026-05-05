/**
 * commission.fallback.test.ts
 *
 * L10 / M15 verification — getFeeBasisPoints fallback behaviour.
 *
 * Tests that:
 *  - Known tiers return their locked basis points.
 *  - Unknown / empty / garbage tier strings fall back to 0 (free / no fee).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { getFeeBasisPoints } from "@/lib/bookings/commission";

// ─── Known tiers (must stay locked) ──────────────────────────────────────────

test("free tier → 0 bp", () => {
  assert.equal(getFeeBasisPoints("free"), 0);
});

test("studio tier → 1100 bp (11.00%)", () => {
  assert.equal(getFeeBasisPoints("studio"), 1100);
});

test("agency tier → 1750 bp (17.50%)", () => {
  assert.equal(getFeeBasisPoints("agency"), 1750);
});

test("network tier → 1750 bp (17.50%)", () => {
  assert.equal(getFeeBasisPoints("network"), 1750);
});

// ─── M15 — unknown-tier fallback MUST be 0, not 1100 ─────────────────────────

test('empty string falls back to 0 bp (M15 safe fail-open)', () => {
  assert.equal(
    getFeeBasisPoints(""),
    0,
    'empty string should return 0 bp, not the studio rate',
  );
});

test('"unknown" falls back to 0 bp (M15 safe fail-open)', () => {
  assert.equal(
    getFeeBasisPoints("unknown"),
    0,
    '"unknown" should return 0 bp, not the studio rate',
  );
});

test('"enterprise" (hypothetical unregistered tier) falls back to 0 bp', () => {
  assert.equal(getFeeBasisPoints("enterprise"), 0);
});

test('"legacy" (unregistered tier) falls back to 0 bp', () => {
  assert.equal(getFeeBasisPoints("legacy"), 0);
});
