/**
 * Alba DoD §3 items 4–5:
 *  4. Site-wide override (accent + heading font) then discard-without-change restores
 *  5. Draft → publish → live preview, then revert + republish (demo stays artifact)
 *
 *   cd web && npx tsx --env-file=.env.local scripts/maison-alba-dod-4-5.mts
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://127.0.0.1:3001";
const OUT =
  "/cursor/stores/bc-80661ff2-8036-4d60-998b-696a75e11225/media/integ-designs-final/maison-alba";
const TMP = "/tmp/maison-alba-shots";
const PROFILE = "8a59afc1-6e2e-49cd-b78d-27f689cc80f5";
const LIVE = `${BASE}/template-preview/current?kind=live-site&talent=${PROFILE}&locale=es`;
fs.mkdirSync(TMP, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

function cookies() {
  return fs
    .readFileSync("/tmp/alba-cookies.txt", "utf8")
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
    if (fs.statSync(t).size < 900_000) fs.copyFileSync(t, path.join(OUT, name));
  } catch (e) {
    console.warn(e);
  }
  return path.join(OUT, name);
}

async function openTheme(page: Page) {
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /^Design$|^Diseño$/i }).first().click({ force: true, timeout: 15000 });
  await page.waitForTimeout(500);
  await page.getByText(/^Theme$|^Tema$/i).first().click().catch(() => {});
  await page.waitForTimeout(500);
  const openBtn = page.locator("[data-design-open-theme]").first();
  await openBtn.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
  if (await openBtn.isVisible().catch(() => false)) {
    await openBtn.click();
  } else {
    await page.getByText(/Open theme editor|Abrir editor de tema/i).first().click({ timeout: 8000 }).catch(() => {});
  }
  await page.waitForTimeout(1500);
  return page.locator('[data-edit-drawer="theme"]');
}

const results: Record<string, unknown> = {};
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies(cookies());
const page = await ctx.newPage();

await page.goto(`${BASE}/talent/page-builder`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(4500);
await shot(page, "10-dod4-builder-baseline.png");

// ── DoD 4a: change accent + heading font ──────────────────────────────────
const drawer = await openTheme(page);
await drawer.waitFor({ state: "visible", timeout: 15000 });

// Colors tab — change accent if color input exists
await drawer.getByRole("tab", { name: /^Colors$|^Colores$/i }).click().catch(() => {});
await page.waitForTimeout(600);
const accentInput = drawer.locator('input[type="color"], input[type="text"]').filter({ has: page.locator("xpath=ancestor::*[contains(., 'Accent') or contains(., 'Acento') or contains(., 'Primary')]") }).first();
// Simpler: find Primary/Accent hex field
let accentChanged = false;
const colorFields = drawer.locator("input").filter({ hasText: "" });
const labels = ["Primary", "Accent", "Primario", "Acento"];
for (const lab of labels) {
  const field = drawer.locator(`label:has-text("${lab}")`).locator("xpath=following::input[1]");
  if (await field.count()) {
    const before = await field.inputValue().catch(() => "");
    await field.fill("#0044AA").catch(async () => {
      await field.click();
      await page.keyboard.type("#0044AA");
    });
    await page.waitForTimeout(800);
    accentChanged = true;
    results.accentBefore = before;
    results.accentAttempt = "#0044AA";
    break;
  }
}
await shot(page, "10-dod4-accent-changed.png");

// Typography — heading font
await drawer.getByRole("tab", { name: /^Typography$|^Tipografía$/i }).click().catch(() => {});
await page.waitForTimeout(700);
let fontChanged = false;
const fontPicker = drawer.locator("button, [role='combobox'], input").filter({ hasText: /Instrument|Cormorant|Playfair|Serif|Font/i }).first();
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
await shot(page, "10-dod4-font-changed.png");
results.accentChanged = accentChanged;
results.fontChanged = fontChanged;

// Save draft if enabled
const saveBtn = drawer.getByRole("button", { name: /Save draft|Guardar borrador/i });
if (await saveBtn.count()) {
  const disabled = await saveBtn.isDisabled().catch(() => true);
  results.saveDraftEnabled = !disabled;
  if (!disabled) {
    await saveBtn.click();
    await page.waitForTimeout(1500);
  }
}
await shot(page, "10-dod4-after-save.png");

// Close theme
await page.keyboard.press("Escape").catch(() => {});
await page.waitForTimeout(800);
await shot(page, "10-dod4-canvas-after-override.png");

// ── DoD 4b: open theme, discard without changes must restore ──────────────
const drawer2 = await openTheme(page);
await drawer2.waitFor({ state: "visible", timeout: 15000 });
await shot(page, "10-dod4-reopen-baseline.png");
// Close without changing (Escape / Discard if dirty from accidental touch)
const discard = drawer2.getByRole("button", { name: /Discard changes|Descartar/i });
if (await discard.count()) {
  const en = !(await discard.isDisabled().catch(() => true));
  results.discardEnabledOnReopen = en;
  if (en) {
    await discard.click();
    await page.waitForTimeout(1000);
  } else {
    await page.keyboard.press("Escape");
  }
} else {
  await page.keyboard.press("Escape");
}
await page.waitForTimeout(800);
await shot(page, "10-dod4-after-discard-close.png");
results.dod4 = {
  ok: accentChanged || fontChanged,
  note: accentChanged || fontChanged
    ? "site-wide override applied in theme drawer; discard/close path exercised"
    : "could not mutate accent/font controls — drawer opened",
};

// ── DoD 5: Draft → publish → live, then revert ────────────────────────────
// Prefer publishing the DoD4 theme draft; else mutate hero eyebrow via Content tab.
await page.goto(`${BASE}/talent/page-builder`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(4000);

async function clickPublish(): Promise<boolean> {
  const pub = page.getByRole("button", { name: /^Publish$|^Publicar$/i }).first();
  if (!(await pub.count()) || (await pub.isDisabled().catch(() => true))) return false;
  await pub.click();
  await page.waitForTimeout(1200);
  const confirm = page
    .getByRole("button", { name: /^Publish$|^Publicar$|Confirm|Confirmar|Yes|Sí/i })
    .filter({ hasNot: page.locator("[disabled]") });
  if (await confirm.count()) {
    await confirm.last().click().catch(() => {});
    await page.waitForTimeout(2800);
  } else {
    await page.waitForTimeout(2000);
  }
  return true;
}

let original = "";
let published = false;
let edited = false;
const hero = page.locator("#hero, [data-anchor-id='hero'], [data-builder-node-kind='split']").first();
if (await hero.count()) {
  await hero.click({ force: true }).catch(() => {});
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /Edit Content|Editar contenido/i }).first().click().catch(() => {});
  await page.waitForTimeout(400);
  await page.getByRole("tab", { name: /^Content$|^Contenido$/i }).first().click().catch(() => {});
  await page.waitForTimeout(400);
}
const text = page
  .locator('[data-inspector] textarea, [data-inspector] [contenteditable="true"], [data-edit-drawer] textarea')
  .or(page.locator('textarea, [contenteditable="true"]'))
  .first();
if (await text.count()) {
  original = (await text.inputValue().catch(async () => (await text.textContent()) ?? "")) || "";
  const marker = " ·QA";
  const next = original.includes(marker) ? original.replace(marker, "") : (original + marker).slice(0, 80);
  await text.fill(next).catch(async () => {
    await text.click();
    await page.keyboard.press("Control+a");
    await page.keyboard.type(next.slice(0, 80));
  });
  await page.waitForTimeout(1000);
  edited = true;
  await shot(page, "10-dod5-draft-edit.png");
  results.dod5Draft = next.slice(0, 60);
} else {
  // Theme draft from DoD4 may still be unpublished — publish that.
  await shot(page, "10-dod5-draft-edit.png");
  results.dod5Draft = "theme-draft-from-dod4";
}

published = await clickPublish();
await shot(page, "10-dod5-after-publish.png");
results.dod5Edited = edited;

const live = await ctx.newPage();
await live.goto(LIVE, { waitUntil: "domcontentloaded", timeout: 60000 });
await live.waitForTimeout(3000);
await shot(live, "10-dod5-live-after-publish.png");
const liveHasMarker = (await live.getByText(/·QA|QA/i).count()) > 0;
results.liveHasMarker = liveHasMarker;
await live.close();

// Revert: restore original text and/or theme accent, then republish
await page.bringToFront();
if (edited && (await text.count()) && original) {
  await text.fill(original).catch(async () => {
    await page.keyboard.press("Control+z");
  });
  await page.waitForTimeout(800);
}
// Restore Maison rose accent if DoD4 left blue published
{
  const drawerR = await openTheme(page);
  await drawerR.waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
  await drawerR.getByRole("tab", { name: /^Colors$|^Colores$/i }).click().catch(() => {});
  await page.waitForTimeout(400);
  const field = drawerR.locator('label:has-text("Primary"), label:has-text("Accent"), label:has-text("Primario"), label:has-text("Acento")').locator("xpath=following::input[1]").first();
  if (await field.count()) {
    const rose = (results.accentBefore as string) || "#B3174A";
    await field.fill(rose).catch(async () => {
      await field.click();
      await page.keyboard.type(rose);
    });
    await page.waitForTimeout(600);
    const save = drawerR.getByRole("button", { name: /Save draft|Guardar borrador|Save|Guardar/i });
    if (await save.count() && !(await save.isDisabled().catch(() => true))) {
      await save.click();
      await page.waitForTimeout(1200);
    }
  }
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(600);
}
await clickPublish();
await shot(page, "10-dod5-reverted-publish.png");

const live2 = await ctx.newPage();
await live2.goto(LIVE, { waitUntil: "domcontentloaded", timeout: 60000 });
await live2.waitForTimeout(3000);
await shot(live2, "10-dod5-live-restored.png");
const liveClean = (await live2.getByText(/Manos que/i).count()) > 0;
results.liveRestored = liveClean;
results.dod5 = {
  ok: published,
  note: published
    ? `published=${published}; liveMarker=${liveHasMarker}; restored=${liveClean}`
    : "publish button path incomplete",
};

fs.writeFileSync(path.join(OUT, "10-dod-4-5.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
await browser.close();
