/**
 * Focused Alba shots: Style tab, shell=1 header/footer, live 1440/390.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://127.0.0.1:3001";
const OUT = "/cursor/stores/bc-80661ff2-8036-4d60-998b-696a75e11225/media/alba-builder-pending";
const PROFILE = "8a59afc1-6e2e-49cd-b78d-27f689cc80f5";
fs.mkdirSync(OUT, { recursive: true });

function cookiesFromFile() {
  return fs
    .readFileSync("/tmp/alba-cookies.txt", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const p = l.split("\t");
      if (p.length < 7) return null;
      return { name: p[5], value: p[6], url: BASE };
    })
    .filter(Boolean) as Array<{ name: string; value: string; url: string }>;
}

async function shot(page: import("playwright").Page, name: string) {
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: false });
  console.log("shot", name);
  return file;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies(cookiesFromFile());

const page = await context.newPage();
await page.goto(`${BASE}/talent/page-builder`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(5000);
await shot(page, "09-builder-canvas-1440.png");

// Design panel → Theme
for (const label of ["Design", "Diseño"]) {
  const b = page.getByRole("button", { name: new RegExp(`^${label}$`, "i") });
  if (await b.count()) {
    await b.first().click();
    break;
  }
}
await page.waitForTimeout(500);
// Theme under Design
const themeBtn = page.locator("button, a, [role='button']").filter({ hasText: /Theme|Tema/i }).first();
if (await themeBtn.count()) await themeBtn.click();
await page.waitForTimeout(1500);
await shot(page, "09-theme-drawer.png");

// Style tab
const styleTab = page.getByRole("tab", { name: /Style|Estilo/i });
if (await styleTab.count()) {
  await styleTab.click();
  await page.waitForTimeout(800);
  await shot(page, "09-theme-style-tab.png");
}

// Layout + chat
const layoutTab = page.getByRole("tab", { name: /Layout|Diseño|Disposición/i });
if (await layoutTab.count()) {
  await layoutTab.click();
  await page.waitForTimeout(600);
  await shot(page, "09-theme-layout-chat.png");
}

// Shell header/footer
await page.goto(`${BASE}/talent/page-builder?shell=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(5000);
await shot(page, "09-builder-shell-1440.png");

// Live 1440
const live = await context.newPage();
await live.setViewportSize({ width: 1440, height: 900 });
await live.goto(
  `${BASE}/template-preview/current?kind=live-site&talent=${PROFILE}&locale=es`,
  { waitUntil: "domcontentloaded", timeout: 60000 },
);
await live.waitForTimeout(3000);
await shot(live, "09-live-1440.png");
await live.locator(".site-header").first().screenshot({ path: path.join(OUT, "09-live-1440-header.png") }).catch(() => {});
await live.locator("#site-footer").first().screenshot({ path: path.join(OUT, "09-live-1440-footer.png") }).catch(() => {});

// Live 390
await live.setViewportSize({ width: 390, height: 844 });
await live.reload({ waitUntil: "domcontentloaded" });
await live.waitForTimeout(3000);
await shot(live, "09-live-390.png");
await live.locator(".site-header").first().screenshot({ path: path.join(OUT, "09-live-390-header.png") }).catch(() => {});
const burger = await live.locator(".site-header__menu-toggle, .site-header__burger, [data-header-item='menu']").count();
const footerText = await live.locator("#site-footer").innerText().catch(() => "");
fs.writeFileSync(
  path.join(OUT, "09-phone-shell.json"),
  JSON.stringify({ burgerCount: burger, footerSnippet: footerText.slice(0, 400) }, null, 2),
);
await live.locator("#site-footer").first().screenshot({ path: path.join(OUT, "09-live-390-footer.png") }).catch(() => {});

// Structure panel → click header via layers if present
await page.goto(`${BASE}/talent/page-builder?shell=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(3000);
const structure = page.getByRole("button", { name: /Structure|Estructura|Layers/i });
if (await structure.count()) await structure.first().click();
await page.waitForTimeout(500);
const headerLayer = page.locator("text=/Header|Encabezado|site_header/i").first();
if (await headerLayer.count()) {
  await headerLayer.click();
  await page.waitForTimeout(800);
  await shot(page, "09-edit-header.png");
}
const footerLayer = page.locator("text=/Footer|Pie|site-footer|site_footer/i").first();
if (await footerLayer.count()) {
  await footerLayer.click();
  await page.waitForTimeout(800);
  await shot(page, "09-edit-footer.png");
}

console.log("done");
await browser.close();
