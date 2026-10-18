import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeGetStartedRedirect, cronSecretPlan, judgeTalentSiteCacheHeaders } from "./smoke-decisions.mjs";

const resp = (status, headers = {}) => ({ status, headers });
const PUBLIC_CC = "public, s-maxage=60, stale-while-revalidate=300";

test("talent-site cache: anonymous cacheable + cookie MISS passes", () => {
  const r = judgeTalentSiteCacheHeaders(
    resp(200, { "cache-control": PUBLIC_CC, "x-vercel-cache": "STALE" }),
    resp(200, { "cache-control": PUBLIC_CC, "x-vercel-cache": "MISS" }),
  );
  assert.equal(r.ok, true);
});
test("talent-site cache: cookie BYPASS passes; cookie private cache-control passes", () => {
  const anon = resp(200, { "cache-control": PUBLIC_CC, "x-vercel-cache": "HIT" });
  assert.equal(judgeTalentSiteCacheHeaders(anon, resp(200, { "x-vercel-cache": "BYPASS" })).ok, true);
  assert.equal(judgeTalentSiteCacheHeaders(anon, resp(200, { "cache-control": "private, no-store", "x-vercel-cache": "HIT" })).ok, true);
});
test("talent-site cache: cookie request served HIT / STALE / REVALIDATED / PRERENDER fails (the TUL-445/755 leak)", () => {
  const anon = resp(200, { "cache-control": PUBLIC_CC, "x-vercel-cache": "HIT" });
  for (const vc of ["HIT", "STALE", "REVALIDATED", "PRERENDER", "hit"]) {
    const r = judgeTalentSiteCacheHeaders(anon, resp(200, { "cache-control": PUBLIC_CC, "x-vercel-cache": vc }));
    assert.equal(r.ok, false, vc);
    assert.match(r.reason, /shared cache/);
  }
});
test("talent-site cache: anonymous page that is private / no-store / not 200 fails", () => {
  const cookie = resp(200, { "x-vercel-cache": "MISS" });
  assert.equal(judgeTalentSiteCacheHeaders(resp(200, { "cache-control": "private, max-age=0" }), cookie).ok, false);
  assert.equal(judgeTalentSiteCacheHeaders(resp(200, { "cache-control": "no-store" }), cookie).ok, false);
  assert.equal(judgeTalentSiteCacheHeaders(resp(404, {}), cookie).ok, false);
  assert.equal(judgeTalentSiteCacheHeaders(resp(200, { "cache-control": PUBLIC_CC }), resp(500, {})).ok, false);
});
test("talent-site cache: a cookie request with no cache signal at all fails closed", () => {
  const r = judgeTalentSiteCacheHeaders(resp(200, { "cache-control": PUBLIC_CC }), resp(200, { "cache-control": PUBLIC_CC }));
  assert.equal(r.ok, false);
  assert.match(r.reason, /neither MISS\/BYPASS nor private/);
});

test("get-started: 307 to absolute /start passes", () => {
  assert.equal(judgeGetStartedRedirect(307, "https://tulala.digital/start").ok, true);
});
test("get-started: 307 to relative /start (with query) passes", () => {
  assert.equal(judgeGetStartedRedirect(307, "/start").ok, true);
  assert.equal(judgeGetStartedRedirect(307, "/start?src=x").ok, true);
});
test("get-started: 200 now fails (not weakened)", () => {
  assert.equal(judgeGetStartedRedirect(200, "").ok, false);
});
test("get-started: other redirect statuses fail", () => {
  for (const s of [301, 302, 308, 404, 500]) {
    assert.equal(judgeGetStartedRedirect(s, "/start").ok, false, String(s));
  }
});
test("get-started: 307 to the old /?start= target fails", () => {
  assert.equal(judgeGetStartedRedirect(307, "/?start=1").ok, false);
});
test("get-started: 307 with missing or wrong Location fails", () => {
  assert.equal(judgeGetStartedRedirect(307, undefined).ok, false);
  assert.equal(judgeGetStartedRedirect(307, "").ok, false);
  assert.equal(judgeGetStartedRedirect(307, "/get-started").ok, false);
  assert.equal(judgeGetStartedRedirect(307, "/restart").ok, false);
});

test("cron secret: absent values skip with the exact one-line message", () => {
  for (const v of [undefined, null, "", "   "]) {
    assert.deepEqual(cronSecretPlan(v), { action: "skip", message: "skipped: CRON_SECRET not set" });
  }
});
test("cron secret: present value runs and never leaks into the plan", () => {
  const plan = cronSecretPlan("s3cr3t-value");
  assert.deepEqual(plan, { action: "run" });
  assert.equal(JSON.stringify(plan).includes("s3cr3t"), false);
});
