#!/usr/bin/env node
/**
 * Mockup parity: headless visual + structural comparison of a talent's published
 * Maison v2 site against the approved mockup. Read-only (see docs/qa/mockup-parity.md).
 *
 *   npm run qa:mockup-parity -- [--design maison-v2|folio] [--talents alba,valeria,TAL-93020|--all-maison-v2]
 *     [--widths 390,360,1440] [--locale es|en] [--states static,chat,dock,booking]
 *     [--base-url http://localhost:3001] [--mockup-url http://localhost:3099/]
 *     [--include-drafts] [--storage-state file.json] [--out dir]
 *     [--design maison-v2] [--source live|code] [--sections menu,hero] [--compact] [--no-report]
 *
 * Alba (the reference demo) also gets a pixel diff per section; every failing check is
 * classified into a delta (classify.mjs) and compared with design-references/<design>/parity-baseline.json.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

import { loadEnvLocal } from "../../load-env-local.mjs";
import { analyze } from "./analyze.mjs";
import { fitImages, writeReport } from "./report.mjs";
import { createImageTool, preparePage } from "./pixel.mjs";
import { pixelThresholdFor } from "./pixel-thresholds.mjs";
import { SECTION_UNITS, classify, compactTable, findingsOf } from "./classify.mjs";
import { applyBaseline, loadBaseline, writeBaseline } from "./baseline.mjs";
import { ACCENT_DENYLIST, ES_DENYLIST, LOCALE_TEXT, NEVER_CLICK, loadDesignMap } from "./section-map.mjs";

loadEnvLocal();
const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, "..", "..", "..");

// ---------------------------------------------------------------- args
function parseArgs(argv) {
  const o = { talents: [], all: false, widths: [390], locale: "es", states: ["static", "chat", "dock", "booking"], baseUrl: "http://localhost:3001", mockupUrl: "http://localhost:3099/", drafts: false, storageState: null, out: null, public: false, apex: "tulala.digital", allowActions: false, design: "maison-v2", source: "live", sections: [], compact: false, noReport: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = () => argv[++i];
    if (a === "--design") o.design = v();
    else if (a === "--talents") o.talents = v().split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--all-maison-v2" || a === "--all-design") o.all = true;
    else if (a === "--widths") o.widths = v().split(",").map(Number).filter(Boolean);
    else if (a === "--locale") o.locale = v();
    else if (a === "--states") o.states = v().split(",").map((s) => s.trim());
    else if (a === "--base-url") o.baseUrl = v().replace(/\/$/, "");
    else if (a === "--mockup-url") { o.mockupUrl = v(); o.mockupUrlSet = true; }
    else if (a === "--include-drafts") o.drafts = true;
    else if (a === "--storage-state") o.storageState = v();
    else if (a === "--out") o.out = v();
    else if (a === "--public") o.public = true;
    else if (a === "--apex") o.apex = v();
    else if (a === "--allow-server-actions") o.allowActions = true;
    else if (a === "--design") o.design = v();
    else if (a === "--source") o.source = v();
    else if (a === "--sections") o.sections = v().split(",").map((x) => x.trim()).filter(Boolean);
    else if (a === "--compact") o.compact = true;
    else if (a === "--no-report") o.noReport = true;
    else if (a === "--update-baseline") o.updateBaseline = true;
    else if (a === "--ticket") o.ticket = v();
    else if (a === "--help" || a === "-h") { console.log("see docs/qa/mockup-parity.md"); process.exit(0); }
    else { console.error(`unknown flag ${a}`); process.exit(2); }
  }
  if (!["live", "code"].includes(o.source)) { console.error("--source must be live or code"); process.exit(2); }
  if (!["es", "en"].includes(o.locale)) { console.error("--locale must be es or en"); process.exit(2); }
  return o;
}
const opts = parseArgs(process.argv.slice(2));
let tool = null; // canvas image tool (pixel diff, downscaled JPEGs)

// The design map (web/design-references/<slug>/parity-map.json) drives sections, order, the mockup
// driver and the reference demo (the demo whose content equals the mockup; see demos/registry.ts).
const MAP = (() => {
  try { return loadDesignMap(opts.design); } catch (e) { console.error(String(e.message || e)); process.exit(2); }
})();
const SECTIONS = MAP.sections;
const ORDER = MAP.order;
const REF_CODE = MAP.referenceDemo.profileCode;
if (!opts.talents.length && !opts.all) opts.talents = [REF_CODE];
if (!opts.mockupUrlSet) opts.mockupUrl = MAP.mockup.defaultUrl || opts.mockupUrl;
// The classifier'"'"'s unit table follows the selected design'"'"'s map (key -> mockup data-w unit and kit slot).
for (const k of Object.keys(SECTION_UNITS)) delete SECTION_UNITS[k];
for (const sec of SECTIONS) {
  const shell = /^(header|footer|footer_rich|socket)$/.test(sec.parityKey || "") ? sec.parityKey.replace("footer_rich", "footer") : null;
  SECTION_UNITS[sec.key] = { wType: sec.unit || sec.key, ...(sec.missing ? { missing: true } : {}), ...(shell ? { shell } : { slot: sec.parityKey || null }) };
}
for (const k of opts.sections) if (!SECTIONS.some((x) => x.key === k)) { console.error(`--sections: unknown section "${k}" (have ${SECTIONS.map((x) => x.key).join(", ")})`); process.exit(2); }
const ACTIVE = opts.sections.length ? SECTIONS.filter((x) => opts.sections.includes(x.key)) : SECTIONS;
const ACTIVE_ORDER = ORDER.filter((k) => ACTIVE.some((x) => x.key === k));

// Read-only guard: agents QA on local servers only (web/AGENTS.md, Verification).
for (const u of [opts.baseUrl, opts.mockupUrl]) {
  const h = new URL(u).hostname;
  if (!["localhost", "127.0.0.1", "[::1]"].includes(h)) {
    console.error(`Refusing ${u}: mockup-parity only runs against local servers (localhost / 127.0.0.1).`);
    process.exit(2);
  }
}

// ---------------------------------------------------------------- talents (read-only REST)
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
async function rest(path) {
  if (!SB || !KEY) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing (web/.env.local).");
  const r = await fetch(`${SB}/rest/v1/${path}`, { method: "GET", headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error(`REST ${path.split("?")[0]} -> ${r.status}`);
  return r.json();
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveTalents() {
  const siteRows = await rest("talent_sites?select=talent_profile_id,status,site_slug,theme_design_slug&theme_design_slug=eq." + opts.design);
  const siteBy = new Map(siteRows.map((s) => [s.talent_profile_id, s]));
  let profiles = [];
  if (opts.all) {
    const ids = siteRows.map((s) => s.talent_profile_id);
    if (ids.length) profiles = await rest(`talent_profiles?select=id,profile_code,display_name,is_demo&id=in.(${ids.join(",")})`);
  }
  for (const tok of opts.talents) {
    const filters = [`profile_code.ilike.*${tok}*`, `display_name.ilike.*${tok}*`];
    if (UUID.test(tok)) filters.push(`id.eq.${tok}`);
    const hit = await rest(`talent_profiles?select=id,profile_code,display_name,is_demo&or=(${filters.join(",")})`);
    const exact = hit.filter((h) => h.profile_code.toLowerCase() === tok.toLowerCase() || h.display_name.toLowerCase() === tok.toLowerCase() || h.id === tok);
    const pick = exact.length ? exact : hit;
    if (!pick.length) console.error(`warn: no talent matches "${tok}"`);
    profiles.push(...pick);
  }
  const seen = new Set();
  const out = [];
  const skippedDrafts = [];
  for (const p of profiles) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    let site = siteBy.get(p.id);
    if (!site) { const r = await rest(`talent_sites?select=talent_profile_id,status,site_slug,theme_design_slug&talent_profile_id=eq.${p.id}`); site = r[0]; }
    const t = { id: p.id, code: p.profile_code, name: p.display_name, demo: !!p.is_demo, design: site?.theme_design_slug || "none", status: site?.status || "none", slug: site?.site_slug || null };
    if (opts.all && !opts.talents.length && t.status !== "published" && !opts.drafts) { skippedDrafts.push(t); continue; }
    out.push(t);
  }
  out.sort((a, b) => (a.code === REF_CODE ? -1 : b.code === REF_CODE ? 1 : a.code.localeCompare(b.code)));
  return { talents: out, skippedDrafts };
}

// ---------------------------------------------------------------- auth
function identities() {
  const e = process.env;
  const list = [];
  if (e.QA_PLATFORM_ADMIN_PASSWORD) list.push({ name: "platform-admin", admin: true, email: e.QA_PLATFORM_ADMIN_EMAIL || "qa-platform-admin@impronta.test", password: e.QA_PLATFORM_ADMIN_PASSWORD });
  for (const [name, pw, em] of [["qa-fresh", "QA_FRESH_PASSWORD", "QA_FRESH_EMAIL"], ["qa-free", "QA_FREE_PASSWORD", "QA_FREE_EMAIL"], ["qa-jor-clone", "QA_JOR_CLONE_PASSWORD", "QA_JOR_CLONE_EMAIL"], ["qa-talent", "QA_TALENT_PASSWORD", "QA_TALENT_EMAIL"]]) {
    if (e[pw] && e[em]) list.push({ name, email: e[em], password: e[pw] });
  }
  return list;
}

const liveUrl = (id) => `${opts.baseUrl}/template-preview/live?kind=live-site&talent=${id}&locale=${opts.locale}`;
const codeUrl = (t) => `${opts.baseUrl}/template-preview/${opts.design}?kind=talent-theme&demo=${opts.design}:${t.demoKey}&source=code&locale=${opts.locale}`;
const probeUrl = (t) => (opts.source === "code" ? codeUrl(t) : liveUrl(t.id));
const siteUrl = (t) => (t.viaPublic ? `http://${t.slug}.${opts.apex}:${new URL(opts.baseUrl).port || 80}/` : probeUrl(t));
/** A code-source page that did not hydrate the demo silently shows another persona; refuse that. */
const hydratedFor = async (r, t) => {
  if (opts.source !== "code") return true;
  const first = (t.name || "").split(/\s+/)[0];
  return !!first && (await r.text().catch(() => "")).includes(first);
};
const analyses = []; // raw per-width product analyses (analysis.json)
const stateCache = new Map(); // identity name -> storageState | null

async function stateFor(browser, ident) {
  if (stateCache.has(ident.name)) return stateCache.get(ident.name);
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  const page = await ctx.newPage();
  let st = null;
  try {
    await page.goto(`${opts.baseUrl}/login`, { waitUntil: "domcontentloaded" });
    await page.getByLabel(/email/i).fill(ident.email);
    await page.getByLabel(/password/i).fill(ident.password);
    await page.getByRole("button", { name: /sign in|log in|iniciar/i }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
    st = await ctx.storageState();
  } catch {
    st = null;
  }
  await ctx.close();
  stateCache.set(ident.name, st);
  return st;
}

async function pickSession(browser, talent) {
  if (opts.storageState) {
    const ctx = await browser.newContext({ storageState: opts.storageState });
    const r = await ctx.request.get(probeUrl(talent), { maxRedirects: 0 }).catch(() => null);
    const okSess = r && r.status() === 200 && (await hydratedFor(r, talent));
    await ctx.close();
    return okSess ? { name: "storage-state", state: opts.storageState } : null;
  }
  const idents = identities();
  const ordered = [...idents].sort((a, b) => (talent.demo ? (b.admin ? 1 : 0) - (a.admin ? 1 : 0) : (a.admin ? 1 : 0) - (b.admin ? 1 : 0)));
  for (const ident of ordered) {
    const st = await stateFor(browser, ident);
    if (!st) continue;
    const ctx = await browser.newContext({ storageState: st });
    const r = await ctx.request.get(probeUrl(talent), { maxRedirects: 0 }).catch(() => null);
    const okSess = r && r.status() === 200 && (await hydratedFor(r, talent));
    await ctx.close();
    if (okSess) return { name: ident.name, state: st };
  }
  return null;
}

// ---------------------------------------------------------------- helpers
const safeShot = async (loc, quality) => {
  try {
    await loc.first().scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => {});
    return await loc.first().screenshot({ ...(quality ? { type: "jpeg", quality } : { type: "png" }), timeout: 8000, animations: "disabled" });
  } catch {
    return null;
  }
};
const never = new RegExp(NEVER_CLICK, "i");
async function safeClick(loc) {
  const name = await loc.first().evaluate((e) => (e.getAttribute("aria-label") || e.innerText || e.textContent || "").trim());
  const launcher = /^(enviar mensaje a|send (a )?message to|abrir el chat|open (the )?chat)/i.test(name); // opens the chat, sends nothing
  if (!launcher && never.test(name)) throw new Error(`refused to click "${name.slice(0, 40)}" (read-only)`);
  await loc.first().click({ timeout: 4000 });
}
async function lazyScroll(page) {
  await page.evaluate(async () => {
    const h = document.documentElement.scrollHeight;
    for (let y = 0; y < h; y += window.innerHeight * 0.8) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(400);
}
const analyzeArgs = (side, extra = {}) => ({ sections: ACTIVE, order: ACTIVE_ORDER, locale: opts.locale, side, textMap: { ...LOCALE_TEXT, ...(MAP.localeText || {}) }, denyEs: ES_DENYLIST, denyAccent: ACCENT_DENYLIST, rootSel: MAP.mockup.root || "#site", ...extra });
const failed = (checks) => (checks || []).filter((c) => !c.ok).map((c) => `${c.name}${c.detail ? `: ${c.detail}` : ""}`);

function colorDiff(a, b) {
  const p = (s) => (s || "").match(/[\d.]+/g)?.slice(0, 3).map(Number);
  const x = p(a), y = p(b);
  if (!x || !y) return 0;
  return Math.max(...x.map((v, i) => Math.abs(v - y[i])));
}
function styleDiffs(prod, mock) {
  const out = [];
  const add = (k, prop, evidence) => out.push({ kind: "style", check: `style ${k} ${prop}`, evidence });
  for (const [k, ps] of Object.entries(prod || {})) {
    const ms = mock?.[k];
    if (!ps || !ms) { if (ps && !ms && k !== "eyebrow") add(k, "presence", `mockup has no ${k}`); /* the mockup eyebrow is a dot + text pair the leaf probe cannot see; its presence is checked by the kicker/eyebrow structure rule */ if (!ps && ms) add(k, "presence", `product element missing (${k})`); continue; }
    if (ps.ff !== ms.ff) add(k, "font-family", `${k} font-family "${ps.ff}" vs mockup "${ms.ff}"`);
    if (Math.abs(ps.fs - ms.fs) > Math.max(2, ms.fs * 0.08)) add(k, "font-size", `${k} font-size ${ps.fs}px vs mockup ${ms.fs}px`);
    if (Math.abs(ps.fw - ms.fw) > 100) add(k, "font-weight", `${k} font-weight ${ps.fw} vs mockup ${ms.fw}`);
    if (colorDiff(ps.color, ms.color) > 16) add(k, "color", `${k} color ${ps.color} vs mockup ${ms.color}`);
    if (k === "button" && colorDiff(ps.bg, ms.bg) > 16) add(k, "background", `${k} background ${ps.bg} vs mockup ${ms.bg}`);
  }
  return out;
}
const checkFindings = (kind, checks) => (checks || []).filter((c) => !c.ok).map((c) => ({ kind, check: c.name, evidence: c.detail || "" }));
/** Record structured findings on a row and mirror them into its human-readable reasons. */
const addFindings = (r, list) => {
  for (const f of list) {
    r.findings.push(f);
    r.reasons.push(f.evidence && f.kind !== "style" ? `${f.check}: ${f.evidence}` : f.evidence || f.check);
  }
};

// ---------------------------------------------------------------- mockup capture
async function captureMockup(browser, width) {
  const big = width >= 1000;
  const ctx = await browser.newContext({ viewport: { width: big ? 1800 : 1280, height: big ? 1000 : 940 } });
  const page = await ctx.newPage();
  const out = { shots: {}, png: {}, analysis: null, selfCheck: [], ok: true };
  const wantStates = opts.states.some((x) => x !== "static");
  try {
    await page.goto(opts.mockupUrl, { waitUntil: "load", timeout: 20000 });
    const drv = MAP.mockup;
    const devBtn = drv.deviceButton.replace("{w}", String(width));
    await page.waitForSelector(devBtn, { timeout: 8000 });
    const prime = async (fn) => {
      await page.locator(devBtn).click();
      await page.evaluate(fn);
      await page.waitForTimeout(500);
    };
    // The step jump can reset the mockup's device mode (Folio does), so jump first, THEN pick the device.
    if (drv.stepButton) await page.locator(drv.stepButton).click();
    await page.locator(devBtn).click();
    await page.waitForTimeout(600);
    // Capture self-check: the mockup lays out inside a container (@container site), so the device
    // switch alone is not enough. The measured container must really be this wide.
    const rootSel = drv.root || "#site";
    const cw = await page.evaluate((sel) => document.querySelector(sel)?.clientWidth || 0, rootSel);
    out.containerWidth = cw;
    const okWidth = width >= 1000 ? cw >= 1200 : Math.abs(cw - width) <= 4;
    if (!okWidth) { out.containerOk = false; throw new Error(`mockup container ${cw}px does not match the ${width}px device mode (need ${width >= 1000 ? ">= 1200" : width})`); }
    out.containerOk = true;
    await page.evaluate(() => { const v = document.getElementById("vp"); if (v) { v.style.scrollBehavior = "auto"; } });
    await preparePage(page);
    out.analysis = await page.evaluate(analyze, analyzeArgs("mockup"));
    for (const sec of ACTIVE) {
      out.png[sec.key] = out.analysis.sections[sec.key]?.present ? await safeShot(page.locator(`[data-parity-shot="${sec.key}"]`)) : null;
      out.shots[sec.key] = out.png[sec.key] ? await tool.jpeg(out.png[sec.key]) : null;
    }
    for (const sec of ACTIVE) {
      const r = out.analysis.sections[sec.key];
      if (!r?.present) { if (!SECTIONS.find((x) => x.key === sec.key)?.productOnly) out.selfCheck.push(`${sec.key}: not found on mockup (${[sec.unit ? "data-w=" + sec.unit : null, ...(sec.mockup || [])].filter(Boolean).join(" | ")})`); continue; }
      for (const f of failed(r.structure)) out.selfCheck.push(`${sec.key}: ${f}`);
    }
    if (width <= 480 && (out.analysis.page.headerRows || 0) > 1) out.selfCheck.push(`header: mockup itself is on ${out.analysis.page.headerRows} rows (header-row rule needs tuning)`);
    const site = page.locator(drv.root || "#site");
    if (!wantStates || !drv.states) { await ctx.close(); return out; }
    await prime(() => { reset(); openService("lash4d"); S.draft.x = ["ret"]; chatOpen(S.draft); });
    out.shots.chat = await safeShot(site, 55);
    await prime(() => { reset(); S.sel = [{ id: "lash4d", v: "vol", x: ["ret"] }]; render(); });
    out.shots.dock = await safeShot(site, 55);
    await prime(() => { reset(); S.sel = [{ id: "lash4d", v: "vol", x: ["ret"] }, { id: "mrusa", v: "liso", x: [] }]; S.sheet = "summary"; render(); });
    out.shots.booking = await safeShot(site, 55);
  } catch (e) {
    out.ok = false;
    out.error = String(e.message || e).split("\n")[0];
  }
  await ctx.close();
  return out;
}

// ---------------------------------------------------------------- product capture
async function loadProduct(ctx, talent, width) {
  const page = await ctx.newPage();
  const resp = await page.goto(siteUrl(talent), { waitUntil: "load", timeout: 30000 }).catch((e) => ({ err: e }));
  if (!resp || resp.err) return { page, error: `navigation failed: ${String(resp?.err?.message || "").split("\n")[0]}` };
  if (resp.status() !== 200) return { page, error: `HTTP ${resp.status()}` };
  await page.waitForLoadState("networkidle", { timeout: 9000 }).catch(() => {});
  await page.waitForSelector("h1, h2", { timeout: 8000 }).catch(() => {});
  // The analytics consent banner is a role=dialog overlay: hide it so it neither intercepts clicks nor passes for the chat or booking dialog.
  await page.addStyleTag({ content: "[data-consent-banner]{display:none!important}" }).catch(() => {});
  if (process.env.PARITY_DEBUG) console.log("DEBUG", await page.evaluate(() => [document.styleSheets.length, getComputedStyle(document.querySelector(".site-header__ritem") || document.body).display, document.readyState]));
  return { page };
}

const row = (talent, width, key, label) => ({ talent: talent.name, code: talent.code, width, section: key, label, status: "PASS", reasons: [], warnings: [], findings: [], product: null, mockup: null, diff: null, pixel: null });
const finish = (r) => { r.status = r.status === "BLOCKED" ? "BLOCKED" : r.reasons.length ? "FAIL" : "PASS"; return r; };

async function scanStatic(ctx, talent, width, mock, rows) {
  const { page, error } = await loadProduct(ctx, talent, width);
  const isAlba = talent.code === REF_CODE; // the reference demo: its content equals the mockup
  if (error) {
    const r = row(talent, width, "page", "Page render");
    addFindings(r, [{ kind: "page", check: "page renders", evidence: `site did not render (${error})` }]);
    r.status = "FAIL";
    rows.push(r);
    await page.close();
    return;
  }
  await lazyScroll(page);
  await preparePage(page);
  const res = await page.evaluate(analyze, analyzeArgs("product"));
  analyses.push({ code: talent.code, name: talent.name, width, keyed: res.page.keyed, sections: res.sections, page: res.page });
  const pr = row(talent, width, "page", "Page (global checks)");
  const pg = res.page;
  const pf = (check, evidence) => ({ kind: "page", check, evidence });
  const pageFindings = [];
  if (opts.locale === "es" && !/^es/i.test(pg.lang)) pageFindings.push(pf("html lang matches locale", `<html lang="${pg.lang}"> on locale=es`));
  if (pg.docOverflow) pageFindings.push(pf("no horizontal page scroll", `page scrolls horizontally (${pg.docOverflowDetail})`));
  if (pg.brokenAnchors.length) pageFindings.push({ kind: "anchor", check: "anchors have a target", evidence: `anchors without a target: ${pg.brokenAnchors.join(", ")}` });
  if (width <= 480 && (pg.headerRows || 0) > 1) pageFindings.push(pf("header on one row", `header is on ${pg.headerRows} rows at ${width}px`));
  if (pg.fixedBottomBars.length > 1) pageFindings.push(pf("one fixed bottom bar", `${pg.fixedBottomBars.length} fixed bottom bars: ${pg.fixedBottomBars.join(" | ")}`));
  if (pg.chatLaunchers.length > 1) pageFindings.push(pf("one chat launcher", `${pg.chatLaunchers.length} chat launchers: ${pg.chatLaunchers.join(" | ")}`));
  if (pg.fixedOverlaps?.length) pageFindings.push(pf("fixed layers do not overlap", `fixed layers overlap: ${pg.fixedOverlaps.join(" | ")}`));
  if (pg.keyed === false) pr.warnings.push("no data-parity-key on this page (the build predates the contract): matched through the map fallback selectors");
  addFindings(pr, pageFindings);
  if (pg.extraSections?.length) pr.warnings.push(`sections not in the mockup: ${pg.extraSections.join(", ")}`);
  if (talent.viaPublic) pr.warnings.push("rendered through the public host (no preview session)");
  pr.product = await page.screenshot({ type: "jpeg", quality: 50, fullPage: false }).catch(() => null);
  // a targeted pass (--sections) looks at those sections only; page-level checks belong to the full run
  if (!opts.sections.length) rows.push(finish(pr));
  for (const sec of ACTIVE) {
    const r = row(talent, width, sec.key, sec.label);
    const a = res.sections[sec.key];
    if (!a?.present) {
      if ((sec.optional && (!isAlba || sec.optionalOnReference)) || sec.productOnly) r.warnings.push("absent (optional: hidden without data)");
      else addFindings(r, [{ kind: "missing", check: "section present", evidence: `section not found (tried ${sec.parityKey ? "[data-parity-key=" + sec.parityKey + "] / " : ""}${(sec.fallback || []).join(" | ")})` }]);
    } else {
      addFindings(r, [
        ...checkFindings("structure", a.structure),
        ...checkFindings("layout", a.layout),
        ...checkFindings("i18n", a.i18n),
      ]);
      if (isAlba && a.order && !a.order.ok) addFindings /* section order is the talent's own tree; only the reference demo must follow the mockup order */(r, [{ kind: "order", check: "section order", evidence: `order: ${a.order.detail}` }]);
      if (isAlba) addFindings(r, styleDiffs(a.style, mock.analysis?.sections[sec.key]?.style));
      const png = await safeShot(page.locator(`[data-parity-shot="${sec.key}"]`));
      const mpng = mock.png?.[sec.key];
      if (png) {
        // Pixel diff on the reference demo only: its content is exact, so every mismatch is the design's.
        if (isAlba && mpng) {
          const d = await tool.diff(png, mpng);
          const threshold = pixelThresholdFor(sec.key, sec);
          r.pixel = { ratio: d.ratio, threshold, ok: d.ratio <= threshold, heightDelta: d.heightDelta, heightDeltaRatio: d.heightB ? d.heightDelta / d.heightB : 0 };
          r.diff = await tool.jpeg(d.diffPng);
          r.keep = { diff: d.diffPng, product: png, mockup: mpng };
          if (!r.pixel.ok) addFindings(r, [{ kind: "pixel", check: "pixel diff", evidence: `mismatch ${(d.ratio * 100).toFixed(1)}% > ${(threshold * 100).toFixed(1)}% (height ${d.heightDelta >= 0 ? "+" : ""}${d.heightDelta}px vs mockup)`, pixel: r.pixel }]);
        }
        r.product = await tool.jpeg(png);
      }
    }
    r.mockup = mock.shots[sec.key];
    if (mock.ok === false) r.warnings.push(`mockup unavailable: ${mock.error}`);
    rows.push(finish(r));
  }
  await page.close();
}

async function scanState(ctx, talent, width, state, mock, rows) {
  const labels = { chat: "Chat panel", dock: "Selection dock", booking: "Booking sheet" };
  const r = row(talent, width, `state:${state}`, labels[state]);
  r.mockup = mock.shots[state];
  const { page, error } = await loadProduct(ctx, talent, width);
  if (error) { r.reasons.push(`site did not render (${error})`); rows.push(finish(r)); await page.close(); return; }
  const never_ = new RegExp(NEVER_CLICK, "i");
  const LOAD_ERROR = /(algo no carg|something went wrong|no se pudo cargar|talent-site-load-error)/i;
  try {
    await lazyScroll(page);

    /** Layout, overflow and i18n checks for one element, through the same in-page analysis the sections use. */
    const checkEl = async (selector, name) => {
      const res = await page.evaluate(analyze, analyzeArgs("product", { sections: [{ key: "x", label: name, mockup: [selector], fallback: [selector], expects: [] }], order: [] }));
      const a = res.sections.x;
      if (!a?.present) { r.reasons.push(`${name} not found (${selector})`); return; }
      // a sheet scrolls its content under a sticky footer (Continue bar): that overlap is by design
      r.reasons.push(...failed(a.layout).filter((f) => !(name === "booking sheet" && /^no overlapping/.test(f))).map((f) => `${name}: ${f}`), ...failed(a.i18n).map((f) => `${name}: ${f}`));
    };

    /** Open the first service (the "Seleccionar" action), choose its first option, then close the sheet. Nothing is submitted. */
    const pickService = async ({ keepOpen }) => {
      const svc = page.locator("#services");
      await svc.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => {});
      let act = svc.locator("button:visible").filter({ hasText: /^(seleccion|select|reserv|book|a[ñn]adir|agregar|add|solicit|request|elegir|choose)/i }).filter({ hasNotText: never_ });
      if (!(await act.count())) {
        // other label: any button that is not a category chip ("Name 3") or inside a nav/group
        act = svc.locator("button:visible:not(nav button):not([role=group] button)").filter({ hasNotText: /^\S+(\s\S+)?\s+\d+$/ }).filter({ hasNotText: never_ });
      }
      if (!(await act.count())) throw new Error("no service action (Seleccionar) found in #services");
      await safeClick(act);
      await page.waitForTimeout(900);
      const sheet = page.locator("[role=dialog]:not([data-consent-banner])").first();
      if (!(await sheet.isVisible().catch(() => false))) return null; // added straight to the selection
      const radio = sheet.locator("input[type=radio], [role=radio]").first();
      if (await radio.count()) { await radio.click({ force: true, timeout: 3000 }).catch(() => {}); await page.waitForTimeout(400); }
      if (keepOpen) return sheet;
      const close = sheet.locator("button[aria-label*='cerrar' i], button[aria-label*='close' i], .jb-x").first();
      if (await close.count()) await close.click({ timeout: 3000 }).catch(() => {});
      else await page.keyboard.press("Escape");
      await page.waitForTimeout(900);
      return null;
    };

    const dockInfo = () => page.evaluate(() => {
      const vis = (e) => { const b = e.getBoundingClientRect(); return b.width > 20 && b.height > 20 && b.top < window.innerHeight && b.bottom > 0; };
      const fixedBars = Array.from(document.querySelectorAll("body *")).filter((e) => getComputedStyle(e).position === "fixed" && vis(e) && !e.closest("[data-show=false], [data-gone=true], [aria-hidden=true]") && e.getBoundingClientRect().height < 200 && e.getBoundingClientRect().width > 200);
      const top = fixedBars.filter((b) => !fixedBars.some((o) => o !== b && o.contains(b)));
      const dock = Array.from(document.querySelectorAll(".cb-dock[data-show='true']")).find(vis) || top.find((b) => /(servicio|service|\$|MXN)/i.test(b.innerText || ""));
      if (!dock) return { bars: top.length, dock: false };
      const btns = Array.from(dock.querySelectorAll("button, a"));
      const ask = dock.querySelector(".cb-dock-ask") || btns.find((b) => /(chat|mensaje|pregunt|escrib|message|ask)/i.test(b.getAttribute("aria-label") || ""));
      return {
        bars: top.length,
        dock: true,
        text: (dock.innerText || "").replace(/\s+/g, " ").slice(0, 90),
        chatBtn: !!ask,
        chatBtnHasPhoto: !!(ask && (ask.querySelector("img") || /url\(/.test(getComputedStyle(ask).backgroundImage))),
        selection: /(\$|MXN|\d+\s*(h|min)|servicio)/i.test(dock.innerText || ""),
      };
    });

    if (state === "booking") {
      let sheet = await pickService({ keepOpen: true });
      if (!sheet) {
        // the service went straight to the selection: the dock's Continue opens the booking sheet
        const go = page.locator(".cb-dock[data-show='true'] .cb-dock-go:visible, .cb-dock[data-show='true'] button:visible, .cb-bar[data-show='true'] .cb-bar-go:visible").filter({ hasText: /(continuar|continue|reservar|book|solicitar|request)/i }).filter({ hasNotText: never_ });
        if (!(await go.count())) throw new Error("a service was selected but no visible Continue (dock or bar) opens the booking sheet");
        await safeClick(go);
        await page.waitForTimeout(900);
        sheet = page.locator("[role=dialog]:not([data-consent-banner])").first();
        if (!(await sheet.isVisible().catch(() => false))) sheet = null;
      }
      if (!sheet) r.reasons.push("the booking sheet did not open");
      else await checkEl("[role=dialog]:not([data-consent-banner])", "booking sheet");
    } else if (state === "dock") {
      await pickService({ keepOpen: false });
      const d = await dockInfo();
      if (!d.dock) r.reasons.push("no selection dock after picking a service");
      else {
        if (d.bars > 1) r.reasons.push(`${d.bars} fixed bottom bars`);
        if (!d.chatBtn) r.reasons.push("dock has no chat button");
        else if (d.chatBtnHasPhoto) r.reasons.push("dock chat button shows a photo, not a chat icon");
        if (!d.selection) r.reasons.push(`dock does not show the selection (service, price, time): "${d.text}"`);
      }
    } else {
      // chat: a visible launcher first, else the dock's chat button (needs a selection)
      let opener = page.locator(".cb-bar-chat, .tl-fab:not([data-gone='true']), [data-guest-chat-launcher] button, .chatb").first();
      if (!(await opener.isVisible().catch(() => false))) {
        await pickService({ keepOpen: false });
        opener = page.locator(".cb-dock[data-show='true'] .cb-dock-ask").first();
        if (!(await opener.isVisible().catch(() => false))) throw new Error("no way to open the chat: no launcher and no dock chat button");
      }
      await safeClick(opener);
      await page.waitForTimeout(1500);
      const body = await page.evaluate(() => document.body.innerText.slice(0, 400));
      if (LOAD_ERROR.test(body) || (await page.locator("[data-testid=talent-site-load-error]").count())) {
        r.status = "BLOCKED";
        r.reasons.push("opening the chat crashed the page, most likely because the read-only guard blocked the chat's server action. Re-run with --allow-server-actions on an isolated target to verify (it may create a guest inquiry).");
      } else {
        const panelSel = "[role=dialog]:not([data-consent-banner]), [data-chat-variant]";
        // The honeypot (name=company_website) is a hidden input that sits BEFORE the textarea in the DOM; never treat it as the composer.
        const composer = page.locator("textarea:visible, [role=dialog] input[type=text]:not([name=company_website]):visible").first();
        if (!(await page.locator(panelSel).first().isVisible().catch(() => false))) r.reasons.push("chat panel did not open");
        if (!(await composer.isVisible().catch(() => false))) r.reasons.push("chat composer not found");
        const chip = page.locator(`${panelSel.split(", ").map((s) => `${s} button`).join(", ")}`).filter({ hasText: /[?¿]|\d\s*(MXN|USD)|\$\s?\d|cotizaci[oó]n|quote/i }).filter({ hasNotText: never_ }); // the front-door chat suggests service chips ("Revisión eléctrica 550 MXN"), not canned questions
        if (!(await chip.count())) r.reasons.push("no suggestion chips (questions) in the chat");
        else {
          const before = await composer.inputValue().catch(() => "");
          await safeClick(chip); // fills the composer; never sent
          await page.waitForTimeout(400);
          if ((await composer.inputValue().catch(() => "")) === before) r.reasons.push("tapping a chip did not fill the composer");
        }
        const list = page.locator("[role=dialog] button, [data-chat-variant] button").filter({ hasText: /☰/ });
        const listAria = page.locator("[role=dialog] button[aria-label], [data-chat-variant] button[aria-label]").filter({ hasText: /^$/ }).filter({ has: page.locator("svg") });
        const listLabelled = page.locator("[role=dialog] [aria-label*='servicios' i], [role=dialog] [aria-label*='services' i], [role=dialog] [aria-label*='menú' i], [role=dialog] [aria-label*='lista' i]");
        if (!(await list.count()) && !(await listLabelled.count()) && !(await listAria.count())) r.reasons.push("no list control (☰) in the chat");
        await checkEl("[role=dialog]:not([data-consent-banner]), [data-chat-variant]", "chat panel");
      }
    }
    r.product = await page.screenshot({ type: "jpeg", quality: 55 }).catch(() => null);
  } catch (e) {
    r.reasons.push(String(e.message || e).split("\n")[0]);
    r.product = await page.screenshot({ type: "jpeg", quality: 55 }).catch(() => null);
  }
  rows.push(finish(r));
  await page.close();
}


// ---------------------------------------------------------------- main
async function main() {
  const ts = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");
  const outDir = opts.out || join(WEB, "qa-evidence", "mockup-parity", opts.compact ? `loop-${opts.design}` : ts);
  mkdirSync(outDir, { recursive: true });
  const { talents, skippedDrafts } = await resolveTalents();
  if (!talents.length) { console.error("No talents to check."); process.exit(2); }
  for (const t of talents) t.demoKey = t.code === REF_CODE ? MAP.referenceDemo.demoKey || null : null; // gallery-meta demo key, for --source code
  if (opts.source === "code") {
    const missing = talents.filter((t) => !t.demoKey);
    if (missing.length) { console.error(`--source code needs a gallery demo key for ${missing.map((t) => t.code).join(", ")} in ${opts.design} (DEMO_KEYS in run.mjs).`); process.exit(2); }
  }
  const baseline = loadBaseline(opts.design);
  // The host-resolver rule only maps the platform apex to this machine (public-host fallback).
  const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP *.${opts.apex} 127.0.0.1`] });
  tool = await createImageTool(browser);
  const rows = [];
  const mockups = {};
  for (const w of opts.widths) mockups[w] = await captureMockup(browser, w);
  const noSession = [];
  for (const t of talents) {
    let sess = opts.public ? null : await pickSession(browser, t);
    if (!sess && t.status === "published" && t.slug && opts.source !== "code") {
      // No preview session: render the same published site through its public host, mapped to this machine.
      t.viaPublic = true;
      sess = { name: "public host", state: undefined };
    }
    if (!sess) {
      noSession.push(t);
      for (const w of opts.widths) {
        const r = row(t, w, "page", "Page render");
        r.status = "BLOCKED";
        r.reasons.push(opts.source === "code"
          ? "no signed-in platform admin can render this demo from code. Set QA_PLATFORM_ADMIN_PASSWORD, and run against a server that has the ?source=code route."
          : "no signed-in session can view this site (404). Set QA_PLATFORM_ADMIN_PASSWORD for demos, or the owner's QA_*_EMAIL/QA_*_PASSWORD, or pass --storage-state.");
        rows.push(r);
      }
      continue;
    }
    for (const w of opts.widths) {
      const ctx = await browser.newContext({ ...(sess.state ? { storageState: sess.state } : {}), viewport: { width: w, height: w >= 1000 ? 900 : 844 }, locale: opts.locale === "es" ? "es-MX" : "en-US", deviceScaleFactor: 1 });
      // Read-only: only GET/HEAD leave the browser.
      if (!opts.allowActions) await ctx.route("**/*", (route) => (["GET", "HEAD"].includes(route.request().method()) ? route.continue() : route.abort()));
      const mock = mockups[w];
      if (opts.states.includes("static")) await scanStatic(ctx, t, w, mock, rows);
      for (const s of ["chat", "dock", "booking"]) if (opts.states.includes(s)) await scanState(ctx, t, w, s, mock, rows);
      await ctx.close();
    }
    process.stdout.write(`  ${t.code} ${t.name}: done (${sess.name})\n`);
  }

  // ---- deltas, baseline, verdict
  const deltas = classify(rows, { design: opts.design });
  const stale = applyBaseline(deltas, baseline);
  for (const r of rows) r.known = r.status === "FAIL" && r.findings.length > 0 && r.findings.every((f) => f.delta?.accepted);
  if (opts.updateBaseline) {
    if (!opts.ticket) { console.error("--update-baseline needs --ticket <id> (every accepted delta needs a ticket)"); process.exit(2); }
    const res = writeBaseline(opts.design, deltas, baseline, opts.ticket, { scoped: opts.sections.length > 0 });
    console.log(`baseline updated: ${res.file} (+${res.added} added, -${res.removed} stale removed, ${res.total} total)`);
  }
  const open = opts.updateBaseline ? [] : deltas.filter((d) => !d.accepted);
  const captureBad = Object.values(mockups).some((m) => m.containerOk !== true);
  const summary = {
    timestamp: ts,
    design: opts.design,
    source: opts.source,
    baseUrl: opts.baseUrl,
    design: opts.design,
    referenceDemo: MAP.referenceDemo,
    mockupUrl: opts.mockupUrl,
    locale: opts.locale,
    widths: opts.widths,
    states: opts.states,
    sections: ACTIVE.map((x) => x.key),
    talents: talents.length,
    pass: rows.filter((r) => r.status === "PASS").length,
    fail: rows.filter((r) => r.status === "FAIL" && !r.known).length,
    known: rows.filter((r) => r.known).length,
    blocked: rows.filter((r) => r.status === "BLOCKED").length,
    deltas: deltas.length,
    openDeltas: open.length,
    deltasByLayer: Object.fromEntries(["token", "payload", "kit", "platform", "new-capability"].map((l) => [l, deltas.filter((d) => d.layer === l && !d.accepted).length])),
    baseline: { file: baseline.file, missing: baseline.missing, accepted: baseline.accepted.length, stale: stale.map((a) => `${a.section} / ${a.check} (${a.ticket})`) },
    pixel: rows.filter((r) => r.pixel).map((r) => ({ width: r.width, section: r.section, ratio: +r.pixel.ratio.toFixed(4), threshold: r.pixel.threshold, ok: r.pixel.ok, heightDelta: r.pixel.heightDelta })),
    skippedDrafts: skippedDrafts.map((t) => `${t.code} ${t.name}`),
    noSession: noSession.map((t) => `${t.code} ${t.name}`),
    mockupContainer: Object.fromEntries(Object.entries(mockups).map(([w, m]) => [w, { containerWidth: m.containerWidth ?? null, ok: m.containerOk === true }])),
    mockupSelfCheck: Object.fromEntries(Object.entries(mockups).map(([w, m]) => [w, m.ok ? m.selfCheck : [`mockup unavailable: ${m.error}`]])),
    talentsChecked: talents.map((t) => ({ code: t.code, name: t.name, demo: t.demo, status: t.status })),
    failures: rows.filter((r) => r.status !== "PASS").map((r) => ({ talent: r.code, width: r.width, section: r.section, status: r.known ? "KNOWN" : r.status, reasons: r.reasons })),
  };
  summary.verdict = summary.fail || summary.blocked ? "RED" : "GREEN";

  // previous pass (fix loop): what got fixed, what is new
  const deltasFile = join(outDir, "deltas.json");
  let prevIds = null;
  if (opts.compact && existsSync(deltasFile)) { try { prevIds = new Set(JSON.parse(readFileSync(deltasFile, "utf8")).deltas.map((d) => d.id)); } catch { prevIds = null; } }
  const strip = (d) => { const { pixel, ...rest } = d; return { ...rest, ...(pixel ? { pixelRatio: +pixel.ratio.toFixed(4), pixelThreshold: pixel.threshold } : {}) }; };
  writeFileSync(deltasFile, JSON.stringify({ meta: { timestamp: ts, design: opts.design, source: opts.source, widths: opts.widths, sections: summary.sections }, deltas: deltas.map(strip), staleBaseline: stale }, null, 2));
  writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  // raw in-page analyses: input of the delta classifier (gap.mjs)
  writeFileSync(join(outDir, "analysis.json"), JSON.stringify({ design: opts.design, referenceDemo: MAP.referenceDemo, widths: opts.widths, mockup: Object.fromEntries(Object.entries(mockups).map(([w, m]) => [w, m.analysis ? { sections: m.analysis.sections, page: m.analysis.page } : null])), product: analyses }));

  // images for the report / the loop
  mkdirSync(join(outDir, "img"), { recursive: true });
  for (const r of rows) {
    const base = `${r.code}-${r.width}-${r.section.replace(/[^a-z0-9]+/gi, "_")}`;
    if (opts.compact && r.keep) {
      writeFileSync(join(outDir, "img", `${base}.product.png`), r.keep.product);
      writeFileSync(join(outDir, "img", `${base}.mockup.png`), r.keep.mockup);
      writeFileSync(join(outDir, "img", `${base}.diff.png`), r.keep.diff);
    } else {
      if (r.product) writeFileSync(join(outDir, "img", `${base}.product.jpg`), r.product);
      if (r.mockup) writeFileSync(join(outDir, "img", `${base}.mockup.jpg`), r.mockup);
      if (r.diff) writeFileSync(join(outDir, "img", `${base}.diff.jpg`), r.diff);
    }
    delete r.keep;
  }
  let reportBytes = 0;
  if (!opts.noReport && !opts.compact) {
    const budget = await fitImages(rows, tool);
    reportBytes = writeReport(join(outDir, "report.html"), { meta: summary, rows, summary, deltas, staleBaseline: stale, budget });
  }
  await tool.close();
  await browser.close();

  if (opts.compact) {
    const head = `parity-loop ${opts.design} ${talents.map((t) => t.code).join(",")} widths ${opts.widths.join(",")} sections ${summary.sections.join(",")} source ${opts.source}`;
    console.log(`\n${head}`);
    for (const p of summary.pixel) console.log(`  pixel ${p.section}@${p.width}: ${(p.ratio * 100).toFixed(1)}% (max ${(p.threshold * 100).toFixed(1)}%) ${p.ok ? "ok" : "OVER"}, height ${p.heightDelta >= 0 ? "+" : ""}${p.heightDelta}px`);
    console.log(compactTable(open));
    if (prevIds) {
      const nowIds = new Set(deltas.map((d) => d.id));
      const fixed = [...prevIds].filter((i) => !nowIds.has(i)).length;
      const added = [...nowIds].filter((i) => !prevIds.has(i)).length;
      console.log(`since last pass: ${fixed} fixed, ${added} new`);
    }
    console.log(`${summary.verdict}: ${open.length} open deltas (${Object.entries(summary.deltasByLayer).filter(([, n]) => n).map(([l, n]) => `${l} ${n}`).join(", ") || "none"}), ${deltas.length - open.length} known. images: ${join(outDir, "img")}`);
    console.log(`mockup container: ${Object.entries(summary.mockupContainer).map(([w, c]) => `${w}px -> ${c.containerWidth}px ${c.ok ? "ok" : "MISMATCH"}`).join(", ")}`);
    process.exit(summary.verdict === "GREEN" && !captureBad ? 0 : 1);
  }

  console.log(`\nmockup-parity  ${summary.talents} talents · ${opts.design} · source ${opts.source} · widths ${opts.widths.join(",")} · locale ${opts.locale} · states ${opts.states.join(",")}`);
  console.log(`PASS ${summary.pass}   FAIL ${summary.fail}   KNOWN ${summary.known}   BLOCKED ${summary.blocked}   -> ${summary.verdict}`);
  console.log(`deltas: ${summary.deltas} (${summary.openDeltas} outside the baseline)  by layer: ${Object.entries(summary.deltasByLayer).map(([l, n]) => `${l} ${n}`).join(", ")}`);
  const byReason = new Map();
  for (const f of summary.failures) if (f.status !== "KNOWN") for (const reason of f.reasons) { const k = reason.replace(/\d+/g, "N").slice(0, 90); byReason.set(k, (byReason.get(k) || 0) + 1); }
  [...byReason.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([k, n]) => console.log(`  ${String(n).padStart(3)} x ${k}`));
  if (baseline.missing) console.log(`baseline: none at ${baseline.file} (every delta counts)`);
  if (stale.length) console.log(`baseline entries that no longer fail (remove them): ${summary.baseline.stale.join("; ")}`);
  if (skippedDrafts.length) console.log(`skipped (draft, unpublished): ${summary.skippedDrafts.join(", ")} (use --include-drafts)`);
  console.log(`mockup container: ${Object.entries(summary.mockupContainer).map(([w, c]) => `${w}px device -> ${c.containerWidth}px ${c.ok ? "ok" : "MISMATCH"}`).join(", ")}`);
  const mc = Object.values(summary.mockupSelfCheck).flat();
  if (mc.length) console.log(`mockup self-check notes: ${mc.length} (see summary.json; rules that fail on the mockup need tuning)`);
  console.log(`deltas: ${deltasFile}`);
  if (reportBytes) console.log(`report: ${join(outDir, "report.html")} (${(reportBytes / 1048576).toFixed(1)} MB, self-contained)`);
  process.exit(summary.verdict === "GREEN" && !captureBad ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
