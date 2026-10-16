#!/usr/bin/env node
/**
 * probe-first-load: a rerunnable, READ-ONLY first-load probe for a public URL.
 *
 * Why it exists (TUL-534 issues table): GRK-087 "intermittent first-load
 * ERR_TIMED_OUT", GRK-008 "/en blank Loading for ~10 s" and SPRINT-444 ("no
 * rerunnable 50-request script in repo") all ask the same question: over N plain
 * requests, does every one answer 200 inside the budget, and how often is it a
 * CDN HIT? This script answers it the same way every time, so a QA run, a PR
 * and a release smoke can be compared.
 *
 *   node scripts/qa/probe-first-load.mjs <url> [--n 50] [--concurrency 4]
 *        [--budget-ms 10000] [--json]
 *   node scripts/qa/probe-first-load.mjs --selftest
 *
 * What it sends: plain cookieless GETs, no auth header, nothing written
 * anywhere. Caps: n <= 200, concurrency <= 8. It never follows the request with
 * anything else, so it is safe against any public host, including production.
 * Do not point it at an SSO-gated preview (it will just report 302/401).
 *
 * Reported per run: status counts, x-vercel-cache counts (HIT / MISS / STALE /
 * none), time to response headers (TTFB) and to the full body (total) at p50 /
 * p95 / max, and how many requests failed or went over the budget. Exit code 1
 * when any request fails, is not 2xx, or exceeds the budget; 0 otherwise.
 */

const MAX_N = 200;
const MAX_CONCURRENCY = 8;

/** @param {number[]} sorted ascending @param {number} p 0..100 */
export function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

/**
 * @typedef {{ status: number | null, cache: string | null, ttfbMs: number | null, totalMs: number | null, error: string | null }} Sample
 * @param {Sample[]} samples
 * @param {number} budgetMs
 */
export function summarize(samples, budgetMs) {
  const statuses = {};
  const caches = {};
  const ttfb = [];
  const total = [];
  let failed = 0;
  let overBudget = 0;
  let non2xx = 0;
  for (const s of samples) {
    const sk = s.status === null ? "error" : String(s.status);
    statuses[sk] = (statuses[sk] ?? 0) + 1;
    const ck = s.cache ?? "none";
    caches[ck] = (caches[ck] ?? 0) + 1;
    if (s.error || s.status === null) failed += 1;
    else if (s.status < 200 || s.status >= 300) non2xx += 1;
    if (s.ttfbMs !== null) ttfb.push(s.ttfbMs);
    if (s.totalMs !== null) {
      total.push(s.totalMs);
      if (s.totalMs > budgetMs) overBudget += 1;
    } else if (s.error) {
      overBudget += 1; // a timeout or abort counts as over budget
    }
  }
  ttfb.sort((a, b) => a - b);
  total.sort((a, b) => a - b);
  const stat = (arr) => ({ p50: percentile(arr, 50), p95: percentile(arr, 95), max: arr.length ? arr[arr.length - 1] : null });
  return {
    requests: samples.length,
    statuses,
    cache: caches,
    ttfbMs: stat(ttfb),
    totalMs: stat(total),
    failed,
    non2xx,
    overBudget,
    budgetMs,
    ok: failed === 0 && non2xx === 0 && overBudget === 0 && samples.length > 0,
  };
}

/** @param {string} url @param {number} timeoutMs @returns {Promise<Sample>} */
async function one(url, timeoutMs) {
  const t0 = performance.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow", cache: "no-store", signal: ctl.signal, headers: { "user-agent": "tulala-probe-first-load/1" } });
    const ttfbMs = performance.now() - t0;
    await res.arrayBuffer();
    return { status: res.status, cache: res.headers.get("x-vercel-cache"), ttfbMs, totalMs: performance.now() - t0, error: null };
  } catch (e) {
    return { status: null, cache: null, ttfbMs: null, totalMs: null, error: e instanceof Error ? e.name : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

/** Bounded-concurrency map that keeps result order. */
async function pool(count, concurrency, fn) {
  const out = new Array(count);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, count) }, async () => {
    while (next < count) {
      const i = next++;
      out[i] = await fn(i);
    }
  });
  await Promise.all(workers);
  return out;
}

function parseArgs(argv) {
  const opts = { url: null, n: 50, concurrency: 4, budgetMs: 10_000, json: false, selftest: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--selftest") opts.selftest = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--n") opts.n = Number(argv[++i]);
    else if (a === "--concurrency") opts.concurrency = Number(argv[++i]);
    else if (a === "--budget-ms") opts.budgetMs = Number(argv[++i]);
    else if (!a.startsWith("--") && !opts.url) opts.url = a;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return opts;
}

function selftest() {
  const assert = (cond, msg) => {
    if (!cond) {
      console.error(`selftest FAILED: ${msg}`);
      process.exit(1);
    }
  };
  const ok = (ms, cache = "HIT") => ({ status: 200, cache, ttfbMs: ms / 2, totalMs: ms, error: null });
  const good = summarize([ok(100), ok(200), ok(300, "MISS"), ok(400)], 10_000);
  assert(good.ok === true, "all-200 under budget is ok");
  assert(good.statuses["200"] === 4 && good.cache.HIT === 3 && good.cache.MISS === 1, "status + cache counts");
  assert(good.totalMs.p50 === 200 && good.totalMs.max === 400, "p50/max");
  assert(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95) === 10, "p95 uses nearest-rank");
  assert(percentile([], 50) === null, "empty percentile is null");
  const slow = summarize([ok(100), ok(11_000)], 10_000);
  assert(slow.ok === false && slow.overBudget === 1, "a request over the budget fails the run");
  const timeout = summarize([ok(100), { status: null, cache: null, ttfbMs: null, totalMs: null, error: "AbortError" }], 10_000);
  assert(timeout.ok === false && timeout.failed === 1 && timeout.overBudget === 1 && timeout.statuses.error === 1, "an abort counts as failed and over budget");
  const redirect = summarize([{ status: 302, cache: null, ttfbMs: 5, totalMs: 6, error: null }], 10_000);
  assert(redirect.ok === false && redirect.non2xx === 1, "a non-2xx fails the run");
  assert(summarize([], 10_000).ok === false, "zero requests is not a pass");
  console.log("probe-first-load selftest OK");
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.selftest) return selftest();
  if (!opts.url) {
    console.error("usage: node scripts/qa/probe-first-load.mjs <url> [--n 50] [--concurrency 4] [--budget-ms 10000] [--json]");
    process.exit(2);
  }
  const u = new URL(opts.url);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Only http(s) URLs.");
  if (!Number.isInteger(opts.n) || opts.n < 1 || opts.n > MAX_N) throw new Error(`--n must be 1..${MAX_N}`);
  if (!Number.isInteger(opts.concurrency) || opts.concurrency < 1 || opts.concurrency > MAX_CONCURRENCY) throw new Error(`--concurrency must be 1..${MAX_CONCURRENCY}`);
  if (!Number.isFinite(opts.budgetMs) || opts.budgetMs <= 0) throw new Error("--budget-ms must be a positive number");
  const samples = await pool(opts.n, opts.concurrency, () => one(u.toString(), opts.budgetMs * 1.5));
  const summary = { url: u.toString(), ...summarize(samples, opts.budgetMs) };
  if (opts.json) console.log(JSON.stringify(summary, null, 2));
  else {
    const r = (v) => (v === null ? "n/a" : `${Math.round(v)} ms`);
    console.log(`${summary.ok ? "✓" : "✗"} ${summary.url}`);
    console.log(`  ${summary.requests} requests · statuses ${JSON.stringify(summary.statuses)} · x-vercel-cache ${JSON.stringify(summary.cache)}`);
    console.log(`  TTFB   p50 ${r(summary.ttfbMs.p50)} · p95 ${r(summary.ttfbMs.p95)} · max ${r(summary.ttfbMs.max)}`);
    console.log(`  total  p50 ${r(summary.totalMs.p50)} · p95 ${r(summary.totalMs.p95)} · max ${r(summary.totalMs.max)}`);
    console.log(`  failed ${summary.failed} · non-2xx ${summary.non2xx} · over ${summary.budgetMs} ms: ${summary.overBudget}`);
  }
  process.exit(summary.ok ? 0 : 1);
}

import { fileURLToPath } from "node:url";
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(2);
  });
}
