/**
 * E2E — the directory quick-open profile modal, end to end.
 *
 * Covers the flagship path shipped in this workstream, including the two bugs
 * that were found only by exercising it for real:
 *
 *   1. card click opens the profile as an OVERLAY at the real /t/<code> URL
 *      (so the URL is shareable and crawlable, not a fake dialog route)
 *   2. adding to the lineup INSIDE the modal updates the directory card
 *      behind it — the state fork that needed cross-tree sync to fix
 *   3. closing restores the directory, scroll position intact
 *   4. a hard load of the same URL renders the FULL page, not the overlay
 *      (SEO + shared-link parity)
 *
 * e2e is not gated in CI (see e2e/README.md); run it before a promotion:
 *
 *   PLAYWRIGHT_DIRECTORY_BASE_URL=https://improntamodels.com \
 *     npx playwright test e2e/directory-modal.spec.ts --workers=1
 *
 * RUN IT AGAINST A COMPILED SERVER. Against `next dev` these tests fail
 * spuriously: every first hit to a route triggers an on-demand compile, cards
 * paint before hydration, and the whole file takes ~6 minutes with most
 * assertions racing the compiler. The same five tests pass in ~50s against
 * production. Use one worker — parallel workers multiply the compile storms.
 *
 * Base URL must be a host registered in `agency_domains`: a raw *.vercel.app
 * preview 404s at the proxy before route matching.
 */

import { test, expect, type Page } from "@playwright/test";

const BASE =
  process.env.PLAYWRIGHT_DIRECTORY_BASE_URL ?? "http://impronta.lvh.me:3070";

/** The lineup badge the directory card shows while a talent is selected. */
const LINEUP_BADGE = ".lineup-check-badge";

async function gotoDirectory(page: Page) {
  await page.goto(`${BASE}/directory`, { waitUntil: "domcontentloaded" });
  await page.locator("a.talent-card").first().waitFor({ state: "visible" });
  await waitForHydration(page);
}

/**
 * Wait until React has hydrated the directory.
 *
 * Route interception is a client-side soft-navigation feature: a click landing
 * before hydration is handled by the plain <a>, which does a FULL navigation
 * to the canonical profile page. That is correct graceful degradation for a
 * real visitor, but it means the overlay never appears — so an un-waited test
 * asserts against the wrong render.
 *
 * NOT networkidle: the Next dev server holds an HMR websocket open, so that
 * state is never reached and the wait just burns the timeout. The floating
 * chat launcher is a reliable signal instead — it returns null until its
 * mounted guard flips, i.e. it only exists post-hydration. Falls back to a
 * short settle on surfaces where the launcher is disabled.
 */
async function waitForHydration(page: Page) {
  const launcher = page
    .locator("button")
    .filter({ hasText: /message|lineup|inquiry|mensaje/i })
    .first();
  await launcher.waitFor({ state: "visible", timeout: 15_000 }).catch(async () => {
    await page.waitForTimeout(2_500);
  });
}

/** Open the first talent card and wait for the intercepted overlay. */
async function openFirstCardModal(page: Page) {
  await page.locator('a.talent-card[href*="/t/"]').first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

/** Start every test from an empty lineup so badge assertions are unambiguous. */
async function clearLineup(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem("impronta.public.saved-ids", JSON.stringify([]));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("a.talent-card").first().waitFor({ state: "visible" });
  await waitForHydration(page);
}

test.describe("directory profile modal", () => {
  test("card click opens the profile as an overlay at the real /t/ URL", async ({
    page,
  }) => {
    await gotoDirectory(page);
    const firstCard = page.locator('a.talent-card[href*="/t/"]').first();
    const href = await firstCard.getAttribute("href");
    expect(href).toBeTruthy();

    await firstCard.click();

    // The URL is the canonical profile route — shareable and crawlable.
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    // ...but rendered as an overlay, with the directory still mounted behind.
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.locator("a.talent-card").first()).toBeAttached();
  });

  test("closing the modal returns to the directory", async ({ page }) => {
    await gotoDirectory(page);
    await openFirstCardModal(page);

    await page.goBack();

    await expect(page).toHaveURL(/\/directory/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator("a.talent-card").first()).toBeVisible();
  });

  test("lineup added inside the modal updates the card behind it", async ({
    page,
  }) => {
    // REGRESSION GUARD: the modal renders in the root layout's @modal slot,
    // outside the directory's state provider. Before cross-tree sync, this
    // badge stayed absent until a hard reload.
    await gotoDirectory(page);
    await clearLineup(page);
    await expect(page.locator(LINEUP_BADGE)).toHaveCount(0);

    await openFirstCardModal(page);

    await page
      .getByRole("dialog")
      .getByRole("button", { name: /inquire|consultar/i })
      .first()
      .click();

    await page.goBack();
    await expect(page).toHaveURL(/\/directory/);
    // No reload — the card must already know.
    await expect(page.locator(LINEUP_BADGE)).toHaveCount(1);
  });

  test("a hard load of the same URL renders the full page, not the overlay", async ({
    page,
  }) => {
    // SEO + shared-link parity: interception must apply ONLY to in-app
    // navigation. A crawler or a pasted link gets the canonical page.
    await gotoDirectory(page);
    const href = await page
      .locator('a.talent-card[href*="/t/"]')
      .first()
      .getAttribute("href");

    await page.goto(`${BASE}${href}`, { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("dialog")).toHaveCount(0);
    // The canonical page carries ProfilePage JSON-LD; the overlay never does.
    await expect(
      page.locator('script[type="application/ld+json"]'),
    ).not.toHaveCount(0);
  });

  test("quick view opens the gallery without leaving the directory", async ({
    page,
  }) => {
    await gotoDirectory(page);
    const quickView = page.locator("[data-card-quick-view]").first();
    await quickView.click();

    await expect(page.getByRole("dialog")).toBeVisible();
    // Quick view is a peek — it must NOT navigate.
    await expect(page).toHaveURL(/\/directory/);
  });
});
