/**
 * TUL-1342: the public catalog + booking-slots limiters must keep limiting
 * when Upstash env is missing (they used to be a no-op, so a missing env
 * silently removed the only abuse floor on two public endpoints).
 *
 * Run: node_modules/.bin/tsx --test src/lib/rate-limit-kv-public-fallback.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  _resetLimiterSingletonForTests,
  checkBookingSlots,
  checkPublicCatalog,
} from "./rate-limit-kv";

function withoutUpstash() {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  _resetLimiterSingletonForTests();
}

test("public catalog: 30 per minute per IP is enforced with no Upstash env", async () => {
  withoutUpstash();
  const ip = `203.0.113.${Math.floor(Math.random() * 250)}-cat`;
  for (let i = 0; i < 30; i += 1) {
    assert.equal((await checkPublicCatalog(ip)).ok, true, `request ${i + 1} allowed`);
  }
  const r = await checkPublicCatalog(ip);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.code, "rate_limited");
    assert.ok((r.retryAfterMs ?? 0) > 0);
  }
});

test("booking slots: 60 per minute per IP is enforced with no Upstash env", async () => {
  withoutUpstash();
  const ip = `198.51.100.${Math.floor(Math.random() * 250)}-slots`;
  for (let i = 0; i < 60; i += 1) {
    assert.equal((await checkBookingSlots(ip)).ok, true);
  }
  assert.equal((await checkBookingSlots(ip)).ok, false);
});

test("the two buckets stay separate and one IP does not limit another", async () => {
  withoutUpstash();
  const a = `192.0.2.1-${Math.random()}`;
  const b = `192.0.2.2-${Math.random()}`;
  for (let i = 0; i < 31; i += 1) await checkPublicCatalog(a);
  assert.equal((await checkPublicCatalog(a)).ok, false);
  assert.equal((await checkBookingSlots(a)).ok, true, "slots bucket untouched by catalog");
  assert.equal((await checkPublicCatalog(b)).ok, true);
});
