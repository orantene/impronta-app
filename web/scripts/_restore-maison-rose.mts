/**
 * Restore Alba Maison accent/primary to Rosé artifact colors and publish.
 */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://127.0.0.1:3001";
const AUTH = "/home/ubuntu/.claude/design-diff/.auth-alba-nail-artist.json";
const PROFILE = "8a59afc1-6e2e-49cd-b78d-27f689cc80f5";
const LIVE = `${BASE}/template-preview/current?kind=live-site&talent=${PROFILE}&locale=es`;
const OUT =
  "/cursor/stores/bc-80661ff2-8036-4d60-998b-696a75e11225/media/integ-designs-final/cross-wire";

// Maison v2 Rosé defaults (from prior dod accentBefore)
const ROSE = {
  Primary: "#B3174A",
  Accent: "#B3174A",
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ storageState: AUTH, viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

async function openTheme() {
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /^Design$/i }).first().click({ force: true, timeout: 15000 });
  await page.waitForTimeout(500);
  await page.getByText(/^Theme$/i).first().click();
  await page.waitForTimeout(500);
  await page.locator("[data-design-open-theme]").first().click({ timeout: 10000 });
  await page.waitForTimeout(1200);
  return page.locator('[data-edit-drawer="theme"]');
}

await page.goto(`${BASE}/talent/page-builder`, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(4500);
const drawer = await openTheme();
await drawer.getByRole("tab", { name: /^Colors$/i }).click();
await page.waitForTimeout(600);

const set: Record<string, string> = {};
for (const lab of ["Primary", "Accent"]) {
  const field = drawer.locator(`label:has-text("${lab}")`).locator("xpath=following::input[1]").first();
  if (await field.count()) {
    const before = await field.inputValue().catch(() => "");
    const hex = ROSE[lab as keyof typeof ROSE];
    await field.fill(hex);
    await page.waitForTimeout(400);
    set[lab] = `${before}→${hex}`;
  }
}
console.log("set", set);
const save = drawer.getByRole("button", { name: /Save draft|Save|Guardar/i });
if (await save.count() && !(await save.isDisabled().catch(() => true))) {
  await save.click();
  await page.waitForTimeout(1500);
}
await page.keyboard.press("Escape");
await page.waitForTimeout(800);
await page.getByRole("button", { name: /^Publish$/i }).first().click();
await page.waitForTimeout(1200);
const confirm = page.getByRole("button", { name: /^Publish$|Confirm/i });
if (await confirm.count()) await confirm.last().click().catch(() => {});
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/brand-restore-publish.png` });

const live = await ctx.newPage();
await live.goto(LIVE, { waitUntil: "networkidle", timeout: 90000 }).catch(() =>
  live.goto(LIVE, { waitUntil: "domcontentloaded", timeout: 90000 }),
);
await live.waitForTimeout(4000);
const sample = await live.evaluate(`(() => {
  const cs = getComputedStyle(document.documentElement);
  return {
    accent: cs.getPropertyValue("--token-color-accent").trim(),
    primary: cs.getPropertyValue("--token-color-primary").trim(),
    body: (document.body.innerText || "").slice(0, 120),
  };
})()`);
await live.screenshot({ path: `${OUT}/brand-restore-live.png` });
console.log("live", sample);
fs.writeFileSync(`${OUT}/brand-restore.json`, JSON.stringify({ set, sample }, null, 2));
await browser.close();
