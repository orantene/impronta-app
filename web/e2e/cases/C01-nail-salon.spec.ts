/**
 * C01 [R] — Nail salon. Complete browser journey once the fixture exists.
 * Pattern for the other nine representatives: one file per case.
 */
import { test, openWorkspace, openStorefront, prepareJourneysPage, skipUnlessFixture } from "./_harness";

skipUnlessFixture();

test.beforeEach(async ({ page }) => {
  await prepareJourneysPage(page);
});

test("C01-CUS smoke: storefront body is reachable — not a journey pass", async ({ page }) => {
  await openStorefront(page);
});

test("C01-OP smoke: operator Sales heading is reachable — not a journey pass", async ({ page }) => {
  await openWorkspace(page, "sales");
});
