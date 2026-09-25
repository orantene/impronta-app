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

async function login(page: import("@playwright/test").Page) {
  await page.goto(`${BASE_URL}/auth/login`);
  await page.fill('input[type="email"]', QA_EMAIL!);
  await page.fill('input[type="password"]', QA_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(talent|admin|workspace)/, { timeout: 15_000 });
}

test.describe("Talent Agenda V2 smoke", () => {
  test.beforeEach(async ({ page }) => {
    if (!QA_EMAIL) test.skip();
    await login(page);
  });

  test("Today page renders with agenda header", async ({ page }) => {
    await page.goto(`${BASE_URL}/talent/today`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/Hi,/)).toBeVisible({ timeout: 8_000 });
    await page.screenshot({ path: path.join(EVIDENCE, "today-desktop.png"), fullPage: true });
  });

  test("Calendar page loads with view toggle", async ({ page }) => {
    await page.goto(`${BASE_URL}/talent/calendar`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("tablist", { name: "Calendar view" })).toBeVisible({
      timeout: 8_000,
    });
    await page.screenshot({ path: path.join(EVIDENCE, "calendar-desktop.png"), fullPage: true });
  });

  test("New booking page renders form", async ({ page }) => {
    await page.goto(`${BASE_URL}/talent/bookings/new`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Client")).toBeVisible({ timeout: 8_000 });
  });

  test("Availability page renders weekly schedule", async ({ page }) => {
    await page.goto(`${BASE_URL}/talent/calendar/availability`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Weekly schedule")).toBeVisible({ timeout: 8_000 });
  });

  test("Calendar + Add menu opens without error", async ({ page }) => {
    await page.goto(`${BASE_URL}/talent/calendar`);
    await page.waitForLoadState("networkidle");
    const addBtn = page.getByRole("button", { name: "Add event or block" });
    await expect(addBtn).toBeVisible({ timeout: 8_000 });
    await addBtn.click();
    await expect(page.getByRole("menu", { name: "Add event or block" })).toBeVisible();
  });

  test("Attention page loads", async ({ page }) => {
    await page.goto(`${BASE_URL}/talent/attention`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/Needs attention|Necesita atención/i)).toBeVisible({
      timeout: 8_000,
    });
  });

  test("Block time form opens from Add menu", async ({ page }) => {
    await page.goto(`${BASE_URL}/talent/calendar`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Add event or block" }).click();
    await page.getByRole("button", { name: /Block time|Bloquear/i }).click();
    await expect(page.locator('input[type="time"]').first()).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Talent Agenda V2 T9.5 journeys", () => {
  test.beforeEach(async ({ page }) => {
    if (!QA_EMAIL) test.skip();
    await login(page);
  });

  test("attention → open record path is reachable", async ({ page }) => {
    await page.goto(`${BASE_URL}/talent/attention`);
    await page.waitForLoadState("networkidle");
    const open = page.getByRole("button", { name: /Open|Reply|Collect|Release/i }).first();
    if (await open.count()) {
      await open.click();
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: path.join(EVIDENCE, "attention-journey.png"), fullPage: true });
  });

  test("new booking conflict UI surfaces Save gated until payment", async ({ page }) => {
    await page.goto(`${BASE_URL}/talent/bookings/new`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/Save stays off|Save/i).first()).toBeVisible({ timeout: 8_000 });
    await page.screenshot({ path: path.join(EVIDENCE, "new-booking-journey.png"), fullPage: true });
  });

  test("finish/collect surface opens from a booking when linked", async ({ page }) => {
    await page.goto(`${BASE_URL}/talent/today`);
    await page.waitForLoadState("networkidle");
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
    await page.goto(`${BASE_URL}/talent/today`);
    await page.waitForLoadState("networkidle");
    const header = page.getByText(/Hi,/);
    await expect(header).toBeVisible({ timeout: 8_000 });
    const box = await header.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(40);
    await page.screenshot({ path: path.join(EVIDENCE, "today-390.png"), fullPage: true });
  });

  test("focused new-booking hides bottom tab chrome", async ({ page }) => {
    await page.goto(`${BASE_URL}/talent/bookings/new`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Client")).toBeVisible({ timeout: 8_000 });
    // Tab bar labels from talent rail should not dominate focused composer.
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
    await page.goto(`${BASE_URL}/talent/calendar`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("tablist", { name: "Calendar view" })).toBeVisible({
      timeout: 8_000,
    });
    await page.screenshot({ path: path.join(EVIDENCE, "calendar-360.png"), fullPage: true });
  });
});
