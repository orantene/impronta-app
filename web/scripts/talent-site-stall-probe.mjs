/**
 * TUL-444 rerun check: sequential anonymous GETs against a public talent site.
 *
 * Every request must return 200 with the whole body inside the budget
 * (default 10 s). Requests run one at a time so a stall shows as a stall, not
 * as contention. Each line carries the `x-vercel-id` so a slow request can be
 * looked up in the Vercel function logs.
 *
 *   node scripts/talent-site-stall-probe.mjs
 *   node scripts/talent-site-stall-probe.mjs --host book-jorgelina.tulala.digital --paths /,/en --n 50 --budget 10000
 *
 * Look-only: plain GETs, no cookies, nothing written.
 * Exit codes: 0 every request passed, 1 at least one failed or ran over budget.
 */

const DEFAULTS = { host: "book-jorgelina.tulala.digital", paths: "/,/en", n: "50", budget: "10000" };

function parseArgs(argv) {
  const out = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i].replace(/^--/, "");
    if (key in out && argv[i + 1] !== undefined) {
      out[key] = argv[i + 1];
      i += 1;
    }
  }
  return {
    host: out.host,
    paths: out.paths.split(",").map((p) => p.trim()).filter(Boolean),
    n: Number(out.n),
    budgetMs: Number(out.budget),
  };
}

async function probe(url, budgetMs) {
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budgetMs);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "follow", cache: "no-store" });
    const ttfbMs = performance.now() - started;
    const body = await res.arrayBuffer();
    return {
      status: res.status,
      ttfbMs,
      totalMs: performance.now() - started,
      bytes: body.byteLength,
      vercelId: res.headers.get("x-vercel-id") ?? "",
      cache: res.headers.get("x-vercel-cache") ?? "",
      error: null,
    };
  } catch (err) {
    return {
      status: 0,
      ttfbMs: null,
      totalMs: performance.now() - started,
      bytes: 0,
      vercelId: "",
      cache: "",
      error: controller.signal.aborted ? `over ${budgetMs} ms` : String(err?.message ?? err),
    };
  } finally {
    clearTimeout(timer);
  }
}

function pct(sorted, p) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

const s = (ms) => (ms == null ? "-" : `${(ms / 1000).toFixed(2)}s`);

async function main() {
  const { host, paths, n, budgetMs } = parseArgs(process.argv.slice(2));
  let failures = 0;
  for (const path of paths) {
    const url = `https://${host}${path}`;
    const totals = [];
    let pathFailures = 0;
    console.log(`\n${url} × ${n} (budget ${s(budgetMs)})`);
    for (let i = 1; i <= n; i += 1) {
      const r = await probe(url, budgetMs);
      const ok = r.status === 200 && r.error == null && r.totalMs <= budgetMs;
      totals.push(r.totalMs);
      if (!ok) pathFailures += 1;
      const mark = ok ? "ok  " : "FAIL";
      console.log(
        `${mark} #${String(i).padStart(2)} ${r.status || "---"} ttfb ${s(r.ttfbMs)} total ${s(r.totalMs)} ${r.bytes}B ${r.cache} ${r.vercelId}${r.error ? ` ${r.error}` : ""}`,
      );
    }
    const sorted = [...totals].sort((a, b) => a - b);
    const avg = totals.reduce((a, b) => a + b, 0) / Math.max(1, totals.length);
    console.log(
      `${path}: ${n - pathFailures}/${n} ok · avg ${s(avg)} · p50 ${s(pct(sorted, 50))} · p95 ${s(pct(sorted, 95))} · max ${s(sorted.at(-1))}`,
    );
    failures += pathFailures;
  }
  console.log(failures === 0 ? "\nPASS" : `\nFAIL: ${failures} request(s) failed or ran over budget`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
