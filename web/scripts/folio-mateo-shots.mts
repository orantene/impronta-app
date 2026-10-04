/**
 * Mateo Folio builder/live shots + light editability probe.
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://127.0.0.1:3001";
const OUT =
  "/cursor/stores/bc-80661ff2-8036-4d60-998b-696a75e11225/media/folio-mateo-dod";
const TMP = "/tmp/folio-mateo-shots";
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
    if (fs.statSync(t).size < 900_000) fs.copyFileSync(t, path.join(OUT, name));
  } catch (e) {
    console.warn(e);
  }
}

const results: Array<{ id: string; ok: boolean; note: string }> = [];
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies(cookies());

const page = await ctx.newPage();
await page.goto(`${BASE}/talent/page-builder`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(5000);
await shot(page, "01-builder-1440.png");
const hasName = (await page.getByText(/Mateo|Ferrer|MATEO/i).count()) > 0;
results.push({ id: "builder-loaded", ok: hasName, note: hasName ? "Mateo name on canvas" : "name missing" });

const live = await ctx.newPage();
await live.goto(LIVE, { waitUntil: "domcontentloaded", timeout: 60000 });
await live.waitForTimeout(3000);
await shot(live, "01-live-1440.png");
await live.setViewportSize({ width: 390, height: 844 });
await live.reload({ waitUntil: "domcontentloaded" });
await live.waitForTimeout(3000);
await shot(live, "01-live-390.png");

// Theme Style / magazine
await page.getByRole("button", { name: /^Design$/i }).first().click().catch(() => {});
await page.waitForTimeout(400);
await page.locator("[data-testid='design-panel']").getByText(/^Theme$/i).first().click().catch(() => {});
await page.waitForTimeout(300);
if (await page.locator("[data-design-open-theme]").count()) {
  await page.locator("[data-design-open-theme]").first().click();
} else {
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(300);
  await page.keyboard.type("Open Theme");
  await page.keyboard.press("Enter");
}
await page.waitForTimeout(1500);
const drawer = page.locator('[data-edit-drawer="theme"]');
const themeOpen = (await drawer.count()) > 0;
await shot(page, "02-theme-open.png");
if (themeOpen) {
  await drawer.getByRole("tab", { name: /^Style$/i }).click().catch(() => {});
  await page.waitForTimeout(700);
  await shot(page, "02-theme-style.png");
  const styleOk = (await drawer.locator("[data-theme-control^='style-']").count()) > 0;
  results.push({ id: "style-tab", ok: styleOk, note: styleOk ? "Style tab controls" : "no style controls" });
  await page.keyboard.press("Escape");
}

// Click a few rows
const probes: Array<[string, string]> = [
  ["cover", "[data-builder-node-kind='masthead'], #hero"],
  ["contents", "[data-builder-node-kind='contents']"],
  ["chapters", "[data-builder-node-kind='portfolio']"],
  ["rate-card", "[data-builder-node-kind='services_catalog'], #services"],
  ["comp-card", "[data-builder-node-kind='comp_card']"],
];
for (const [id, sel] of probes) {
  try {
    const loc = page.locator(sel).first();
    if (await loc.count()) {
      await loc.scrollIntoViewIfNeeded().catch(() => {});
      await loc.click({ force: true, timeout: 5000 });
      await page.waitForTimeout(500);
      await page.getByRole("button", { name: /Edit Content/i }).first().click().catch(() => {});
      await page.waitForTimeout(400);
      await shot(page, `03-edit-${id}.png`);
      results.push({ id, ok: true, note: "selected" });
    } else {
      results.push({ id, ok: false, note: "selector miss" });
    }
  } catch (e) {
    results.push({ id, ok: false, note: String(e) });
  }
}

fs.writeFileSync(path.join(OUT, "editability-probe.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
await browser.close();
