/**
 * Lane 5 brand loop: accent change → publish → live → revert → publish.
 * Alba Maison (demo stays artifact after revert).
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://127.0.0.1:3001";
const AUTH = "/home/ubuntu/.claude/design-diff/.auth-alba-nail-artist.json";
const PROFILE = "8a59afc1-6e2e-49cd-b78d-27f689cc80f5";
const LIVE = `${BASE}/template-preview/current?kind=live-site&talent=${PROFILE}&locale=es`;
const OUT =
  "/cursor/stores/bc-80661ff2-8036-4d60-998b-696a75e11225/media/integ-designs-final/cross-wire";
fs.mkdirSync(OUT, { recursive: true });

const MARKER = "#0044AA";
type Row = { id: string; ok: boolean; note: string; shot?: string };
const results: Row[] = [];

async function shot(page: Page, name: string) {
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

async function openTheme(page: Page) {
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /^Design$|^Diseño$/i }).first().click({ force: true, timeout: 15000 });
  await page.waitForTimeout(500);
  await page.getByText(/^Theme$|^Tema$/i).first().click().catch(() => {});
  await page.waitForTimeout(400);
  const openBtn = page.locator("[data-design-open-theme]").first();
  await openBtn.waitFor({ state: "visible", timeout: 10000 });
  await openBtn.click();
  await page.waitForTimeout(1200);
  return page.locator('[data-edit-drawer="theme"]');
}

async function setAccent(page: Page, drawer: ReturnType<Page["locator"]>, hex: string) {
  await drawer.getByRole("tab", { name: /^Colors$|^Colores$/i }).click();
  await page.waitForTimeout(500);
  // Accent drives Maison pills; also set Primary to keep brand pair in sync.
  let before = "";
  let lab = "";
  for (const name of ["Accent", "Acento", "Primary", "Primario"]) {
    const field = drawer.locator(`label:has-text("${name}")`).locator("xpath=following::input[1]").first();
    if (!(await field.count())) continue;
    if (!before) before = await field.inputValue().catch(() => "");
    await field.fill(hex).catch(async () => {
      await field.click();
      await page.keyboard.press("Control+a");
      await page.keyboard.type(hex);
    });
    await page.waitForTimeout(350);
    lab = lab ? `${lab}+${name}` : name;
  }
  return { ok: !!lab, before, lab };
}

/** Theme drawer owns site tokens — topbar Publish alone does not promote them. */
async function publishTheme(page: Page, drawer: ReturnType<Page["locator"]>) {
  const pub = drawer.getByRole("button", { name: /Publish theme|Publicar tema/i }).first();
  if (!(await pub.count())) {
    // Fallback: any Publish inside the theme drawer footer
    const alt = drawer.getByRole("button", { name: /^Publish$|^Publicar$/i }).first();
    if (!(await alt.count())) return false;
    await alt.click();
  } else {
    await pub.click();
  }
  await page.waitForTimeout(800);
  const confirm = page.getByRole("button", { name: /Yes, publish|Sí, publicar|Confirm|Confirmar/i });
  if (await confirm.count()) {
    await confirm.last().click();
    await page.waitForTimeout(3000);
  } else {
    await page.waitForTimeout(2500);
  }
  return true;
}

async function liveAccentSample(page: Page): Promise<string> {
  await page.goto(LIVE, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(3500);
  // Sample the site design root — NOT <html>, which carries platform preview chrome vars.
  return page.evaluate(`(() => {
    const root = document.querySelector("[data-talent-design]") || document.querySelector("[data-theme-canvas-root]");
    const cs = getComputedStyle(root || document.documentElement);
    return JSON.stringify({
      accent: cs.getPropertyValue("--token-color-accent").trim(),
      primary: cs.getPropertyValue("--token-color-primary").trim(),
      design: root ? root.getAttribute("data-talent-design") : null,
    });
  })()`);
}

function hexClose(sample: string, hex: string): boolean {
  const norm = hex.replace("#", "").toLowerCase();
  return sample.toLowerCase().includes(norm) || sample.toLowerCase().includes(`#${norm}`);
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  storageState: AUTH,
  viewport: { width: 1440, height: 900 },
});
const page = await ctx.newPage();

await page.goto(`${BASE}/talent/page-builder`, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(4500);
await shot(page, "brand-00-baseline.png");

const baselineLive = await liveAccentSample(page);
results.push({ id: "baseline-live", ok: true, note: baselineLive, shot: await shot(page, "brand-01-live-baseline.png") });

await page.goto(`${BASE}/talent/page-builder`, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(4000);
const drawer = await openTheme(page);
const set = await setAccent(page, drawer, MARKER);
await shot(page, "brand-02-accent-draft.png");
results.push({
  id: "accent-set",
  ok: set.ok,
  note: `lab=${set.lab} before=${set.before} → ${MARKER}`,
});

const saveBtn = drawer.getByRole("button", { name: /Save draft|Guardar borrador/i });
if (await saveBtn.count() && !(await saveBtn.isDisabled().catch(() => true))) {
  await saveBtn.click();
  await page.waitForTimeout(1500);
}

const published = await publishTheme(page, drawer);
await shot(page, "brand-03-after-publish.png");
results.push({ id: "publish-accent", ok: published, note: `publishedTheme=${published}` });
await page.keyboard.press("Escape").catch(() => {});
await page.waitForTimeout(600);

const afterLive = await liveAccentSample(page);
const liveHit = hexClose(afterLive, MARKER);
await shot(page, "brand-04-live-accent.png");
results.push({
  id: "live-shows-accent",
  ok: published && liveHit,
  note: `liveHit=${liveHit} sample=${afterLive}`,
  shot: path.join(OUT, "brand-04-live-accent.png"),
});

// Revert to Maison Rosé artifact accent
const ROSE = "#B3174A";
await page.goto(`${BASE}/talent/page-builder`, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(4000);
const drawer2 = await openTheme(page);
const restored = await setAccent(page, drawer2, ROSE);
const save2 = drawer2.getByRole("button", { name: /Save draft|Guardar borrador/i });
if (await save2.count() && !(await save2.isDisabled().catch(() => true))) {
  await save2.click();
  await page.waitForTimeout(1500);
}
const republished = await publishTheme(page, drawer2);
await shot(page, "brand-05-reverted-publish.png");
results.push({
  id: "revert-publish",
  ok: restored.ok && republished,
  note: `restoreHex=${ROSE} republishedTheme=${republished}`,
});
await page.keyboard.press("Escape").catch(() => {});
await page.waitForTimeout(600);

const finalLive = await liveAccentSample(page);
const restoredOk = hexClose(finalLive, ROSE) && !hexClose(finalLive, MARKER);
await shot(page, "brand-06-live-restored.png");
results.push({
  id: "live-restored",
  ok: restoredOk,
  note: `restoredOk=${restoredOk} sample=${finalLive}`,
  shot: path.join(OUT, "brand-06-live-restored.png"),
});

fs.writeFileSync(path.join(OUT, "brand-publish-loop.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
console.log("PASS", results.filter((r) => r.ok).length, "FAIL", results.filter((r) => !r.ok).length);
await browser.close();
