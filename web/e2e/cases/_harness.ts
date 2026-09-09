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
  expect(
    page.url(),
    "workspace identity must be asserted on a workspace surface",
  ).toMatch(/\/(admin|talent|client)(\/|\?|$)/);
  await expect(
    page.getByRole("heading", { name: /this page is no longer here/i }),
    "branded 404 cannot pass a workspace identity check",
  ).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const landmarks = await page
    .locator("header, [role='banner'], nav, aside, h1")
    .allTextContents();
  const shell = [await page.title(), ...landmarks].join(" ").toLowerCase();
  expect(shell, `workspace chrome must name ${JOURNEYS_DISPLAY}`).toContain(
    JOURNEYS_DISPLAY.toLowerCase().slice(0, 8),
  );
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
 * How many times to ask for a session before calling it a failure.
 *
 * A 404 from `/api/dev/signin` has two very different causes and only one of
 * them is worth retrying.
 *
 * PERMANENT: TULALA_ALLOW_DEV_SURFACES is not set on the dev server. The Edge
 * proxy inlines NODE_ENV=production, so without the flag `/api/dev/*` is not
 * short-circuited, falls through host resolution, and every request lands on
 * the storefront's not-found page. Retrying cannot help and the message below
 * has to name the flag, because the symptom looks like a missing route.
 *
 * TRANSIENT: the Turbopack dev server briefly loses the route from its tree
 * after it rebuilds — observed as four consecutive 404s immediately after
 * `Compiling /_not-found/page`, followed by 307 for the sixteen requests
 * either side of them, all inside one server process with the flag set the
 * whole time. It is a dev-server fault, not a product one, so it must not be
 * allowed to read as "the fixture cannot sign in".
 */
const SIGNIN_ATTEMPTS = 6;

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
  const seen: number[] = [];
  for (let attempt = 1; attempt <= SIGNIN_ATTEMPTS; attempt += 1) {
    const res = await page.request.get(`/api/dev/signin?${params.toString()}`, {
      maxRedirects: 0,
    });
    if (res.status() === 307) break;
    seen.push(res.status());
    // 404 (Turbopack briefly missing the route) and 502/503 (Next restarting
    // or the proxy's upstream gone) are the only statuses worth retrying.
    // 403/400/401/500 are the handler answering; retrying only delays the report.
    if (res.status() !== 404 && res.status() !== 502 && res.status() !== 503) {
      expect(res.status(), `dev sign-in refused: ${await res.text()}`).toBe(307);
    }
    if (attempt < SIGNIN_ATTEMPTS) await page.waitForTimeout(250 * attempt);
  }
  expect(
    seen.length,
    `dev sign-in returned ${seen.join(", ")} — ${SIGNIN_ATTEMPTS} 404s is not a rebuild ` +
      `gap. Start the dev server with TULALA_ALLOW_DEV_SURFACES=1 or /api/dev/* falls ` +
      `through to the storefront's not-found page.`,
  ).toBeLessThan(SIGNIN_ATTEMPTS);
  await page.goto(nextPath);
  await assertNotAuthWall(page);
}

export function skipUnlessFixture(): void {
  test.skip(!FIXTURE_READY, "P0-06 apply needs credentials; set JOURNEYS_FIXTURE_READY=1 after seed");
}
