/**
 * TUL-823 — Horario at 390px: the hour/minute selects must not be clipped.
 *
 * Requires QA_TALENT_EMAIL + QA_TALENT_PASSWORD (skips when unset). Read-only:
 * opens the Horario form and measures it; never saves.
 * Not run in CI by default (needs a live host). Run against localhost only:
 *   QA_TALENT_EMAIL=... QA_TALENT_PASSWORD=... PLAYWRIGHT_BASE_URL=http://localhost:3001 \
 *     npx playwright test e2e/talent-agenda-horario-390.spec.ts
 */

import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://app.local:3102";
const QA_EMAIL = process.env.QA_TALENT_EMAIL;
const QA_PASSWORD = process.env.QA_TALENT_PASSWORD ?? "";
const VIEWPORT = { width: 390, height: 844 };

test.setTimeout(180_000);
test.skip(!QA_EMAIL, "QA_TALENT_EMAIL not set");

// 24h hour/minute selects only render for 24-hour locales (Spanish).
test.use({ viewport: VIEWPORT, locale: "es-MX" });

test("TUL-823: Horario hour and minute selects sit fully inside the 390px viewport", async ({ page }) => {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.locator('input[type="email"]').waitFor({ state: "visible", timeout: 60_000 });
  await page.fill('input[type="email"]', QA_EMAIL!);
  await page.fill('input[type="password"]', QA_PASSWORD);
  await Promise.all([
    page.waitForURL(/\/(talent|admin|workspace)/, { timeout: 120_000 }),
    page.click('button[type="submit"]'),
  ]);

  await page.goto(`${BASE_URL}/talent/calendar/availability`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  if (await page.getByRole("heading", { name: /Page not found/i }).isVisible().catch(() => false)) {
    test.skip(true, "Agenda V2 availability route missing on this host");
  }
  await expect(page.getByText(/Horario|Weekly schedule/i).first()).toBeVisible({ timeout: 60_000 });

  const hourSelects = page.locator('select[aria-label*="Hora" i], select[aria-label*="Hour" i]');
  const minuteSelects = page.locator('select[aria-label*="Minuto" i], select[aria-label*="Minute" i]');
  await expect(hourSelects.first()).toBeVisible({ timeout: 30_000 });
  await expect(minuteSelects.first()).toBeVisible();

  for (const group of [hourSelects, minuteSelects]) {
    const count = await group.count();
    for (let i = 0; i < count; i++) {
      const el = group.nth(i);
      if (!(await el.isVisible())) continue;
      const box = await el.boundingBox();
      expect(box, "select has a box").not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(VIEWPORT.width);
      // 2 digits + the native chevron need real width; a clipped select collapses.
      expect(box!.width).toBeGreaterThanOrEqual(40);
    }
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
