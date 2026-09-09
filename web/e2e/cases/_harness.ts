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
  const url = page.url().toLowerCase();
  expect(url, "login URL cannot pass a journey").not.toMatch(/\/login|\/signin|\/auth\//);
  await expect(
    page.getByText(/host not registered/i),
    "unregistered host page cannot pass a journey",
  ).toHaveCount(0);
  // A public header "Sign in" link is not an auth wall. The wall is a
  // sign-in heading as the page itself — scanning the whole body also
  // matched builder CSS and failed every storefront journey.
  await expect(
    page.getByRole("heading", { name: /^(sign in|log in|iniciar sesión)$/i }),
    "login heading cannot pass a journey",
  ).toHaveCount(0);
}

export async function assertWorkspaceIdentity(page: Page): Promise<void> {
  await assertNotAuthWall(page);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const shell = ((await page.locator("body").textContent()) ?? "").toLowerCase();
  expect(shell).toContain(JOURNEYS_DISPLAY.toLowerCase().slice(0, 8));
}

export async function openWorkspace(page: Page, segment: string): Promise<void> {
  await signInJourneysStaff(page, `/admin/${segment}`);
  await assertWorkspaceIdentity(page);
}

export async function openStorefront(page: Page): Promise<void> {
  await page.goto("/");
  await assertNotAuthWall(page);
  await expect(page.locator("body")).toBeVisible();
}

export const JOURNEYS_OWNER_EMAIL =
  process.env.JOURNEYS_OWNER_EMAIL ?? "qa-journeys-owner@impronta.test";
export const JOURNEYS_TALENT_EMAIL =
  process.env.JOURNEYS_TALENT_EMAIL ?? "qa-journeys-talent@impronta.test";

/**
 * Passwordless fixture sign-in. Reads cookies from the 307 and then opens
 * `nextPath` on PLAYWRIGHT_BASE_URL so a Location that dropped the proxy
 * port cannot bounce the browser onto :80.
 */
export async function signInJourneysStaff(
  page: Page,
  nextPath = "/admin/pos",
  email = JOURNEYS_OWNER_EMAIL,
): Promise<void> {
  const params = new URLSearchParams({ email, next: nextPath });
  const res = await page.request.get(`/api/dev/signin?${params.toString()}`, {
    maxRedirects: 0,
  });
  expect(res.status(), "dev sign-in must mint a session").toBe(307);
  await page.goto(nextPath);
  await assertNotAuthWall(page);
}

export function skipUnlessFixture(): void {
  test.skip(!FIXTURE_READY, "P0-06 apply needs credentials; set JOURNEYS_FIXTURE_READY=1 after seed");
}
