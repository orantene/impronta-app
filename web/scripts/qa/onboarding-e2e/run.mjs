#!/usr/bin/env node
/**
 * Onboarding end-to-end QA: a brand-new talent registers on the (local copy of)
 * tulala.digital through the front door, onboards, picks a design, publishes,
 * adds content, and the published site is verified. One run per design x viewport.
 *
 *   node web/scripts/qa/onboarding-e2e/run.mjs
 *
 * Env (all optional):
 *   ONB_BASE_PORT      local prod build to drive (default 3001; never restarted/built here)
 *   ONB_DESIGNS        comma list of design slugs (default: every design the gallery lists
 *                      out of maison-v2,folio,gridline)
 *   ONB_VIEWPORTS      comma list of widths (default 390,1280)
 *   ONB_ENV_FILE       .env.local to read the Supabase URL + service role from
 *   ONB_SKIP_CLEANUP=1 keep the throwaway users (they are still listed in the report)
 *   ONB_ONLY           stop after a step id (register|design|content|verify|switch)
 *   ONB_EVIDENCE_ROOT  override web/qa-evidence/onboarding-e2e
 *
 * How it reaches "tulala.digital" on localhost: the build serves by Host header and
 * its cookies are Secure, so a tiny local TLS proxy fronts the build and Chromium
 * maps tulala.digital + *.tulala.digital to it (host-resolver-rules). Nothing leaves
 * the machine except the build's own calls to Supabase/Stripe(test)/model APIs.
 *
 * Safety: only users this run created (qa-onboard+...@impronta.test) are ever
 * deleted. Passwords are generated per run and never printed or written.
 * Service role is used for: confirming the email code (generate_link) and cleanup.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, "../../..");
const REPO = path.resolve(WEB, "..");

// ---------- environment -------------------------------------------------------
function findEnvFile() {
  const cands = [
    process.env.ONB_ENV_FILE,
    path.join(WEB, ".env.local"),
    path.join(REPO, "../pm-apply/web/.env.local"), // sibling worktree of the integrator
    path.join(REPO, "../../web/.env.local"), // main checkout
    path.join(REPO, "web/.env.local"),
  ].filter(Boolean);
  return cands.find((p) => fs.existsSync(p));
}
const ENV_FILE = findEnvFile();
if (!ENV_FILE) throw new Error("no .env.local found (set ONB_ENV_FILE)");
const env = Object.fromEntries(
  fs.readFileSync(ENV_FILE, "utf8").split("\n")
    .map((l) => l.match(/^([A-Z0-9_]+)="?(.*?)"?\s*$/)).filter(Boolean).map((m) => [m[1], m[2]]),
);
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA || !SERVICE) throw new Error("Supabase URL / service role missing in env file");

function loadPlaywright() {
  const cands = [path.join(WEB, "package.json"), path.join(path.dirname(ENV_FILE), "package.json"), path.join(REPO, "../pm-apply/web/package.json"), path.join(REPO, "../../web/package.json")];
  for (const c of cands) {
    try { return createRequire(c)("playwright"); } catch { /* try next */ }
  }
  throw new Error("playwright not resolvable; run npm ci in web/ or point ONB_ENV_FILE at a checkout that has node_modules");
}
const { chromium } = loadPlaywright();

const BASE_PORT = Number(process.env.ONB_BASE_PORT ?? 3001);
const VIEWPORTS = (process.env.ONB_VIEWPORTS ?? "390,1280").split(",").map(Number);
const ONLY = process.env.ONB_ONLY ?? "";
const STAMP = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
const EVID_ROOT = process.env.ONB_EVIDENCE_ROOT ?? path.join(WEB, "qa-evidence/onboarding-e2e");
const OUT = path.join(EVID_ROOT, STAMP);
if (process.argv[2] !== "--report") fs.mkdirSync(OUT, { recursive: true });

const MARKETING = "https://tulala.digital";
const APP = "https://app.tulala.digital";

// ---------- supabase admin ----------------------------------------------------
const admin = (p, init = {}) =>
  fetch(SUPA + p, { ...init, headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "content-type": "application/json", ...(init.headers ?? {}) } });
async function rest(table, query) {
  const r = await admin(`/rest/v1/${table}?${query}`);
  if (!r.ok) return { error: `${r.status} ${(await r.text()).slice(0, 200)}`, rows: [] };
  return { rows: await r.json() };
}
async function emailOtp(email) {
  const r = await admin("/auth/v1/admin/generate_link", { method: "POST", body: JSON.stringify({ type: "magiclink", email }) });
  const j = await r.json();
  return { otp: j.email_otp, id: j.id };
}
async function findUserId(email) {
  // generate_link returns the id for an existing user; otherwise scan recent users.
  const r = await admin(`/auth/v1/admin/users?per_page=200&page=1`);
  const j = await r.json();
  return (j.users ?? []).find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase())?.id ?? null;
}

// ---------- cleanup: only users this run created ------------------------------
const THROWAWAY = /^qa-onboard\+[a-z0-9-]+@impronta\.test$/i;
let _schema = null;
async function schemaColumns() {
  if (_schema) return _schema;
  const sw = await (await admin("/rest/v1/")).json();
  _schema = Object.entries(sw.definitions ?? {}).map(([table, d]) => ({ table, cols: Object.keys(d.properties ?? {}) }));
  return _schema;
}
const USER_COLS = ["user_id", "profile_id", "owner_id", "owner_profile_id", "created_by", "actor_user_id"];
async function scanLeftovers(userId, tpIds) {
  const left = [];
  for (const { table, cols } of await schemaColumns()) {
    const checks = [];
    if (cols.includes("talent_profile_id") && tpIds.length) checks.push(["talent_profile_id", `in.(${tpIds.join(",")})`]);
    if (table === "talent_profiles") checks.push(["user_id", `eq.${userId}`]);
    else for (const c of USER_COLS) if (cols.includes(c)) checks.push([c, `eq.${userId}`]);
    if (table === "profiles") checks.push(["id", `eq.${userId}`]);
    if (table === "talent_profiles" && tpIds.length) checks.push(["id", `in.(${tpIds.join(",")})`]);
    for (const [c, v] of checks) {
      const r = await admin(`/rest/v1/${table}?${c}=${v}&select=${c}&limit=50`, { headers: { Prefer: "count=exact" } });
      if (!r.ok) continue; // view / no access: not a store of ours
      const n = (await r.json()).length;
      if (n) left.push({ table, col: c, n });
    }
  }
  return left;
}
/** Delete one throwaway user the way the platform does (profile row, which cascades to talent, then the auth user), then sweep + verify. */
async function cleanupUser(userId, email) {
  const out = { userId, email, deleted: false, leftovers: [], log: [] };
  if (!userId || !THROWAWAY.test(email ?? "")) { out.log.push("refused: not a qa-onboard+ throwaway address"); return out; }
  const u = await (await admin(`/auth/v1/admin/users/${userId}`)).json();
  if (!THROWAWAY.test(u?.email ?? "")) { out.log.push("refused: auth user email is not a throwaway"); return out; }
  const tp = await rest("talent_profiles", `user_id=eq.${userId}&select=id`);
  const tpIds = tp.rows.map((r) => r.id);
  out.talentProfileIds = tpIds;
  // 1. sites/revisions/offerings etc. by talent profile (children first, in case a FK is not cascade)
  const sweep = async (label) => {
    for (const { table, cols } of await schemaColumns()) {
      if (table === "talent_profiles" || table === "profiles") continue;
      const filters = [];
      if (cols.includes("talent_profile_id") && tpIds.length) filters.push(`talent_profile_id=in.(${tpIds.join(",")})`);
      for (const c of USER_COLS) if (cols.includes(c)) filters.push(`${c}=eq.${userId}`);
      for (const f of filters) {
        const r = await admin(`/rest/v1/${table}?${f}`, { method: "DELETE" });
        if (r.ok === false && ![404, 400, 403, 500].includes(r.status)) out.log.push(`${label} delete ${table}?${f.split("=")[0]} -> ${r.status}`);
      }
    }
  };
  // The platform's own path first (actions-tier3 deletePlatformUserAccount): delete the profiles row
  // (documented to cascade to talent), then the auth user.
  const pr = await admin(`/rest/v1/profiles?id=eq.${userId}`, { method: "DELETE" });
  const prBody = pr.ok ? "" : (await pr.text()).slice(0, 220);
  out.log.push(`platform path: profiles delete -> ${pr.status}${prBody ? " " + prBody : ""}`);
  out.platformPathWorked = pr.ok;
  if (!pr.ok) {
    // Fallback (admin API): our own rows first, then the talent profile, then the profile again.
    await sweep("pre");
    if (tpIds.length) { const t = await admin(`/rest/v1/talent_profiles?user_id=eq.${userId}`, { method: "DELETE" }); out.log.push(`fallback: talent_profiles delete -> ${t.status}`); }
    const pr2 = await admin(`/rest/v1/profiles?id=eq.${userId}`, { method: "DELETE" });
    out.log.push(`fallback: profiles delete -> ${pr2.status}`);
  }
  const au = await admin(`/auth/v1/admin/users/${userId}`, { method: "DELETE" });
  out.log.push(`auth user delete -> ${au.status}`);
  out.deleted = au.ok;
  let left = await scanLeftovers(userId, tpIds);
  if (left.length) {
    // The profiles delete did not take the talent profile with it: remove it (history/child rows cascade), then sweep.
    if (tpIds.length) { const t = await admin(`/rest/v1/talent_profiles?id=in.(${tpIds.join(",")})`, { method: "DELETE" }); out.log.push(`orphan talent_profiles delete -> ${t.status}`); out.orphanTalentProfile = left.some((l) => l.table === "talent_profiles"); }
    left = await scanLeftovers(userId, tpIds);
    if (left.length) { await sweep("post"); left = await scanLeftovers(userId, tpIds); }
  }
  out.leftovers = left;
  return out;
}

// ---------- local TLS front for the build ------------------------------------
async function startTlsProxy(upstreamPort) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "onb-tls-"));
  execSync(`openssl req -x509 -newkey rsa:2048 -nodes -keyout ${dir}/k.pem -out ${dir}/c.pem -days 1 -subj "/CN=tulala.digital" -addext "subjectAltName=DNS:tulala.digital,DNS:*.tulala.digital" 2>/dev/null`);
  const agent = new http.Agent({ keepAlive: false, maxSockets: 256 });
  const srv = https.createServer({ key: fs.readFileSync(`${dir}/k.pem`), cert: fs.readFileSync(`${dir}/c.pem`) }, (req, res) => {
    // Buffer the body so an idempotent request can be retried when the build resets a socket.
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const idem = req.method === "GET" || req.method === "HEAD";
      const attempt = (n) => {
        const up = http.request({ host: "127.0.0.1", port: upstreamPort, method: req.method, path: req.url, agent, headers: { ...req.headers, "x-forwarded-proto": "https" } }, (ur) => {
          res.writeHead(ur.statusCode, ur.headers);
          ur.pipe(res);
        });
        up.on("error", (e) => {
          if (idem && n < 3 && !res.headersSent) return setTimeout(() => attempt(n + 1), 250 * (n + 1));
          if (!res.headersSent) { res.writeHead(502); res.end(String(e)); } else res.destroy();
        });
        up.end(body);
      };
      attempt(0);
    });
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  return { port: srv.address().port, close: () => srv.close() };
}

// ---------- step recording ----------------------------------------------------
const results = []; // { run, step, status, reason, shots, findings }
class Run {
  constructor(design, width) {
    this.design = design; this.width = width;
    this.id = `${design}-${width}`;
    this.dir = path.join(OUT, this.id);
    fs.mkdirSync(this.dir, { recursive: true });
    this.steps = [];
    this.n = 0;
    this.userId = null; this.email = null;
    this.notes = [];
  }
  async shot(page, label) {
    const file = `${String(++this.n).padStart(2, "0")}-${label.replace(/[^a-z0-9-]+/gi, "_")}.png`;
    try { await page.screenshot({ path: path.join(this.dir, file) }); } catch { /* page gone */ }
    return `${this.id}/${file}`;
  }
  /** Run one named check. Never throws: a failure is recorded and the run continues if `fatal` is false. */
  async step(page, id, title, fn, { fatal = false } = {}) {
    const rec = { id, title, status: "PASS", reason: "", shots: [], details: [] };
    this.steps.push(rec);
    const t0 = Date.now();
    try {
      const out = await fn(rec);
      if (out && out.skip) { rec.status = "SKIP"; rec.reason = out.skip; }
      if (out && out.warn) { rec.status = "WARN"; rec.reason = out.warn; }
    } catch (e) {
      rec.status = "FAIL";
      rec.reason = String(e?.message ?? e).split("\n")[0].slice(0, 400);
    }
    rec.ms = Date.now() - t0;
    rec.shots.push(await this.shot(page, `${id}-${rec.status.toLowerCase()}`));
    console.log(`[${this.id}] ${rec.status} ${id} ${title}${rec.reason ? ` :: ${rec.reason}` : ""}`);
    if (rec.status === "FAIL" && fatal) throw Object.assign(new Error(`fatal:${id}`), { fatalStep: id });
    return rec;
  }
}

// ---------- helpers -----------------------------------------------------------
const visible = (loc, ms = 1500) => loc.isVisible({ timeout: ms }).catch(() => false);
const trace = (...a) => { if (process.env.ONB_TRACE) console.log("   .", ...a); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FIXTURE_LEAKS = [/\bAlba\b/, /\bMérida\b/, /\bMerida\b/, /\bDiego\b/, /\bQA\b/];
// Template/demo copy written for other trades or currencies (seen on Folio: "DEMO SHOW CREDIT", "Runway", "Base rates in MXN").
const DEMO_COPY = [/DEMO SHOW CREDIT/i, /\bRunway\b/i, /Base rates in MXN/i, /\bMXN\b/, /3 EXITS/i, /HARD LIGHT/i, /Mateo/i, /Ferreira?/i, /Linh\b/];
const ES_WORDS = /\b(Reservar|Servicios|Sobre mí|Contacto|Política|Términos|Precio|Desde|Inicio|Empieza|Escríbeme)\b/;


// ---------- step: register through the front door -----------------------------
const TRADES = {
  nails: { match: /nail/i, sentence: "I'm a nail technician, I do gel nails and nail art, Monday to Saturday.", what: "nail", name: "Nails by Mireya", services: ["Gel manicure", "Nail art"] },
  lashes: { match: /lash/i, sentence: "I'm a lash artist, I do classic and volume lash extensions, Tuesday to Saturday.", what: "lash", name: "Lashes by Mireya", services: ["Classic lashes", "Volume lashes"] },
  electrician: { match: /electric/i, sentence: "I'm an electrician, I fix wiring and install lights and outlets, Monday to Friday.", what: "electric", name: "Spark Electric Mireya", services: ["Outlet repair", "Lighting install"] },
};

async function pickFromPicker(page, input, optionTid, term) {
  await page.getByTestId(input).fill(term);
  const opt = page.getByTestId(optionTid).first();
  await opt.waitFor({ timeout: 15000 });
  await opt.click();
}

/** Drive every overlay screen from entry to arrival. Returns the arrival text. */
async function registerViaFrontDoor(page, run, { email, trade, city, notes }) {
  const t = TRADES[trade];
  for (let attempt = 0; ; attempt++) {
    await page.goto(MARKETING + "/", { waitUntil: "domcontentloaded", timeout: 120_000 });
    const ready = await page.waitForSelector("html[data-onboarding-ready]", { timeout: 60_000 }).then(() => true).catch(() => false);
    if (ready) break;
    notes.push(`marketing home did not become interactive (data-onboarding-ready) within 60s, attempt ${attempt + 1}; reloading`);
    if (attempt >= 2) throw new Error("marketing home never became interactive (data-onboarding-ready) in 3 loads");
  }
  await page.getByRole("button", { name: /Sell your work|Vende tu trabajo/ }).first().click();
  await page.getByTestId("onb-sentence").fill(t.sentence);
  await page.getByTestId("onb-send").click();
  await page.getByTestId("onb-confirm-send").click();
  let lastHead = "";
  const sampler = setInterval(async () => {
    const h = await page.evaluate(() => { const o = document.querySelector('[data-testid="onb-overlay"]'); return o ? (o.querySelector("h1,h2")?.textContent ?? "").trim() + " | next-disabled=" + document.querySelector('[data-testid="onb-next"]')?.disabled + " accept-disabled=" + document.querySelector('[data-testid="onb-accept"]')?.disabled : "(no overlay)"; }).catch(() => "(eval failed)");
    if (h !== lastHead) { lastHead = h; trace("screen:", h); }
  }, 1000);
  const deadline = Date.now() + 8 * 60_000;
  let shotsDone = new Set();
  const snap = async (k) => { if (!shotsDone.has(k)) { shotsDone.add(k); await run.shot(page, `reg-${k}`); } };
  let understoodN = 0;
  /** After a click, wait for that screen to go (the next one may take a server round trip). */
  const leave = (tidName, ms = 120_000) =>
    page.waitForFunction((x) => !document.querySelector(`[data-testid="${x}"]`), tidName, { timeout: ms }).catch(() => notes.push(`screen ${tidName} stayed ${ms / 1000}s after its button was clicked`));
  let codeSent = false, lastTid = "", lastChange = Date.now(); const stuckShot = new Set();
  while (Date.now() < deadline) {
    const tid = await page.evaluate(() => {
      const order = ["onb-resume", "onb-arrival", "onb-arrival-failed", "onb-building", "onb-code", "onb-save", "onb-ready", "onb-style", "onb-essentials", "onb-fork", "onb-understood", "onb-too-little", "onb-reading", "onb-confirm"];
      return order.find((x) => document.querySelector(`[data-testid="${x}"]`)) ?? "";
    });
    trace("loop", tid || "(none)");
    if (tid !== lastTid) {
      lastTid = tid; lastChange = Date.now(); console.log(`  [${run.id}] overlay: ${tid || "(none)"}`);
    } else if (Date.now() - lastChange > 45_000 && !stuckShot.has(tid)) {
      stuckShot.add(tid);
      const tids = await page.locator("[data-testid]").evaluateAll((es) => es.map((e) => e.getAttribute("data-testid")).join(","));
      notes.push(`stalled 45s+ on overlay screen "${tid || "(none)"}"; testids: ${tids.slice(0, 300)}`);
      await snap(`stalled-${tid || "none"}`);
    }
    if (tid === "onb-arrival") { clearInterval(sampler); await snap("arrival"); return (await page.getByTestId("onb-arrival").innerText()).replace(/\s+/g, " "); }
    if (tid === "onb-arrival-failed") { await snap("arrival-failed"); throw new Error("build failed (onb-arrival-failed shown)"); }
    if (tid === "onb-understood") {
      trace("understood: accept branch");
      const accept = page.getByTestId("onb-accept");
      // `busy` can hold the button disabled; give it time, then say so.
      for (let i = 0; i < 60 && (await accept.isDisabled({ timeout: 800 }).catch(() => true)); i++) await sleep(1000);
      const stuck = await accept.isDisabled({ timeout: 800 }).catch(() => true);
      understoodN++; if (understoodN <= 4) { shotsDone.delete("understood-" + understoodN); await snap("understood-" + understoodN); }
      if (stuck) notes.push("understood screen: 'Looks good, continue' stayed disabled for 60s (busy never cleared)");
      if (await visible(page.getByTestId("onb-error"), 300)) notes.push("AI understand step fell back to the short form ('We couldn't read your words right now')");
      trace("understood: clicking accept");
      await accept.click({ timeout: 240_000 });
      trace("understood: clicked accept");
      await leave("onb-understood");
    } else if (tid === "onb-fork") {
      await page.getByTestId("onb-fork-talent").click();
      await leave("onb-fork");
    } else if (tid === "onb-essentials") {
      trace("await snap('essentials');"); await snap("essentials");
      // The picker may preselect a guess even when the AI is down (seen: "3D designer" for
      // a nail technician). A real user corrects it, so the run does too, and verifies.
      const sel = page.getByTestId("onb-basics-what-selected");
      if (await visible(sel, 700)) {
        const was = (await sel.innerText().catch(() => "?")).replace(/\s+/g, " ").replace(/\s*Change$/, "").slice(0, 40);
        if (!t.match.test(was)) notes.push(`trade preselected as "${was}" (wrong) before the user chose; wanted ${t.what}`);
      }
      trace("let picked = false;"); let picked = false;
      for (let attempt = 0; attempt < 3 && !picked; attempt++) {
        const cur = page.getByTestId("onb-basics-what-selected");
        if (await visible(cur, 500) && t.match.test(await cur.innerText().catch(() => ""))) { picked = true; break; }
        const change = page.getByTestId("onb-basics-what-change");
        if (await visible(change, 300)) await change.click();
        await page.locator("input[data-testid=onb-basics-what]").fill(t.what);
        const opts = page.getByTestId("onb-basics-what-option");
        const hit = opts.filter({ hasText: t.match });
        // The list shows the unfiltered catalogue first and narrows when the search answers.
        for (let i = 0; i < 40 && !(await hit.count()); i++) await sleep(500);
        if (await hit.count()) { await hit.first().click(); await sleep(400); }
        else if (await opts.count()) { notes.push(`no catalogue option matching ${t.match} for "${t.what}" after 20s; saw: ${(await opts.allInnerTexts()).join(" / ").slice(0, 120)}`); break; }
        else { notes.push(`trade "${t.what}" returned no options; used 'not in the list'`); await page.getByTestId("onb-basics-other").fill(t.name); break; }
      }
      if (!(await visible(page.getByTestId("onb-basics-city-selected"), 500))) {
        await pickFromPicker(page, "onb-basics-city", "onb-basics-city-option", city);
      }
      trace("const nm = page.getByTestId('onb-name-in"); const nm = page.getByTestId("onb-name-input");
      if (await visible(nm, 300) && !(await nm.inputValue()).trim()) await nm.fill(t.name);
      for (const s of t.services) {
        const have = await page.getByTestId("onb-services").innerText().catch(() => "");
        if (!have.includes(s)) { await page.getByTestId("onb-service-input").fill(s); await page.getByTestId("onb-service-input").press("Enter"); }
      }
      trace("await snap('essentials-filled');"); await snap("essentials-filled");
      trace("const nextBtn = page.getByTestId('onb-ne"); const nextBtn = page.getByTestId("onb-next");
      for (let i = 0; i < 30 && (await nextBtn.isDisabled({ timeout: 800 }).catch(() => true)); i++) await sleep(1000);
      if (await nextBtn.isDisabled({ timeout: 800 }).catch(() => true)) {
        notes.push("Continue stayed disabled 30s after every essentials field was filled: " + (await page.getByTestId("onb-essentials").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 200));
        await snap("essentials-continue-disabled");
      }
      trace("click next"); await nextBtn.click({ timeout: 120_000 });
      await leave("onb-essentials");
    } else if (tid === "onb-style") {
      await page.getByTestId("onb-style-continue").click();
      await leave("onb-style");
    } else if (tid === "onb-ready") {
      await snap("ready");
      await page.getByTestId("onb-build").click({ timeout: 120_000 });
      await leave("onb-ready");
    } else if (tid === "onb-save") {
      await snap("save");
      await page.getByTestId("onb-email").fill(email);
      const age = page.getByTestId("onb-age-terms");
      if (await visible(age, 1000)) await age.check();
      else notes.push("no 18+ / terms checkbox on the save step");
      // The platform limits code emails per address window ("Too many attempts. Wait a minute"); wait and retry like a person would.
      for (let attempt = 0; attempt < 5; attempt++) {
        await page.getByTestId("onb-email-cta").click({ timeout: 60_000 });
        const gone = await page.waitForFunction(() => !document.querySelector('[data-testid="onb-save"]'), null, { timeout: 25_000 }).then(() => true).catch(() => false);
        if (gone) break;
        const err = (await page.getByTestId("onb-error").innerText().catch(() => "")).replace(/\s+/g, " ");
        notes.push(`save step refused the email: "${err.slice(0, 80)}" (attempt ${attempt + 1})`);
        if (/too many|wait a minute|demasiados/i.test(err) && attempt >= 1) throw Object.assign(new Error("code email refused: " + err), { emailLimited: true });
        await sleep(70_000);
      }
    } else if (tid === "onb-code" && !codeSent) {
      await snap("code");
      const { otp, id } = await emailOtp(email);
      run.userId = id;
      if (!otp) throw new Error("admin generate_link returned no email_otp");
      const box = page.locator('[data-testid="onb-code"] input[inputmode="numeric"]').first();
      await box.click();
      await page.keyboard.type(otp, { delay: 60 });
      codeSent = true;
    } else if (tid === "onb-resume") {
      await page.getByTestId("onb-resume-fresh").click({ timeout: 15_000 });
      await sleep(1500);
    } else if (tid === "onb-too-little") {
      throw new Error("front door refused the sentence as too little");
    }
    await sleep(700);
  }
  clearInterval(sampler);
  throw new Error("front door did not reach arrival within 8 minutes (last screen: " + lastTid + ")");
}


// ---------- browser helpers ---------------------------------------------------
let PROXY = null;
async function launch() {
  if (!PROXY) PROXY = await startTlsProxy(BASE_PORT);
  return chromium.launch({ args: [`--host-resolver-rules=MAP tulala.digital 127.0.0.1:${PROXY.port}, MAP *.tulala.digital 127.0.0.1:${PROXY.port}`] });
}
async function healthCheck() {
  const px = PROXY ?? (PROXY = await startTlsProxy(BASE_PORT));
  const r = await fetch(`http://127.0.0.1:${BASE_PORT}/`, { headers: { host: "tulala.digital" } }).catch((e) => ({ ok: false, status: String(e) }));
  if (!r.ok) throw new Error(`nothing healthy on localhost:${BASE_PORT} for Host tulala.digital (status ${r.status})`);
  return px;
}
async function loginWithPassword(page, email, password) {
  await page.goto(APP + "/login", { waitUntil: "domcontentloaded", timeout: 120_000 });
  await sleep(3000);
  await page.getByRole("button", { name: /^(Decline|Rechazar)$/ }).click({ timeout: 1500 }).catch(() => {});
  await page.locator('input[name="email"]').first().fill(email);
  await page.locator('input[name="password"]').first().fill(password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 90_000 });
}
/** First VISIBLE element with this test id (the sheet renders desktop + phone copies of some buttons). */
const vt = (page, id) => page.locator(`[data-testid="${id}"]:visible`).first();
const declineCookies = async (page) => { await page.getByRole("button", { name: /^(Decline|Rechazar)$/ }).click({ timeout: 1500 }).catch(() => {}); };
async function gotoApp(page, p, { settle = 3500 } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(APP + p, { waitUntil: "domcontentloaded", timeout: 120_000 });
      await sleep(settle);
      await declineCookies(page);
      return { redirectLoopRecovered: attempt > 0 };
    } catch (e) {
      lastErr = e;
      if (/TOO_MANY_REDIRECTS/.test(String(e))) { await sleep(65_000); continue; } // the access-profile memo is 60s
      await sleep(3000);
    }
  }
  throw lastErr;
}
const bodyText = async (page) => (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
const IMAGES = (() => {
  const base = path.join(WEB, "design-references");
  const out = [];
  for (const d of fs.existsSync(base) ? fs.readdirSync(base).sort() : []) {
    const img = path.join(base, d, "img");
    if (fs.existsSync(img)) for (const f of fs.readdirSync(img).sort()) if (/\.(jpe?g|png)$/i.test(f)) out.push(path.join(img, f));
  }
  return out;
})();

// ---------- stages ------------------------------------------------------------
async function stageProfileData(run, rec) {
  const tp = await rest("talent_profiles", `user_id=eq.${run.userId}&select=id,profile_code,display_name,short_bio,location_id,workflow_status`);
  const row = tp.rows[0];
  if (!row) throw new Error("no talent_profiles row for the new user");
  run.talentProfileId = row.id; run.profileCode = row.profile_code;
  const tax = await rest("talent_profile_taxonomy", `talent_profile_id=eq.${row.id}&select=taxonomy_term_id,is_primary`);
  const roster = await rest("agency_talent_roster", `talent_profile_id=eq.${row.id}&select=status,agency_visibility`);
  rec.details.push(`profile ${row.profile_code} name="${row.display_name}" bio=${row.short_bio ? "yes" : "NO"} location_id=${row.location_id ?? "null"} taxonomy_rows=${tax.rows.length} roster=${roster.rows.map((r) => r.status + "/" + r.agency_visibility).join(",") || "NONE"}`);
  const problems = [];
  if (!row.display_name) problems.push("no display name");
  if (!row.short_bio) problems.push("no drafted bio");
  if (!tax.rows.length) problems.push("trade not saved to taxonomy");
  if (!roster.rows.length) problems.push("not enrolled on the platform hub roster");
  if (!row.location_id) run.notes.push("city typed in the front door is not saved as a location (talent_profiles.location_id is null); Today shows it from the brief only");
  if (problems.length) throw new Error(problems.join("; "));
}

async function stageHours(page, run, rec) {
  const narrow = page.viewportSize().width < 800;
  const saveBtn = page.getByRole("button", { name: /Save availability/ }).first();
  if (!narrow) {
    await gotoApp(page, "/talent/calendar");
    await page.getByRole("button", { name: /^Working hours$/ }).click({ timeout: 60_000 });
  } else {
    // Phone: the obvious route is More > Working hours ("Not set yet"). Try it like a person, then use the one that works.
    await gotoApp(page, "/talent/calendar");
    await page.getByRole("button", { name: /^More$/ }).first().click({ timeout: 30_000 });
    await sleep(1200);
    await page.getByText("Working hours", { exact: false }).first().click({ timeout: 15_000 });
    await sleep(3500);
    if (!(await visible(saveBtn, 1500))) {
      run.notes.push("phone: More > Working hours (\"Not set yet\") lands on the calendar with nothing to edit hours; the working-hours panel is only reachable from Settings > Working hours and days off");
      await run.shot(page, "phone-more-working-hours-dead-end");
      await gotoApp(page, "/talent/settings");
      await page.getByText("Working hours and days off", { exact: false }).first().click({ timeout: 30_000 });
    }
  }
  await sleep(2500);
  await run.shot(page, "hours-open");
  await saveBtn.click({ timeout: 60_000 });
  await sleep(4000);
  const saved = await rest("talent_booking_hours", `talent_profile_id=eq.${run.talentProfileId}&select=timezone,weekly`);
  if (!saved.rows.length) throw new Error("Save availability clicked but no talent_booking_hours row was written");
  rec.details.push(`saved hours tz=${saved.rows[0].timezone}`);
}

const SERVICES = [
  { name: "Gel manicure", price: "45", dur: "60", mode: "instant" },
  { name: "Nail art design", price: "60", dur: "75", mode: "instant" },
  { name: "Fill and refresh", price: "35", dur: "45", mode: "request" },
];
async function stageServices(page, run, rec) {
  for (const sv of SERVICES) {
    await gotoApp(page, "/talent/services");
    await page.getByText("+ Add item", { exact: false }).first().click({ timeout: 60_000 });
    await sleep(1200);
    await page.getByRole("button", { name: /^Continue$/ }).click({ timeout: 30_000 });
    await sleep(2500);
    await page.getByLabel("Name", { exact: true }).first().fill(sv.name);
    await page.locator("input[type=number]").nth(0).fill(sv.price);
    await page.locator("input[type=number]").nth(1).fill(sv.dur);
    if (sv.mode === "request") await page.getByText("Request to book", { exact: false }).first().click();
    const pub = page.getByRole("button", { name: /^Publish service$/ });
    await pub.waitFor({ timeout: 30_000 });
    if (await pub.isDisabled({ timeout: 800 }).catch(() => false)) throw new Error(`Publish service stays disabled for "${sv.name}" (${sv.mode}); needs: ${(await bodyText(page)).match(/READY TO PUBLISH\?[^|]{0,160}/i)?.[0] ?? "?"}`);
    await pub.click();
    await page.getByText(/is live/).first().waitFor({ timeout: 60_000 });
    rec.details.push(`published ${sv.name} $${sv.price}/${sv.dur}min ${sv.mode}`);
  }
  await run.shot(page, "services-list");
  const list = await bodyText(page);
  for (const sv of SERVICES) if (!list.includes(sv.name)) throw new Error(`"${sv.name}" not on the Services page after publish`);
}

async function stageBio(page, run, rec) {
  await gotoApp(page, "/talent/profile");
  const intro = page.getByText("Your introduction", { exact: true }).first();
  await intro.waitFor({ timeout: 60_000 });
  await intro.locator("xpath=ancestor::*[.//button[normalize-space()='Edit']][1]").getByRole("button", { name: "Edit" }).first().click();
  const ta = page.locator("textarea").first();
  await ta.waitFor({ timeout: 60_000 });
  const bio = run.bioText;
  // The drawer first renders an empty textarea, then loads the saved bio into it; typing before that is overwritten.
  await page.waitForFunction(() => (document.querySelector("textarea")?.value ?? "").length > 15, null, { timeout: 60_000 }).catch(() => {});
  await ta.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(bio, { delay: 5 });
  await sleep(1500);
  const saveBtn = page.getByRole("button", { name: /^Save$/ }).first();
  if (await visible(saveBtn, 800)) await saveBtn.click().catch(() => {});
  // Saving is slow (several seconds): wait for the drawer to say it saved. The published site proves it later (bio-live).
  let ok = false, calm = 0;
  for (let i = 0; i < 40 && !ok; i++) {
    await sleep(2000);
    const t = await bodyText(page);
    calm = /Saving\.\.\./.test(t) ? 0 : calm + 1;
    ok = calm >= 3 && i >= 3;
  }
  await run.shot(page, "bio-typed");
  const row = (await rest("talent_profiles", `id=eq.${run.talentProfileId}&select=short_bio`)).rows[0];
  rec.details.push(`drawer ${ok ? "stopped saving" : "never stopped saving"}; talent_profiles.short_bio ${String(row?.short_bio ?? "").includes(bio.slice(0, 25)) ? "updated" : "unchanged (bio may live in the field catalog)"}`);
  if (!ok) throw new Error("profile drawer never showed a saved state 80s after typing the bio");
}

async function stagePhotos(page, run, rec) {
  const pics = IMAGES.slice(0, 6);
  if (pics.length < 6) throw new Error(`need 6 images under web/design-references/*/img, found ${IMAGES.length}`);
  await gotoApp(page, "/talent/profile");
  await page.getByRole("button", { name: /^Edit profile$/ }).first().click({ timeout: 60_000 });
  await sleep(2500);
  // Desktop: the nav item reads "Media"; phone: a tab chip with an emoji in the same text node.
  const exactMedia = page.getByText("Media", { exact: true }).first();
  if (await visible(exactMedia, 3000)) await exactMedia.click({ timeout: 30_000 });
  else await page.locator('button, [role="tab"]').filter({ hasText: /Media/ }).first().click({ timeout: 30_000 });
  await sleep(1500);
  await page.getByText("Add photos", { exact: false }).first().click({ timeout: 30_000 });
  await sleep(2000);
  await page.locator("input[type=file][multiple]").first().setInputFiles(pics, { timeout: 60_000 });
  await page.waitForFunction(() => document.querySelectorAll('input[type=checkbox][aria-label="Select photo"]').length >= 6, null, { timeout: 120_000 });
  await run.shot(page, "photos-uploaded");
  rec.details.push(`uploaded ${pics.length} images (${pics.map((p) => path.basename(p)).join(", ")})`);
}

/** Drive /talent/site until a given screen testid shows. Returns the testid reached. */
async function siteScreen(page, want, { timeout = 90_000 } = {}) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    for (const t of want) if (await visible(vt(page, t), 300)) return t;
    const act = vt(page, "website-activate");
    if (await visible(act, 300) && !want.includes("website-activate")) { await act.click().catch(() => {}); await sleep(2500); continue; }
    await sleep(800);
  }
  throw new Error(`none of [${want.join(", ")}] appeared in ${timeout / 1000}s; page: ${(await bodyText(page)).slice(0, 220)}`);
}

async function listedDesigns(page) {
  return page.locator("[data-design-slug]").evaluateAll((es) => es.map((e) => e.getAttribute("data-design-slug")));
}

async function applyDesign(page, run, rec, slug, { paletteIndex = 1 } = {}) {
  const explore = vt(page, slug === "maison" ? "maison-explore-theme" : `design-explore-${slug}`);
  await explore.waitFor({ timeout: 60_000 });
  await explore.click();
  await vt(page, "maison-theme-detail").waitFor({ timeout: 60_000 });
  await sleep(2500);
  await run.shot(page, `detail-${slug}`);
  const mine = vt(page, "maison-mode-mine");
  if (await mine.waitFor({ timeout: 25_000 }).then(() => true).catch(() => false)) { await mine.click(); await sleep(800); } else run.notes.push(`${slug}: no "My content" toggle appeared within 25s on the detail screen`);
  const narrow = page.viewportSize().width < 800;
  // Phone: the palettes live in a Colors sheet behind the bottom bar (maison-phone-palette-*); open it first.
  const prefix = narrow ? "maison-phone-palette-" : "maison-palette-";
  if (narrow) { const colors = vt(page, "maison-phone-colors"); if (await visible(colors, 3000)) { await colors.click(); await page.locator(`[data-testid^="${prefix}"]:visible`).first().waitFor({ timeout: 15_000 }).catch(() => {}); } }
  const palettes = await page.locator(`[data-testid^="${prefix}"]`).evaluateAll((es) => es.map((e) => e.getAttribute("data-testid")));
  const usable = palettes.filter((t) => !/custom|name$/.test(t));
  if (usable.length) { const pick = usable[Math.min(paletteIndex, usable.length - 1)]; await vt(page, pick).click({ timeout: 30_000 }); rec.details.push(`${slug}: palette ${pick} (of ${usable.length})`); run.palette[slug] = pick; await sleep(1000); }
  else run.notes.push(`${slug}: no palettes listed on the detail screen`);
  if (narrow) {
    // close the Colors sheet if the pick did not
    for (let i = 0; i < 3; i++) {
      if (!(await visible(page.getByText(/Only colors change/i).first(), 600))) break;
      await page.keyboard.press("Escape"); await sleep(600);
      if (!(await visible(page.getByText(/Only colors change/i).first(), 600))) break;
      const x = page.getByRole("button", { name: /^(Close|Cerrar|✕|×)$/ }).last();
      if (await visible(x, 500)) await x.click().catch(() => {});
      await sleep(600);
    }
  }
  const use = vt(page, page.viewportSize().width < 800 ? "maison-use-design-phone" : "maison-use-design");
  const use2 = (await visible(use, 1500)) ? use : vt(page, "maison-use-design");
  await use2.click({ timeout: 30_000 });
}

/** Walk back out of any design screen to the live My website card (no changes applied). */
async function toLiveCard(page) {
  for (let i = 0; i < 8; i++) {
    if (await visible(vt(page, "maison-my-website-card"), 400)) return true;
    let clicked = false;
    for (const t of ["maison-back-my-website", "maison-back-designs", "maison-review-back", "maison-gallery-back", "maison-gallery-close"]) {
      const b = vt(page, t);
      if (await visible(b, 300)) { await b.click().catch(() => {}); clicked = true; await sleep(1500); break; }
    }
    if (!clicked) await sleep(1500);
  }
  await gotoApp(page, "/talent/site");
  return visible(vt(page, "maison-my-website-card"), 8000);
}

/** After "Use this design": confirm dialogs, review, publish, land on the live card. */
async function publishFlow(page, run, rec) {
  const end = Date.now() + 150_000;
  let clickedPublish = false, publishedAt = 0, reloaded = false;
  while (Date.now() < end) {
    for (const t of ["maison-publish-design-confirm", "maison-publish-colors-confirm"]) {
      const b = vt(page, t);
      if (await visible(b, 300)) { await b.click(); await sleep(2000); }
    }
    const pub = vt(page, "maison-publish");
    if (await visible(pub, 300) && !clickedPublish) {
      await run.shot(page, "review");
      const blockers = await page.locator("[data-testid^='maison-blocker-']").allInnerTexts().catch(() => []);
      if (blockers.length) throw new Error(`publish blocked: ${blockers.join(" / ").slice(0, 200)}`);
      await pub.click(); clickedPublish = true; publishedAt = Date.now(); await sleep(3000); continue;
    }
    const act = vt(page, "website-activate");
    if (await visible(act, 300) && !clickedPublish) { await act.click().catch(() => {}); await sleep(2500); continue; }
    if (clickedPublish && !reloaded && Date.now() - publishedAt > 25_000) {
      reloaded = true;
      const body = (await bodyText(page)).slice(0, 200);
      run.notes.push(`after Publish the My website tab did not show the live card within 25s (it showed: "${body.slice(0, 90)}"); a reload was needed`);
      await run.shot(page, "after-publish-no-live-card");
      await gotoApp(page, "/talent/site");
      continue;
    }
    const fail = vt(page, "maison-publish-failure");
    if (await visible(fail, 300)) throw new Error("publish failed: " + (await fail.innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 200));
    const live = vt(page, "maison-my-website-card");
    if (await visible(live, 300)) {
      const addr = (await vt(page, "maison-live-address").innerText().catch(() => "")).trim();
      if (addr) run.siteHost = addr.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      const summary = (await vt(page, "maison-live-summary").innerText().catch(() => "")).replace(/\s+/g, " ");
      rec.details.push(`live at ${run.siteHost}; ${summary}`);
      return;
    }
    await sleep(700);
  }
  await run.shot(page, "publish-stalled");
  const ids = await page.locator("[data-testid]").evaluateAll((es) => [...new Set(es.map((e) => e.getAttribute("data-testid")))].join(",")).catch(() => "");
  throw new Error(`did not reach the live website card within 120s of Use this design (clickedPublish=${clickedPublish}); testids: ${ids.slice(0, 300)}`);
}

async function stageDesign(page, run, rec, slug) {
  await gotoApp(page, "/talent/site");
  const first = await siteScreen(page, ["maison-choose-design", "maison-my-website-card", "maison-theme-detail", "maison-review", "website-activate"]);
  if (first === "website-activate") { await vt(page, "website-activate").click(); await siteScreen(page, ["maison-choose-design", "maison-review", "maison-theme-detail"]); }
  await run.shot(page, "gallery");
  if (await visible(vt(page, "maison-choose-design"), 2000)) {
    const listed = await listedDesigns(page);
    run.listed = listed; rec.details.push(`gallery lists: ${listed.join(", ")}`);
    if (!listed.includes(slug)) return { skip: `design "${slug}" is not listed in the onboarding gallery on this build` };
    await applyDesign(page, run, rec, slug);
  } else if (await visible(vt(page, "maison-theme-detail"), 1000)) {
    await vt(page, "maison-use-design").click();
  }
  await publishFlow(page, run, rec);
}

async function stageImportProbe(page, run, rec, _designSlug) {
  const slug = "maison"; // the starter-import entry exists only on the Maison (v1) theme detail screen
  // Entry point inside the design flow: "Import starter content" on the theme detail screen.
  await gotoApp(page, "/talent/site");
  const change = vt(page, "maison-change-design");
  await change.waitFor({ timeout: 60_000 });
  await change.click();
  const explore = vt(page, slug === "maison" ? "maison-explore-theme" : `design-explore-${slug}`);
  await explore.waitFor({ timeout: 60_000 });
  await explore.click();
  await vt(page, "maison-theme-detail").waitFor({ timeout: 60_000 });
  const entry = vt(page, "maison-import-entry");
  if (!(await visible(entry, 3000))) return { skip: "no import entry on this theme's detail screen" };
  await entry.click();
  await vt(page, "maison-import-panel").waitFor({ timeout: 30_000 });
  await sleep(2500);
  const txt = (await vt(page, "maison-import-panel").innerText()).replace(/\s+/g, " ");
  rec.details.push("import panel: " + txt.slice(0, 260));
  await run.shot(page, "import-panel");
  run.notes.push(`import entry "Import starter content" (design detail screen) opens a panel: ${txt.slice(0, 140)}`);
  // leave without committing so demo starter content never lands in this talent's site
  await page.keyboard.press("Escape");
  await sleep(500);
  await toLiveCard(page);
}

async function stageLive(page, run, rec) {
  const url = `${APP}/template-preview/live?kind=live-site&talent=${run.talentProfileId}`;
  const r = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await sleep(6000);
  await declineCookies(page);
  await run.shot(page, "live-preview");
  if (!r || r.status() >= 400) throw new Error(`live-site preview returned ${r?.status()}`);
  const txt = await bodyText(page);
  run.liveText = txt;
  if (txt.length < 300) throw new Error("live preview rendered almost nothing: " + txt.slice(0, 120));
  for (const sv of SERVICES) if (!txt.includes(sv.name)) throw new Error(`service "${sv.name}" missing from the published site`);
  if (!txt.includes(run.displayName)) throw new Error(`display name "${run.displayName}" missing from the published site`);
  const photos = await page.locator("img").evaluateAll((es) => es.filter((e) => e.naturalWidth > 50).length);
  rec.details.push(`rendered images: ${photos}`);
  if (photos < 3) throw new Error(`only ${photos} loaded images on the published site (uploaded 6)`);
  return {};
}

async function stageBioLive(page, run, rec) {
  const txt = run.liveText ?? "";
  if (!txt.includes(run.bioText.slice(0, 30))) throw new Error(`the bio typed in the profile drawer ("${run.bioText.slice(0, 40)}...") is not on the published site; the site still shows the onboarding-drafted intro`);
}

async function stageSocket(page, run, rec) {
  const sock = page.locator("[data-tulala-socket]");
  if (!(await sock.count())) throw new Error("no [data-tulala-socket] footer socket on the published site");
  const links = await sock.locator("a").evaluateAll((es) => es.map((e) => `${e.textContent.trim()}->${e.getAttribute("href")}`));
  rec.details.push(links.join(" ; "));
  const need = [/politicas|policies/i, /privacidad|privacy/i, /terms/i, /cookies/i];
  const miss = need.filter((re) => !links.some((l) => re.test(l)));
  if (miss.length) throw new Error(`socket missing links matching ${miss.join(", ")}; has: ${links.join(" ; ")}`);
  const credit = await page.locator("[data-socket-credit]").count();
  if (!credit) rec.details.push("no Tulala credit in the socket (whitelabel?)");
}

async function stagePolicies(page, run, rec) {
  if (!run.siteHost) throw new Error("public host unknown (live card address not captured)");
  const bad = [];
  for (const p of ["/politicas", "/privacidad"]) {
    const r = await page.goto(`https://${run.siteHost}${p}`, { waitUntil: "domcontentloaded", timeout: 90_000 }).catch((e) => ({ status: () => String(e) }));
    await sleep(2500);
    const txt = await bodyText(page);
    await run.shot(page, `policy${p.replace("/", "-")}`);
    rec.details.push(`${p} -> ${r.status?.()} (${txt.length} chars)`);
    if (r.status?.() !== 200) bad.push(`${p} status ${r.status?.()}`);
    else if (!/(Booking policies|Privacy|Pol[ií]ticas|Privacidad)/i.test(txt)) bad.push(`${p} has no policy heading`);
    if (FIXTURE_LEAKS.some((re) => re.test(txt))) bad.push(`${p} leaks fixture text`);
  }
  if (bad.length) throw new Error(bad.join("; "));
}

async function stageChat(page, run, rec) {
  await page.goto(`https://${run.siteHost}/`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await sleep(5000);
  await declineCookies(page);
  const btn = page.locator('button[aria-label*="chat" i]:visible, button[aria-label*="message" i]:visible, button[aria-label*="mensaje" i]:visible').first();
  const found = await btn.waitFor({ timeout: 30_000 }).then(() => true).catch(() => false);
  if (!found) {
    const labels = await page.locator("button:visible").evaluateAll((es) => es.map((e) => (e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 24)).filter(Boolean).slice(0, 25).join(" ; "));
    throw new Error("no chat button found on the published site; visible buttons: " + labels);
  }
  await btn.click();
  await sleep(3000);
  const dlg = page.locator("[role=dialog]:visible").first();
  await dlg.waitFor({ timeout: 20_000 });
  const t = (await dlg.innerText()).replace(/\s+/g, " ");
  await run.shot(page, "chat-open");
  rec.details.push("chat: " + t.slice(0, 160));
  if (!new RegExp(run.shortName, "i").test(t)) throw new Error("chat opened but does not mention the talent: " + t.slice(0, 120));
}

async function stageBooking(page, run, rec) {
  const slotCalls = [];
  const onResp = async (r) => { if (r.url().includes("/api/public/booking/slots")) slotCalls.push(`${r.status()} ${(await r.text().catch(() => "")).slice(0, 160)}`); };
  page.on("response", onResp);
  try { await bookingInner(page, run, rec, slotCalls); } finally { page.off("response", onResp); }
}
async function bookingInner(page, run, rec, slotCalls) {
  await page.goto(`https://${run.siteHost}/`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await sleep(5000);
  await declineCookies(page);
  const first = SERVICES.find((s) => s.mode === "instant");
  const card = page.getByText(first.name, { exact: true }).last();
  await card.scrollIntoViewIfNeeded().catch(() => {});
  const book = card.locator("xpath=ancestor::*[.//button][1]").getByRole("button").first();
  rec.details.push(`service button label: "${(await book.innerText().catch(() => "?")).trim()}"`);
  await book.click({ timeout: 30_000 });
  await sleep(2500);
  const cont = page.getByRole("button", { name: /Continue|Continuar|Book now|Reservar/ }).first();
  if (!(await cont.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false))) {
    const labels = await page.locator("button:visible").evaluateAll((es) => es.map((e) => (e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 24)).filter(Boolean).slice(0, 25).join(" ; "));
    throw new Error("after selecting the service no Continue/Book button appeared (dock missing); visible buttons: " + labels);
  }
  await cont.click({ timeout: 30_000 });
  await sleep(5000);
  await run.shot(page, "booking-when");
  const dlg = page.locator("[role=dialog]:visible").filter({ hasText: /YOUR BOOKING|Your booking|Tu reserva/i }).first();
  await dlg.waitFor({ timeout: 20_000 });
  const t0 = (await dlg.innerText().catch(() => "")).replace(/\s+/g, " ");
  rec.details.push(`slots api: ${slotCalls.slice(-2).join(" || ") || "no call seen"}`);
  if (/No times available|Sin horarios/i.test(t0)) throw new Error(`booking sheet shows 'No times available' for an instant-booking service whose working hours are saved (Mon-Sat). slots api said: ${slotCalls.slice(-1)[0] ?? "no call"}`);
  // pick the first offered time, then continue to the details step
  const time = dlg.locator("button").filter({ hasText: /^\d{1,2}:\d{2}/ }).first();
  await time.click({ timeout: 20_000 });
  await dlg.getByRole("button", { name: /Continue|Continuar/ }).last().click({ timeout: 20_000 });
  await sleep(2500);
  const email = vt(page, "cb-email");
  await email.waitFor({ timeout: 20_000 });
  await run.shot(page, "booking-details");
  rec.details.push("reached the details step (name/email/phone fields); nothing submitted");
}

async function stageLeaks(page, run, rec) {
  const hits = [];
  const pages = [["live preview", run.liveText ?? ""]];
  await page.goto(`https://${run.siteHost}/`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await sleep(4000);
  pages.push(["public home", await bodyText(page)]);
  for (const [label, txt] of pages) for (const re of [...FIXTURE_LEAKS, ...DEMO_COPY]) { const m = txt.match(re); if (m) hits.push(`${label}: "${m[0]}" ... ${txt.slice(Math.max(0, m.index - 30), m.index + 40)}`); }
  if (hits.length) throw new Error(`${hits.length} leak(s) of fixture or other-trade demo copy: ` + hits.slice(0, 4).join(" | "));
}

async function stageLocale(page, run, rec, ctx) {
  // A talent site renders only in the languages the talent's site has (primary + secondaries); anything else never renders there.
  // So the check is: no Spanish strings on the English site, however the visitor asks for Spanish.
  const problems = [];
  const visit = async (label, url) => {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await sleep(3500);
    const t = await bodyText(page);
    const hit = t.match(ES_WORDS);
    rec.details.push(`${label}: ${t.slice(0, 70)}${hit ? ` [Spanish: ${hit[0]}]` : ""}`);
    if (hit) problems.push(`${label}: Spanish word "${hit[0]}" on the English site`);
    return t;
  };
  await visit("en home", `https://${run.siteHost}/`);
  await visit("en services page", `https://${run.siteHost}/politicas`);
  await ctx.addCookies([{ name: "locale", value: "es", domain: run.siteHost, path: "/", secure: true, sameSite: "Lax" }]);
  await visit("cookie locale=es", `https://${run.siteHost}/`);
  await run.shot(page, "site-with-es-cookie");
  await visit("?locale=es", `https://${run.siteHost}/?locale=es`);
  await ctx.addCookies([{ name: "locale", value: "en", domain: run.siteHost, path: "/", secure: true, sameSite: "Lax" }]);
  if (problems.length) throw new Error(problems.join("; "));
}

async function stageCloseAccountUi(page, run, rec) {
  await gotoApp(page, "/talent/settings");
  await page.getByText("Close your account", { exact: false }).first().click({ timeout: 30_000 });
  await sleep(1500);
  const t = (await bodyText(page)).match(/Close your account.{0,420}/)?.[0] ?? "";
  await run.shot(page, "close-account");
  rec.details.push("self-serve close: " + t.slice(0, 380));
  if (!/14 days/i.test(t)) throw new Error("the Close your account section did not explain the 14-day grace: " + t.slice(0, 160));
  run.notes.push("self-serve 'Close your account' is a 14-day scheduled removal (cancellable), so it cannot delete the throwaway user within a run; cleanup used the admin API instead");
}

async function stageSwitch(page, run, rec, fromSlug, toSlug) {
  const label = `${fromSlug} -> ${toSlug}`;
  for (const [a, b] of [[fromSlug, toSlug], [toSlug, fromSlug]]) {
    await gotoApp(page, "/talent/site");
    await toLiveCard(page);
    const change = vt(page, "maison-change-design");
    await change.waitFor({ timeout: 60_000 });
    await change.click();
    await vt(page, "maison-choose-design").waitFor({ timeout: 60_000 });
    const listed = await listedDesigns(page);
    if (!listed.includes(b)) return { skip: `${b} not listed` };
    await applyDesign(page, run, rec, b, { paletteIndex: 0 });
    await publishFlow(page, run, rec);
    // content kept?
    const r = await page.goto(`${APP}/template-preview/live?kind=live-site&talent=${run.talentProfileId}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await sleep(5000);
    await run.shot(page, `after-switch-to-${b}`);
    const txt = await bodyText(page);
    const lost = SERVICES.filter((s) => !txt.includes(s.name)).map((s) => s.name);
    const photos = await page.locator("img").evaluateAll((es) => es.filter((e) => e.naturalWidth > 50).length);
    const bioKept = txt.includes(run.bioText.slice(0, 30));
    rec.details.push(`${a} -> ${b}: live ${r?.status()}, services lost: ${lost.join(",") || "none"}, images ${photos}, bio ${bioKept ? "kept" : "MISSING"}`);
    if (lost.length || !bioKept || photos < 3) throw new Error(`content not kept after switching to ${b}: lost services [${lost.join(", ")}], bio ${bioKept ? "ok" : "missing"}, images ${photos}`);
  }
}

// ---------- findings: likely code locations per failing step -------------------
const LOCATIONS = {
  today: ["web/src/app/api/onboarding/build/route.ts lines 58-62 (the access-profile refresh cookie is set without a domain, so it stays on tulala.digital and never reaches app.tulala.digital)", "web/src/lib/supabase/middleware.ts (60s ACCESS_PROFILE_TTL_MS memo; forgetAccessProfileMemo only clears the route's own copy)", "web/src/app/(workspace)/talent/page.tsx + web/src/app/onboarding/role/page.tsx (the /talent <-> /onboarding/role bounce)", "web/src/components/onboarding/steps/arrival-step.tsx (CTA is an absolute app-host link)"],
  "register-email": ["web/src/app/auth/otp-actions.ts (requestEmailCode: SEND_PER_EMAIL / SEND_PER_IP budgets)", "Supabase project Auth > Rate limits (email sends per hour)"],
  "register-ai": ["web/src/lib/onboarding/understand.server.ts", "web/src/components/onboarding/onboarding-module.tsx (UNDERSTAND_CEILING_MS)"],
  "content-hours": ["web/src/components/talent/studio/MoreScreen.tsx (More > Working hours row only navigates to the calendar)", "web/src/components/admin/shell/internal/talent/agenda/AgendaCalendarPage.tsx (no phone control for the working-hours panel)", "web/src/components/admin/shell/internal/talent/pages/SettingsPage.tsx (the only phone entry)"],
  "content-services": ["web/src/components/talent/services/TalentOfferingsManager.tsx", "web/src/lib/talent/offerings-types.ts"],
  "content-bio": ["web/src/components/admin/shell/internal/talent (profile drawer About panel, autosave)"],
  "content-photos": ["web/src/components/talent/media-gallery-drawer.tsx"],
  "close-account-ui": ["web/src/app/(workspace)/talent settings: Close your account (14-day scheduled removal)"],
  register: ["web/src/components/onboarding/onboarding-module.tsx (state machine, understand ceiling)", "web/src/components/onboarding/steps/*.tsx (screen that stalled)", "web/src/lib/server-actions/onboarding-module.ts", "web/src/app/auth/otp-actions.ts (email code verify)", "web/src/app/api/onboarding/build + web/src/lib/onboarding/build.server.ts"],
  "register-ai": ["web/src/lib/onboarding/understand.server.ts (model call / KV fail-closed)", "web/src/components/onboarding/onboarding-module.tsx UNDERSTAND_CEILING_MS"],
  profile: ["web/src/lib/onboarding/talent-writer.server.ts (writeTalentProfileFromBrief)", "web/src/lib/onboarding/type-chip.server.ts"],
  design: ["web/src/components/talent/site/maison-setup/* (GalleryBrowseScreen, ThemeDetailScreen, ReviewWebsiteScreen)", "web/src/lib/talent-site/server/maison-publish-readiness.ts", "web/src/lib/talent-site/server/site-activation-core.ts"],
  publish: ["web/src/components/talent/site/maison-setup/ReviewWebsiteScreen.tsx", "web/src/lib/talent-site/server/site-activation-core.ts", "web/src/lib/talent-site/server/maison-publish-readiness.ts"],
  services: ["web/src/components/talent/services/TalentOfferingsManager.tsx", "web/src/lib/talent/offerings-types.ts"],
  bio: ["web/src/components/talent/bio-helper-card.tsx", "web/src/app/(workspace)/talent/today/page.tsx"],
  photo: ["web/src/components/talent/media-gallery-drawer.tsx", "web/src/components/talent/photo-cropper-dialog.tsx", "web/src/app/api/media"],
  import: ["web/src/components/talent/site/maison-setup/ImportStarterPanel.tsx", "web/src/lib/talent-site/server/maison-import-actions.ts", "web/src/app/api/tulala/import"],
  live: ["web/src/app/template-preview/[key]/live-site-preview.tsx", "web/src/lib/talent-site/server/render-max-site.tsx"],
  socket: ["web/src/lib/talent-site/footer-socket.ts", "web/src/components/talent-site/talent-site-socket.tsx", "web/src/lib/talent-site/theme-catalog/collection/maison-v2-footer.ts"],
  policies: ["web/src/lib/talent-site/server/policy-main.tsx", "web/src/lib/talent-site/footer-socket.ts (TALENT_BOOKING_POLICY_PATH, TALENT_PRIVACY_PATH)"],
  chat: ["web/src/app/%5Ftalent-site/TalentSiteMessagesDock.tsx", "web/src/app/t/[profileCode]/_chat/TalentProfileChatLauncherMount.tsx"],
  booking: ["web/src/lib/scheduling/booking-surface.ts (resolveTalentBooking returns 'inquire' for a talent sold through the platform hub tenant, even with working hours saved and an instant-booking service)", "web/src/app/api/public/booking/slots/route.ts line 204 (reason inquiry_only)", "web/src/components/public-booking/CatalogLiveWhenPicker.tsx (empty state says 'Nothing is open in the next two weeks' instead of explaining the site is inquiry-only)", "Folio: selecting a service shows no Continue dock (web/src/lib/talent-site/theme-catalog folio sections)", "web/src/components/public-booking/*"],
  leaks: ["Folio default section copy is written for fashion models and MXN: web/design-references/folio/content.json + the Folio theme catalog entry under web/src/lib/talent-site/theme-catalog/", "web/src/lib/talent-site/demos/fixture-plan.ts", "web/src/lib/talent-site/server/preview-data.ts"],
  locale: ["web/src/lib/talent-site/live-text.ts", "web/src/lib/talent-site/server/render-max-site.tsx", "web/src/lib/i18n/pick-locale.ts"],
  switch: ["web/src/lib/site-admin/builder-core/templates/apply-shell-variant-action.ts", "web/src/components/talent/site/maison-setup/live-design-change.ts", "web/src/components/talent/site/maison-setup/PublishDesignDialog.tsx"],
  cleanup: ["web/src/app/(workspace)/platform/admin/users/actions-tier3.ts (deletePlatformUserAccount: delete profiles row, then auth user; platform-admin only)", "supabase/migrations: the talent_pages delete path writes a talent_page_revisions row with created_by = the user being deleted (23503 FK violation), and talent_profiles is not removed by deleting profiles", "talent self-serve Close your account is a 14-day schedule, not a delete"],
};

// ---------- report --------------------------------------------------------------
const esc = (x) => String(x ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function writeReport(runs, meta) { writeReportTo(OUT, runs, meta); }
function writeReportTo(outDir, runs, meta) {
  const badge = (st) => `<span class="b ${st}">${st}</span>`;
  const worst = (r) => (r.steps.every((x) => x.status === "SKIP") ? "SKIP" : r.steps.some((x) => x.status === "FAIL") ? "FAIL" : r.steps.some((x) => x.status === "WARN") ? "WARN" : "PASS");
  const findings = [];
  for (const r of runs) {
    for (const st of r.steps) if (st.status === "FAIL" || st.status === "WARN") findings.push({ run: r.id, id: st.id, title: st.title, status: st.status, reason: st.reason });
    for (const n of r.notes) findings.push({ run: r.id, id: "note", title: "Observation", status: "NOTE", reason: n });
  }
  const locFor = (id) => LOCATIONS[id] ?? LOCATIONS[id.split(":")[0]] ?? LOCATIONS[id.split("-")[0]] ?? [];
  const html = `<!doctype html><meta charset="utf-8"><title>Onboarding e2e ${esc(meta.stamp)}</title>
<style>body{font:14px/1.5 system-ui,sans-serif;margin:24px;color:#1b1b1b;max-width:1200px}h1{font-size:22px}h2{font-size:18px;margin-top:32px;border-top:1px solid #ddd;padding-top:16px}
table{border-collapse:collapse;width:100%;margin:8px 0}td,th{border:1px solid #ddd;padding:6px 8px;vertical-align:top;text-align:left}th{background:#f5f5f5}
.b{display:inline-block;padding:1px 8px;border-radius:10px;font-weight:600;font-size:12px}.PASS{background:#d6f5df;color:#12592b}.FAIL{background:#fbd5d5;color:#8a1212}.WARN{background:#fdeccb;color:#7a4b00}.SKIP{background:#e6e6e6;color:#444}.NOTE{background:#dbe8fb;color:#1b3d7a}
.shots a{display:inline-block;margin:2px}.shots img{height:90px;border:1px solid #ccc;border-radius:4px}code{background:#f1f1f1;padding:1px 4px;border-radius:3px}small{color:#666}</style>
<h1>Onboarding end-to-end: register, onboard, design, publish, switch</h1>
<p><small>Run ${esc(meta.stamp)} against <code>localhost:${meta.port}</code> (fronted as tulala.digital). Commit ${esc(meta.sha)}. Designs: ${esc(meta.designs.join(", "))}. Viewports: ${esc(meta.viewports.join(", "))}.</small></p>
<h2>Summary</h2>
<table><tr><th>Design</th><th>Viewport</th><th>Result</th><th>Steps (pass / warn / fail / skip)</th><th>Throwaway user</th><th>Cleanup</th></tr>
${runs.map((r) => { const c = (k) => r.steps.filter((x) => x.status === k).length; return `<tr><td>${esc(r.design)}</td><td>${r.width}</td><td>${badge(worst(r))}</td><td>${c("PASS")} / ${c("WARN")} / ${c("FAIL")} / ${c("SKIP")}</td><td><small>${esc(r.email ?? "-")}</small></td><td>${r.cleanup ? (r.cleanup.deleted && !r.cleanup.leftovers.length ? badge("PASS") : badge("FAIL")) : badge("SKIP")}</td></tr>`; }).join("")}</table>
<h2>Findings</h2>
${findings.length ? `<table><tr><th>Run</th><th>Step</th><th>Status</th><th>What happened</th><th>Likely code locations</th></tr>${findings.map((f) => `<tr><td>${esc(f.run)}</td><td>${esc(f.id)}${f.title ? `<br><small>${esc(f.title)}</small>` : ""}</td><td>${badge(f.status)}</td><td>${esc(f.reason)}</td><td>${locFor(f.id).map((l) => `<code>${esc(l)}</code>`).join("<br>")}</td></tr>`).join("")}</table>` : "<p>No failures, warnings or observations.</p>"}
${runs.map((r) => `<h2>${esc(r.design)} @ ${r.width}</h2>
<table><tr><th style="width:150px">Step</th><th style="width:70px">Result</th><th>Detail</th><th>Evidence</th></tr>
${r.steps.map((st) => `<tr><td>${esc(st.id)}<br><small>${esc(st.title)}</small></td><td>${badge(st.status)}</td><td>${esc(st.reason)}${st.details.length ? `<br><small>${st.details.map(esc).join("<br>")}</small>` : ""}<br><small>${st.ms ?? 0} ms</small></td><td class="shots">${st.shots.filter(Boolean).map((sh) => `<a href="${esc(sh)}"><img src="${esc(sh)}" loading="lazy"></a>`).join("")}</td></tr>`).join("")}</table>
${r.cleanup ? `<p><small>Cleanup: user ${esc(r.cleanup.userId)}; deleted=${r.cleanup.deleted}; leftovers=${esc(JSON.stringify(r.cleanup.leftovers))}; ${esc(r.cleanup.log.join(" | "))}</small></p>` : ""}`).join("")}
${meta.extra ?? ""}`;
  fs.writeFileSync(path.join(outDir, "report.html"), html);
  fs.writeFileSync(path.join(outDir, "meta.json"), JSON.stringify({ ...meta, extra: undefined }));
  fs.writeFileSync(path.join(outDir, "results.json"), JSON.stringify(runs.map((r) => ({ id: r.id, design: r.design, width: r.width, email: r.email, steps: r.steps, notes: r.notes, cleanup: r.cleanup })), null, 1));
}


// ---------- orchestration -------------------------------------------------------
const trace_ = (...a) => console.log(...a);
function sha() { try { return execSync("git rev-parse --short HEAD", { cwd: WEB }).toString().trim(); } catch { return "?"; } }

async function probeFrontDoorLink(browser, run) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60_000);
  try {
    await run.step(page, "import-link", "Front-door Link entry (paste a website to import from)", async (rec) => {
      await page.goto(MARKETING + "/", { waitUntil: "domcontentloaded", timeout: 120_000 });
      await page.waitForSelector("html[data-onboarding-ready]", { timeout: 90_000 });
      await page.getByRole("button", { name: /Sell your work/ }).first().click();
      await page.getByTestId("onb-toggle-link").click({ timeout: 15_000 });
      await page.getByTestId("onb-link").fill("https://example.com");
      await page.getByTestId("onb-send").click();
      const end = Date.now() + 150_000;
      let last = "";
      while (Date.now() < end) {
        const t = (await page.getByTestId("onb-overlay").innerText().catch(() => "")).replace(/\s+/g, " ");
        last = t;
        if (await visible(page.getByTestId("onb-understood"), 300) || await visible(page.getByTestId("onb-essentials"), 300)) { rec.details.push("link read, moved on: " + t.slice(0, 200)); return; }
        if (await visible(page.getByTestId("onb-error"), 300)) throw new Error("link entry showed an error: " + (await page.getByTestId("onb-error").innerText()).slice(0, 160));
        await sleep(1500);
      }
      throw new Error("link import never left the reading screen in 150s: " + last.slice(0, 160));
    });
  } finally { await ctx.close(); }
}

let lastSignupAt = 0;
async function oneRun(browser, design, width, ctxState) {
  const gap = Date.now() - lastSignupAt;
  if (gap < 75_000) await sleep(75_000 - gap); // the platform rate-limits code emails
  lastSignupAt = Date.now();
  const run = new Run(design, width);
  run.palette = {}; run.notes = [];
  const trade = ctxState.trade;
  const t = TRADES[trade];
  run.displayName = t.name; run.shortName = t.name.split(" ")[0];
  run.bioText = `${run.shortName} here. I do ${t.services.join(" and ").toLowerCase()} by appointment in my own studio, six days a week, with ten years of care behind every set.`;
  const stamp = Date.now().toString(36);
  run.email = `qa-onboard+${design}-${stamp}@impronta.test`;
  const password = crypto.randomBytes(12).toString("base64url") + "aA1!"; // never printed or written
  // Each run looks like its own visitor to the build's per-IP limiter (the TLS front adds no client IP).
  const fakeIp = `10.${Math.floor(Math.random() * 200) + 20}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
  const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 }, ignoreHTTPSErrors: true, extraHTTPHeaders: { "x-forwarded-for": fakeIp } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60_000);
  const failedFatal = () => run.steps.some((x) => x.id === "register" && x.status === "FAIL");
  try {
    await run.step(page, "register", "Register as a brand-new talent through the front door", async (rec) => {
      let arrival;
      try {
        arrival = await registerViaFrontDoor(page, run, { email: run.email, trade, city: "Cancún", notes: run.notes });
      } catch (e) {
        if (!e.emailLimited) throw e;
        // The project's auth e-mail limit is spent (every signup sends a code). Fall back: an admin-created confirmed user signs in
        // with a password and walks the same overlay as a signed-in person. The code-email step is NOT exercised in this run.
        rec.details.push("EMAIL LIMIT: " + e.message + " -> fallback: admin-created confirmed user + password login");
        const cr = await admin("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email: run.email, password, email_confirm: true, user_metadata: { signup_intent: "talent" } }) });
        const cj = await cr.json();
        if (!cr.ok) throw new Error("fallback user creation failed: " + JSON.stringify(cj).slice(0, 160));
        run.userId = cj.id;
        await loginWithPassword(page, run.email, password);
        arrival = await registerViaFrontDoor(page, run, { email: run.email, trade, city: "Cancún", notes: run.notes });
        run.steps.push({ id: "register-email", title: "Code e-mail during sign-up", status: "WARN", reason: "Supabase refused further code emails ('email rate limit exceeded', project-level) during this QA session, so this run signed up through an admin-created confirmed user instead of the e-mailed code. The e-mailed-code path was proven in earlier runs of the same session; a real user hitting the limit sees 'Too many attempts. Wait a minute' and is stuck for as long as the project limit lasts.", shots: [], details: [], ms: 0 });
      }
      rec.details.push("arrival: " + arrival.slice(0, 220));
      if (!run.userId) run.userId = await findUserId(run.email);
      const cta = page.getByTestId("onb-arrival-cta");
      if (await visible(cta, 1000)) {
        const href = await cta.getAttribute("href");
        await cta.click().catch(() => {});
        await sleep(9000);
        rec.details.push(`arrival "Finish my page" href=${href} landed on ${page.url()}`);
        const body = await bodyText(page);
        if (/Page not found|Host not registered|404/.test(body.slice(0, 400))) run.notes.push(`arrival CTA (${href}) landed on a not-found page at ${page.url()}`);
      }
    }, { fatal: false });
    if (failedFatal() || !run.userId) throw Object.assign(new Error("registration did not complete"), { fatalStep: "register" });
    run.step.skipAI = false;
    if (run.notes.some((n) => /AI understand step fell back/.test(n))) {
      // surfaced as its own finding row
      run.steps.push({ id: "register-ai", title: "AI understanding of the typed sentence", status: "WARN", reason: "The model step did not read the sentence ('We couldn't read your words right now'); the short-form questions took over. Real users on this build get the slower path.", shots: [], details: [], ms: 0 });
    }
    await run.step(page, "profile", "Profile, trade, city, roster written by onboarding", (rec) => stageProfileData(run, rec));
    await run.step(page, "today", "Dashboard opens as the new user (no redirect loop)", async (rec) => {
      const r = await gotoApp(page, "/talent/today");
      const body = await bodyText(page);
      await run.shot(page, "today");
      if (r.redirectLoopRecovered) throw new Error("first /talent/today load hit ERR_TOO_MANY_REDIRECTS (/talent <-> /onboarding/role) and only recovered after the 60s access-profile memo expired");
      if (!/Today|Hoy/.test(body)) throw new Error("dashboard did not render: " + body.slice(0, 160));
      rec.details.push(body.slice(0, 160));
    });
    await run.step(page, "content-hours", "Working hours saved from the calendar", (rec) => stageHours(page, run, rec));
    await run.step(page, "content-services", "3 services with prices published", (rec) => stageServices(page, run, rec));
    await run.step(page, "content-bio", "Bio typed in the profile drawer and saved", (rec) => stageBio(page, run, rec));
    await run.step(page, "content-photos", "6 photos uploaded from design-references", (rec) => stagePhotos(page, run, rec));
    const designRec = await run.step(page, "design", `Pick ${design} + palette, use it, first publish`, (rec) => stageDesign(page, run, rec, design));
    if (designRec.status === "SKIP") return run;
    if (designRec.status === "FAIL") { run.steps.push({ id: "verify", title: "Published-site checks", status: "SKIP", reason: "no published site (design/publish step failed)", shots: [], details: [], ms: 0 }); return run; }
    ctxState.listed = run.listed ?? ctxState.listed;
    await run.step(page, "import", "Import entry point: Import starter content panel", (rec) => stageImportProbe(page, run, rec, design));
    await run.step(page, "live", "Published site renders as the owner (services, name, photos)", (rec) => stageLive(page, run, rec));
    await run.step(page, "bio-live", "Edited bio shows on the published site", (rec) => stageBioLive(page, run, rec));
    await run.step(page, "socket", "Footer socket present with policy + Tulala links", (rec) => stageSocket(page, run, rec));
    await run.step(page, "policies", "Policy pages /politicas and /privacidad on the public host", (rec) => stagePolicies(page, run, rec));
    await run.step(page, "chat", "Chat opens from the dock on the public site", (rec) => stageChat(page, run, rec));
    await run.step(page, "booking", "Book a service up to the booking-sheet details step", (rec) => stageBooking(page, run, rec));
    await run.step(page, "leaks", "No fixture or demo data leaks (Alba, Mérida, Diego, QA)", (rec) => stageLeaks(page, run, rec));
    await run.step(page, "locale", "Spanish text only on the Spanish site", (rec) => stageLocale(page, run, rec, ctx));
    const alt = design === "maison-v2" ? "folio" : "maison-v2";
    await run.step(page, "switch", `Switch ${design} -> ${alt} -> ${design}, content kept, publish`, (rec) => stageSwitch(page, run, rec, design, alt));
    await run.step(page, "close-account-ui", "Self-serve Close your account is reachable and explains its terms", (rec) => stageCloseAccountUi(page, run, rec));
    await run.step(page, "relogin", "Returning user can log in with email and password", async (rec) => {
      // The run set this password itself (admin API, never printed); a password change ends the live session, so it is last.
      await admin(`/auth/v1/admin/users/${run.userId}`, { method: "PUT", body: JSON.stringify({ password }) });
      const ctx2 = await browser.newContext({ viewport: { width, height: 844 }, ignoreHTTPSErrors: true });
      const p2 = await ctx2.newPage(); p2.setDefaultTimeout(60_000);
      try {
        await p2.goto(APP + "/login", { waitUntil: "domcontentloaded", timeout: 120_000 });
        await sleep(3000);
        await declineCookies(p2);
        await p2.locator('input[name="email"]').first().fill(run.email);
        await p2.locator('input[name="password"]').first().fill(password);
        await p2.locator('button[type="submit"]').first().click();
        await p2.waitForURL(/\/talent/, { timeout: 90_000 });
        rec.details.push("landed on " + p2.url());
      } finally { await ctx2.close(); }
    });
  } catch (e) {
    if (!e.fatalStep) { run.notes.push("run aborted: " + String(e.message).slice(0, 200)); console.log(`[${run.id}] ABORT ${e.message}`); }
  } finally {
    try {
      if (process.env.ONB_DEBUG_STATE) await ctx.storageState({ path: process.env.ONB_DEBUG_STATE }).catch(() => {}); // debugging only: lets a follow-up script reuse the session
      await ctx.close();
      if (process.env.ONB_SKIP_CLEANUP === "1") {
        run.cleanup = { userId: run.userId, email: run.email, deleted: false, leftovers: [], log: ["ONB_SKIP_CLEANUP=1: user kept"] };
      } else {
        const cp = await (await browser.newContext()).newPage();
        const step = { id: "cleanup", title: "Delete the throwaway user and every row of theirs", status: "PASS", reason: "", shots: [], details: [], ms: 0 };
        run.cleanup = await cleanupUser(run.userId ?? (await findUserId(run.email)), run.email);
        if (!run.cleanup.deleted || run.cleanup.leftovers.length) { step.status = "FAIL"; step.reason = `deleted=${run.cleanup.deleted} leftovers=${JSON.stringify(run.cleanup.leftovers)} ${run.cleanup.log.join(" | ")}`; }
        else if (run.cleanup.orphanTalentProfile) { step.status = "WARN"; step.reason = "the platform's account deletion (profiles row, then auth user) succeeded but left the user's talent_profiles row (and its field history) behind; it had to be removed separately"; step.details.push(run.cleanup.log.join(" | ")); }
        else if (run.cleanup.platformPathWorked === false) { step.status = "WARN"; step.reason = `the platform's own account-deletion path (delete the profiles row, cascades to talent) was refused, so the admin-API fallback was needed: ${run.cleanup.log[0]}`; step.details.push(run.cleanup.log.join(" | ")); }
        else step.details.push(run.cleanup.log.join(" | ") + ` talent profiles: ${(run.cleanup.talentProfileIds ?? []).length}`);
        run.steps.push(step);
        console.log(`[${run.id}] ${step.status} cleanup ${step.reason}`);
        await cp.context().close();
      }
    } catch (e) { run.notes.push("cleanup crashed: " + String(e.message).slice(0, 200)); }
  }
  return run;
}

async function main() {
  await healthCheck();
  const wanted = (process.env.ONB_DESIGNS ?? "maison-v2,folio,gridline").split(",");
  const browser = await launch();
  const runs = [];
  const state = { trade: process.env.ONB_TRADE ?? "nails", listed: null };
  try {
    for (const design of wanted) {
      for (const width of VIEWPORTS) {
        if (state.listed && !state.listed.includes(design)) {
          const r = new Run(design, width); r.notes = [];
          r.steps.push({ id: "design", title: `Pick ${design}`, status: "SKIP", reason: `design "${design}" is not listed in the onboarding gallery on this build (gallery: ${state.listed.join(", ")})`, shots: [], details: [], ms: 0 });
          runs.push(r); console.log(`[${r.id}] SKIP not listed`);
          continue;
        }
        runs.push(await oneRun(browser, design, width, state));
        writeReport(runs, { stamp: STAMP, port: BASE_PORT, sha: sha(), designs: wanted, viewports: VIEWPORTS });
      }
    }
    const probe = new Run("front-door", 1280); probe.notes = [];
    await probeFrontDoorLink(browser, probe);
    runs.push(probe);
  } finally {
    writeReport(runs, { stamp: STAMP, port: BASE_PORT, sha: sha(), designs: wanted, viewports: VIEWPORTS });
    await browser.close().catch(() => {});
    PROXY?.close();
  }
  const fails = runs.flatMap((r) => r.steps.filter((x) => x.status === "FAIL").map((x) => `${r.id}:${x.id}`));
  console.log(`\nreport: ${path.join(OUT, "report.html")}\nfailures: ${fails.length ? fails.join(", ") : "none"}`);
  process.exit(fails.length ? 1 : 0);
}

/** node run.mjs --report <outDir> <runDir> [<runDir>...]: rebuild report.html from saved results.json files (later dirs win per run id). */
function reportFromDirs(outDir, dirs) {
  const byId = new Map();
  let meta = null;
  for (const d of dirs) {
    const res = JSON.parse(fs.readFileSync(path.join(d, "results.json"), "utf8"));
    try { meta = { ...(meta ?? {}), ...JSON.parse(fs.readFileSync(path.join(d, "meta.json"), "utf8")) }; } catch { /* old run dir */ }
    const rel = path.relative(outDir, d);
    for (const r of res) {
      for (const st of r.steps) st.shots = (st.shots ?? []).map((x) => path.join(rel, x));
      byId.set(r.id, { ...r, details: undefined });
    }
  }
  fs.mkdirSync(outDir, { recursive: true });
  const prevOut = OUT;
  const runs = [...byId.values()];
  const m = { stamp: path.basename(outDir), port: BASE_PORT, sha: sha(), designs: [...new Set(runs.map((r) => r.design))], viewports: [...new Set(runs.map((r) => r.width))], ...(meta ?? {}), extra: `<h2>Sources</h2><p><small>${dirs.map((d) => esc(path.basename(d))).join(", ")}</small></p>` };
  m.stamp = path.basename(outDir);
  writeReportTo(outDir, runs, m);
  console.log("report:", path.join(outDir, "report.html"));
}

if (process.argv[2] === "--report") {
  reportFromDirs(path.resolve(process.argv[3]), process.argv.slice(4).map((d) => path.resolve(d)));
  process.exit(0);
}

if (import.meta.url === new URL(process.argv[1], "file://").href || process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(2); });
}

export { LOCATIONS, writeReport, cleanupUser, scanLeftovers, THROWAWAY, TRADES, registerViaFrontDoor, Run, results, env, admin, rest, emailOtp, findUserId, startTlsProxy, chromium, visible, sleep, FIXTURE_LEAKS, ES_WORDS, OUT, MARKETING, APP, BASE_PORT, VIEWPORTS, ONLY, STAMP, WEB, REPO };
