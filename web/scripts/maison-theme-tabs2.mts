/**
 * Theme drawer Style + Layout (chat.variant) — scoped to data-edit-drawer=theme.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://127.0.0.1:3001";
const OUT =
  "/cursor/stores/bc-80661ff2-8036-4d60-998b-696a75e11225/media/alba-builder-pending";
const TMP = "/tmp/maison-alba-shots";
fs.mkdirSync(TMP, { recursive: true });

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

async function shot(page: import("playwright").Page, name: string) {
  const t = path.join(TMP, name);
  await page.screenshot({ path: t, fullPage: false });
  try {
    if (fs.statSync(t).size < 900_000) fs.copyFileSync(t, path.join(OUT, name));
  } catch (e) {
    console.warn(e);
  }
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies(cookies());
const page = await ctx.newPage();
await page.goto(`${BASE}/talent/page-builder`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(4500);

await page.getByRole("button", { name: /^Design$|^Diseño$/i }).first().click();
await page.waitForTimeout(500);
const design = page.locator("[data-testid='design-panel']");
if (await design.getByText(/^Theme$|^Tema$/i).count()) {
  await design.getByText(/^Theme$|^Tema$/i).first().click();
} else {
  await page.getByText(/^Theme$/i).first().click();
}
await page.waitForTimeout(400);
if (await page.locator("[data-design-open-theme]").count()) {
  await page.locator("[data-design-open-theme]").first().click();
} else {
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(400);
  await page.keyboard.type("Open Theme");
  await page.waitForTimeout(300);
  await page.keyboard.press("Enter");
}
await page.waitForTimeout(1500);

const drawer = page.locator('[data-edit-drawer="theme"]');
await drawer.waitFor({ state: "visible", timeout: 15000 });
await shot(page, "09-theme-editor-open.png");

// Style tab inside theme drawer only
await drawer.getByRole("tab", { name: /^Style$|^Estilo$/i }).click();
await page.waitForTimeout(900);
await shot(page, "09-theme-style-tab-real.png");
const styleControls = await drawer.locator("[data-theme-control^='style-']").count();
const typeBits = await drawer.getByText(/Type system|Editorial|Type roles|Buttons|Shape|Spacing|Reset to design|Restablecer/i).count();
console.log({ styleControls, typeBits });

// Layout tab → Chat style
await drawer.getByRole("tab", { name: /^Layout$|^Disposición$/i }).click();
await page.waitForTimeout(900);
// Scroll drawer body
const body = drawer.locator("[data-drawer-body], .overflow-y-auto, [class*='overflow']").first();
if (await body.count()) {
  await body.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  }).catch(() => {});
}
await page.waitForTimeout(400);
let hasChat = await drawer.getByText(/Chat style|Estilo de chat/i).count();
if (!hasChat) {
  // scroll incrementally
  for (let i = 0; i < 8; i++) {
    await drawer.evaluate((el) => {
      const scrollers = el.querySelectorAll("*");
      for (const n of scrollers) {
        const s = n as HTMLElement;
        if (s.scrollHeight > s.clientHeight + 40) s.scrollTop += 220;
      }
    }).catch(() => {});
    await page.waitForTimeout(200);
    hasChat = await drawer.getByText(/Chat style|Estilo de chat/i).count();
    if (hasChat) break;
  }
}
if (hasChat) {
  await drawer.getByText(/Chat style|Estilo de chat/i).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await drawer.getByRole("button", { name: /^Standard$|^Estándar$/i }).first().click().catch(() => {});
  await page.waitForTimeout(400);
}
await shot(page, "09-theme-layout-chat-real.png");
await shot(page, "09-edit-chat.png");

const out = { styleControls, typeBits, hasChat, styleOk: styleControls > 0 || typeBits > 0, chatOk: hasChat > 0 };
fs.writeFileSync(path.join(OUT, "09-theme-controls.json"), JSON.stringify(out, null, 2));
console.log(out);
await browser.close();
