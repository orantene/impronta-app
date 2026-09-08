/**
 * C48 [delta] — C48-independent-event-host-or-mc. Browser journey once the fixture exists.
 */
import { test, expect, openWorkspace, prepareJourneysPage, skipUnlessFixture } from "./_harness";

skipUnlessFixture();

test.beforeEach(async ({ page }) => {
  await prepareJourneysPage(page);
});

test("C48-CUS customer can reach the storefront", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toBeVisible();
});

test("C48-OP operator can open Sales", async ({ page }) => {
  await openWorkspace(page, "sales");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
