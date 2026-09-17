/**
 * Phase 7 · the desktop overlay: a 640 px card over the dimmed page, Escape
 * closes with the saved toast when there is progress, Tab stays inside.
 * chromium only (the mobile project covers the full-screen form).
 */
import { dialog, expect, openHome, sentence, test } from "./_module";

test.describe("onboarding · desktop overlay", () => {
  test.skip(({ isMobile }) => !!isMobile, "desktop geometry only");

  test("640 px card, focus stays inside, Escape closes and keeps the words", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openHome(page);
    await page.getByRole("button", { name: /Sell your work/ }).first().click();
    const box = await dialog(page).boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(600);
    expect(box?.width).toBeLessThanOrEqual(640);
    expect(box!.x).toBeGreaterThan(300);
    // Tab from the last control wraps to the first (no escape to the page).
    await page.getByTestId("onb-toggle-link").focus();
    await page.keyboard.press("Tab");
    const inside = await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
    expect(inside).toBe(true);
    await sentence(page).fill("I teach yoga on the beach in Puerto Morelos");
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toBeHidden();
    await expect(page.getByTestId("onb-toast")).toContainText(/Saved on this phone/);
  });
});
