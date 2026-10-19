/**
 * H3: the in-memory limiter must not grow without bound under a spray of
 * distinct keys, and a spray must never reset a real attacker's counter on a
 * sensitive (auth/login) key. Sensitive limits belong in rate-limit-kv.
 *
 * Run: node_modules/.bin/tsx --test src/lib/rate-limit-bounded.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  RATE_LIMIT_MAX_BUCKETS,
  rateLimitBucketCount,
  rateLimitStrictBucketCount,
  tryConsumeRateLimit,
} from "./rate-limit";

test("one key is still limited", () => {
  const k = `h3-single:${Math.random()}`;
  assert.equal(tryConsumeRateLimit(k, 2, 60_000), true);
  assert.equal(tryConsumeRateLimit(k, 2, 60_000), true);
  assert.equal(tryConsumeRateLimit(k, 2, 60_000), false);
});

test("a spray of public keys cannot grow the public table past its cap", () => {
  for (let i = 0; i < RATE_LIMIT_MAX_BUCKETS + 500; i += 1) {
    tryConsumeRateLimit(`h3-spray:${i}`, 5, 60_000);
  }
  assert.ok(rateLimitBucketCount() <= RATE_LIMIT_MAX_BUCKETS, `table is ${rateLimitBucketCount()}`);
});

test("a public spray never touches the strict (auth) table", () => {
  const attacker = `auth-password:attacker-${Math.random()}`;
  assert.equal(tryConsumeRateLimit(attacker, 2, 60_000), true);
  assert.equal(tryConsumeRateLimit(attacker, 2, 60_000), true);
  assert.equal(tryConsumeRateLimit(attacker, 2, 60_000), false);
  for (let i = 0; i < RATE_LIMIT_MAX_BUCKETS * 2; i += 1) {
    tryConsumeRateLimit(`dir-api:spray-${i}`, 5, 60_000);
  }
  assert.equal(tryConsumeRateLimit(attacker, 2, 60_000), false, "the attacker's counter survived the spray");
});

test("a strict-table spray fails CLOSED for new keys and never resets an existing counter", () => {
  const attacker = `auth-otp-verify:attacker-${Math.random()}`;
  assert.equal(tryConsumeRateLimit(attacker, 1, 60_000), true);
  assert.equal(tryConsumeRateLimit(attacker, 1, 60_000), false);
  for (let i = 0; i < RATE_LIMIT_MAX_BUCKETS + 200; i += 1) {
    tryConsumeRateLimit(`auth-otp-verify:spray-${i}`, 5, 60_000);
  }
  assert.ok(rateLimitStrictBucketCount() <= RATE_LIMIT_MAX_BUCKETS);
  assert.equal(tryConsumeRateLimit(attacker, 1, 60_000), false, "existing counter survived");
  assert.equal(tryConsumeRateLimit(`auth-otp-verify:brand-new-${Math.random()}`, 5, 60_000), false, "full strict table denies new keys");
});

test("expired buckets are swept so a fresh window starts clean", async () => {
  const k = `h3-expiry:${Math.random()}`;
  assert.equal(tryConsumeRateLimit(k, 1, 5), true);
  assert.equal(tryConsumeRateLimit(k, 1, 5), false);
  await new Promise((r) => setTimeout(r, 15));
  assert.equal(tryConsumeRateLimit(k, 1, 5), true);
});
