/**
 * Case-journey spec pattern.
 *
 * Fixtures prepare state. This file only opens the real interface.
 * Each case adds `e2e/cases/Cxx-….spec.ts` rather than a bespoke harness.
 *
 * Auth: PLAYWRIGHT_USE_DEV_SIGNIN=1 and /api/dev/signin already exist.
 * Device: tablet-pos and mobile-checkout projects in playwright.config.ts.
 *
 * A login page, host-not-registered page, or empty error shell cannot pass.
 */

import { test, expect, type Page } from "@playwright/test";

export { test, expect };

export const JOURNEYS_SLUG = process.env.JOURNEYS_TENANT_SLUG ?? "qa-journeys";
export const JOURNEYS_DISPLAY = process.env.JOURNEYS_TENANT_NAME ?? "QA Journeys";
export const FIXTURE_READY = process.env.JOURNEYS_FIXTURE_READY === "1";

export async function prepareJourneysPage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("impronta_analytics_consent", "denied");
    } catch {
      /* ignore */
    }
  });
}

export async function assertNotAuthWall(page: Page): Promise<void> {
  const body = ((await page.locator("body").textContent()) ?? "").toLowerCase();
  expect(body, "login/error page cannot pass a journey").not.toMatch(
    /sign in|log in|iniciar sesión|host not registered|not registered/,
  );
  const url = page.url().toLowerCase();
  expect(url).not.toMatch(/\/login|\/signin|\/auth\//);
}

export async function assertWorkspaceIdentity(page: Page): Promise<void> {
  await assertNotAuthWall(page);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const shell = ((await page.locator("body").textContent()) ?? "").toLowerCase();
  expect(shell).toContain(JOURNEYS_DISPLAY.toLowerCase().slice(0, 8));
}

export async function openWorkspace(page: Page, segment: string): Promise<void> {
  await page.goto(`/${JOURNEYS_SLUG}/admin/${segment}`);
  await assertWorkspaceIdentity(page);
}

export async function openStorefront(page: Page): Promise<void> {
  await page.goto("/");
  await assertNotAuthWall(page);
  await expect(page.locator("body")).toBeVisible();
}

export function skipUnlessFixture(): void {
  test.skip(!FIXTURE_READY, "P0-06 apply needs credentials; set JOURNEYS_FIXTURE_READY=1 after seed");
}
