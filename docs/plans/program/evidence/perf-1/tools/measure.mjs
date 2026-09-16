// perf1-measure.mjs <baseURL> <label> [bypassSecret]
// One browser, sequential. Signs in via /api/dev/signin, then for each route:
// hard load -> TTFB (responseStart), LCP, DOMContentLoaded, JS transferred,
// number of RSC fetches + server-action POSTs during load. Then click flows:
// catalog Create -> Continue (create drawer), rail switches, POS mode.
import { chromium } from "playwright";
import fs from "node:fs";

const [, , base, label, bypass] = process.argv;
if (!base || !label) {
  console.error("usage: perf1-measure.mjs <baseURL> <label> [bypass]");
  process.exit(2);
}
const ROUTES = [
  "/admin",
  "/admin/catalog",
  "/admin/catalog?create=1",
  "/admin/pos?mode=counter",
  "/admin/messages",
  "/admin/appts",
];
const rows = [];
const clicks = [];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  extraHTTPHeaders: bypass ? { "x-vercel-protection-bypass": bypass } : {},
});
const page = await ctx.newPage();

// Sign in (307 carries the cookies; adopt them into the context).
const params = new URLSearchParams({ email: "qa-journeys-owner@impronta.test", next: "/admin" });
let signed = false;
for (let i = 0; i < 6 && !signed; i++) {
  const res = await page.request.get(`${base}/api/dev/signin?${params}`, { maxRedirects: 0 });
  if (res.status() === 307) {
    const setCookies = res.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value);
    const u = new URL(base);
    const cookies = setCookies.map((line) => {
      const [pair] = line.split(";");
      const eq = pair.indexOf("=");
      return { name: pair.slice(0, eq).trim(), value: pair.slice(eq + 1).trim(), domain: u.hostname, path: "/" };
    });
    await ctx.addCookies(cookies);
    signed = true;
  } else {
    await page.waitForTimeout(500 * (i + 1));
  }
}
if (!signed) {
  console.error("sign-in failed");
  process.exit(1);
}

// Network accounting per phase.
let rsc = 0;
let actions = 0;
let actionMs = 0;
let rscMs = 0;
const timings = new Map();
page.on("request", (r) => {
  timings.set(r, Date.now());
});
page.on("requestfinished", async (r) => {
  const started = timings.get(r) ?? Date.now();
  const ms = Date.now() - started;
  const url = r.url();
  if (r.method() === "POST" && r.headers()["next-action"]) {
    actions += 1;
    actionMs += ms;
  } else if (r.headers()["rsc"] === "1" || url.includes("_rsc=")) {
    rsc += 1;
    rscMs += ms;
  }
});
function resetNet() {
  rsc = 0;
  actions = 0;
  actionMs = 0;
  rscMs = 0;
}

async function hardLoad(path, warm) {
  resetNet();
  await page.goto(`${base}${path}`, { waitUntil: "load" });
  // Let LCP + hydration + first client fetches settle.
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  const m = await page.evaluate(async () => {
    const nav = performance.getEntriesByType("navigation")[0];
    const lcp = await new Promise((resolve) => {
      let last = 0;
      const po = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) last = e.startTime;
      });
      po.observe({ type: "largest-contentful-paint", buffered: true });
      setTimeout(() => {
        po.disconnect();
        resolve(last);
      }, 300);
    });
    const res = performance.getEntriesByType("resource");
    let jsBytes = 0;
    let jsCount = 0;
    let jsDecoded = 0;
    for (const r of res) {
      if (r.initiatorType === "script" || /\.js(\?|$)/.test(r.name)) {
        jsBytes += r.transferSize || 0;
        jsDecoded += r.decodedBodySize || 0;
        jsCount += 1;
      }
    }
    return {
      ttfb: Math.round(nav.responseStart - nav.requestStart),
      htmlBytes: nav.transferSize,
      dcl: Math.round(nav.domContentLoadedEventEnd),
      load: Math.round(nav.loadEventEnd),
      lcp: Math.round(lcp),
      jsBytes,
      jsDecoded,
      jsCount,
    };
  });
  rows.push({ route: path, warm, ...m, rsc, actions, actionMs, rscMs });
}

for (const r of ROUTES) {
  await hardLoad(r, "cold");
  await hardLoad(r, "warm");
}

// Click flows. Each: reset counters, click, wait for the target, record.
async function clickFlow(name, fn, settleSelector) {
  resetNet();
  const t = Date.now();
  await fn();
  if (settleSelector) await page.waitForSelector(settleSelector, { timeout: 60000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  clicks.push({ name, ms: Date.now() - t, rsc, actions, actionMs, rscMs });
}

await page.goto(`${base}/admin/catalog`, { waitUntil: "networkidle" });
await page.waitForTimeout(3000);
await clickFlow(
  "catalog: Create (list -> type chooser)",
  async () => {
    const btn = page.locator('[data-testid="catalog-create-item"]').first();
    await btn.click();
  },
  '[data-testid="catalog-create-type"]',
);
await clickFlow(
  "catalog: Continue (type chooser -> new item editor)",
  async () => {
    await page.locator('[data-testid="catalog-create-continue"]').click();
  },
  '[data-testid="catalog-item-editor"], [data-testid="catalog-create-type"]',
);
await clickFlow(
  "catalog: browser Back (editor -> list)",
  async () => {
    await page.goBack();
  },
  '[data-testid="catalog-create-item"]',
);
await page.goto(`${base}/admin`, { waitUntil: "networkidle" });
await page.waitForTimeout(5000);
for (const [name, label, settle] of [
  ["rail: Overview -> Catalog", "Menu & catalog", '[data-testid="catalog-create-item"]'],
  ["rail: Catalog -> Messages", "Messages", null],
  ["rail: Messages -> Appts", "Appointments & Classes", null],
  ["rail: Appts -> Overview", "Overview", null],
]) {
  await clickFlow(
    name,
    async () => {
      await page.locator(`[aria-label^="${label}"]`).first().click();
    },
    settle,
  );
}

fs.writeFileSync(
  `/private/tmp/claude-505/-Users-oranpersonal-Desktop-impronta-app/e30ce090-ce88-474f-861f-a6f78cb4f718/scratchpad/perf1-${label}.json`,
  JSON.stringify({ base, label, at: new Date().toISOString(), rows, clicks }, null, 2),
);
console.log(`== ${label} (${base})`);
console.log("route | warm | TTFB ms | LCP ms | DCL ms | HTML KB | JS KB xfer (decoded) | JS files | RSC | actions");
for (const r of rows) {
  console.log(
    `${r.route} | ${r.warm} | ${r.ttfb} | ${r.lcp} | ${r.dcl} | ${Math.round(r.htmlBytes / 1024)} | ${Math.round(r.jsBytes / 1024)} (${Math.round(r.jsDecoded / 1024)}) | ${r.jsCount} | ${r.rsc} | ${r.actions}`,
  );
}
console.log("click | ms to settle | RSC round trips | server actions | action ms | rsc ms");
for (const c of clicks) console.log(`${c.name} | ${c.ms} | ${c.rsc} | ${c.actions} | ${c.actionMs} | ${c.rscMs}`);
await browser.close();
