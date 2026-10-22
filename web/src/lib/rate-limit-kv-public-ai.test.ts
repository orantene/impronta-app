/** TUL-1630: the anonymous AI routes are limited per network and FAIL CLOSED. Lane: test:ai-guardrails. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import {
  PUBLIC_AI_LIMITS,
  PUBLIC_AI_ROUTES,
  PUBLIC_AI_STORE_ERROR,
  _resetPublicAiLimiterForTests,
  checkPublicAiByIp,
  publicAiKey,
  type PublicAiRoute,
} from "./rate-limit-kv-public-ai";

const saved = { ...process.env };
beforeEach(() => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.VERCEL_ENV;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://pluhdapdnuiulvxmyspd.supabase.co";
  _resetPublicAiLimiterForTests(null);
});
afterEach(() => {
  process.env = { ...saved };
  _resetPublicAiLimiterForTests(null);
});

const limiters = (fn: (k: string) => Promise<{ success: boolean; reset: number }>) =>
  Object.fromEntries(PUBLIC_AI_ROUTES.map((r) => [r, fn])) as Record<PublicAiRoute, typeof fn>;

describe("fail closed", () => {
  test("no store on the real production project: refused for every route", async () => {
    process.env.VERCEL_ENV = "production";
    for (const r of PUBLIC_AI_ROUTES) assert.deepEqual(await checkPublicAiByIp(r, "1.2.3.4"), PUBLIC_AI_STORE_ERROR);
  });
  test("no store anywhere else (dev, CI, preview): allowed, so local work and QA keep going", async () => {
    for (const r of PUBLIC_AI_ROUTES) assert.deepEqual(await checkPublicAiByIp(r, "1.2.3.4"), { ok: true });
  });
  test("a store ERROR refuses (it does not fail open)", async () => {
    _resetPublicAiLimiterForTests(limiters(async () => { throw new Error("redis down"); }));
    for (const r of PUBLIC_AI_ROUTES) assert.deepEqual(await checkPublicAiByIp(r, "1.2.3.4"), PUBLIC_AI_STORE_ERROR);
  });
});

describe("metering", () => {
  test("a spent window refuses with the wait; an open window allows", async () => {
    _resetPublicAiLimiterForTests(limiters(async () => ({ success: false, reset: Date.now() + 5_000 })));
    const r = await checkPublicAiByIp("search", "1.2.3.4");
    assert.equal(r.ok, false);
    assert.ok(!r.ok && r.retryAfterMs > 0 && r.retryAfterMs <= 5_000);
    _resetPublicAiLimiterForTests(limiters(async () => ({ success: true, reset: 0 })));
    assert.deepEqual(await checkPublicAiByIp("search", "1.2.3.4"), { ok: true });
  });
  test("the isolated QA branch uses the in-memory window with the same ceilings, per route and per IP", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fxlankepwnvelxjrahwk.supabase.co";
    const n = PUBLIC_AI_LIMITS["inquiry-draft"];
    for (let i = 0; i < n; i++) assert.equal((await checkPublicAiByIp("inquiry-draft", "9.9.9.9")).ok, true);
    assert.equal((await checkPublicAiByIp("inquiry-draft", "9.9.9.9")).ok, false, "over the ceiling");
    assert.equal((await checkPublicAiByIp("inquiry-draft", "8.8.8.8")).ok, true, "another network is untouched");
    assert.equal((await checkPublicAiByIp("search", "9.9.9.9")).ok, true, "another route is untouched");
  });
  test("keys are namespaced by route and IP", () => {
    assert.equal(publicAiKey("search", " 1.2.3.4 "), "public_ai:search:1.2.3.4");
    assert.equal(publicAiKey("search", null), "public_ai:search:x");
  });
});

describe("wiring: every anonymous AI route calls the guard before any AI work", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  for (const r of PUBLIC_AI_ROUTES) {
    test(r, () => {
      const src = read(`src/app/api/ai/${r}/route.ts`);
      const call = src.indexOf(`guardPublicAiRoute("${r}"`);
      assert.ok(call > 0, "calls the guard with its own name");
      assert.match(src.slice(call, call + 200), /if \(limited\) return limited;/);
      // before the request body is read and before any model / embedding / search work
      assert.ok(call < src.indexOf("request.json("), "before the body is parsed");
      for (const work of ["runInterpretSearchModel(", "assertAiInvocationAllowed(", "getCachedTaxonomyFilterOptions("]) {
        const at = src.indexOf(work);
        if (at > 0 && !src.slice(0, at).includes("import")) assert.ok(call < at || at < 0, `${work} comes after the guard`);
      }
    });
  }
  test("the guard identifies the network, refuses an unknown one, and answers 429", () => {
    const g = read("src/lib/ai/public-ai-guard.ts");
    assert.match(g, /resolveClientIp\(\)/);
    assert.match(g, /if \(!ip\) return NextResponse\.json\([\s\S]*?status: 429/);
    assert.match(g, /status: 429, headers: \{ "Retry-After"/);
  });
  test("PM limits: CGNAT-friendly ceilings, and the 429 text exists in Spanish", () => {
    assert.deepEqual({ ...PUBLIC_AI_LIMITS }, { "inquiry-draft": 25, "interpret-search": 40, search: 60, "refine-suggestions": 40 });
    const g = read("src/lib/ai/public-ai-guard.ts");
    assert.match(g, /Demasiadas solicitudes, intenta de nuevo en unos minutos/);
    assert.match(g, /\(await messagesForRequest\(\)\)\.limited/);
    assert.match(g, /\(await messagesForRequest\(\)\)\.unknownNetwork/);
  });
  test("the limiter is fail-closed and has no fail-open path", () => {
    const l = read("src/lib/rate-limit-kv-public-ai.ts");
    assert.match(l, /return PUBLIC_AI_STORE_ERROR;/);
    assert.doesNotMatch(l, /return failOpen\(/);
  });
});
