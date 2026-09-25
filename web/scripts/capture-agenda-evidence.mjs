#!/usr/bin/env node
/**
 * Capture Talent Agenda V2 evidence PNGs (A3.2).
 *
 *   PLAYWRIGHT_BASE_URL=https://app.tulala.digital \
 *   QA_TALENT_EMAIL=... QA_TALENT_PASSWORD=... \
 *   node scripts/capture-agenda-evidence.mjs
 *
 * Default base: http://app.local:3102
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const WEB_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const EVIDENCE = path.resolve(WEB_ROOT, "../docs/plans/program/evidence/today-calendar");
const BASE_URL = (process.env.PLAYWRIGHT_BASE_URL ?? "http://app.local:3102").replace(/\/$/, "");
const EMAIL = process.env.QA_TALENT_EMAIL;
const PASSWORD = process.env.QA_TALENT_PASSWORD ?? "";
const TIMEOUT = 180_000;

const ROUTES = [
  { path: "/talent/today", file: "today-evidence.png" },
  { path: "/talent/calendar", file: "calendar-evidence.png" },
  { path: "/talent/attention", file: "attention-evidence.png" },
  { path: "/talent/bookings/new", file: "new-booking-evidence.png" },
];

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await page.locator('input[type="email"]').waitFor({ state: "visible", timeout: TIMEOUT });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await Promise.all([
    page.waitForURL(/\/(talent|admin|workspace)/, { timeout: TIMEOUT }),
    page.click('button[type="submit"]'),
  ]);
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error("Set QA_TALENT_EMAIL and QA_TALENT_PASSWORD");
    process.exit(1);
  }

  mkdirSync(EVIDENCE, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(TIMEOUT);
  page.setDefaultNavigationTimeout(TIMEOUT);

  console.log(`[capture-agenda-evidence] base=${BASE_URL} → ${EVIDENCE}`);
  await login(page);

  const written = [];
  for (const { path: routePath, file } of ROUTES) {
    const out = path.join(EVIDENCE, file);
    await page.goto(`${BASE_URL}${routePath}`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: out, fullPage: true });
    written.push(file);
    console.log(`  ✓ ${file} (${routePath})`);
  }

  await browser.close();
  console.log(`[capture-agenda-evidence] ${written.length} PNG(s)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
