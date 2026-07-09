/**
 * Storefront smoke — the public Services section (talent-services program).
 *
 * Run against PROD (the only environment where dev-hydration is reliable —
 * see web/docs/dev-hydration-defect-findings-2026-07-09.md):
 *
 *   PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_BASE_URL=https://improntamodels.com \
 *     npx playwright test e2e/storefront.spec.ts
 *
 * NOT in CI (no Supabase in CI; lane parity list stays untouched). Covers:
 *   - SSR: section + category pills + offering rows/CTAs render
 *   - Hydration: clicking a category pill filters the list
 *   - D4/D5 sheet: Book now opens the confirm sheet; variant pills + qty
 *     stepper recompute the total live
 *   - Mobile 375px: no horizontal overflow; section + sheet usable
 */

import { test, expect, type Page } from "@playwright/test";

const MORE = "/t/TAL-00045"; // 5 offerings · categories Shoots/Licensing/Casting
const MAKEUP = "/t/TAL-AUDIT-0512"; // Bridal trial: variants + extra + qty (per_contact)

async function gotoProfile(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-profile-section="storefront"]')).toHaveCount(1);
}

test.describe("storefront — desktop", () => {
  test("renders section, category pills and offering CTAs (SSR)", async ({ page }) => {
    await gotoProfile(page, MORE);
    const store = page.locator('[data-profile-section="storefront"]');
    await store.scrollIntoViewIfNeeded();
    await expect(store.getByRole("button", { name: "All" })).toBeVisible();
    await expect(store.getByRole("button", { name: "Shoots" })).toBeVisible();
    const offerings = page.locator("[data-offering-row], [data-offering-card], [data-offering-tile], [data-offering-featured]");
    await expect(offerings).toHaveCount(5);
    await expect(page.locator("[data-offering-cta]").first()).toBeVisible();
  });

  test("category pill filters the list (hydration)", async ({ page }) => {
    await gotoProfile(page, MORE);
    const store = page.locator('[data-profile-section="storefront"]');
    await store.scrollIntoViewIfNeeded();
    const shoots = store.getByRole("button", { name: "Shoots" });
    await shoots.click();
    await expect(shoots).toHaveAttribute("aria-pressed", "true");
    // Shoots = 3 of the 5 offerings; Licensing + Casting rows leave the DOM.
    const offerings = page.locator("[data-offering-row], [data-offering-card], [data-offering-tile], [data-offering-featured]");
    await expect(offerings).toHaveCount(3);
    await expect(page.getByText("Usage & licensing buyout")).toHaveCount(0);
  });

  test("confirm sheet: variants + qty recompute the total (D4/D5)", async ({ page }) => {
    await gotoProfile(page, MAKEUP);
    const bookNow = page.locator('[data-offering-cta="book_now"]').first();
    await bookNow.scrollIntoViewIfNeeded();
    await bookNow.click();
    const sheet = page.locator("[data-offering-confirm-sheet]");
    await expect(sheet).toBeVisible();
    // Base: €120. Variant "At your location" = €160; qty + doubles it.
    await expect(sheet.locator("[data-sheet-total]")).toContainText("120");
    const variant = sheet.getByRole("button", { name: /At your location/ });
    if (await variant.count()) {
      await variant.click();
      await expect(sheet.locator("[data-sheet-total]")).toContainText("160");
      await sheet.getByRole("button", { name: "Increase quantity" }).click();
      await expect(sheet.locator("[data-sheet-qty-value]")).toHaveText("2");
      await expect(sheet.locator("[data-sheet-total]")).toContainText("320");
    }
    await sheet.getByRole("button", { name: /^(Cancel|Cancelar)$/ }).click();
    await expect(sheet).toHaveCount(0);
  });
});

test.describe("storefront — mobile 375px", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("no horizontal overflow and the section is usable", async ({ page }) => {
    await gotoProfile(page, MAKEUP);
    const store = page.locator('[data-profile-section="storefront"]');
    await store.scrollIntoViewIfNeeded();
    await expect(store.getByRole("button", { name: "All" })).toBeVisible();
    // The page body must never scroll horizontally at mobile width.
    const scrollWidth = await page.evaluate(() => document.scrollingElement!.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(376);
    // Every offering element fits the viewport.
    const overflowing = await page.evaluate(() =>
      [...document.querySelectorAll("[data-offering-row],[data-offering-card],[data-offering-tile],[data-offering-featured]")]
        .filter((el) => el.getBoundingClientRect().right > 376).length,
    );
    expect(overflowing).toBe(0);
  });

  test("confirm sheet fits and works at mobile width", async ({ page }) => {
    await gotoProfile(page, MAKEUP);
    const bookNow = page.locator('[data-offering-cta="book_now"]').first();
    await bookNow.scrollIntoViewIfNeeded();
    await bookNow.click();
    const sheet = page.locator("[data-offering-confirm-sheet]");
    await expect(sheet).toBeVisible();
    const box = await sheet.locator("> div").last().boundingBox();
    expect(box!.width).toBeLessThanOrEqual(375);
    // Qty stepper reachable + tappable on mobile.
    const inc = sheet.getByRole("button", { name: "Increase quantity" });
    if (await inc.count()) {
      await inc.click();
      await expect(sheet.locator("[data-sheet-qty-value]")).toHaveText("2");
    }
    await sheet.getByRole("button", { name: /^(Cancel|Cancelar)$/ }).click();
  });
});
