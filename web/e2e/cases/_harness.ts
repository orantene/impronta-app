/**
 * Case-journey spec pattern.
 *
 * Fixtures prepare state. This file only opens the real interface.
 * Each case adds `e2e/cases/Cxx-….spec.ts` rather than a bespoke harness.
 *
 * Auth: PLAYWRIGHT_USE_DEV_SIGNIN=1 and /api/dev/signin already exist.
 * Device: tablet-pos and mobile-checkout projects in playwright.config.ts.
 */

import { test, expect, type Page } from "@playwright/test";

export { test, expect };

export const JOURNEYS_SLUG = process.env.JOURNEYS_TENANT_SLUG ?? "qa-journeys";
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

export async function openWorkspace(page: Page, segment: string): Promise<void> {
  await page.goto(`/${JOURNEYS_SLUG}/admin/${segment}`);
}

export function skipUnlessFixture(): void {
  test.skip(!FIXTURE_READY, "P0-06 apply needs credentials; set JOURNEYS_FIXTURE_READY=1 after seed");
}
