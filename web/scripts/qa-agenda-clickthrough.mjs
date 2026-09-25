#!/usr/bin/env node
/**
 * One-shot Agenda V2 click-through for Step 0 QA.
 * Uses QA_TALENT_* + PLAYWRIGHT_BASE_URL (default http://127.0.0.1:3000).
 */
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const EMAIL = process.env.QA_TALENT_EMAIL;
const PASSWORD = process.env.QA_TALENT_PASSWORD ?? "";
const CLOCK = "2026-09-23T09:50:00";
const evidenceDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../docs/plans/program/evidence/today-calendar",
);

if (!EMAIL || !PASSWORD) {
  console.error("QA_TALENT_EMAIL and QA_TALENT_PASSWORD required");
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.setDefaultTimeout(120_000);

try {
  console.log(`[qa] login ${EMAIL} @ ${BASE}`);
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"]').waitFor({ state: "visible" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await Promise.all([
    page.waitForURL(/\/(talent|admin|workspace)/, { timeout: 180_000 }),
    page.click('button[type="submit"]'),
  ]);
  console.log(`[qa] landed ${page.url()}`);

  const todayUrl = `${BASE}/talent/today?agendaNow=${encodeURIComponent(CLOCK)}`;
  await page.goto(todayUrl, { waitUntil: "domcontentloaded" });
  await page.getByText(/Hi,|Today|Agenda|First day|Needs attention/i).first().waitFor({
    state: "visible",
    timeout: 90_000,
  });
  const todayShot = path.join(evidenceDir, "qa-today-agendaNow.png");
  await page.screenshot({ path: todayShot, fullPage: true });
  console.log(`[qa] Today OK → ${todayShot}`);
  console.log(`[qa] Today URL ${page.url()}`);

  await page.goto(`${BASE}/talent/calendar?agendaNow=${encodeURIComponent(CLOCK)}`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("tablist", { name: "Calendar view" }).waitFor({
    state: "visible",
    timeout: 90_000,
  });
  const calShot = path.join(evidenceDir, "qa-calendar-agendaNow.png");
  await page.screenshot({ path: calShot, fullPage: true });
  console.log(`[qa] Calendar OK → ${calShot}`);

  console.log("[qa] click-through passed");
} catch (err) {
  console.error("[qa] FAIL", err);
  await page.screenshot({ path: path.join(evidenceDir, "qa-clickthrough-fail.png"), fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
