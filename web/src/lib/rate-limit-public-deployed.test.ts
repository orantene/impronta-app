/**
 * TUL-1342 (failed QA on c97ccc7): 68 requests to the public business catalog against a 30/min limit all
 * returned 200. The in-memory fallback is per serverless instance, so on a deployed environment it must
 * never stand in for the shared store.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { GET as healthGet } from "@/app/api/health/guest-chat/route";
import { resetFailOpenStateForTests } from "./rate-limit-fail-open";
import { _resetLimiterSingletonForTests, checkBookingSlots, checkPublicCatalog } from "./rate-limit-kv";
import { _resetPublicFloorWarningsForTests, isDeployedEnv, runPublicLimiter } from "./rate-limit-public-floor";

const KEYS = ["VERCEL_ENV", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"] as const;
const saved: Record<string, string | undefined> = {};
const errors: string[] = [];
const realError = console.error;

beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  errors.length = 0;
  console.error = (...a: unknown[]) => void errors.push(a.map(String).join(" "));
  _resetLimiterSingletonForTests();
  _resetPublicFloorWarningsForTests();
  resetFailOpenStateForTests();
});
afterEach(() => {
  console.error = realError;
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  _resetLimiterSingletonForTests();
});

test("a deployed env (production or preview) without Upstash FAILS CLOSED on both public limiters, from the very first request", async () => {
  for (const env of ["production", "preview"]) {
    process.env.VERCEL_ENV = env;
    _resetLimiterSingletonForTests();
    _resetPublicFloorWarningsForTests();
    const ip = `203.0.113.${env.length}-${Math.random()}`;
    for (let i = 0; i < 3; i += 1) {
      const c = await checkPublicCatalog(ip);
      assert.equal(c.ok, false, `${env}: catalog request ${i + 1} must be refused`);
      assert.equal((await checkBookingSlots(ip)).ok, false, `${env}: slots request ${i + 1} must be refused`);
    }
  }
});

test("on a deployed env the limiter is NOT the in-memory one: the same first request is allowed locally and refused there", async () => {
  const ip = `198.51.100.7-${Math.random()}`;
  assert.equal((await checkPublicCatalog(ip)).ok, true, "local dev / CI keeps the in-memory limit");
  process.env.VERCEL_ENV = "production";
  _resetLimiterSingletonForTests();
  assert.equal((await checkPublicCatalog(`${ip}-b`)).ok, false);
});

test("the fail-closed condition is logged ONCE per limiter, naming the missing store", async () => {
  process.env.VERCEL_ENV = "production";
  for (let i = 0; i < 5; i += 1) await checkPublicCatalog("192.0.2.1");
  const mine = errors.filter((e) => e.includes("checkPublicCatalog"));
  assert.equal(mine.length, 1);
  assert.match(mine[0], /FAILING CLOSED/);
});

test("a store error on a public limiter does not turn into 'no limit' on a deployed env (per-instance floor), but stays open locally", async () => {
  const broken = { limit: async () => Promise.reject(new Error("upstash down")) };
  process.env.VERCEL_ENV = "production";
  const key = `public_catalog:${Math.random()}`;
  let allowed = 0;
  for (let i = 0; i < 40; i += 1) if ((await runPublicLimiter("checkPublicCatalog", broken, key, 30)).ok) allowed += 1;
  assert.equal(allowed, 30, "30 pass, then the floor refuses");
  delete process.env.VERCEL_ENV;
  const localKey = `public_catalog:${Math.random()}`;
  for (let i = 0; i < 40; i += 1) assert.equal((await runPublicLimiter("checkPublicCatalog", broken, localKey, 30)).ok, true);
});

test("a working store is passed through untouched (allow, and deny with the store's retry time)", async () => {
  process.env.VERCEL_ENV = "production";
  assert.deepEqual(await runPublicLimiter("x", { limit: async () => ({ success: true, reset: 0 }) }, "k", 30), { ok: true });
  const denied = await runPublicLimiter("x", { limit: async () => ({ success: false, reset: Date.now() + 5000 }) }, "k", 30);
  assert.equal(denied.ok, false);
  assert.ok(!denied.ok && denied.retryAfterMs > 0 && denied.retryAfterMs <= 5000);
});

test("isDeployedEnv: only VERCEL_ENV production | preview", () => {
  assert.equal(isDeployedEnv({ VERCEL_ENV: "production" } as never), true);
  assert.equal(isDeployedEnv({ VERCEL_ENV: "preview" } as never), true);
  assert.equal(isDeployedEnv({ VERCEL_ENV: "development" } as never), false);
  assert.equal(isDeployedEnv({} as never), false);
});

test("the health route reports the store state and how the public limiters behave, never a secret", async () => {
  process.env.VERCEL_ENV = "production";
  const res = await healthGet();
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(body.rateLimitFloor, "disabled");
  assert.equal(body.store, "unset");
  assert.equal(body.publicLimiter, "fail_closed");
  assert.equal(typeof body.failOpenCount, "number");
  assert.doesNotMatch(JSON.stringify(body), /https?:\/\//);
});
