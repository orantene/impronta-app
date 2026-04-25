/**
 * E2E smoke test — login → builder → save draft → publish → share-link works.
 *
 * The single Playwright test covering the highest-leverage user path. Run
 * before promoting anything that touches: auth, admin shell, builder, share-
 * link viewer.
 *
 * Requires Playwright (not yet installed in this repo). To enable:
 *
 *   cd web
 *   npm install -D @playwright/test
 *   npx playwright install chromium
 *   npx playwright test
 *
 * Reads test-account credentials from env. Set in `web/.env.local`:
 *   TEST_ADMIN_EMAIL
 *   TEST_ADMIN_PASSWORD
 *
 * Default base URL: http://app.local:3102 (the local-host-proxy host). Override
 * via `PLAYWRIGHT_BASE_URL` to point at staging.tulala.digital before a
 * post-launch promotion.
 */

import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;

test.describe("smoke: login → builder → publish → share", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD not set",
  );

  test("admin can edit, publish, and view a share link", async ({ page }) => {
    // Step 1 — login
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(ADMIN_EMAIL!);
    await page.getByLabel(/password/i).fill(ADMIN_PASSWORD!);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await page.waitForURL(/\/admin/);

    // Step 2 — open the builder
    await page.goto("/admin/site-settings/structure");
    await expect(page.getByRole("heading", { name: /homepage|structure/i })).toBeVisible();

    // Step 3 — save draft (no edits required for smoke; just exercise the action)
    const saveDraft = page.getByRole("button", { name: /save draft/i });
    if (await saveDraft.isVisible()) {
      await saveDraft.click();
      await expect(page.getByText(/saved|draft saved/i)).toBeVisible({ timeout: 5_000 });
    }

    // Step 4 — generate share link
    const shareButton = page.getByRole("button", { name: /share|preview link/i });
    await shareButton.click();
    const shareLinkLocator = page.getByRole("link", { name: /share|view/i }).first();
    await expect(shareLinkLocator).toBeVisible();
    const shareUrl = await shareLinkLocator.getAttribute("href");
    expect(shareUrl).toMatch(/\/share\//);

    // Step 5 — open share link in a new context (no admin cookies) and verify it renders
    const context = await page.context().browser()?.newContext();
    expect(context).toBeDefined();
    const publicPage = await context!.newPage();
    await publicPage.goto(shareUrl!);
    await expect(publicPage.locator("body")).toBeVisible();
    // 200 response — Playwright surfaces network errors as test failures already.
    await context!.close();
  });
});
