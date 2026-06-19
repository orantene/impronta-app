/**
 * rollout-ramp-cron-logic.test.ts — unit tests for the pure guard helpers
 * extracted from the G8 cron route.
 *
 * These tests exercise:
 *   1. parseRolloutCronFlag — truthy/falsy env-var values
 *   2. checkCronSecret — null / wrong / correct / bearer-prefix variants
 *   3. buildRampPatch — mid-ramp re-arm, final tick clears ramp cols, null input
 *
 * No Supabase, no Next.js, no HTTP — pure node:test.
 * Run: node_modules/.bin/tsx --test src/app/api/cron/builder-rollout-ramp/rollout-ramp-cron-logic.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  parseRolloutCronFlag,
  checkCronSecret,
  buildRampPatch,
} from "./rollout-ramp-cron-logic";
import { shouldAutoArchive } from "@/lib/site-admin/builder-core/templates/rollout-ramp";

// ── 1. parseRolloutCronFlag ───────────────────────────────────────────────────

test("parseRolloutCronFlag: falsy values return false", () => {
  assert.equal(parseRolloutCronFlag(undefined), false, "undefined → false");
  assert.equal(parseRolloutCronFlag(""), false, "empty string → false");
  assert.equal(parseRolloutCronFlag("0"), false, '"0" → false');
  assert.equal(parseRolloutCronFlag("false"), false, '"false" → false');
  assert.equal(parseRolloutCronFlag("False"), false, '"False" → false');
  assert.equal(parseRolloutCronFlag("no"), false, '"no" → false');
  assert.equal(parseRolloutCronFlag("off"), false, '"off" → false');
  assert.equal(parseRolloutCronFlag("  "), false, "whitespace → false");
});

test("parseRolloutCronFlag: truthy values return true", () => {
  assert.equal(parseRolloutCronFlag("1"), true, '"1" → true');
  assert.equal(parseRolloutCronFlag("true"), true, '"true" → true');
  assert.equal(parseRolloutCronFlag("True"), true, '"True" → true');
  assert.equal(parseRolloutCronFlag("TRUE"), true, '"TRUE" → true');
  assert.equal(parseRolloutCronFlag("yes"), true, '"yes" → true');
  assert.equal(parseRolloutCronFlag("Yes"), true, '"Yes" → true');
  assert.equal(parseRolloutCronFlag("on"), true, '"on" → true');
  assert.equal(parseRolloutCronFlag("On"), true, '"On" → true');
  // Leading/trailing whitespace is trimmed before comparison.
  assert.equal(parseRolloutCronFlag("  1  "), true, '"  1  " → true');
  assert.equal(parseRolloutCronFlag("  true  "), true, '"  true  " → true');
});

// ── 2. checkCronSecret ───────────────────────────────────────────────────────

test("checkCronSecret: null/undefined/empty header → unauthorized", () => {
  assert.equal(checkCronSecret(null, "secret123").authorized, false, "null → false");
  assert.equal(checkCronSecret(undefined, "secret123").authorized, false, "undefined → false");
  assert.equal(checkCronSecret("", "secret123").authorized, false, "empty string → false");
});

test("checkCronSecret: wrong token in Bearer header → unauthorized", () => {
  assert.equal(
    checkCronSecret("Bearer wrongtoken", "secret123").authorized,
    false,
    "wrong token → false",
  );
  assert.equal(
    checkCronSecret("Bearer ", "secret123").authorized,
    false,
    "empty token after Bearer → false",
  );
});

test("checkCronSecret: correct Bearer header → authorized", () => {
  assert.equal(
    checkCronSecret("Bearer secret123", "secret123").authorized,
    true,
    "correct Bearer token → true",
  );
});

test("checkCronSecret: Bearer is case-insensitive prefix", () => {
  assert.equal(
    checkCronSecret("bearer secret123", "secret123").authorized,
    true,
    "lowercase bearer → true",
  );
  assert.equal(
    checkCronSecret("BEARER secret123", "secret123").authorized,
    true,
    "uppercase BEARER → true",
  );
});

test("checkCronSecret: extra whitespace after Bearer is allowed", () => {
  assert.equal(
    checkCronSecret("Bearer   secret123", "secret123").authorized,
    true,
    "extra spaces after Bearer → true (regexp strips all whitespace)",
  );
});

test("checkCronSecret: bare secret without Bearer prefix → unauthorized", () => {
  // Security: the route always sets the Authorization header with Bearer; a bare
  // secret in the header should NOT be accepted.
  assert.equal(
    checkCronSecret("secret123", "secret123").authorized,
    false,
    "bare secret (no Bearer) → false",
  );
});

// ── 3. buildRampPatch ────────────────────────────────────────────────────────

const BASE_ROW = {
  id: "tmpl-uuid-1",
  rollout_ramp_at: new Date().toISOString(),
};

const TICK_MS = 60_000; // 1 minute for tests (not 24h)

test("buildRampPatch: rollout_ramp_to = null → returns null (caller should skip)", () => {
  const row = { ...BASE_ROW, rollout_percentage: 50, rollout_ramp_to: null };
  assert.equal(buildRampPatch(row, new Date(), TICK_MS), null);
});

test("buildRampPatch: mid-ramp (10 → 100, step 10) re-arms next tick", () => {
  const now = new Date();
  const row = { ...BASE_ROW, rollout_percentage: 10, rollout_ramp_to: 100 };
  const patch = buildRampPatch(row, now, TICK_MS);
  assert.ok(patch !== null, "patch must not be null");
  // One step: 10 + 10 = 20
  assert.equal(patch.rollout_percentage, 20, "advances by one step");
  // Ramp not complete — re-arm at now + TICK_MS
  assert.equal(patch.rollout_ramp_to, undefined, "rollout_ramp_to is NOT cleared");
  assert.ok(
    typeof patch.rollout_ramp_at === "string",
    "rollout_ramp_at is set (re-armed)",
  );
  const reArmedAt = new Date(patch.rollout_ramp_at as string).getTime();
  assert.ok(
    Math.abs(reArmedAt - (now.getTime() + TICK_MS)) < 1000,
    "re-arm timestamp is now + TICK_MS (±1s)",
  );
});

test("buildRampPatch: final tick (95 → 100, step 10) clears ramp columns", () => {
  const now = new Date();
  // 95 + 10 would overshoot 100; computeRampStep clamps to target → 100 → complete.
  const row = { ...BASE_ROW, rollout_percentage: 95, rollout_ramp_to: 100 };
  const patch = buildRampPatch(row, now, TICK_MS);
  assert.ok(patch !== null, "patch must not be null");
  assert.equal(patch.rollout_percentage, 100, "advances to target (clamped)");
  // Ramp complete — both ramp columns cleared.
  assert.equal(patch.rollout_ramp_to, null, "rollout_ramp_to cleared to null");
  assert.equal(patch.rollout_ramp_at, null, "rollout_ramp_at cleared to null");
});

test("buildRampPatch: already at target — returns a patch that clears ramp columns", () => {
  // computeRampStep detects current === target → complete immediately.
  const row = { ...BASE_ROW, rollout_percentage: 100, rollout_ramp_to: 100 };
  const patch = buildRampPatch(row, new Date(), TICK_MS);
  assert.ok(patch !== null, "patch must not be null");
  assert.equal(patch.rollout_percentage, 100);
  assert.equal(patch.rollout_ramp_to, null, "ramp_to cleared on already-complete");
  assert.equal(patch.rollout_ramp_at, null, "ramp_at cleared on already-complete");
});

// ── 4. shouldAutoArchive proxy ───────────────────────────────────────────────
// shouldAutoArchive is a re-export from rollout-ramp.ts; we test its proxy
// behaviour here to keep the cron-logic test file self-contained.

test("shouldAutoArchive: past expiry → true", () => {
  const past = new Date(Date.now() - 1000).toISOString();
  assert.equal(shouldAutoArchive(past, new Date()), true);
});

test("shouldAutoArchive: future expiry → false", () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  assert.equal(shouldAutoArchive(future, new Date()), false);
});

test("shouldAutoArchive: null → false", () => {
  assert.equal(shouldAutoArchive(null, new Date()), false);
});
