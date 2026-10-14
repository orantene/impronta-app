/**
 * Billing regression suite skeleton (TUL-838).
 *
 * Only the pricing toggle runs for real (no Stripe needed). Every other
 * scenario is a `test.fixme` placeholder to be implemented against staging in
 * Stripe TEST mode. Test cards: 4242424242424242 (ok),
 * 4000000000000341 (attaches, then fails on charge).
 */
import { expect, test } from "@playwright/test";

test.describe("pricing toggle", () => {
  test("monthly/yearly flips prices", async ({ page }) => {
    await page.goto("/pricing");
    const root = page.getByTestId("billing-interval-root");
    await expect(root).toHaveAttribute("data-interval", "month");

    const cards = page.getByTestId("pricing-tier-card");
    await expect(cards.first()).toBeVisible();
    // Only cards that carry both variants are priced tiers.
    const priced = cards.filter({ has: page.getByTestId("price-yearly") });
    const n = await priced.count();
    expect(n).toBeGreaterThan(0);

    for (let i = 0; i < n; i++) {
      await expect(priced.nth(i).getByTestId("price-monthly")).toBeVisible();
      await expect(priced.nth(i).getByTestId("price-yearly")).toBeHidden();
    }

    await page.getByTestId("billing-interval-year").click();
    await expect(root).toHaveAttribute("data-interval", "year");
    await expect(page.getByTestId("billing-interval-year")).toHaveAttribute("aria-checked", "true");
    for (let i = 0; i < n; i++) {
      await expect(priced.nth(i).getByTestId("price-yearly")).toBeVisible();
      await expect(priced.nth(i).getByTestId("price-monthly")).toBeHidden();
    }

    await page.getByTestId("billing-interval-month").click();
    await expect(root).toHaveAttribute("data-interval", "month");
    await expect(priced.first().getByTestId("price-monthly")).toBeVisible();
  });

  test("/es/pricing toggle has no English labels", async ({ page }) => {
    await page.goto("/es/pricing");
    const toggle = page.getByTestId("billing-interval-toggle");
    await expect(toggle).toBeVisible();
    const text = (await toggle.innerText()).toLowerCase();
    expect(text).not.toMatch(/monthly|yearly|annual|save up to/);
    await page.getByTestId("billing-interval-year").click();
    await expect(page.getByTestId("billing-interval-root")).toHaveAttribute("data-interval", "year");
    const yearly = page.getByTestId("price-yearly").first();
    if (await yearly.count()) {
      expect((await yearly.innerText()).toLowerCase()).not.toMatch(/billed yearly|\/month/);
    }
  });

  test("CTA hrefs carry plan and interval", async ({ page }) => {
    await page.goto("/pricing");
    await page.getByTestId("billing-interval-year").click();
    const href = await page
      .getByTestId("pricing-tier-card")
      .first()
      .getByRole("link")
      .last()
      .getAttribute("href");
    expect(href).toMatch(/plan=/);
    expect(href).toMatch(/interval=year/);
    // The interval survives a reload through the URL.
    await expect(page).toHaveURL(/interval=year/);
    await page.reload();
    await expect(page.getByTestId("billing-interval-root")).toHaveAttribute(
      "data-interval",
      "year",
    );
  });
});

test.describe("checkout and subscription lifecycle (Stripe TEST mode)", () => {
  test.fixme("upgrade modal -> checkout with 4242 card", async () => {});
  test.fixme("features unlock after payment", async () => {});
  test.fixme("plan change charges prorated amount", async () => {});
  test.fixme("promo code TESTPRO20 is accepted", async () => {});
  test.fixme("promo code NOPE is rejected", async () => {});
  test.fixme("billing portal opens", async () => {});
  test.fixme("cancel at period end, then resume", async () => {});
  test.fixme("failed payment 4000000000000341 then recovery", async () => {});
  test.fixme("webhook replay is idempotent", async () => {});
});
