// Stage flows. Each receives { page, ctx, sess, step, rec, base }.
import { SIG, clickSweep, closeLayers } from "./lib.mjs";

export const STAGES = {};
const btn = (page, re) => page.getByRole("button", { name: re }).first();
const sleep = (page, ms) => page.waitForTimeout(ms);
const LOADING = /Cargando|Loading/;

async function contentText(page) {
  return page.evaluate(() => (document.querySelector("#tulala-talent-content") || document.body).innerText).catch(() => "");
}
async function waitNoLoading(page, timeout = 25000) {
  const t0 = Date.now();
  await page.waitForFunction(() => { const t = (document.querySelector("#tulala-talent-content") || document.body).innerText; return t.trim().length > 20 && !/Cargando|Loading/.test(t); }, null, { timeout }).catch(() => {});
  return Date.now() - t0;
}
async function ensureNav(page) {
  const hoy = page.getByRole("button", { name: /^Hoy$/ }).first();
  const mas = page.getByRole("button", { name: /^Más$/ }).first();
  for (let i = 0; i < 20; i++) {
    if ((await hoy.isVisible().catch(() => false)) || (await mas.isVisible().catch(() => false))) return true;
    await sleep(page, 500);
  }
  return false;
}
async function ensureHome(page, base, sess) { if (!(await ensureNav(page))) { await go(page, base, "/talent/today"); await sess.waitContent("Hoy"); } }
/** click a destination: sidebar on desktop, bottom tab bar or the "Más" sheet on phones */
async function clickDest(page, re, mre) {
  for (let i = 0; i < 16; i++) { if ((await page.getByRole("button", { name: re }).or(page.getByRole("link", { name: re })).first().isVisible().catch(() => false)) || (await page.getByRole("button", { name: /^Más$/ }).first().isVisible().catch(() => false))) break; await sleep(page, 500); }
  const d1 = page.getByRole("button", { name: re }).or(page.getByRole("link", { name: re })).first();
  if (await d1.isVisible().catch(() => false)) { await d1.click(); return; }
  const mas = page.getByRole("button", { name: /^Más$/ }).first();
  if (await mas.isVisible().catch(() => false)) {
    await mas.click(); await sleep(page, 900);
    const r2 = mre || re;
    const d2 = page.getByRole("button", { name: r2 }).or(page.getByRole("link", { name: r2 })).last();
    if (!(await d2.isVisible().catch(() => false))) {
      const items = (await visibleNames(page)).slice(0, 40).join(" | ");
      const close = page.getByRole("button", { name: /^Cerrar$/ }).first();
      if (await close.isVisible().catch(() => false)) await close.click().catch(() => {});
      const e = new Error(`Destination ${re} has no entry in the phone navigation. Más sheet shows: ${items}`);
      e.code = "UNREACH";
      throw e;
    }
    await d2.click({ timeout: 8000 });
    return;
  }
  throw new Error(`Destination ${re} not reachable (not visible in the sidebar, tab bar or Más sheet)`);
}
async function visibleNames(page) {
  return page.evaluate(() => [...document.querySelectorAll("button,a,[role=menuitem],[role=button],[role=option]")].filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.height && r.right > 0 && r.left < innerWidth; }).map((e) => (e.getAttribute("aria-label") || e.innerText || "").trim().replace(/\s+/g, " ")).filter(Boolean));
}
async function closeByTitle(page, titleRe, closeRe) {
  for (let i = 0; i < 3; i++) {
    if (!(await page.getByText(titleRe).first().isVisible().catch(() => false))) return true;
    const b = page.getByRole("button", { name: closeRe }).last();
    if (await b.count()) await b.click({ timeout: 4000 }).catch(() => {}); else await page.keyboard.press("Escape");
    await sleep(page, 600);
  }
  return !(await page.getByText(titleRe).first().isVisible().catch(() => false));
}
async function go(page, base, path) {
  await page.goto(base + path, { waitUntil: "domcontentloaded" });
}

// ============================================================ NAV: every sidebar destination
const NAV = [
  { label: "Hoy", re: /^Hoy$/ }, { label: "Mensajes", re: /^Mensajes$/, path: "/talent/inbox" }, { label: "Calendario", re: /^Calendario$/, path: "/talent/calendar" },
  { label: "Clientes", re: /^Clientes/, path: "/talent/clients" }, { label: "Dinero", re: /^Dinero$/, path: "/talent/money" }, { label: "Perfil", re: /^Perfil$/, mre: /^Editar mi perfil/, path: "/talent/profile" },
  { label: "Mi presencia", re: /^Mi presencia$/, mre: /^Mi página pública/, path: "/talent/site", subs: ["Mi sitio web", "Dónde aparezco", "Descubrir redes"] },
  { label: "Servicios", re: /^Servicios/, path: "/talent/services" }, { label: "Reseñas", re: /^Reseñas/, path: "/talent/reviews" },
];
const PRESENCE_SKIP = /Cambiar diseño|Opciones de diseño|Restaurar|Ajustes del sitio/;

async function navAll({ page, ctx, sess, step, rec, base }, only) {
  const want = (k) => !only || only === k;
  if (want("Hoy")) {
    // cold load of Hoy + top bar
    let t0 = Date.now();
    await go(page, base, "/talent/today");
    let r = await sess.waitContent("Hoy", t0);
    await sess.audit("Hoy", r);
    await step("nav", "Barra superior", "controles de la barra superior", async () => {
      const rep = await clickSweep(page, ctx, rec, "Barra superior", { scope: "header,[role=banner]", max: 10, base: sess.mark });
      rec.steps.push({ user: ctx.user, width: ctx.width, stage: "nav", name: "Barra superior: " + rep.map((x) => `${x.name}=${x.result}`).join("; "), result: "info" });
    }, { noShot: true });
    await step("nav", "Hoy", "clickSweep", async () => { await clickSweep(page, ctx, rec, "Hoy", { base: sess.mark }); }, { noShot: true });
  } else { await go(page, base, "/talent/today"); await sess.waitContent("Hoy"); }

  for (const n of NAV) {
    if (n.label === "Hoy" || !want(n.label)) continue;
    await step("nav", n.label, "abrir desde la barra lateral", async () => {
      if (!(await ensureNav(page))) {
        await go(page, base, "/talent/today"); await sess.waitContent("Hoy");
        if (!(await ensureNav(page))) throw new Error("Sidebar not reachable (no visible nav and no menu button)");
      }
      const before = new URL(page.url()).pathname;
      const t = Date.now();
      try { await clickDest(page, n.re, n.mre); }
      catch (e) {
        if (e.code !== "UNREACH") throw e;
        rec.add(ctx, { page: n.label, element: "navegación del teléfono", severity: "medium", what: e.message.slice(0, 300), expected: `${n.label} reachable from the phone tab bar or Más sheet`, screenshot: await rec.shot(ctx, page, `${n.label} unreachable on phone`) });
        await go(page, base, n.path);
      }
      await page.waitForURL((u) => u.pathname !== before, { timeout: 15000 }).catch(() => { throw new Error(`URL did not change after clicking ${n.label}`); });
      const res = await sess.waitContent(n.label, t);
      rec.time(ctx, n.label, res.ms, "soft-nav");
      await sess.audit(n.label, res);
    }, { sev: "high", expected: `${n.label} opens from the sidebar` });
    const path = new URL(page.url()).pathname;
    // cold (hard) load of the same URL
    await step("nav", n.label, "carga en frío", async () => {
      const t = Date.now();
      await go(page, base, path);
      const res = await sess.waitContent(n.label, t);
      rec.time(ctx, n.label, res.ms, "hard-load");
      if (res.ms > 6000 || !res.ok) rec.add(ctx, { page: n.label, element: "page", severity: res.ok ? "high" : "critical", what: `Cold load ${res.ok ? res.ms + " ms" : "never finished (25s)"}`, expected: "< 3 s", screenshot: null });
    }, { noShot: true });
    if (n.subs) {
      for (const s of n.subs) {
        await step("nav", `${n.label} / ${s}`, "abrir pestaña", async () => {
          const t = Date.now();
          await page.getByRole("tab", { name: new RegExp("^" + s + "$") }).or(page.getByRole("button", { name: new RegExp("^" + s + "$") })).first().click();
          await sleep(page, 500);
          const ms = await waitNoLoading(page, 30000);
          rec.time(ctx, `${n.label} / ${s}`, Date.now() - t, "tab");
          await sess.audit(`${n.label} / ${s}`, { ms: Date.now() - t, ok: true });
          await clickSweep(page, ctx, rec, `${n.label} / ${s}`, { base: sess.mark, skip: PRESENCE_SKIP, max: 14 });
        }, { sev: "high", noShot: true });
      }
    } else {
      await step("nav", n.label, "controles visibles", async () => {
        let rep = await clickSweep(page, ctx, rec, n.label, { base: sess.mark });
        if (!rep.length) { await sleep(page, 3500); rep = await clickSweep(page, ctx, rec, n.label, { base: sess.mark }); }
        rec.steps.push({ user: ctx.user, width: ctx.width, stage: "nav", name: `${n.label} controles: ` + rep.map((x) => `${x.name}=${x.result}`).join("; ").slice(0, 600), result: "info" });
      }, { noShot: true });
    }
  }

  // Plan, Vista previa del perfil, Soporte, Ajustes
  if (want("Plan")) await step("nav", "Plan", "abrir comparación de planes", async () => {
    await go(page, base, "/talent/today"); await sess.waitContent("Hoy");
    await ensureNav(page);
    const before = await page.evaluate(SIG);
    try { await clickDest(page, /^Plan/); }
    catch (e) { if (e.code !== "UNREACH") throw e; rec.add(ctx, { page: "Plan", element: "navegación del teléfono", severity: "medium", what: "Plan (comparison / upgrade) has no entry in the phone navigation. " + e.message.slice(0, 220), expected: "Plan reachable on phones", screenshot: await rec.shot(ctx, page, "Plan unreachable on phone") }); return; }
    await sleep(page, 1500);
    const after = await page.evaluate(SIG);
    if (before.url === after.url && before.layers === after.layers && Math.abs(before.text - after.text) < 5) throw new Error("Plan did nothing");
    await sess.audit("Plan", { ms: 0, ok: true });
    await clickSweep(page, ctx, rec, "Plan", { scope: "@layer", max: 10, base: sess.mark });
    if (!(await closeLayers(page, before.layers))) throw new Error("Plan layer does not close");
    if (after.url !== before.url) await go(page, base, before.url);
  }, { sev: "high", expected: "Plan comparison opens and closes" });

  if (want("Vista previa del perfil")) await step("nav", "Vista previa del perfil", "abrir vista previa", async () => {
    await ensureHome(page, base, sess);
    let href = await page.getByRole("link", { name: /Vista previa del perfil/ }).first().getAttribute("href", { timeout: 4000 }).catch(() => null);
    if (!href) { const mas = page.getByRole("button", { name: /^Más$/ }).first(); if (await mas.isVisible().catch(() => false)) { await mas.click(); await sleep(page, 900); href = await page.getByRole("link", { name: /Vista previa del perfil/ }).last().getAttribute("href", { timeout: 6000 }).catch(() => null); await page.keyboard.press("Escape"); } }
    if (!href && ctx.width < 768) { rec.steps.push({ user: ctx.user, width: ctx.width, stage: "nav", name: "Vista previa del perfil: no entry in phone navigation (Más sheet has Mi página pública / Sitio en vivo only)", result: "info" }); return; }
    if (!href) throw new Error("Vista previa del perfil link not found");
    const t = Date.now();
    const resp = await page.context().newPage().then(async (p2) => { const rs = await p2.goto(new URL(href, base).toString(), { waitUntil: "load", timeout: 40000 }); const ms = Date.now() - t; rec.time(ctx, "Vista previa del perfil", ms, "hard-load"); const bodyLen = (await p2.evaluate(() => document.body.innerText.length)); const sh = await rec.shot(ctx, p2, "Vista previa del perfil"); await p2.close(); return { status: rs?.status(), ms, bodyLen, sh }; });
    if (!resp.status || resp.status >= 400) rec.add(ctx, { page: "Vista previa del perfil", element: href, severity: "high", what: `Preview returns ${resp.status}`, expected: "200", screenshot: resp.sh });
    if (resp.bodyLen < 100) rec.add(ctx, { page: "Vista previa del perfil", element: href, severity: "high", what: "Preview page is empty", expected: "Public profile renders", screenshot: resp.sh });
    if (resp.ms > 6000) rec.add(ctx, { page: "Vista previa del perfil", element: href, severity: "medium", what: `Preview loads in ${resp.ms} ms`, expected: "< 3 s", screenshot: resp.sh });
  }, { noShot: true });

  if (want("Soporte")) await step("nav", "Soporte", "abrir soporte", async () => {
    await ensureHome(page, base, sess);
    const before = await page.evaluate(SIG);
    try { await clickDest(page, /soporte/i, /^Obtener ayuda/); }
    catch (e) { if (e.code !== "UNREACH") throw e; rec.add(ctx, { page: "Soporte", element: "navegación del teléfono", severity: "medium", what: e.message.slice(0, 300), expected: "Support reachable on phones", screenshot: null }); return; }
    await sleep(page, 1500);
    const after = await page.evaluate(SIG);
    if (before.url === after.url && before.layers === after.layers && Math.abs(before.text - after.text) < 5) throw new Error("Soporte did nothing");
    await sess.audit("Soporte", { ms: 0, ok: true });
    await clickSweep(page, ctx, rec, "Soporte", { scope: "@layer", max: 10, base: sess.mark });
    if (!(await closeLayers(page, before.layers))) throw new Error("Soporte layer does not close");
    if (after.url !== before.url) await go(page, base, before.url);
  }, { sev: "high", expected: "Support opens and closes" });

  if (want("Ajustes")) await step("nav", "Ajustes", "abrir Ajustes", async () => {
    await ensureHome(page, base, sess);
    const t = Date.now();
    await clickDest(page, /^Ajustes$/);
    await page.waitForURL(/\/talent\/settings/, { timeout: 40000 });
    const res = await sess.waitContent("Ajustes", t);
    await sess.audit("Ajustes", res);
    const rep = await clickSweep(page, ctx, rec, "Ajustes", { base: sess.mark, max: 30 });
    rec.steps.push({ user: ctx.user, width: ctx.width, stage: "nav", name: "Ajustes controles: " + rep.map((x) => `${x.name}=${x.result}`).join("; ").slice(0, 600), result: "info" });
  }, { sev: "high", noShot: true });
}
for (const k of [...NAV.map((n) => n.label), "Plan", "Vista previa del perfil", "Soporte", "Ajustes"]) STAGES["nav:" + k] = (a) => navAll(a, k);
STAGES.nav = (a) => navAll(a);

// ============================================================ SETTINGS: Ajustes del sitio
const GROUPS = ["Dirección, logo", "Idiomas", "Servicios y reservas", "Disponibilidad", "Pagos", "Autogestión", "Chat y consultas", "Apariencia", "Políticas"];

async function saveBar(page, ctx, rec, label) {
  const s = page.getByRole("button", { name: /^Guardar$/ }).last();
  await s.waitFor({ state: "visible", timeout: 5000 });
  if (await s.isDisabled()) throw new Error("Guardar stays disabled after an edit");
  const t = Date.now();
  await s.click();
  await sleep(page, 800);
  let saved = false;
  for (let i = 0; i < 20; i++) {
    const txt = await page.evaluate(() => document.body.innerText);
    if (/no se pudo|error|falló|failed|inténtalo/i.test(txt) && !/sin errores/i.test(txt)) { const sh = await rec.shot(ctx, page, `${label} save error`); rec.add(ctx, { page: label, element: "Guardar", severity: "high", what: `Save shows an error: "${(txt.match(/.{0,50}(no se pudo|error|falló|failed|inténtalo).{0,60}/i) || [""])[0].replace(/\s+/g, " ")}"`, expected: "Change saves", screenshot: sh }); return false; }
    if (await s.isDisabled().catch(() => true) || /Guardado/.test(txt)) { saved = true; break; }
    await sleep(page, 500);
  }
  rec.time(ctx, label, Date.now() - t, "save");
  if (!saved) { const sh = await rec.shot(ctx, page, `${label} save stuck`); rec.add(ctx, { page: label, element: "Guardar", severity: "high", what: "Save did not complete in 10 s (button stays active, no Guardado state)", expected: "Saved state shown", screenshot: sh }); }
  return saved;
}

async function editRevert(page, ctx, rec, g, label) {
  const root = page.locator("#tulala-talent-content");
  if (g.startsWith("Políticas")) return "Políticas: publish-only surface (Revisar y publicar publishes a new live version), so it was opened and audited but not edited";
  const more = root.getByRole("button", { name: /^Más: / }).first();
  if (await more.count()) {
    const name = (await more.getAttribute("aria-label")).replace(/^Más: /, "");
    await more.click(); await saveBar(page, ctx, rec, label);
    await root.getByRole("button", { name: new RegExp("^Menos: " + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first().click(); await saveBar(page, ctx, rec, label);
    return `stepper ${name} +1/-1`;
  }
  const cb = root.locator("input[type=checkbox]:not([disabled])").last();
  if (await cb.count()) {
    await cb.click({ force: true }); await sleep(page, 900);
    const keep = page.getByRole("button", { name: /^Seguir editando$/ }).first();
    if (await keep.isVisible().catch(() => false)) {
      await rec.shot(ctx, page, `${label} confirmar ocultar idioma`);
      await keep.click(); await sleep(page, 600);
      if (!(await cb.isChecked().catch(() => true))) { await cb.click({ force: true }); await sleep(page, 700); const k2 = page.getByRole("button", { name: /^Seguir editando$/ }).first(); if (await k2.isVisible().catch(() => false)) await k2.click(); }
      return "unchecking the extra language opens a confirm sheet (Ocultar / Seguir editando); chose Seguir editando, nothing saved";
    }
    await saveBar(page, ctx, rec, label); await cb.click({ force: true }); await saveBar(page, ctx, rec, label); return "checkbox toggle (enabled language)";
  }
  const tog = root.getByRole("button", { name: /^(Aceptar nuevas|Chat del sitio)/ }).first();
  if (await tog.count()) { await tog.click(); await saveBar(page, ctx, rec, label); await tog.click(); await saveBar(page, ctx, rec, label); return "toggle"; }
  const sv = root.getByRole("button", { name: /^Save address$/ });
  if (await sv.count()) { if (await sv.isDisabled()) return "Save address is disabled while the address is unchanged (expected)"; await sv.click(); await sleep(page, 2500); return "Save address (unchanged)"; }
  const field = root.locator("textarea:not([readonly]), input[type=text]:not([readonly])").first();
  if (await field.count()) {
    const v = await field.inputValue();
    await field.fill(v + " ."); if (!(await saveBar(page, ctx, rec, label))) return "text edit (save failed)";
    await field.fill(v); await saveBar(page, ctx, rec, label); return "text edit + revert";
  }
  return "no editable control found";
}

STAGES.settings = async ({ page, ctx, sess, step, rec, base }) => {
  await go(page, base, "/talent/site");
  const open = await step("settings", "Ajustes del sitio", "abrir", async () => {
    const t = Date.now();
    await btn(page, /^Ajustes del sitio/).click({ timeout: 40000 });
    await btn(page, /^Dirección, logo/).waitFor({ state: "visible", timeout: 30000 });
    rec.time(ctx, "Ajustes del sitio", Date.now() - t, "open");
    await sess.audit("Ajustes del sitio", { ms: Date.now() - t });
  }, { sev: "high" });
  if (!open) return;
  for (const g of GROUPS) {
    const label = `Ajustes del sitio / ${g}`;
    const ok = await step("settings", label, "abrir grupo", async () => {
      if (!(await btn(page, /^Dirección, logo/).isVisible().catch(() => false))) {
        await page.keyboard.press("Escape");
        const back = page.getByRole("button", { name: /^‹ Ajustes/ }).first();
        if (await back.isVisible().catch(() => false)) await back.click({ timeout: 5000 }).catch(() => {});
        if (!(await btn(page, /^Dirección, logo/).isVisible().catch(() => false))) { await go(page, base, "/talent/site"); await sess.waitContent("Mi presencia"); await btn(page, /^Ajustes del sitio/).click({ timeout: 30000 }); await btn(page, /^Dirección, logo/).waitFor({ state: "visible", timeout: 30000 }); }
      }
      const b = btn(page, new RegExp("^" + g));
      await b.scrollIntoViewIfNeeded(); await b.click();
      const t = Date.now();
      await sleep(page, 700);
      const ms = await waitNoLoading(page, 30000);
      const txt = await contentText(page);
      const stuck = LOADING.test(txt);
      rec.time(ctx, label, Date.now() - t, "group-open");
      await sess.audit(label, { ms: Date.now() - t, ok: !stuck });
    }, { sev: "high" });
    if (ok && ctx.cfg.writes) {
      let what = "";
      await step("settings", label, "editar, guardar y revertir", async () => { what = await editRevert(page, ctx, rec, g, label); rec.steps.push({ user: ctx.user, width: ctx.width, stage: "settings", name: `${label}: ${what}`, result: "info" }); }, { sev: "high", expected: "Edit saves and reverts" });
    }
    // back to list
    await step("settings", label, "volver", async () => {
      const back = page.getByRole("button", { name: /^‹ Ajustes/ }).first();
      if (await back.count()) await back.click(); else await page.keyboard.press("Escape");
      await btn(page, /^Dirección, logo/).waitFor({ state: "visible", timeout: 8000 });
    }, { sev: "medium", expected: "Back returns to the settings list", noShot: true });
  }
};

// ============================================================ PRESENCE
const THEMES = ["Folio", "Maison", "Gridline", "Maison v2"];
async function cancelSheet(page) {
  const dlg = page.locator("[role=dialog],[role=alertdialog],[aria-modal=true]").last();
  const c = dlg.getByRole("button", { name: /cancelar|ahora no|mantener|no cambiar|volver|cerrar|descartar|seguir editando/i }).first();
  if (await c.count()) { await c.click().catch(() => {}); await sleep(page, 500); return true; }
  await page.keyboard.press("Escape"); await sleep(page, 400); return false;
}

STAGES.presence = async ({ page, ctx, sess, step, rec, base }) => {
  await go(page, base, "/talent/site");
  await sess.waitContent("Mi presencia");
  await waitNoLoading(page, 30000);
  const L = "Mi presencia / Cambiar diseño";
  const currentTheme = ((await contentText(page)).match(/Diseño:\s*([^·\n]+)/) || [])[1]?.trim() || "";
  rec.steps.push({ user: ctx.user, width: ctx.width, stage: "presence", name: `current design: ${currentTheme || "unknown"}`, result: "info" });
  const opened = await step("presence", L, "abrir selector", async () => {
    const t = Date.now();
    await btn(page, /^Cambiar diseño$/).click({ timeout: 30000 });
    await page.getByText(/Elige un diseño/).first().waitFor({ timeout: 20000 });
    rec.time(ctx, L, Date.now() - t, "open");
    await sess.audit(L, { ms: Date.now() - t });
  }, { sev: "high" });
  if (opened) {
    await page.getByRole("button", { name: /^Explorar / }).first().waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
    const present = (await visibleNames(page)).filter((n) => /^Explorar (?!tema)/.test(n)).map((n) => n.replace("Explorar ", ""));
    rec.steps.push({ user: ctx.user, width: ctx.width, stage: "presence", name: `${L}: themes listed = ${present.join(", ")}`, result: "info" });
    for (const th of THEMES) {
      const TL = `${L} / ${th}`;
      const card = page.getByRole("button", { name: new RegExp("^Explorar " + th.replace(/ /g, "\\s") + "$") }).first();
      if (!(await card.count().catch(() => 0))) { rec.steps.push({ user: ctx.user, width: ctx.width, stage: "presence", name: `${TL}: not listed`, result: "info" }); continue; }
      await step("presence", TL, "abrir detalle", async () => {
        await card.scrollIntoViewIfNeeded(); await card.click({ force: true });
        const t = Date.now();
        const use = page.getByRole("button", { name: /^Usar este diseño/ }).first();
        let shown = await use.waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false);
        if (!shown) { await page.getByRole("heading", { name: new RegExp("^" + th.replace(/ /g, "\\s") + "$") }).first().click({ timeout: 4000 }).catch(() => {}); shown = await use.waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false); }
        if (!shown) { await page.getByRole("button", { name: /^Explorar tema/ }).nth(THEMES.indexOf(th) === 3 ? 1 : THEMES.indexOf(th) === 0 ? 2 : 0).click({ timeout: 4000 }).catch(() => {}); }
        await use.waitFor({ state: "visible", timeout: 20000 });
        await page.waitForFunction(() => { const b = [...document.querySelectorAll("button")].find((x) => /Usar este diseño/.test(x.innerText)); return b && !b.disabled && !/Cargando vista previa/.test(document.body.innerText); }, null, { timeout: 120000 }).catch(() => { throw new Error('"Usar este diseño" stays disabled / preview never loads (120s)'); });
        rec.time(ctx, TL, Date.now() - t, "preview-ready");
        if (Date.now() - t > 15000) rec.add(ctx, { page: TL, element: "vista previa", severity: "medium", what: `Theme preview took ${Date.now() - t} ms to load (Usar este diseño stays disabled until it does)`, expected: "< 5 s", screenshot: null });
        await sess.audit(TL, { ms: Date.now() - t });
      }, { sev: "high" });
      await step("presence", TL, "hoja de confirmación de colores", async () => {
        if (currentTheme && currentTheme === th) { rec.steps.push({ user: ctx.user, width: ctx.width, stage: "presence", name: `${TL}: is the current design, Usar este diseño skipped (re-applying it only closes the picker)`, result: "info" }); return; }
        const use = page.getByRole("button", { name: /^Usar este diseño/ }).first();
        if (!(await use.isVisible().catch(() => false))) { const lab = (await visibleNames(page)).filter((n) => /diseño|actual|usando|elegido|tuyo/i.test(n)).slice(-3).join(" | "); rec.steps.push({ user: ctx.user, width: ctx.width, stage: "presence", name: `${TL}: no "Usar este diseño" button (probably the current design). Labels: ${lab}`, result: "info" }); return; }
        if (!(await use.isEnabled())) throw new Error("Usar este diseño disabled");
        const before = await page.evaluate(SIG);
        await use.click();
        await sleep(page, 1800);
        const sheetTxt = await page.evaluate(() => { const d = [...document.querySelectorAll("[role=dialog],[role=alertdialog],[aria-modal=true]")]; return d.map((x) => x.innerText).join("\n---\n"); });
        const colour = /color/i.test(sheetTxt.split("---").pop() || "") && /(cambi|usar|mantener|conservar)/i.test(sheetTxt);
        const sh = await rec.shot(ctx, page, `${TL} confirm sheet`);
        const after = await page.evaluate(SIG);
        const pickerClosed = (await page.getByRole("button", { name: /^Cambiar diseño$/ }).first().isVisible().catch(() => false)) && !(await page.getByText(/Elige un diseño/).first().isVisible().catch(() => false));
        if (pickerClosed) rec.add(ctx, { page: TL, element: "Usar este diseño", severity: "high", what: "Clicking Usar este diseño applied the theme with no colour-switch confirm sheet (picker closed)", expected: "Confirm sheet about keeping/switching colours", screenshot: sh });
        else if (!colour) rec.add(ctx, { page: TL, element: "Usar este diseño", severity: "medium", what: `No colour-switch confirm sheet detected after Usar este diseño (layers ${before.layers} -> ${after.layers}). Sheet text: ${sheetTxt.slice(-160).replace(/\s+/g, " ")}`, expected: "Confirm sheet about colours when the theme palette differs", screenshot: sh });
        rec.steps.push({ user: ctx.user, width: ctx.width, stage: "presence", name: `${TL}: confirm sheet colour=${colour} pickerClosed=${pickerClosed}`, result: "info" });
        await cancelSheet(page);
      }, { sev: "high", noShot: true });
      await step("presence", TL, "volver a la galería", async () => {
        const back = page.getByRole("button", { name: /Mi sitio web/ }).first();
        if (await back.isVisible().catch(() => false)) await back.click();
        await sleep(page, 700);
      }, { noShot: true });
    }
    await step("presence", L, "controles del selector", async () => {
      await clickSweep(page, ctx, rec, L, { scope: "@layer", max: 12, base: sess.mark, skip: /^‹|^Hoy$|Volver|^Cerrar$|Mi sitio web|^Maison|^Folio|^Gridline|Explorar/ });
    }, { noShot: true });
    await step("presence", L, "cerrar selector", async () => {
      for (let q = 0; q < 5; q++) {
        if (await page.getByRole("button", { name: /^Cambiar diseño$/ }).isVisible().catch(() => false)) break;
        await cancelSheet(page).catch(() => {});
        const c = page.getByRole("button", { name: /Volver a Mi sitio|^‹ Mi sitio web|^Cerrar$/ }).first();
        if (await c.isVisible().catch(() => false)) await c.click({ timeout: 4000 }).catch(() => {}); else await page.keyboard.press("Escape");
        await sleep(page, 900);
      }
      if (!(await page.getByRole("button", { name: /^Cambiar diseño$/ }).isVisible().catch(() => false))) throw new Error("Picker still open after Cerrar / Volver a Mi sitio");
    }, { sev: "high" });
  }

  for (const [name, re] of [["Opciones de diseño", /^Opciones de diseño$/], ["Restaurar diseño anterior", /^Restaurar diseño anterior$/]]) {
    const PL = `Mi presencia / ${name}`;
    await step("presence", PL, "abrir (solo abrir)", async () => {
      const before = await page.evaluate(SIG);
      const t = Date.now();
      await btn(page, re).click({ timeout: 15000 });
      await sleep(page, 1500);
      await waitNoLoading(page, 20000);
      const after = await page.evaluate(SIG);
      if (JSON.stringify(before) === JSON.stringify(after)) throw new Error(`${name} produced no visible response`);
      await sess.audit(PL, { ms: Date.now() - t });
      if (name === "Opciones de diseño") await clickSweep(page, ctx, rec, PL, { scope: "@layer", max: 10, base: sess.mark });
      if (!(await closeLayers(page, before.layers))) { await cancelSheet(page); if (!(await closeLayers(page, before.layers))) throw new Error(`${name} does not close`); }
    }, { sev: "high" });
  }
  await step("presence", "Mi presencia / aviso de actualización del tema", "buscar aviso", async () => {
    const txt = await contentText(page);
    const m = txt.match(/.{0,60}(actualizaci[oó]n|nueva versi[oó]n|actualizar (el )?(tema|dise[ñn]o)).{0,80}/i);
    rec.steps.push({ user: ctx.user, width: ctx.width, stage: "presence", name: `theme update notice: ${m ? m[0].replace(/\s+/g, " ") : "not shown"}`, result: "info" });
    if (m) { const b = page.getByRole("button", { name: /actualiz|ver cambios|detalles|descartar|cerrar/i }).first(); if (await b.count()) { const before = await page.evaluate(SIG); await b.click(); await sleep(page, 800); await closeLayers(page, before.layers); } }
  });

  // FAQ editor
  await step("presence", "Mi presencia / Preguntas frecuentes", "editor de FAQ", async () => {
    await page.getByRole("tab", { name: /^Mi sitio web$/ }).or(page.getByRole("button", { name: /^Mi sitio web$/ })).first().click().catch(() => {});
    const anchor = page.getByText(/Preguntas y respuestas|Preguntas frecuentes/i).first();
    if (!(await anchor.count())) throw new Error("FAQ section not found on Mi presencia");
    await anchor.scrollIntoViewIfNeeded();
    await sleep(page, 600);
    await sess.audit("Mi presencia / Preguntas frecuentes", { ms: 0 });
    if (!ctx.cfg.writes) return;
    await clickSweep(page, ctx, rec, "Mi presencia / Preguntas frecuentes", { scope: "#tulala-talent-content", max: 6, base: sess.mark, skip: PRESENCE_SKIP });
    const target = page.locator("#tulala-talent-content input:not([type=checkbox]):not([type=radio]):visible, #tulala-talent-content textarea:visible").first();
    if (!(await target.count())) { rec.steps.push({ user: ctx.user, width: ctx.width, stage: "presence", name: "FAQ: no editable field located", result: "info" }); return; }
    const v = await target.inputValue();
    await target.scrollIntoViewIfNeeded();
    await target.fill(v + " ."); await target.blur(); await sleep(page, 3000);
    const sh = await rec.shot(ctx, page, "FAQ edited");
    const txt = await contentText(page);
    if (/no se pudo|error al guardar|falló/i.test(txt)) rec.add(ctx, { page: "Mi presencia / FAQ", element: "pregunta", severity: "high", what: "FAQ edit shows a save error", expected: "FAQ edit saves", screenshot: sh });
    await target.fill(v); await target.blur(); await sleep(page, 3000);
    if ((await target.inputValue()) !== v) rec.add(ctx, { page: "Mi presencia / FAQ", element: "pregunta", severity: "high", what: "FAQ value did not revert", expected: "Original value", screenshot: sh });
  }, { sev: "medium" });
};

// ============================================================ PAGE BUILDER
STAGES.builder = async ({ page, ctx, sess, step, rec, base }) => {
  const L = "Page builder";
  const t0 = Date.now();
  await go(page, base, "/talent/page-builder");
  const ready = await step("builder", L, "cargar el editor", async () => {
    await btn(page, /^Agregar/).waitFor({ state: "visible", timeout: 60000 });
    const ms = Date.now() - t0;
    rec.time(ctx, L, ms, "time-to-content");
    await sleep(page, 1500);
    await sess.audit(L, { ms, links: "external" });
  }, { sev: "critical", expected: "Editor loads" });
  if (!ready) return;

  await step("builder", L, "cambiar dispositivo (escritorio/tableta/teléfono)", async () => {
    const probe = () => page.evaluate(() => { const fr = [...document.querySelectorAll("iframe")].filter((x) => x.getBoundingClientRect().width > 200).pop(); if (fr) { const r = fr.getBoundingClientRect(); return { iframe: true, left: Math.round(r.left), width: Math.round(r.width), vw: innerWidth }; } const a = document.querySelector('a[href="#gallery"],a[href="#services"]'); if (!a) return null; const r = a.getBoundingClientRect(); return { left: Math.round(r.left), width: Math.round(r.width), vw: innerWidth }; });
    const widths = {};
    for (const [nm, re] of [["tablet", /^Tablet$/], ["mobile", /^Mobile/], ["desktop", /^Desktop$/]]) {
      const b = btn(page, re);
      if (!(await b.isVisible().catch(() => false))) { widths[nm] = "button hidden"; continue; }
      await b.click(); await sleep(page, 2500);
      if (nm !== "desktop") await page.waitForFunction(() => { const fr = document.querySelector("iframe"); return !fr || !/^\s*Loading/i.test(fr.contentDocument?.body?.innerText || "x"); }, null, { timeout: 25000 }).catch(() => { rec.add(ctx, { page: L, element: nm + " frame", severity: "medium", what: `${nm} device frame still shows the English "Loading" skeleton after 25 s`, expected: "Frame renders the site", screenshot: null }); });
      widths[nm] = await probe();
      await rec.shot(ctx, page, `builder device ${nm}`);
      const chrome = await page.evaluate(() => { const f = document.querySelector("iframe"); return f ? (f.contentDocument?.body?.innerText || "").match(/Deshacer|Publicar|Agregar/) : null; }).catch(() => null);
      if (chrome) rec.add(ctx, { page: L, element: nm + " frame", severity: "high", what: "Device frame contains editor chrome, not only the site", expected: "The frame shows only the site", screenshot: null });
    }
    rec.steps.push({ user: ctx.user, width: ctx.width, stage: "builder", name: "device frames " + JSON.stringify(widths), result: "info" });
    if (typeof widths.mobile === "object" && typeof widths.desktop === "object" && widths.mobile?.width === widths.desktop?.width && widths.mobile.left === widths.desktop.left) rec.add(ctx, { page: L, element: "Mobile editing mode", severity: "medium", what: "Switching to mobile did not change the canvas geometry", expected: "Canvas narrows to a phone frame", screenshot: null });
  }, { sev: "high" });

  await step("builder", L, "agregar bloque y deshacer", async () => {
    const before = await page.evaluate(() => document.getElementsByTagName("section").length);
    await btn(page, /^Agregar/).click(); await sleep(page, 1500);
    const item = page.getByText(/^(CTA Banner|Hero Centered|About Simple)$/).first();
    await item.waitFor({ state: "visible", timeout: 8000 });
    await sess.audit(L + " / galería de bloques", { ms: 0 });
    if (!ctx.cfg.writes) { await page.keyboard.press("Escape"); return; }
    await item.click(); await sleep(page, 1200);
    const gate = await page.getByText(/CAMBIO DEL EDITOR BLOQUEADO|Web Office/).first().isVisible().catch(() => false);
    if (gate) rec.steps.push({ user: ctx.user, width: ctx.width, stage: "builder", name: "adding a block on this plan shows 'CAMBIO DEL EDITOR BLOQUEADO / es parte de Web Office' (plan gate)", result: "info" });
    let crashed = false;
    for (let q = 0; q < 12 && !crashed; q++) { crashed = await page.getByText(/Something went wrong|Algo salió mal/).first().isVisible().catch(() => false); if (!crashed) await sleep(page, 500); }
    if (crashed) {
      const sh = await rec.shot(ctx, page, "builder CRASH after add block");
      rec.add(ctx, { page: L, element: "Agregar bloque > " + (await item.innerText().catch(() => "block")), severity: "critical", what: `Clicking a block in the Add gallery ${gate ? "shows the plan-gate toast (adding blocks is Web Office only) and then " : ""}crashes the editor to the generic English error screen ("Something went wrong / Retry / Go home"). Console shows "useAdminShell outside AdminShellProvider".`, expected: "Block is inserted into the page", screenshot: sh, likelyFile: "web/src/components/admin/shell/internal/state/context.tsx (throws useAdminShell outside AdminShellProvider), web/src/components/admin/shell/internal/page-modules/BuilderLabPage.tsx (calls useAdminShell in the block-insert path), boundary web/src/app/(workspace)/talent/error.tsx" });
      await go(page, base, "/talent/page-builder"); await btn(page, /^Agregar/).waitFor({ state: "visible", timeout: 60000 });
      return;
    }
    const mid = await page.evaluate(() => document.getElementsByTagName("section").length);
    await rec.shot(ctx, page, "builder after add block");
    if (gate) { await page.keyboard.press("Escape"); return; }
    if (mid <= before) rec.add(ctx, { page: L, element: "Agregar bloque", severity: "high", what: `Adding a block did not add a section (sections ${before} -> ${mid})`, expected: "Section count increases", screenshot: null });
    await btn(page, /^Deshacer/).click(); await sleep(page, 1500);
    const end = await page.evaluate(() => document.getElementsByTagName("section").length);
    if (end !== before) rec.add(ctx, { page: L, element: "Deshacer", severity: "high", what: `Undo did not remove the added block (sections ${before} -> ${mid} -> ${end})`, expected: "Back to original section count", screenshot: await rec.shot(ctx, page, "builder undo mismatch") });
    await page.keyboard.press("Escape");
  }, { sev: "high" });

  await step("builder", L, "seleccionar sección, editar texto y deshacer", async () => {
    if (!ctx.cfg.writes) return;
    const hs = page.locator("h1");
    let hi = 0, best = 0;
    for (let q = 0; q < Math.min(await hs.count(), 6); q++) { const bb = await hs.nth(q).boundingBox().catch(() => null); if (bb && bb.height > best) { best = bb.height; hi = q; } }
    const h = hs.nth(hi);
    const orig = (await h.innerText()).trim();
    await h.click(); await sleep(page, 1200);
    const sh0 = await rec.shot(ctx, page, "builder section selected");
    const panelTxt = await page.evaluate(() => document.body.innerText);
    const raw = panelTxt.match(/\{\/?[a-z]\}[^\n]{0,40}/);
    if (raw) rec.add(ctx, { page: L, element: "panel del bloque seleccionado", severity: "medium", what: `The selected block panel shows raw inline-markup tokens in its title: "${raw[0].trim()}"`, expected: "Plain text or rendered emphasis, never {i}…{/i}", screenshot: sh0, grep: "{i}" });
    const ed = page.locator("[contenteditable=true]").first();
    if (await ed.count()) { await ed.click(); await page.keyboard.press("End"); await page.keyboard.type(" X"); }
    else {
      await page.getByRole("tab", { name: /^Contenido$/ }).click(); await sleep(page, 1200);
      const f = page.locator('[role=tabpanel] input[type=text]:visible, [role=tabpanel] textarea:visible, input[type=text]:visible, textarea:visible').first();
      if (!(await f.count())) throw new Error("No editable text control after selecting the hero (no contenteditable, no Contenido field)");
      const v = await f.inputValue(); await f.fill(v + " X");
    }
    await sleep(page, 1500);
    const changed = (await hs.nth(hi).innerText()).trim();
    await rec.shot(ctx, page, "builder text edited");
    if (changed === orig) rec.steps.push({ user: ctx.user, width: ctx.width, stage: "builder", name: "text edit: typed text did not appear in the canvas (the heading is bound to the profile: 'Follows your profile'); not counted as a defect", result: "info" });
    for (let i = 0; i < 4; i++) { await btn(page, /^Deshacer/).click().catch(() => {}); await sleep(page, 700); if ((await hs.nth(hi).innerText()).trim() === orig) break; }
    const back = (await hs.nth(hi).innerText()).trim();
    if (back !== orig) rec.add(ctx, { page: L, element: "Deshacer", severity: "high", what: `Undo did not restore the heading ("${back.slice(0, 40)}" vs "${orig.slice(0, 40)}")`, expected: "Original text restored", screenshot: await rec.shot(ctx, page, "builder undo text mismatch") });
  }, { sev: "high" });

  await step("builder", L, "panel de tema (Diseño / Contenido / Estilo)", async () => {
    await go(page, base, "/talent/page-builder"); await btn(page, /^Agregar/).waitFor({ state: "visible", timeout: 60000 }); await sess.dismissCookies(); await sleep(page, 1500);
    for (const tab of ["Diseño", "Contenido", "Estilo"]) {
      const t = page.getByRole("tab", { name: new RegExp("^" + tab + "$") }).first();
      await t.click({ timeout: 8000 }); await sleep(page, 1300);
      const sh = await rec.shot(ctx, page, `builder drawer ${tab}`);
      const shown = (await page.getByRole("button", { name: /Close panel|Cerrar panel/ }).first().isVisible().catch(() => false)) ? 1 : 0;
      if (!shown) rec.add(ctx, { page: L, element: `tab ${tab}`, severity: "medium", what: `Tab ${tab} shows no panel`, expected: "Panel opens", screenshot: sh });
      await sess.audit(`${L} / ${tab}`, { ms: 0, links: false });
    }
    const close = page.getByRole("button", { name: /^Close panel$|Cerrar panel/ }).first();
    if (await close.count()) await close.click().catch(() => {});
  }, { sev: "high" });

  await step("builder", L, "diálogo de publicar (solo abrir)", async () => {
    const closeP = page.getByRole("button", { name: /Close panel|Cerrar panel/ }).first();
    if (await closeP.isVisible().catch(() => false)) { await closeP.click().catch(() => {}); await sleep(page, 500); }
    const before = await page.evaluate(SIG);
    await btn(page, /^Publicar$/).click({ timeout: 8000 }); await sleep(page, 1800);
    const after = await page.evaluate(SIG);
    if (before.layers === after.layers && Math.abs(before.text - after.text) < 20) throw new Error("Publicar produced no dialog");
    await sess.audit(L + " / Publicar", { ms: 0, links: false });
    for (let q = 0; q < 3 && (await page.getByRole("button", { name: /^Publicar ahora$/ }).isVisible().catch(() => false)); q++) { await page.getByRole("button", { name: /^Cancelar$/ }).last().click({ timeout: 4000 }).catch(() => page.keyboard.press("Escape")); await sleep(page, 800); }
    if (await page.getByRole("button", { name: /^Publicar ahora$/ }).isVisible().catch(() => false)) throw new Error("Publish dialog does not close (Cancelar/Escape)");
  }, { sev: "high" });
};

// ============================================================ SERVICES
STAGES.services = async ({ page, ctx, sess, step, rec, base }) => {
  const L = "Servicios";
  await go(page, base, "/talent/services");
  await sess.waitContent(L);
  await waitNoLoading(page);
  await step("services", L, "abrir editor de un servicio", async () => {
    const row = page.getByRole("button", { name: /· \d+ min/ }).first();
    await row.waitFor({ state: "visible", timeout: 15000 });
    const before = await page.evaluate(SIG);
    await row.click(); await sleep(page, 1800);
    await waitNoLoading(page, 15000);
    const after = await page.evaluate(SIG);
    if (JSON.stringify(before) === JSON.stringify(after)) throw new Error("Service row opened nothing");
    await sess.audit(L + " / editor", { ms: 0 });
    await clickSweep(page, ctx, rec, L + " / editor", { scope: "@layer", max: 14, base: sess.mark });
    if (ctx.cfg.writes) {
      const save = page.getByRole("button", { name: /^(Guardar|Guardar cambios)$/ }).last();
      if (await save.count() && (await save.isEnabled())) { await save.click(); await sleep(page, 2500); const txt = await page.evaluate(() => document.body.innerText); if (/no se pudo|error|falló/i.test(txt)) rec.add(ctx, { page: L + " / editor", element: "Guardar", severity: "high", what: "Saving the unchanged service shows an error", expected: "Saves", screenshot: await rec.shot(ctx, page, "service save error") }); }
      else rec.steps.push({ user: ctx.user, width: ctx.width, stage: "services", name: "service editor: Guardar disabled (nothing to save) or absent", result: "info" });
    }
    if (!(await closeLayers(page, before.layers))) { const back = page.getByRole("button", { name: /volver|‹|cerrar|cancelar/i }).first(); if (await back.count()) await back.click(); await sleep(page, 700); }
  }, { sev: "high" });
  await step("services", L, "menú Más / importar", async () => {
    await go(page, base, "/talent/services"); await waitNoLoading(page);
    const before = await page.evaluate(SIG);
    const names0 = new Set(await visibleNames(page));
    await btn(page, /^Más$/).click(); await sleep(page, 900);
    const items = [...new Set((await visibleNames(page)).filter((n) => !names0.has(n)))];
    rec.steps.push({ user: ctx.user, width: ctx.width, stage: "services", name: `Más menu items: ${items.join(" | ")}`, result: "info" });
    await sess.audit(L + " / Más", { ms: 0, links: false });
    for (const it of items.slice(0, 5)) {
      await go(page, base, "/talent/services"); await waitNoLoading(page);
      await btn(page, /^Más$/).click(); await sleep(page, 700);
      const target = page.getByText(new RegExp("^" + it.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$")).first();
      if (!(await target.count())) continue;
      const b4 = await page.evaluate(SIG);
      await target.click({ timeout: 6000 }).catch(() => {}); await sleep(page, 2500);
      const af = await page.evaluate(SIG);
      const sh = await rec.shot(ctx, page, `services menu ${it}`);
      const changed = JSON.stringify(b4) !== JSON.stringify(af);
      rec.steps.push({ user: ctx.user, width: ctx.width, stage: "services", name: `Más > "${it}" -> ${changed ? "opens (" + af.url + ")" : "NO RESPONSE"}`, result: "info" });
      if (!changed) rec.add(ctx, { page: L + " / Más", element: it, severity: "medium", what: `Menu item "${it}" produced no visible response`, expected: "Opens its flow", screenshot: sh, grep: it });
      await sess.audit(`${L} / Más / ${it}`, { ms: 0, links: false });
      await closeLayers(page, b4.layers);
    }
    if (!items.length) rec.steps.push({ user: ctx.user, width: ctx.width, stage: "services", name: "Más menu produced no new items", result: "info" });
  }, { sev: "medium" });
  await step("services", L, "agregar artículo y organizar (solo abrir)", async () => {
    await go(page, base, "/talent/services"); await waitNoLoading(page);
    for (const re of [/^\+ Agregar artículo$/, /^Organizar$/, /^Valores predeterminados$/]) {
      const before = await page.evaluate(SIG);
      if (!(await btn(page, re).waitFor({ state: "visible", timeout: 20000 }).then(() => true).catch(() => false))) { rec.steps.push({ user: ctx.user, width: ctx.width, stage: "services", name: `${String(re)} not visible on this layout`, result: "info" }); continue; }
      await btn(page, re).click({ timeout: 15000 }); await sleep(page, 1800);
      const after = await page.evaluate(SIG);
      if (JSON.stringify(before) === JSON.stringify(after)) rec.add(ctx, { page: L, element: String(re), severity: "medium", what: "Control produced no visible response", expected: "Opens something", screenshot: await rec.shot(ctx, page, "services dead " + re) });
      await sess.audit(L + " / " + re, { ms: 0, links: false });
      await closeLayers(page, before.layers);
      if (after.url !== before.url) await go(page, base, "/talent/services");
      await waitNoLoading(page);
    }
  }, { sev: "medium" });
};

// ============================================================ MESSAGES
STAGES.messages = async ({ page, ctx, sess, step, rec, base }) => {
  const L = "Mensajes";
  const t0 = Date.now();
  await go(page, base, "/talent/inbox");
  const res = await sess.waitContent(L, t0);
  await waitNoLoading(page);
  await sess.audit(L, res);
  await step("messages", L, "abrir un hilo", async () => {
    for (const tab of ["Responder", "Cotizaciones", "Agencia", "Todos"]) {
      const b = btn(page, new RegExp("^" + tab)); if (await b.count()) { await b.click(); await sleep(page, 700); }
    }
    await page.evaluate(() => {
      const root = document.querySelector("#tulala-talent-content") || document.body;
      const c = [...root.querySelectorAll("a,button,[role=button],li,div[tabindex],div")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 150 && r.width < 560 && r.height > 55 && r.height < 220 && r.left < 700 && r.right > 0 && getComputedStyle(e).cursor === "pointer" && (e.innerText || "").trim().length > 12 && !/^(Todos|Responder|Cotizaciones|Agencia|Nueva)/.test((e.innerText || "").trim()); });
      c.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      if (c[0]) c[0].setAttribute("data-sweep-thread", "1");
    });
    const thread = page.locator("[data-sweep-thread]").first();
    if (!(await thread.count())) { rec.steps.push({ user: ctx.user, width: ctx.width, stage: "messages", name: "no thread rows found (empty inbox?)", result: "info" }); return; }
    const before = await page.evaluate(SIG);
    const t = Date.now();
    await thread.click(); await sleep(page, 1800);
    await waitNoLoading(page, 20000);
    rec.time(ctx, L + " / hilo", Date.now() - t, "open");
    const after = await page.evaluate(SIG);
    if (JSON.stringify(before) === JSON.stringify(after)) throw new Error("Thread row opened nothing");
    await sess.audit(L + " / hilo", { ms: Date.now() - t });
    await clickSweep(page, ctx, rec, L + " / hilo", { max: 14, base: sess.mark });
  }, { sev: "high" });
};
