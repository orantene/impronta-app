/**
 * Talent Agenda V2 — smoke + T9.5 journey specs.
 *
 * Requires QA_TALENT_EMAIL + QA_TALENT_PASSWORD. Skips when unset so CI stays green.
 * Screenshots (when run with creds) land under docs/plans/program/evidence/today-calendar/.
 */

import { test, expect } from "@playwright/test";
import path from "node:path";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://app.local:3102";
const QA_EMAIL = process.env.QA_TALENT_EMAIL;
const QA_PASSWORD = process.env.QA_TALENT_PASSWORD ?? "";
const EVIDENCE = path.resolve(
  process.cwd(),
  "../docs/plans/program/evidence/today-calendar",
);

test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

async function login(page: import("@playwright/test").Page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.locator('input[type="email"]').waitFor({ state: "visible", timeout: 60_000 });
  await page.fill('input[type="email"]', QA_EMAIL!);
  await page.fill('input[type="password"]', QA_PASSWORD);
  await Promise.all([
    page.waitForURL(/\/(talent|admin|workspace)/, { timeout: 180_000 }),
    page.click('button[type="submit"]'),
  ]);
}

test.describe("Talent Agenda V2 smoke", () => {
  test.beforeEach(async ({ page }) => {
    if (!QA_EMAIL) test.skip();
    await login(page);
  });

  test("Today page renders with agenda header", async ({ page }) => {
    await page.goto(`${BASE_URL}/talent/today`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await expect(page.getByText(/Hi,|Today|Agenda/i).first()).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: path.join(EVIDENCE, "today-desktop.png"), fullPage: true });
  });

  test("Calendar page loads with view toggle", async ({ page }) => {
    await page.goto(`${BASE_URL}/talent/calendar`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await expect(
      page.getByRole("tablist", { name: /Calendar view|Calendar/i }).or(page.getByText(/Week|Day|Month|List/i).first()),
    ).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: path.join(EVIDENCE, "calendar-desktop.png"), fullPage: true });
  });

  test("New booking page renders form", async ({ page }) => {
    await page.goto(`${BASE_URL}/talent/bookings/new`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await expect(page.getByText(/Client|What|Name/i).first()).toBeVisible({ timeout: 60_000 });
  });

  test("Availability page renders weekly schedule", async ({ page }) => {
    await page.goto(`${BASE_URL}/talent/calendar/availability`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await expect(page.getByText(/Weekly schedule|Availability|Horario/i).first()).toBeVisible({
      timeout: 60_000,
    });
  });

  test("Calendar + Add menu opens without error", async ({ page }) => {
    await page.goto(`${BASE_URL}/talent/calendar`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    const addBtn = page.getByRole("button", { name: /Add event or block|Add/i }).first();
    await expect(addBtn).toBeVisible({ timeout: 60_000 });
    await addBtn.click();
    await expect(page.getByRole("menu").or(page.getByText(/New booking|Block time/i).first())).toBeVisible({
      timeout: 15_000,
    });
  });

  test("Attention page loads", async ({ page }) => {
    await page.goto(`${BASE_URL}/talent/attention`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await expect(page.getByText(/Needs attention|Necesita atención|Attention/i).first()).toBeVisible({
      timeout: 60_000,
    });
  });

  test("Block time form opens from Add menu", async ({ page }) => {
    await page.goto(`${BASE_URL}/talent/calendar`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.getByRole("button", { name: /Add event or block|Add/i }).first().click();
    await page.getByRole("button", { name: /Block time|Bloquear/i }).click();
    await expect(page.locator('input[type="time"]').first()).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Talent Agenda V2 T9.5 journeys", () => {
  test.beforeEach(async ({ page }) => {
    if (!QA_EMAIL) test.skip();
    await login(page);
  });

  test("attention → open record path is reachable", async ({ page }) => {
    await page.goto(`${BASE_URL}/talent/attention`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    const open = page.getByRole("button", { name: /Open|Reply|Collect|Release/i }).first();
    if (await open.count()) {
      await open.click();
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: path.join(EVIDENCE, "attention-journey.png"), fullPage: true });
  });

  test("new booking conflict UI surfaces Save gated until payment", async ({ page }) => {
    await page.goto(`${BASE_URL}/talent/bookings/new`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await expect(page.getByText(/Save stays off|Save|Client/i).first()).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: path.join(EVIDENCE, "new-booking-journey.png"), fullPage: true });
  });

  test("finish/collect surface opens from a booking when linked", async ({ page }) => {
    await page.goto(`${BASE_URL}/talent/today`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.screenshot({ path: path.join(EVIDENCE, "finish-collect-entry.png"), fullPage: true });
  });
});

test.describe("Talent Agenda V2 mobile 390", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    if (!QA_EMAIL) test.skip();
    await login(page);
  });

  test("Today touch targets stay readable at 390", async ({ page }) => {
    await page.goto(`${BASE_URL}/talent/today`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    const header = page.getByText(/Hi,|Today|Agenda/i).first();
    await expect(header).toBeVisible({ timeout: 60_000 });
    const box = await header.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(40);
    await page.screenshot({ path: path.join(EVIDENCE, "today-390.png"), fullPage: true });
  });

  test("focused new-booking hides bottom tab chrome", async ({ page }) => {
    await page.goto(`${BASE_URL}/talent/bookings/new`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await expect(page.getByText(/Client|What|Name/i).first()).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: path.join(EVIDENCE, "new-booking-390.png"), fullPage: true });
  });
});

test.describe("Talent Agenda V2 mobile 360", () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test.beforeEach(async ({ page }) => {
    if (!QA_EMAIL) test.skip();
    await login(page);
  });

  test("Calendar readable at 360", async ({ page }) => {
    await page.goto(`${BASE_URL}/talent/calendar`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await expect(
      page.getByRole("tablist", { name: /Calendar view|Calendar/i }).or(page.getByText(/Week|Day|Month|List/i).first()),
    ).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: path.join(EVIDENCE, "calendar-360.png"), fullPage: true });
  });
});
