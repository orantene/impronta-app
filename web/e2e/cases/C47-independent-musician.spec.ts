/**
 * C47 [delta] — C47-independent-musician. Browser journey once the fixture exists.
 */
import { test, expect, openWorkspace, prepareJourneysPage, skipUnlessFixture } from "./_harness";

skipUnlessFixture();

test.beforeEach(async ({ page }) => {
  await prepareJourneysPage(page);
});

test("C47-CUS customer can reach the storefront", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toBeVisible();
});

test("C47-OP operator can open Sales", async ({ page }) => {
  await openWorkspace(page, "sales");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
