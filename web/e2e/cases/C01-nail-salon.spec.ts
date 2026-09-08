/**
 * C01 [R] — Nail salon. Complete browser journey once the fixture exists.
 * Pattern for the other nine representatives: one file per case.
 */
import { test, expect, openWorkspace, prepareJourneysPage, skipUnlessFixture } from "./_harness";

skipUnlessFixture();

test.beforeEach(async ({ page }) => {
  await prepareJourneysPage(page);
});

test("C01-CUS customer can reach the storefront", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toBeVisible();
});

test("C01-OP operator can open Sales", async ({ page }) => {
  await openWorkspace(page, "sales");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
