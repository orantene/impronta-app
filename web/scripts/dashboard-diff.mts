/**
 * dashboard-diff — headless screenshot pairs: Talent Studio mockup vs the
 * localhost talent dashboard, signed in as the real demo talent (Jor).
 *
 * LOCALHOST ONLY and READ-ONLY: the manifest's `clicks` may only open views
 * (tabs, records, dialogs). Nothing here submits or saves.
 *
 * Usage (from web/):
 *   node --import tsx scripts/dashboard-diff.mts [--only=page1,page2] [--vp=1440,390]
 *
 * Env:
 *   MOCKUP_URL        default http://localhost:8765/
 *   LOCAL_BASE        default http://localhost:3001
 *   DASHBOARD_DIFF_ENV  .env file holding QA_JOR_REAL_EMAIL / QA_JOR_REAL_PASSWORD
 *                     (only needed when the saved storageState is missing or stale)
 *
 * Output: ~/.claude/design-diff/dashboard/<vp>/<page>/{mockup,local}.png,
 *         index.html (contact sheet) and summary.json.
 */
import { chromium, type Browser, type Page } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Entry = {
  page: string;
  mockupScreen: string;
  localPath: string;
  clicks?: string[];
  note?: string;
};

type Result = {
  page: string;
  viewport: number;
  mockupScreen: string;
  localUrl: string;
  mockup: "ok" | string;
  local: "ok" | string;
  localFinalUrl?: string;
  clicksFailed?: string[];
  note?: string;
};

const here = path.dirname(fileURLToPath(import.meta.url));
const MOCKUP_URL = process.env.MOCKUP_URL ?? "http://localhost:8765/";
const LOCAL_BASE = process.env.LOCAL_BASE ?? "http://localhost:3001";
const ROOT = path.join(os.homedir(), ".claude", "design-diff");
const OUT = path.join(ROOT, "dashboard");
const AUTH = path.join(ROOT, ".auth.json");
const ENV_FILE =
  process.env.DASHBOARD_DIFF_ENV ??
  "/Users/oranpersonal/Desktop/impronta-app/.claude/worktrees/pm-apply/web/.env.local";

function assertLocal(url: string): void {
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "[::1]"].includes(host) && !host.endsWith(".localhost")) {
    throw new Error(`dashboard-diff is localhost-only; refusing ${url}`);
  }
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

function readEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

async function waitFor200(url: string, tries = 20): Promise<void> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { redirect: "manual" });
      if (r.status < 500) return;
    } catch {
      /* server restarting */
    }
    await new Promise((r) => setTimeout(r, 15_000));
  }
  throw new Error(`${url} did not answer within ${(tries * 15) / 60} min`);
}

async function ensureAuth(browser: Browser): Promise<void> {
  if (fs.existsSync(AUTH)) {
    const ctx = await browser.newContext({ storageState: AUTH });
    const p = await ctx.newPage();
    await p.goto(`${LOCAL_BASE}/talent/today`, { waitUntil: "domcontentloaded", timeout: 180_000 });
    const ok = !/\/login/.test(p.url());
    await ctx.close();
    if (ok) return;
  }
  const env = readEnv(ENV_FILE);
  const email = process.env.QA_JOR_REAL_EMAIL ?? env.QA_JOR_REAL_EMAIL;
  const password = process.env.QA_JOR_REAL_PASSWORD ?? env.QA_JOR_REAL_PASSWORD;
  if (!email || !password) throw new Error("QA_JOR_REAL_EMAIL / QA_JOR_REAL_PASSWORD not found");
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(`${LOCAL_BASE}/login`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await p.locator('input[type="email"]').waitFor({ state: "visible", timeout: 120_000 });
  await p.fill('input[type="email"]', email);
  await p.fill('input[type="password"]', password);
  await Promise.all([
    p.waitForURL(/\/(talent|admin|workspace)/, { timeout: 180_000 }),
    p.click('button[type="submit"]'),
  ]);
  fs.mkdirSync(ROOT, { recursive: true });
  await ctx.storageState({ path: AUTH });
  fs.chmodSync(AUTH, 0o600);
  await ctx.close();
  console.log("[auth] signed in, storageState saved");
}

async function shootMockup(page: Page, screen: string, vp: number, file: string): Promise<string> {
  // The capture below rearranges the DOM, so every screen starts from a fresh load.
  await page.goto(MOCKUP_URL, { waitUntil: "load" });
  await page.waitForTimeout(800);
  // S / render are script-scoped (let/function) in the prototype, not window props.
  await page.evaluate(
    `S.screen = ${JSON.stringify(screen)}; S.w = ${vp}; render(); window.scrollTo(0, 0);`,
  );
  await page.waitForTimeout(700);
  // #stage holds a desktop frame (1440x900, CSS-scaled down) and a phone frame
  // (390x844), each with an internal scroller. Pick the frame for this viewport,
  // drop the scale and unclip the scrollers so the capture is the full page at
  // real width.
  const picked = await page.evaluate((w: number) => {
    const frames = [...document.querySelectorAll<HTMLElement>("#stage .frame")];
    const frame = frames.find((f) => f.style.width === `${w}px`) ?? frames[w >= 1000 ? 0 : 1] ?? frames[0];
    if (!frame) return -1;
    frames.forEach((f) => f.removeAttribute("data-diff-pick"));
    frame.setAttribute("data-diff-pick", "1");
    // Lift the frame out of the stage so nothing else paints over or around it.
    frame.style.transform = "none";
    frame.style.height = "auto";
    frame.style.margin = "0";
    document.body.appendChild(frame);
    for (const el of [...document.body.children]) {
      if (el !== frame && el instanceof HTMLElement) el.style.display = "none";
    }
    document.body.style.margin = "0";
    // No named helpers in here: tsx wraps them in __name(), which the page lacks.
    for (const el of frame.querySelectorAll<HTMLElement>(".f")) {
      el.style.height = "auto";
      el.style.maxHeight = "none";
    }
    for (let pass = 0; pass < 3; pass++) {
      for (const el of frame.querySelectorAll<HTMLElement>("*")) {
        const cs = getComputedStyle(el);
        if (/(auto|scroll|hidden)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4) {
          el.style.overflow = "visible";
          el.style.flex = "none";
          el.style.height = "auto";
          el.style.maxHeight = "none";
        }
      }
    }
    return frames.indexOf(frame);
  }, vp);
  if (picked < 0) return "no frame in #stage";
  await page.waitForTimeout(300);
  const box = await page.locator('.frame[data-diff-pick="1"]').boundingBox();
  if (!box) return "frame not visible";
  await page.screenshot({
    path: file,
    fullPage: true,
    clip: { x: box.x, y: box.y, width: box.width, height: box.height },
  });
  return "ok";
}

async function shootLocal(
  page: Page,
  entry: Entry,
  file: string,
): Promise<{ status: string; finalUrl: string; failed: string[] }> {
  const url = `${LOCAL_BASE}${entry.localPath}`;
  const failed: string[] = [];
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForLoadState("networkidle", { timeout: 45_000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
    for (const sel of entry.clicks ?? []) {
      try {
        const target = page.locator(sel).first();
        // Overlapping calendar blocks intercept the pointer; fall back to a forced click.
        await target.click({ timeout: 10_000 }).catch(() => target.click({ timeout: 10_000, force: true }));
        await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
        await page.waitForTimeout(1200);
      } catch {
        failed.push(sel);
      }
    }
    await page.screenshot({ path: file, fullPage: true });
    return { status: "ok", finalUrl: page.url(), failed };
  } catch (e) {
    return { status: `error: ${(e as Error).message.split("\n")[0]}`, finalUrl: page.url(), failed };
  }
}

function contactSheet(results: Result[]): string {
  const rows = results
    .map((r) => {
      const dir = `${r.viewport}/${r.page}`;
      const warn = [
        r.mockup !== "ok" ? `mockup: ${r.mockup}` : "",
        r.local !== "ok" ? `local: ${r.local}` : "",
        r.clicksFailed?.length ? `clicks failed: ${r.clicksFailed.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      return `<section><h2>${r.page} <small>${r.viewport}px · mockup <code>${r.mockupScreen}</code> · local <code>${r.localFinalUrl ?? r.localUrl}</code></small></h2>${
        warn ? `<p class="warn">${warn}</p>` : ""
      }<div class="pair"><figure><figcaption>Mockup</figcaption><a href="${dir}/mockup.png"><img loading="lazy" src="${dir}/mockup.png"></a></figure><figure><figcaption>Local</figcaption><a href="${dir}/local.png"><img loading="lazy" src="${dir}/local.png"></a></figure></div></section>`;
    })
    .join("\n");
  return `<!doctype html><meta charset="utf-8"><title>Dashboard diff</title><style>
body{font:14px system-ui;margin:16px;background:#f6f6f6;color:#222}section{background:#fff;margin:0 0 24px;padding:12px;border-radius:8px}
h2{font-size:16px;margin:0 0 8px}small{font-weight:400;color:#666}.warn{color:#b00020}.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start}
figure{margin:0}img{width:100%;border:1px solid #ddd}figcaption{font-weight:600;margin-bottom:4px}</style>
<h1>Talent dashboard · mockup vs localhost</h1><p>Generated ${new Date().toISOString()}</p>${rows}`;
}

async function main(): Promise<void> {
  assertLocal(MOCKUP_URL);
  assertLocal(LOCAL_BASE);
  const manifest = JSON.parse(
    fs.readFileSync(path.join(here, "dashboard-diff.manifest.json"), "utf8"),
  ) as Entry[];
  const only = arg("only")?.split(",");
  const viewports = (arg("vp") ?? "1440,390").split(",").map(Number);
  const entries = only ? manifest.filter((e) => only.includes(e.page)) : manifest;

  await waitFor200(`${LOCAL_BASE}/login`);
  const browser = await chromium.launch();
  await ensureAuth(browser);

  const results: Result[] = [];
  for (const vp of viewports) {
    const height = vp >= 1000 ? 900 : 844;
    const mockCtx = await browser.newContext({ viewport: { width: Math.max(vp + 240, 1440), height: 900 } });
    const mock = await mockCtx.newPage();
    const localCtx = await browser.newContext({
      storageState: AUTH,
      viewport: { width: vp, height },
      isMobile: vp < 768,
      hasTouch: vp < 768,
    });
    const local = await localCtx.newPage();
    for (const e of entries) {
      const dir = path.join(OUT, String(vp), e.page);
      fs.mkdirSync(dir, { recursive: true });
      const m = await shootMockup(mock, e.mockupScreen, vp, path.join(dir, "mockup.png")).catch(
        (err: Error) => `error: ${err.message.split("\n")[0]}`,
      );
      const l = await shootLocal(local, e, path.join(dir, "local.png"));
      const r: Result = {
        page: e.page,
        viewport: vp,
        mockupScreen: e.mockupScreen,
        localUrl: e.localPath,
        mockup: m,
        local: l.status,
        localFinalUrl: l.finalUrl.replace(LOCAL_BASE, ""),
        clicksFailed: l.failed.length ? l.failed : undefined,
        note: e.note,
      };
      results.push(r);
      console.log(`[${vp}] ${e.page}: mockup=${m} local=${l.status}${l.failed.length ? ` clicksFailed=${l.failed.length}` : ""}`);
    }
    await mockCtx.close();
    await localCtx.close();
  }
  await browser.close();
  // A partial run (--only / --vp) replaces its own pairs and keeps the rest of the sheet.
  const summaryFile = path.join(OUT, "summary.json");
  let merged = results;
  if ((only || arg("vp")) && fs.existsSync(summaryFile)) {
    const prev = (JSON.parse(fs.readFileSync(summaryFile, "utf8")) as { results: Result[] }).results;
    const key = (r: Result) => `${r.viewport}/${r.page}`;
    const fresh = new Map(results.map((r) => [key(r), r]));
    merged = prev.map((r) => fresh.get(key(r)) ?? r);
    for (const r of results) if (!prev.some((p) => key(p) === key(r))) merged.push(r);
  }
  fs.writeFileSync(summaryFile, JSON.stringify({ generatedAt: new Date().toISOString(), results: merged }, null, 2));
  fs.writeFileSync(path.join(OUT, "index.html"), contactSheet(merged));
  console.log(`[done] ${merged.length} pairs → ${path.join(OUT, "index.html")}`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
