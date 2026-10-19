/**
 * H3: the in-memory limiter must not grow without bound under a spray of
 * distinct keys (one per spoofed IP), and must still limit a single key.
 *
 * Run: node_modules/.bin/tsx --test src/lib/rate-limit-bounded.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { rateLimitBucketCount, tryConsumeRateLimit, RATE_LIMIT_MAX_BUCKETS } from "./rate-limit";

test("one key is still limited", () => {
  const k = `h3-single:${Math.random()}`;
  assert.equal(tryConsumeRateLimit(k, 2, 60_000), true);
  assert.equal(tryConsumeRateLimit(k, 2, 60_000), true);
  assert.equal(tryConsumeRateLimit(k, 2, 60_000), false);
});

test("a spray of distinct keys cannot grow the table past its cap", () => {
  for (let i = 0; i < RATE_LIMIT_MAX_BUCKETS + 500; i += 1) {
    tryConsumeRateLimit(`h3-spray:${i}`, 5, 60_000);
  }
  assert.ok(rateLimitBucketCount() <= RATE_LIMIT_MAX_BUCKETS, `table is ${rateLimitBucketCount()}`);
});

test("expired buckets are swept so a fresh window starts clean", async () => {
  const k = `h3-expiry:${Math.random()}`;
  assert.equal(tryConsumeRateLimit(k, 1, 5), true);
  assert.equal(tryConsumeRateLimit(k, 1, 5), false);
  await new Promise((r) => setTimeout(r, 15));
  assert.equal(tryConsumeRateLimit(k, 1, 5), true);
});
