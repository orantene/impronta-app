/**
 * Folio / Mateo DoD §3 items 3–5:
 *  3. Editability audit (Builder-map rows + chat)
 *  4. Site-wide override (accent + heading font) then discard-without-change
 *  5. Draft → publish → live, then revert + republish
 *
 *   cd web && npx tsx --env-file=.env.local scripts/folio-mateo-dod.mts
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://127.0.0.1:3001";
const OUT =
  "/cursor/stores/bc-80661ff2-8036-4d60-998b-696a75e11225/media/folio-mateo-dod";
const TMP = "/tmp/folio-mateo-dod-shots";
const PROFILE = "30f45c0f-6c40-44d4-bfb7-f04bfd0a6adc";
const LIVE = `${BASE}/template-preview/current?kind=live-site&talent=${PROFILE}&locale=es`;
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

function cookies() {
  return fs
    .readFileSync("/tmp/mateo-cookies.txt", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const p = l.split("\t");
      return p.length >= 7 ? { name: p[5], value: p[6], url: BASE } : null;
    })
    .filter(Boolean) as Array<{ name: string; value: string; url: string }>;
}

async function shot(page: Page, name: string) {
  const t = path.join(TMP, name);
  await page.screenshot({ path: t, fullPage: false });
  try {
    if (fs.statSync(t).size < 1_200_000) fs.copyFileSync(t, path.join(OUT, name));
  } catch (e) {
    console.warn(e);
  }
}

async function openTheme(page: Page) {
  await page.getByRole("button", { name: /^Design$|^Diseño$/i }).first().click();
  await page.waitForTimeout(500);
  const design = page.locator("[data-testid='design-panel']");
  if (await design.getByText(/^Theme$|^Tema$/i).count()) {
    await design.getByText(/^Theme$|^Tema$/i).first().click();
  }
  await page.waitForTimeout(400);
  if (await page.locator("[data-design-open-theme]").count()) {
    await page.locator("[data-design-open-theme]").first().click();
  } else {
    await page.keyboard.press("Control+k");
    await page.waitForTimeout(300);
    await page.keyboard.type("Open Theme");
    await page.keyboard.press("Enter");
  }
  await page.waitForTimeout(1500);
  return page.locator('[data-edit-drawer="theme"]');
}

const results: Record<string, unknown> = { rows: [] as unknown[] };
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies(cookies());
const page = await ctx.newPage();

await page.goto(`${BASE}/talent/page-builder`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(5000);
await shot(page, "04-builder-baseline.png");
const builderHasSpread = (await page.locator(".sb-mag-spread, [data-edition='magazine']").count()) > 0;
const builderHasModelo = (await page.getByText(/MODELO DE MODA|Modelo de moda/i).count()) > 0;
results.builder = { spread: builderHasSpread, modelo: builderHasModelo };

const live = await ctx.newPage();
await live.goto(LIVE, { waitUntil: "domcontentloaded", timeout: 60000 });
await live.waitForTimeout(3000);
await shot(live, "04-live-baseline.png");
results.live = {
  spread: (await live.locator(".sb-mag-spread, [data-edition='magazine']").count()) > 0,
  modelo: (await live.getByText(/MODELO DE MODA|Modelo de moda/i).count()) > 0,
  toc: (await live.locator(".sb-mag-toc").count()) > 0,
};
await live.close();

// ── DoD 3: editability ────────────────────────────────────────────────────
const probes: Array<{ id: string; sel: string; action?: "content" | "style" }> = [
  { id: "cover", sel: "[data-builder-kind='masthead'], .sb-mag-name, #hero" },
  { id: "contents", sel: ".sb-mag-toc, #contents" },
  { id: "chapters", sel: "[data-builder-node-kind='portfolio'], #chapter-1" },
  { id: "comp-card", sel: "#comp-card, [data-builder-node-kind='comp_card'], .sb-comp" },
  { id: "rate-card", sel: "#services, [data-builder-node-kind='services_catalog']" },
  { id: "statement-footer", sel: ".sb-statement-footer, [data-builder-node-kind='statement_footer']" },
];

const rowResults: Array<{ id: string; ok: boolean; note: string }> = [];
for (const probe of probes) {
  try {
    const loc = page.locator(probe.sel).first();
    if (!(await loc.count())) {
      rowResults.push({ id: probe.id, ok: false, note: "selector miss" });
      continue;
    }
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    await loc.click({ force: true, timeout: 5000 });
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: /Edit Content|Editar contenido/i }).first().click().catch(() => {});
    await page.waitForTimeout(500);
    const field = page.locator('textarea, [contenteditable="true"], input[type="text"]').first();
    let changed = false;
    if (await field.count()) {
      const before = (await field.inputValue().catch(async () => (await field.textContent()) ?? "")) || "";
      const next = before.includes(" ·QA") ? before.replace(" ·QA", "") : `${before} ·QA`.slice(0, 80);
      await field.fill(next).catch(async () => {
        await field.click();
        await page.keyboard.press("Control+a");
        await page.keyboard.type(next);
      });
      await page.waitForTimeout(600);
      changed = true;
      await page.keyboard.press("Control+z").catch(() => {});
      await page.waitForTimeout(400);
    }
    await shot(page, `04-edit-${probe.id}.png`);
    rowResults.push({
      id: probe.id,
      ok: changed,
      note: changed ? "selected + mutated + undo" : "selected (no text field)",
    });
  } catch (e) {
    rowResults.push({ id: probe.id, ok: false, note: String(e) });
  }
}

// Header via Structure (shell)
try {
  await page.getByRole("button", { name: /^Structure$|^Estructura$/i }).first().click().catch(() => {});
  await page.waitForTimeout(400);
  const headerLayer = page.locator("[data-structure-row], [data-layer-row], button, [role='treeitem']").filter({ hasText: /Header|Encabezado|Cabecera/i }).first();
  if (await headerLayer.count()) {
    await headerLayer.click();
    await page.waitForTimeout(400);
    await shot(page, "04-edit-header.png");
    rowResults.push({ id: "header", ok: true, note: "structure header selected" });
  } else {
    rowResults.push({ id: "header", ok: false, note: "structure header miss" });
  }
} catch (e) {
  rowResults.push({ id: "header", ok: false, note: String(e) });
}

// Chat via theme Layout
try {
  const drawer = await openTheme(page);
  await drawer.getByRole("tab", { name: /^Layout$|^Diseño$/i }).click().catch(() => {});
  await page.waitForTimeout(600);
  const chat = drawer.getByText(/Chat style|Estilo del chat|Chat/i).first();
  const chatOk = (await chat.count()) > 0;
  await shot(page, "04-edit-chat.png");
  rowResults.push({ id: "chat", ok: chatOk, note: chatOk ? "theme Layout chat control" : "chat control miss" });
  await page.keyboard.press("Escape");
} catch (e) {
  rowResults.push({ id: "chat", ok: false, note: String(e) });
}
results.rows = rowResults;

// ── DoD 4: site-wide override ─────────────────────────────────────────────
const drawer = await openTheme(page);
await drawer.waitFor({ state: "visible", timeout: 15000 });
await drawer.getByRole("tab", { name: /^Colors$|^Colores$/i }).click().catch(() => {});
await page.waitForTimeout(500);
let accentChanged = false;
for (const lab of ["Primary", "Accent", "Primario", "Acento"]) {
  const field = drawer.locator(`label:has-text("${lab}")`).locator("xpath=following::input[1]");
  if (await field.count()) {
    await field.fill("#0044AA").catch(async () => {
      await field.click();
      await page.keyboard.type("#0044AA");
    });
    accentChanged = true;
    break;
  }
}
await shot(page, "04-dod4-accent.png");
await drawer.getByRole("tab", { name: /^Typography$|^Tipografía$/i }).click().catch(() => {});
await page.waitForTimeout(600);
let fontChanged = false;
if (await drawer.getByText(/Heading family|Familia de títulos/i).count()) {
  const btn = drawer.getByText(/Heading family|Familia de títulos/i).locator("xpath=following::button[1]");
  if (await btn.count()) {
    await btn.click().catch(() => {});
    await page.waitForTimeout(400);
    const opt = page.getByText(/Playfair|Libre Baskerville|Lora|Merriweather/i).first();
    if (await opt.count()) {
      await opt.click();
      fontChanged = true;
    }
  }
}
await shot(page, "04-dod4-font.png");
const saveBtn = drawer.getByRole("button", { name: /Save draft|Guardar borrador/i });
if (await saveBtn.count() && !(await saveBtn.isDisabled().catch(() => true))) {
  await saveBtn.click();
  await page.waitForTimeout(1200);
}
await page.keyboard.press("Escape");
await page.waitForTimeout(600);
await shot(page, "04-dod4-canvas.png");

// Discard path: reopen, close without changes
const drawer2 = await openTheme(page);
const discard = drawer2.getByRole("button", { name: /Discard changes|Descartar/i });
const discardEnabled = (await discard.count()) > 0 && !(await discard.isDisabled().catch(() => true));
if (discardEnabled) await discard.click();
else await page.keyboard.press("Escape");
await page.waitForTimeout(600);
await shot(page, "04-dod4-discard-close.png");
results.dod4 = { ok: accentChanged || fontChanged, accentChanged, fontChanged, discardEnabled };

// ── DoD 5: draft → publish → revert ───────────────────────────────────────
await page.goto(`${BASE}/talent/page-builder`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(4000);
const cover = page.locator("[data-builder-kind='masthead'], .sb-mag-name, #hero").first();
if (await cover.count()) {
  await cover.click({ force: true }).catch(() => {});
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /Edit Content|Editar contenido/i }).first().click().catch(() => {});
  await page.waitForTimeout(500);
}
const text = page.locator('textarea, [contenteditable="true"], input[type="text"]').first();
let original = "";
let published = false;
if (await text.count()) {
  original = (await text.inputValue().catch(async () => (await text.textContent()) ?? "")) || "";
  const marker = " ·QA";
  const next = original.includes(marker) ? original.replace(marker, "") : `${original}${marker}`.slice(0, 80);
  await text.fill(next).catch(async () => {
    await text.click();
    await page.keyboard.press("Control+a");
    await page.keyboard.type(next);
  });
  await page.waitForTimeout(800);
  await shot(page, "04-dod5-draft.png");
  const pub = page.getByRole("button", { name: /^Publish$|^Publicar$/i });
  if (await pub.count()) {
    await pub.first().click();
    await page.waitForTimeout(1500);
    const confirm = page.getByRole("button", { name: /^Publish$|^Publicar$|Confirm|Confirmar|Yes|Sí/i });
    if (await confirm.count()) {
      await confirm.last().click().catch(() => {});
      await page.waitForTimeout(2500);
    }
    published = true;
  }
  await shot(page, "04-dod5-after-publish.png");
}
const live2 = await ctx.newPage();
await live2.goto(LIVE, { waitUntil: "domcontentloaded", timeout: 60000 });
await live2.waitForTimeout(2500);
await shot(live2, "04-dod5-live-after.png");
const liveHasMarker = (await live2.getByText(/·QA/i).count()) > 0;
await live2.close();

// Revert
await page.bringToFront();
if (await text.count() && original) {
  await text.fill(original).catch(async () => {
    await page.keyboard.press("Control+z");
  });
  await page.waitForTimeout(800);
  const pub2 = page.getByRole("button", { name: /^Publish$|^Publicar$/i });
  if (await pub2.count()) {
    await pub2.first().click();
    await page.waitForTimeout(1200);
    const confirm = page.getByRole("button", { name: /^Publish$|^Publicar$|Confirm|Confirmar|Yes|Sí/i });
    if (await confirm.count()) {
      await confirm.last().click().catch(() => {});
      await page.waitForTimeout(2500);
    }
  }
  await shot(page, "04-dod5-reverted.png");
}
const live3 = await ctx.newPage();
await live3.goto(LIVE, { waitUntil: "domcontentloaded", timeout: 60000 });
await live3.waitForTimeout(2500);
await shot(live3, "04-dod5-live-restored.png");
results.dod5 = {
  ok: published,
  liveHasMarker,
  note: published ? `published; liveMarker=${liveHasMarker}` : "publish path incomplete",
};

fs.writeFileSync(path.join(OUT, "dod-3-4-5.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
await browser.close();
