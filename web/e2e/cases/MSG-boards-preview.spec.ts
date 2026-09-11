import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("MSG preview MS02 shows Messages heading and Actions", async ({ page }) => {
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto("/c/t/preview?board=MS02");
  await expect(page.getByRole("heading", { name: /messages/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /actions/i })).toBeVisible();
});

test("MSG preview MS03 empty state keeps a recovery action", async ({ page }) => {
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto("/c/t/preview?board=MS03");
  await expect(page.getByRole("heading", { name: /messages/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("[data-pos-messages-empty]")).toBeVisible();
});

test("MSG preview MC15 checkout is not a raw phase string", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/c/t/preview?board=MC15");
  await expect(page.locator("[data-pos-messages=checkout]")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("open", { exact: true })).toHaveCount(0);
});
