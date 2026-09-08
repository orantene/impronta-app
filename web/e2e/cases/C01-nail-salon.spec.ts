/**
 * C01 [R] — Nail salon. Complete browser journey once the fixture exists.
 * Pattern for the other nine representatives: one file per case.
 */
import { test, expect, openWorkspace, skipUnlessFixture } from "./_harness";

skipUnlessFixture();

test("C01-CUS customer can reach the storefront", async ({ journeysPage }) => {
  await journeysPage.goto("/");
  await expect(journeysPage.locator("body")).toBeVisible();
});

test("C01-OP operator can open Sales", async ({ journeysPage }) => {
  await openWorkspace(journeysPage, "sales");
  await expect(journeysPage.getByRole("heading", { level: 1 })).toBeVisible();
});
