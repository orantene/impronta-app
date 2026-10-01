// Shared helpers for the dashboard sweep: recorder, per-page checks, generic click sweep, report.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SEV = { critical: 0, high: 1, medium: 2, low: 3 };

// ---------------------------------------------------------------- build stability guard
// The local prod server is shared: a `next build` into the same .next dir mid-run yields 404/500 chunks and unstyled pages.
export function serverDir(port = 3001) {
  try {
    const pid = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\n").filter(Boolean)[0];
    const out = execFileSync("lsof", ["-a", "-p", pid, "-d", "cwd", "-Fn"], { encoding: "utf8" });
    return out.split("\n").find((x) => x.startsWith("n"))?.slice(1) || null;
  } catch { return null; }
}
export function buildState(dir) {
  if (!dir) return { id: "unknown", building: false };
  let id = "unknown", mtime = 0;
  try { const p = join(dir, ".next", "BUILD_ID"); id = execFileSync("cat", [p], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); mtime = execFileSync("stat", ["-f", "%m", p], { encoding: "utf8" }).trim(); } catch { /* none */ }
  let building = false;
  try {
    const pids = execFileSync("pgrep", ["-f", "next build"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\n").filter(Boolean);
    for (const pid of pids) {
      try { const c = execFileSync("lsof", ["-a", "-p", pid, "-d", "cwd", "-Fn"], { encoding: "utf8" }).split("\n").find((x) => x.startsWith("n"))?.slice(1); if (c === dir) building = true; } catch { /* gone */ }
    }
  } catch { /* none */ }
  return { id: id + "@" + mtime, building };
}

export class Recorder {
  constructor(outDir, repoWeb) {
    this.outDir = outDir;
    this.web = repoWeb;
    this.findings = [];
    this.timings = [];
    this.steps = [];
    this.seen = new Set();
    this.n = 0;
    this.grepCache = new Map();
    this.invalidated = [];
  }
  shotPath(ctx, label) {
    const dir = join(this.outDir, `${ctx.user}-${ctx.width}`);
    mkdirSync(dir, { recursive: true });
    const slug = label.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
    this.n += 1;
    return join(`${ctx.user}-${ctx.width}`, `${String(this.n).padStart(3, "0")}-${slug}.png`);
  }
  async shot(ctx, page, label) {
    const rel = this.shotPath(ctx, label);
    try { await page.screenshot({ path: join(this.outDir, rel), fullPage: false, timeout: 8000 }); } catch { return null; }
    return rel;
  }
  add(ctx, f) {
    const shellClass = /^(Control clipped|English text|404:|5xx:|console:)/.test(f.what || "");
    const key = [ctx.user, ctx.width, shellClass ? "*" : f.page, f.element, (f.what || "").slice(0, 160)].join("|");
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.findings.push({
      page: f.page, element: f.element || "", user: ctx.user, width: ctx.width,
      severity: f.severity || "medium", what: f.what, expected: f.expected || "",
      screenshot: f.screenshot || "", likelyFile: f.likelyFile || this.fileFor(f.page, f.grep),
    });
  }
  fileFor(pageLabel, grepText) {
    if (grepText) { const g = this.grep(grepText); if (g) return g; }
    return PAGE_FILES[pageLabel] || "";
  }
  grep(text) {
    const t = String(text).trim().slice(0, 48);
    if (t.length < 3) return "";
    if (this.grepCache.has(t)) return this.grepCache.get(t);
    let out = "";
    try {
      const r = execFileSync("git", ["grep", "-l", "-F", "-e", t, "--", "src"], { cwd: this.web, encoding: "utf8", timeout: 15000, stdio: ["ignore", "pipe", "ignore"] });
      out = r.split("\n").filter((x) => x && !/\.test\./.test(x)).slice(0, 3).map((x) => `web/${x}`).join(", ");
    } catch { /* no match */ }
    this.grepCache.set(t, out);
    return out;
  }
  snapshot() { return { f: this.findings.length, t: this.timings.length, s: this.steps.length }; }
  rollback(sn) {
    this.findings.length = sn.f; this.timings.length = sn.t; this.steps.length = sn.s;
    this.seen = new Set(this.findings.map((f) => { const sc = /^(Control clipped|English text|404:|5xx:|console:)/.test(f.what || ""); return [f.user, f.width, sc ? "*" : f.page, f.element, (f.what || "").slice(0, 160)].join("|"); }));
  }
  time(ctx, page, ms, kind) { this.timings.push({ user: ctx.user, width: ctx.width, page, ms, kind }); }
  write(meta) {
    const fs = [...this.findings].sort((a, b) => SEV[a.severity] - SEV[b.severity]);
    writeFileSync(join(this.outDir, "findings.json"), JSON.stringify(fs, null, 2));
    writeFileSync(join(this.outDir, "run-data.json"), JSON.stringify({ timings: this.timings, steps: this.steps, invalidated: this.invalidated }, null, 1));
    writeFileSync(join(this.outDir, "report.html"), renderReport(fs, this.timings, this.steps, { ...meta, invalidated: this.invalidated }));
  }
}

const PAGE_FILES = {
  Hoy: "web/src/app/(workspace)/talent/today/page.tsx",
  Mensajes: "web/src/app/(workspace)/talent/inbox/page.tsx",
  Calendario: "web/src/app/(workspace)/talent/calendar/page.tsx",
  Clientes: "web/src/app/(workspace)/talent/clients/page.tsx",
  Dinero: "web/src/app/(workspace)/talent/money/page.tsx, web/src/components/talent/money",
  Perfil: "web/src/app/(workspace)/talent/profile/page.tsx",
  "Mi presencia": "web/src/app/(workspace)/talent/site/page.tsx, web/src/components/talent/site, web/src/components/talent/studio",
  Servicios: "web/src/app/(workspace)/talent/services/page.tsx, web/src/components/talent/services",
  "Reseñas": "web/src/app/(workspace)/talent/reviews/page.tsx",
  Ajustes: "web/src/app/(workspace)/talent/settings/page.tsx",
  "Ajustes del sitio": "web/src/components/talent/website-settings",
  "Page builder": "web/src/app/(workspace)/talent/page-builder/page.tsx",
};

// ---------------------------------------------------------------- english leak detection
const EN_STOP = new Set("the and your you to for with of is are a an in on or this that it be as at by from will can not have has was we our their more all any if when how what which new about into out up".split(" "));
const ES_STOP = new Set("el la los las de del y que en un una para por con tu tus su sus es son se al lo como más pero sin sobre este esta estos estas ya aún aun hay muy te mi mis nos cuando donde también puede puedes".split(" "));
const EN_UI = new Set(["save", "cancel", "delete", "edit", "close", "back", "next", "loading", "search", "add", "remove", "publish", "preview", "upload", "continue", "done", "undo", "redo", "open", "share", "copy", "create", "manage", "settings", "messages", "calendar", "clients", "money", "reviews", "support", "today", "yes", "apply", "learn more", "view", "show", "hide", "more", "status", "name", "phone", "password", "language", "title", "description", "price", "duration", "free", "paid", "pending", "active", "draft", "published", "live", "error", "retry", "send", "reply", "sign out", "log out", "see all", "view all", "get started", "skip to main content", "preview site", "view site", "edit site", "upgrade", "details", "overview", "notifications", "profile", "services", "my website", "customize", "design", "colors", "fonts", "theme", "themes", "address", "location", "payments", "bookings", "cancellations", "policies", "privacy", "pages", "logo", "languages", "off", "on", "enabled", "disabled", "optional", "required", "select", "choose", "confirm", "dismiss", "got it", "help", "contact", "home", "about", "faq", "gallery", "pricing", "first run", "selling patterns", "from the camera", "loading orders", "prep before", "french", "portuguese", "german", "free", "pro", "move up", "move down", "rename", "add page", "save address", "upload logo", "recommended", "hero", "testimonials", "contact", "tablet", "desktop", "mobile", "exit", "payment", "new category", "categories", "quote", "offer", "order", "orders", "invoice", "refund", "deposit"]);

export function englishLeaks(strings) {
  const out = [];
  for (const raw of strings) {
    const s = raw.replace(/\s+/g, " ").trim();
    if (s.length < 3 || s.length > 220) continue;
    const words = s.toLowerCase().replace(/[^\p{L}\s']/gu, " ").split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    let leak = false;
    if (/^(loading|saving|something went wrong|failed to|unable to|no results|requesting:)/i.test(s)) leak = true;
    else if (words.length <= 3) leak = (EN_UI.has(words.join(" ")) || (words.some((w) => ["the", "from", "your", "you", "with", "for", "and"].includes(w)) && !words.some((w) => ES_STOP.has(w)))) && !/[áéíóúñ¿¡]/i.test(s);
    else {
      const en = words.filter((w) => EN_STOP.has(w)).length, es = words.filter((w) => ES_STOP.has(w)).length;
      leak = en >= 2 && es === 0;
    }
    if (leak) out.push(s);
  }
  return [...new Set(out)];
}

// ---------------------------------------------------------------- in-page collectors (serialised into the browser)
export const COLLECT_TEXT = () => {
  const onscreen = (r) => r.right > 0 && r.left < window.innerWidth;
  const out = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    const p = n.parentElement;
    if (!p || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|CODE|PRE)$/.test(p.tagName)) continue;
    if (p.closest("[lang=en],[data-sweep-ignore],iframe,svg,[aria-hidden=true],[inert]")) continue;
    const r = p.getBoundingClientRect();
    const st = getComputedStyle(p);
    if (!r.width || !r.height || !onscreen(r) || st.visibility === "hidden" || st.display === "none") continue;
    const t = n.textContent.trim();
    if (t) out.push(t);
  }
  for (const el of document.querySelectorAll("[aria-label],[placeholder],[title]")) {
    const er = el.getBoundingClientRect();
    if (!er.width || !onscreen(er) || el.closest("[lang=en],[data-sweep-ignore],[aria-hidden=true],[inert]")) continue;
    for (const a of ["aria-label", "placeholder", "title"]) { const v = el.getAttribute(a); if (v) out.push(v); }
  }
  return out;
};

export const COLLECT_LAYOUT = () => {
  const vw = window.innerWidth;
  const res = { overflowX: document.documentElement.scrollWidth - vw, offenders: [] };
  const scrollable = (el) => { for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) { const o = getComputedStyle(e).overflowX; if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip") return true; } return false; };
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.right <= vw + 2 || r.left >= vw - 10) continue;
    const st = getComputedStyle(el);
    if (st.position === "fixed" && r.left >= vw) continue;
    if (scrollable(el)) continue;
    res.offenders.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : ""} "${(el.innerText || "").trim().slice(0, 30)}" right=${Math.round(r.right)}`);
    if (res.offenders.length >= 4) break;
  }
  res.clipped = [];
  for (const el of document.querySelectorAll("button,a[href],[role=button],[role=tab]")) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.right <= 0 || r.left >= vw || el.closest("[aria-hidden=true],[inert]")) continue;
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.overflowX === "hidden" || cs.overflowX === "clip") {
        const pr = e.getBoundingClientRect();
        if (pr.width && r.right > pr.right + 3 && r.left < pr.right - 3) { res.clipped.push(`"${(el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 30)}" cut by ${e.tagName.toLowerCase()} (${Math.round(r.right - pr.right)}px)`); break; }
      }
    }
    if (res.clipped.length >= 4) break;
  }
  return res;
};

export const COLLECT_LINKS = () =>
  [...document.querySelectorAll("a")].filter((a) => { const r = a.getBoundingClientRect(); return r.width && r.right > 0 && r.left < window.innerWidth && !a.closest("[aria-hidden=true],[inert]"); }).map((a) => ({
    href: a.getAttribute("href"), abs: a.href, text: (a.innerText || a.getAttribute("aria-label") || "").trim().slice(0, 50), target: a.target, rel: a.rel,
  }));

export const SIG = () => {
  const sel = '[role=dialog],[role=alertdialog],[role=menu],[role=listbox],[aria-modal=true],dialog[open],[data-state=open],[role=tooltip]';
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  return {
    url: location.pathname + location.search,
    text: document.body.innerText.length,
    layers: [...document.querySelectorAll(sel)].filter(vis).length,
    expanded: document.querySelectorAll("[aria-expanded=true]").length,
    selected: document.querySelectorAll("[aria-selected=true],[aria-pressed=true],[aria-checked=true]").length,
    nodes: document.getElementsByTagName("*").length,
  };
};

export const TAG_CANDIDATES = ([scopeSel, max, inDialog]) => {
  let scope;
  if (scopeSel === "@layer") {
    const big = (e) => { const r = e.getBoundingClientRect(); return r.width > 200 && r.height > 200 && r.right > 0 && r.left < window.innerWidth; };
    const dl = [...document.querySelectorAll("[role=dialog],[aria-modal=true],dialog[open]")].filter(big);
    scope = dl[dl.length - 1];
    if (!scope) { const fx = [...document.querySelectorAll("body *")].filter((e) => { const st = getComputedStyle(e); return st.position === "fixed" && (+st.zIndex || 0) >= 10 && big(e); }); scope = fx[fx.length - 1]; }
    if (!scope) { const fx2 = [...document.querySelectorAll("body *")].filter((e) => { const st = getComputedStyle(e); const r = e.getBoundingClientRect(); return st.position === "fixed" && r.width >= innerWidth * 0.55 && r.height >= innerHeight * 0.5 && !/cookie|consent/i.test(e.className + " " + e.id); }); scope = fx2[fx2.length - 1]; }
    if (!scope) return [];
    inDialog = true;
  } else scope = document.querySelector(scopeSel) || document.body;
  const sel = 'button,[role=button],[role=tab],[role=menuitem],summary,[role=switch],[role=checkbox],[aria-haspopup]';
  const seen = new Set(), out = [];
  let i = 0;
  for (const el of scope.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.right <= 0 || r.left >= window.innerWidth || el.disabled || el.getAttribute("aria-disabled") === "true" || el.closest("[aria-hidden=true],[inert]")) continue;
    if (!inDialog && el.closest("[role=dialog],[role=menu],[aria-modal=true]")) continue;
    const name = (el.getAttribute("aria-label") || el.innerText || el.title || "").trim().replace(/\s+/g, " ").slice(0, 60);
    const key = el.tagName + "|" + name + "|" + (el.getAttribute("role") || "");
    if (seen.has(key)) continue;
    seen.add(key);
    el.setAttribute("data-sweep-id", String(i));
    out.push({ id: i, name: name || "(sin nombre)", tag: el.tagName.toLowerCase(), role: el.getAttribute("role") || "", type: el.getAttribute("type") || "", selected: el.getAttribute("aria-selected") === "true" || el.getAttribute("aria-current") != null });
    i += 1;
    if (out.length >= max) break;
  }
  return out;
};

// names we never click in the generic sweep (write / irreversible / money / identity)
export const DENY = /eliminar|borrar|delete|remove|quitar|publicar|publish|enviar|send|pagar|pay|cobrar|charge|sign out|log ?out|cerrar sesi|upgrade|mejorar|comprar|buy|suscri|checkout|guardar|save|aplicar|apply|importar|import|generar|generate|regenerar|duplicar|archivar|desconectar|disconnect|conectar|connect|invitar|invite|reembols|refund|confirmar|confirm|aceptar|accept|rechazar|decline|reject|cancelar cita|cancel booking|marcar|mark|restaurar|restore|revertir|revert|^es$|^en$|español|english|idioma|language|subir|bajar|mover|✦|\bai\b|\bia\b|usar este dise|colores propios|ver sitio|editar sitio|vista previa|crear|create|nueva cita|new booking|cotizaci|quote|activar|desactivar|enable|disable|renovar|descargar|download|exportar|export|subir|upload|verificar|verify/i;

const NOCHANGE_OK = /^(hoy|today|anterior|siguiente|previous|next)$/i;
// ---------------------------------------------------------------- generic click sweep
export async function clickSweep(page, ctx, rec, label, { scope = "#tulala-talent-content", max = 24, base, inDialog = false, skip = null } = {}) {
  const cands = await page.evaluate(TAG_CANDIDATES, [scope, max * 3, inDialog]).catch(() => []);
  const origin = page.url();
  let clicked = 0;
  const report = [];
  for (const c of cands) {
    if (clicked >= max) break;
    if (c.type === "submit" || DENY.test(c.name) || (skip && skip.test(c.name))) { report.push({ name: c.name, result: "skipped (write/irreversible)" }); continue; }
    const loc = page.locator(`[data-sweep-id="${c.id}"]`).first();
    if (!(await loc.count().catch(() => 0))) continue;
    const before = await page.evaluate(SIG).catch(() => null);
    const mark = base?.() ?? 0;
    clicked += 1;
    try { await loc.scrollIntoViewIfNeeded({ timeout: 3000 }); await loc.click({ timeout: 6000 }).catch(async () => { await page.waitForTimeout(1200); await loc.click({ timeout: 8000 }); }); }
    catch (e) {
      const sh = await rec.shot(ctx, page, `${label} click-fail ${c.name}`);
      rec.add(ctx, { page: label, element: `${c.tag} "${c.name}"`, severity: "low", what: `Click failed (control covered, off-screen or slow; verify): ${String(e.message).split("\n")[0].slice(0, 140)}`, expected: "Control is clickable (not covered or detached)", screenshot: sh, grep: c.name });
      report.push({ name: c.name, result: "click failed" });
      await page.keyboard.press("Escape").catch(() => {});
      continue;
    }
    const diff = (a, b) => a && b && (a.url !== b.url || Math.abs(a.text - b.text) > 0 || a.layers !== b.layers || a.expanded !== b.expanded || a.selected !== b.selected || a.nodes !== b.nodes);
    let after = null;
    for (let w = 0; w < 14; w++) { // up to ~4.5 s for slow machines
      await page.waitForTimeout(w === 0 ? 600 : 300);
      after = await page.evaluate(SIG).catch(() => null);
      if (diff(before, after)) { await page.waitForTimeout(300); after = await page.evaluate(SIG).catch(() => after); break; }
    }
    const changed = before && after && (before.url !== after.url || Math.abs(before.text - after.text) > 0 || before.layers !== after.layers || before.expanded !== after.expanded || before.selected !== after.selected || before.nodes !== after.nodes);
    const sh = await rec.shot(ctx, page, `${label} click ${c.name}`);
    if (!changed && !c.selected && !NOCHANGE_OK.test(c.name)) {
      rec.add(ctx, { page: label, element: `${c.tag} "${c.name}"`, severity: "medium", what: "Click produced no visible response (no dialog, menu, navigation or content change)", expected: "A drawer, sheet, menu, tab or navigation opens", screenshot: sh, grep: c.name });
      report.push({ name: c.name, result: "no response" });
    } else report.push({ name: c.name, result: "opens" });
    // close cleanly
    if (after && after.url !== (before?.url ?? after.url)) {
      await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
      await page.waitForTimeout(600);
      if (new URL(page.url()).pathname !== new URL(origin).pathname) { await page.goto(origin, { waitUntil: "domcontentloaded" }).catch(() => {}); await page.waitForTimeout(800); }
      await page.evaluate(TAG_CANDIDATES, [scope, max * 3, inDialog]).catch(() => {});
      continue;
    }
    closeLayers.lastVia = "";
    const closed = await closeLayers(page, before?.layers ?? 0);
    if (closed && /unnamed icon/.test(closeLayers.lastVia || "")) rec.add(ctx, { page: label, element: `${c.tag} "${c.name}"`, severity: "medium", what: "Layer only closes via an icon-only X button with no accessible name (Escape does not close it)", expected: "Escape closes it and the close button has an aria-label", screenshot: sh, grep: c.name });
    if (!closed) {
      const sh2 = await rec.shot(ctx, page, `${label} stuck-open ${c.name}`);
      rec.add(ctx, { page: label, element: `${c.tag} "${c.name}"`, severity: "high", what: "Opened layer does not close with Escape or a Close/Cancel button (page stays blocked)", expected: "Escape or Close dismisses the drawer/sheet/menu", screenshot: sh2, grep: c.name });
      await page.goto(origin, { waitUntil: "domcontentloaded" }).catch(() => {});
      await page.waitForTimeout(800);
      await page.evaluate(TAG_CANDIDATES, [scope, max * 3, inDialog]).catch(() => {});
    }
  }
  if (new URL(page.url()).pathname !== new URL(origin).pathname) { await page.goto(origin, { waitUntil: "domcontentloaded" }).catch(() => {}); await page.waitForTimeout(1200); }
  return report;
}

export async function closeLayers(page, baselineLayers) {
  const count = async () => (await page.evaluate(SIG).catch(() => ({ layers: 0 }))).layers;
  for (let i = 0; i < 2; i++) {
    if ((await count()) <= baselineLayers) return true;
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(350);
  }
  if ((await count()) <= baselineLayers) return true;
  const btn = page.locator('[role=dialog],[aria-modal=true]').last().getByRole("button", { name: /cerrar|close|cancelar|cancel|volver|×|✕|descartar|ahora no|seguir editando|no, /i }).first();
  if (await btn.count().catch(() => 0)) { await btn.click({ timeout: 2500 }).catch(() => {}); await page.waitForTimeout(450); }
  if ((await count()) <= baselineLayers) return true;
  // icon-only close button: top-right-most button of the top layer
  const iconBtn = await page.evaluateHandle(() => {
    const layers = [...document.querySelectorAll("[role=dialog],[aria-modal=true]")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 150 && r.height > 100 && r.right > 0 && r.left < innerWidth; });
    const layer = layers[layers.length - 1]; if (!layer) return null;
    const lr = layer.getBoundingClientRect();
    const bs = [...layer.querySelectorAll("button,[role=button]")].filter((b) => { const r = b.getBoundingClientRect(); return r.width && r.top < lr.top + Math.max(90, lr.height * 0.2) && r.right > lr.right - 90; });
    bs.sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right);
    return bs[0] || null;
  }).catch(() => null);
  const el = iconBtn && iconBtn.asElement();
  if (el) { const nm = await el.evaluate((b) => (b.getAttribute("aria-label") || b.innerText || "").trim()); await el.click({ timeout: 2500 }).catch(() => {}); await page.waitForTimeout(450); closeLayers.lastVia = nm ? `close button "${nm}"` : "unnamed icon close button"; if ((await count()) <= baselineLayers) return true; }
  // click outside (backdrop)
  await page.mouse.click(4, 4).catch(() => {});
  await page.waitForTimeout(350);
  return (await count()) <= baselineLayers;
}

// ---------------------------------------------------------------- report
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function renderReport(fs, timings, steps, meta) {
  const counts = fs.reduce((a, f) => ((a[f.severity] = (a[f.severity] || 0) + 1), a), {});
  const rows = fs.map((f, i) => `<tr class="${f.severity}"><td>${i + 1}</td><td><b>${esc(f.severity)}</b></td><td>${esc(f.page)}</td><td>${esc(f.element)}</td><td>${esc(f.user)} @${f.width}</td><td>${esc(f.what)}<div class="x">Expected: ${esc(f.expected)}</div></td><td>${f.screenshot ? `<a href="${esc(f.screenshot)}"><img loading="lazy" src="${esc(f.screenshot)}" width="120"></a>` : ""}</td><td class="x">${esc(f.likelyFile)}</td></tr>`).join("\n");
  const slow = [...timings].sort((a, b) => b.ms - a.ms).slice(0, 40).map((t) => `<tr><td>${esc(t.page)}</td><td>${esc(t.kind)}</td><td>${esc(t.user)} @${t.width}</td><td>${t.ms} ms</td></tr>`).join("");
  const st = steps.map((s) => `<tr><td>${esc(s.user)} @${s.width}</td><td>${esc(s.stage)}</td><td>${esc(s.name)}</td><td>${esc(s.result)}</td></tr>`).join("");
  return `<!doctype html><meta charset=utf-8><title>Dashboard sweep ${esc(meta.stamp)}</title><style>body{font:14px system-ui;margin:24px;color:#222}table{border-collapse:collapse;width:100%;margin:12px 0}td,th{border:1px solid #ddd;padding:6px;vertical-align:top;text-align:left}.critical td,.high td{background:#fff1f0}.medium td{background:#fffbe6}.x{color:#666;font-size:12px}h2{margin-top:32px}</style>
<h1>Dashboard sweep ${esc(meta.stamp)}</h1><p>${esc(meta.summary)}</p>${meta.invalidated?.length ? `<p><b>Server rebuilt during the run:</b> ${meta.invalidated.map(esc).join("; ")}</p>` : ""}<p>Findings: ${fs.length} (${Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(", ")})</p>
<table><tr><th>#</th><th>Sev</th><th>Page</th><th>Element</th><th>User</th><th>What happened</th><th>Shot</th><th>Likely file</th></tr>${rows}</table>
<h2>Slowest pages / steps</h2><table><tr><th>Page</th><th>Kind</th><th>User</th><th>Time</th></tr>${slow}</table>
<h2>Step log</h2><table><tr><th>User</th><th>Stage</th><th>Step</th><th>Result</th></tr>${st}</table>`;
}
