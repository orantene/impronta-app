#!/usr/bin/env node
/**
 * Talent dashboard + page builder sweep (Playwright, local server only).
 *
 *   node scripts/qa/dashboard-sweep/run.mjs [--users valeria,diego,jor] [--widths 390,1280]
 *      [--stages nav,settings,presence,builder,services,messages] [--base-url http://localhost:3001] [--out dir]
 *
 * QA users only. Writes are allowed for valeria + diego (revert-on-exit); jor is read-only.
 * Output: web/qa-evidence/dashboard-sweep/<timestamp>/{report.html,findings.json,<user>-<width>/*.png}
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { loadEnvLocal } from "../../load-env-local.mjs";
import { COLLECT_LAYOUT, COLLECT_LINKS, COLLECT_TEXT, Recorder, buildState, englishLeaks, serverDir } from "./lib.mjs";
import { STAGES } from "./flows.mjs";

loadEnvLocal();
const WEB = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const o = { users: ["valeria", "diego", "jor"], widths: [390, 1280], stages: ["nav", "settings", "presence", "builder", "services", "messages"], baseUrl: "http://localhost:3001", out: null };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i], v = () => process.argv[++i];
  if (a === "--users") o.users = v().split(",");
  else if (a === "--widths") o.widths = v().split(",").map(Number);
  else if (a === "--stages") o.stages = v().split(",");
  else if (a === "--base-url") o.baseUrl = v().replace(/\/$/, "");
  else if (a === "--out") o.out = v();
  else { console.error("unknown flag " + a); process.exit(2); }
}
if (!["localhost", "127.0.0.1"].includes(new URL(o.baseUrl).hostname)) { console.error("local server only"); process.exit(2); }

const E = process.env;
const USERS = {
  valeria: { email: E.QA_FRESH_EMAIL, password: E.QA_FRESH_PASSWORD, code: "TAL-93901", writes: true },
  diego: { email: E.QA_FREE_EMAIL, password: E.QA_FREE_PASSWORD, code: "TAL-QAFIXFREE", writes: true },
  jor: { email: E.QA_JOR_CLONE_EMAIL, password: E.QA_JOR_CLONE_PASSWORD, code: "TAL-93900", writes: false },
};

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = o.out || join(WEB, "qa-evidence", "dashboard-sweep", stamp);
mkdirSync(outDir, { recursive: true });
const rec = new Recorder(outDir, WEB);
const browser = await chromium.launch();

async function login(name) {
  const u = USERS[name];
  if (!u.email || !u.password) throw new Error(`missing credentials for ${name} in web/.env.local`);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([{ name: "locale", value: "es", url: o.baseUrl }]);
  const p = await ctx.newPage();
  await p.goto(`${o.baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await p.getByLabel(/email|correo/i).fill(u.email);
  await p.getByLabel(/password|contraseña/i).fill(u.password);
  await p.getByRole("button", { name: /sign in|log in|iniciar|entrar/i }).click();
  await p.waitForURL((x) => !x.pathname.startsWith("/login"), { timeout: 45000 });
  const st = await ctx.storageState();
  await ctx.close();
  return st;
}

/** Per-page checks shared by every stage. */
export function makeSession(page, ctx) {
  const events = [];
  const origin = new URL(o.baseUrl).origin;
  const seenEv = new Set();
  const push = (e) => { const key = e.k + "|" + e.text.replace(/\d{3,}/g, "#"); if (/_vercel\/(speed-insights|insights)/.test(e.text) || (e.k === "console" && /_vercel\/(speed-insights|insights)|status of 404/.test(e.text))) return; if (seenEv.has(key)) return; seenEv.add(key); events.push(e); };
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|DevTools|chrome-extension|net::ERR_ABORTED/i.test(m.text())) push({ k: "console", text: m.text().slice(0, 300), url: page.url() }); });
  page.on("pageerror", (e) => push({ k: "pageerror", text: String(e.message).slice(0, 300), url: page.url() }));
  page.on("response", (r) => {
    const u = r.url();
    if (!u.startsWith(origin)) return;
    const s = r.status();
    if (s >= 500) push({ k: "5xx", text: `${r.request().method()} ${u.replace(origin, "")} -> ${s}`, url: page.url() });
    else if (s === 404 && r.request().resourceType() !== "document" && !/_next\/image|favicon/.test(u)) push({ k: "404", text: `${r.request().method()} ${u.replace(origin, "")} -> 404`, url: page.url() });
  });
  page.on("requestfailed", (r) => { if (r.url().startsWith(origin) && !/ERR_ABORTED/.test(r.failure()?.errorText || "") ) push({ k: "reqfail", text: `${r.url().replace(origin, "")} ${r.failure()?.errorText}`, url: page.url() }); });
  const cookieSeen = (globalThis.__cookieSeen ||= new Set());
  const linkCache = new Map();
  const leakSeen = new Set();
  const s = {
    events, mark: () => events.length,
    drain(label, since, shot) {
      for (const e of events.slice(since)) {
        const sev = e.k === "5xx" || e.k === "pageerror" ? "high" : e.k === "console" ? "medium" : "medium";
        rec.add(ctx, { page: label, element: e.k, severity: sev, what: `${e.k}: ${e.text}`, expected: "No console errors, uncaught exceptions or server errors", screenshot: shot, grep: e.k === "console" ? e.text.slice(0, 40) : "" });
      }
    },
    async dismissCookies() {
      const rej = page.getByRole("button", { name: /^Rechazar$|^Reject/ }).first();
      if (!(await rej.isVisible().catch(() => false))) return;
      if (!cookieSeen.has(ctx.user + ctx.width)) {
        cookieSeen.add(ctx.user + ctx.width);
        const overlap = await page.evaluate(() => {
          const banner = [...document.querySelectorAll("*")].find((e) => /Usamos cookies/.test(e.innerText || "") && e.getBoundingClientRect().height < 200 && getComputedStyle(e).position === "fixed") || null;
          if (!banner) return [];
          const br = banner.getBoundingClientRect();
          return [...document.querySelectorAll("button,a")].filter((b) => { if (banner.contains(b)) return false; const r = b.getBoundingClientRect(); return r.width && r.top < br.bottom && r.bottom > br.top && r.left < br.right && r.right > br.left && r.top >= 0 && r.bottom <= innerHeight + 1; }).map((b) => (b.innerText || b.getAttribute("aria-label") || "").trim().slice(0, 30)).filter(Boolean).slice(0, 6);
        }).catch(() => []);
        const sh = await rec.shot(ctx, page, "cookie banner overlap");
        if (overlap.length) rec.add(ctx, { page: "Shell / banner de cookies", element: "banner de cookies", severity: "medium", what: `The cookie banner covers interactive controls (${overlap.join(", ")}); with the banner open they cannot be clicked`, expected: "Banner does not hide navigation or action buttons (reserve space or move it)", screenshot: sh, grep: "Usamos cookies" });
      }
      await rej.click().catch(() => {});
      await page.waitForTimeout(400);
    },
    async waitContent(label, t0 = Date.now()) {
      await s.dismissCookies();
      let ok = true;
      await page.waitForFunction(() => { const m = document.querySelector("#tulala-talent-content") || document.querySelector("main") || document.body; const t = m.innerText.trim(); return t.length > 30 && !/^(cargando|loading)/i.test(t) && !/Cargando tu sitio/.test(t); }, null, { timeout: 25000 }).catch(() => { ok = false; });
      const ms = Date.now() - t0;
      rec.time(ctx, label, ms, "time-to-content");
      return { ok, ms };
    },
    /** overflow, english leaks, dead links, slow, loading-stuck */
    async audit(label, { ms, ok = true, links = true, leaks = true } = {}) {
      const linkMode = links;
      const since = events.length;
      await page.waitForTimeout(700);
      const shot = await rec.shot(ctx, page, label);
      if (!ok) rec.add(ctx, { page: label, element: "page", severity: "high", what: `Content never finished loading (25s)`, expected: "Page content within a few seconds", screenshot: shot });
      else if (ms > 6000) rec.add(ctx, { page: label, element: "page", severity: "high", what: `Slow: ${ms} ms to content`, expected: "< 3 s", screenshot: shot });
      else if (ms > 3000) rec.add(ctx, { page: label, element: "page", severity: "medium", what: `Slow: ${ms} ms to content`, expected: "< 3 s", screenshot: shot });
      const lay = await page.evaluate(COLLECT_LAYOUT).catch(() => null);
      if (lay && (lay.overflowX > 2 || lay.offenders.length)) rec.add(ctx, { page: label, element: lay.offenders[0] || "document", severity: ctx.width <= 480 ? "high" : "medium", what: `Layout break: horizontal overflow ${lay.overflowX}px; offenders: ${lay.offenders.join(" | ")}`, expected: "No horizontal scroll or content wider than the viewport", screenshot: shot });
      if (lay && lay.clipped?.length) rec.add(ctx, { page: label, element: lay.clipped[0], severity: "medium", what: `Control clipped by its container: ${lay.clipped.join(" | ")}`, expected: "Controls fully visible (wrap or shrink instead of clipping)", screenshot: shot });
      if (leaks) {
        const lk = englishLeaks(await page.evaluate(COLLECT_TEXT).catch(() => []));
        for (const t of lk.slice(0, 12)) if (!leakSeen.has(t)) { leakSeen.add(t); rec.add(ctx, { page: label, element: `text "${t.slice(0, 60)}"`, severity: "medium", what: `English text on the Spanish dashboard: "${t.slice(0, 120)}"`, expected: "Spanish copy when locale=es", screenshot: shot, grep: t }); }
      }
      if (links) await s.checkLinks(label, shot, links === "external");
      s.drain(label, since, shot);
    },
    async checkLinks(label, shot, externalOnly = false) {
      const ls = await page.evaluate(COLLECT_LINKS).catch(() => []);
      let ext = 0;
      for (const l of ls) {
        const h = l.href;
        if (h === null || h === "" || h === "#" || /^javascript:/i.test(h)) { rec.add(ctx, { page: label, element: `link "${l.text}"`, severity: "medium", what: `Dead link (href=${JSON.stringify(h)})`, expected: "Link goes somewhere", screenshot: shot, grep: l.text }); continue; }
        if (h.startsWith("#") || /^(mailto|tel|sms):/.test(h) || /sign-?out|log-?out|\/auth\/|\/api\//.test(h)) continue;
        const abs = l.abs;
        const same = abs.startsWith(origin);
        if (externalOnly && same) continue;
        if (!same && ++ext > 8) continue;
        if (!linkCache.has(abs)) {
          let st;
          try { const r = await ctx.pw.request.get(abs, { timeout: 20000, maxRedirects: 5 }); st = { s: r.status(), final: r.url() }; } catch (e) { st = { s: 0, err: String(e.message).slice(0, 80) }; }
          linkCache.set(abs, st);
        }
        const st = linkCache.get(abs);
        if (st.s >= 400 || st.s === 0) rec.add(ctx, { page: label, element: `link "${l.text}" -> ${h}`, severity: st.s >= 500 || st.s === 0 ? "high" : "medium", what: `Link returns ${st.s || st.err}`, expected: "2xx", screenshot: shot, grep: l.text });
        else if (same && /\/login/.test(st.final) && !/\/login/.test(h)) rec.add(ctx, { page: label, element: `link "${l.text}" -> ${h}`, severity: "medium", what: "Link redirects to /login while signed in", expected: "Opens the destination", screenshot: shot, grep: l.text });
      }
    },
  };
  return s;
}

/** run one named step; records failure, console/5xx and a screenshot */
export function makeStep(ctx, page, sess) {
  return async function step(stage, label, name, fn, opts = {}) {
    const since = sess.mark();
    let result = "ok", shot = null;
    try { await fn(); }
    catch (e) {
      result = "FAILED: " + String(e.message).split("\n")[0].slice(0, 160);
      shot = await rec.shot(ctx, page, `${label} ${name} FAILED`);
      rec.add(ctx, { page: label, element: name, severity: opts.sev || "medium", what: `Step failed: ${result.slice(8)}`, expected: opts.expected || `${name} works`, screenshot: shot, grep: opts.grep });
      await page.keyboard.press("Escape").catch(() => {});
    }
    if (!shot && !opts.noShot) shot = await rec.shot(ctx, page, `${label} ${name}`);
    sess.drain(`${label} / ${name}`, since, shot);
    rec.steps.push({ user: ctx.user, width: ctx.width, stage, name: `${label}: ${name}`, result });
    return result === "ok";
  };
}

const SDIR = serverDir(new URL(o.baseUrl).port || 3001);
const sleepMs = (ms) => new Promise((res) => setTimeout(res, ms));
async function serverUp() {
  try { const r = await fetch(`${o.baseUrl}/login`, { signal: AbortSignal.timeout(30000) }); return r.status === 200; } catch { return false; }
}
async function waitStable() {
  const t = Date.now();
  let waited = false;
  for (;;) {
    const st = buildState(SDIR);
    if (!st.building && !st.id.startsWith("unknown") && (await serverUp())) break;
    if (Date.now() - t > 40 * 60000) { console.log("  (gave up waiting for a stable server after 40 min)"); break; }
    console.log("  (waiting: server dir is rebuilding or the app is not answering)"); waited = true; await sleepMs(20000);
  }
  if (waited) await sleepMs(10000);
}
const t00 = Date.now();
console.log("server dir:", SDIR, "build:", buildState(SDIR).id);
for (const name of o.users) {
  if (!USERS[name]) { console.error("unknown user " + name); continue; }
  let state;
  let lastErr; state = null;
  for (let i = 0; i < 3 && !state; i++) { await waitStable(); try { state = await login(name); } catch (e) { lastErr = e; } }
  try { if (!state) throw lastErr; } catch (e) { console.error(`LOGIN FAILED ${name}: ${e.message}`); rec.add({ user: name, width: 0 }, { page: "Login", element: "login", severity: "critical", what: `Login failed: ${e.message}`, expected: "QA user can sign in" }); continue; }
  for (const width of o.widths) {
    const bctx = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"], storageState: state, viewport: { width, height: width < 600 ? 844 : 900 }, locale: "es-MX", isMobile: width < 600, hasTouch: width < 600 });
    await bctx.addCookies([{ name: "locale", value: "es", url: o.baseUrl }]);
    const page = await bctx.newPage();
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(60000);
    const ctx = { user: name, width, pw: bctx, base: o.baseUrl, cfg: USERS[name] };
    const sess = makeSession(page, ctx);
    const step = makeStep(ctx, page, sess);
    const stageList = o.stages.flatMap((s) => (s === "nav" ? Object.keys(STAGES).filter((k) => k.startsWith("nav:")) : [s]));
    for (const st of stageList) {
      if (!STAGES[st]) continue;
      for (let attempt = 1; attempt <= 3; attempt++) {
        await waitStable();
        const b0 = buildState(SDIR);
        const sn = rec.snapshot();
        console.log(`[${((Date.now() - t00) / 1000).toFixed(0)}s] ${name}@${width} ${st} (attempt ${attempt}, build ${b0.id})`);
        try { await STAGES[st]({ page, ctx, sess, step, rec, base: o.baseUrl }); }
        catch (e) { rec.add(ctx, { page: st, element: "stage", severity: "high", what: `Stage crashed: ${String(e.message).split("\n")[0]}`, expected: "Stage completes" }); }
        const b1 = buildState(SDIR);
        if (b1.id === b0.id && !b1.building) { if (attempt > 1) rec.invalidated.push(`${name}@${width} ${st}: re-run ${attempt - 1}x because the server build changed mid-stage`); break; }
        console.log(`  build changed/running during stage (${b0.id} -> ${b1.id}); discarding and retrying`);
        rec.rollback(sn);
        if (attempt === 3) { rec.invalidated.push(`${name}@${width} ${st}: server build kept changing; results from the last attempt kept and may include rebuild artifacts`); }
        await page.goto("about:blank").catch(() => {});
      }
      rec.write({ stamp, summary: "partial (in progress)" });
    }
    await bctx.close();
  }
}
await browser.close();
rec.write({ stamp, summary: `Users ${o.users.join(", ")}; widths ${o.widths.join(", ")}; locale es; base ${o.baseUrl}; ${((Date.now() - t00) / 60000).toFixed(1)} min.` });
console.log(`DONE ${rec.findings.length} findings -> ${outDir}`);
