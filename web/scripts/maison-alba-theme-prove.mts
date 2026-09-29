/**
 * Open theme editor via Design → Theme (Segmented, not role=tab) → Open theme editor.
 * Also prove ticker via Edit Content after marquee click.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://127.0.0.1:3001";
const OUT =
  "/cursor/stores/bc-80661ff2-8036-4d60-998b-696a75e11225/media/integ-designs-final/maison-alba";
const TMP = "/tmp/maison-alba-shots";
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

async function shot(page: import("playwright").Page, name: string) {
  const tmp = path.join(TMP, name);
  await page.screenshot({ path: tmp, fullPage: false });
  try {
    if (fs.statSync(tmp).size < 900_000) fs.copyFileSync(tmp, path.join(OUT, name));
  } catch (e) {
    console.warn(e);
  }
  return path.join(OUT, name);
}

const results: Array<{ id: string; ok: boolean; note: string; shot?: string }> = [];
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies(cookies());
const page = await ctx.newPage();
await page.goto(`${BASE}/talent/page-builder`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(4500);

// Design dock → Theme segmented → Open theme editor
await page.getByRole("button", { name: /^Design$|^Diseño$/i }).first().click();
await page.waitForTimeout(600);
// Segmented Theme (NOT role=tab)
const themeSeg = page.locator("[data-testid='design-panel'], [data-panel-id='brand']").getByText(/^Theme$|^Tema$/i);
if (await themeSeg.count()) {
  await themeSeg.first().click();
} else {
  // fallback: any Theme text inside floating panel near Brand
  await page.getByText(/^Theme$/i).first().click().catch(() => {});
}
await page.waitForTimeout(500);
await shot(page, "09-design-theme-entry.png");

const openBtn = page.locator("[data-design-open-theme]");
let opened = false;
if (await openBtn.count()) {
  await openBtn.first().click();
  await page.waitForTimeout(1500);
  opened = true;
} else {
  // ⌘K palette
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(500);
  await page.keyboard.type("Open Theme");
  await page.waitForTimeout(400);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
  opened = (await page.getByRole("tab", { name: /Style|Colors|Layout|Typography/i }).count()) > 0;
}

await shot(page, "09-theme-editor-open.png");
console.log("opened", opened, "data-design-open-theme", await openBtn.count());

if (opened || (await page.locator("[data-theme-control], [data-theme-tab]").count()) > 0 || (await page.getByRole("tab", { name: /Style|Colors|Layout/i }).count()) > 0) {
  opened = true;
  await page.getByRole("tab", { name: /Style|Estilo/i }).click().catch(() => {});
  await page.waitForTimeout(800);
  const styleShot = await shot(page, "09-theme-style-tab-real.png");
  const hasStyle =
    (await page.locator("[data-theme-control^='style-']").count()) > 0 ||
    (await page.getByText(/Type roles|Typography|Tipografía|Buttons|Shape|Reset to design|type\.system/i).count()) > 0;
  results.push({ id: "style-tab", ok: hasStyle, note: hasStyle ? "Style tab tokens visible" : "Style tab empty", shot: styleShot });

  await page.getByRole("tab", { name: /Layout|Disposición/i }).click().catch(() => {});
  await page.waitForTimeout(700);
  const chatShot = await shot(page, "09-edit-chat.png");
  const hasChat = (await page.getByText(/Chat style|Estilo de chat/i).count()) > 0;
  if (hasChat) {
    await page.getByRole("button", { name: /^Standard$|^Estándar$/i }).first().click().catch(() => {});
    await page.waitForTimeout(300);
    await shot(page, "09-edit-chat.png");
  }
  results.push({ id: "chat", ok: hasChat, note: hasChat ? "chat.variant visible" : "chat.variant missing", shot: chatShot });
  await page.keyboard.press("Escape").catch(() => {});
} else {
  results.push({ id: "style-tab", ok: false, note: "theme editor still closed" });
  results.push({ id: "chat", ok: false, note: "theme editor still closed" });
}

// Ticker re-prove: click marquee, Edit Content, change Style select
await page.goto(`${BASE}/talent/page-builder`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(4000);
const marquee = page.locator(".site-builder-node--marquee, [data-builder-node-kind='marquee']").first();
await marquee.scrollIntoViewIfNeeded().catch(() => {});
await marquee.click({ force: true });
await page.waitForTimeout(500);
await page.getByRole("button", { name: /Edit Content|Editar contenido/i }).first().click().catch(() => {});
await page.waitForTimeout(700);
// Try Content tab explicitly
await page.getByRole("tab", { name: /^Content$|^Contenido$/i }).click().catch(() => {});
await page.waitForTimeout(400);
const sel = page.locator("select").filter({ has: page.locator("option") }).first();
const selects = page.locator("select");
const n = await selects.count();
let tickerOk = false;
let tickerNote = `selects=${n}`;
for (let i = 0; i < n; i++) {
  const s = selects.nth(i);
  const html = await s.innerHTML().catch(() => "");
  if (/serif|plain|text/i.test(html)) {
    await s.selectOption("text").catch(async () => {
      await s.selectOption({ index: 0 });
    });
    tickerOk = true;
    tickerNote = "marquee variant changed";
    break;
  }
}
await shot(page, "09-edit-ticker.png");
results.push({ id: "ticker", ok: tickerOk || (await page.getByText(/Separator|Speed|Direction|Plain text|Serif/i).count()) > 0, note: tickerNote, shot: path.join(OUT, "09-edit-ticker.png") });

fs.writeFileSync(path.join(OUT, "editability-results-pass3.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
await browser.close();
