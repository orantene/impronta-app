/**
 * Phase 2 · the module shell.
 *
 * Opens from the three CTAs (talent button, business link, header link),
 * accepts a typed sentence, a pasted link, refuses too little, closes with the
 * saved toast, and resumes after a reload on the same browser (guest cookie).
 * Runs on chromium (desktop overlay) and mobile-onboarding (iPhone 14).
 */
import { APP_BASE, MARKETING_BASE, ROSA_EN, evidence, expect, dialog, openHome, overlay, sentence, test } from "./_module";

test.describe("onboarding module shell", () => {
  test("opens from the talent CTA with the entry screen, no navigation", async ({ page }) => {
    await openHome(page);
    await page.getByRole("button", { name: /Sell your work/ }).first().click();
    await expect(dialog(page)).toBeVisible();
    await expect(page.getByTestId("onb-entry")).toBeVisible();
    await expect(page.getByTestId("onb-step-label")).toHaveText(/1 · Tell us/);
    await expect(page.getByTestId("onb-account-pill")).toHaveText(/Not signed in/);
    await expect(page.getByTestId("onb-example")).toContainText(/For example:/);
    expect(new URL(page.url()).pathname).toBe("/");
    await evidence(page, "01-entry");
  });

  test("intercepts the business link and the header link (no /get-started navigation)", async ({ page }) => {
    await openHome(page);
    await page.getByRole("link", { name: /Start a business/ }).first().click();
    await expect(dialog(page)).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/");
    await page.getByTestId("onb-close").click();
    await expect(dialog(page)).toBeHidden();
    const header = page.getByRole("link", { name: /^Get started$/ }).first();
    if (await header.isVisible()) {
      await header.click();
      await expect(dialog(page)).toBeVisible();
      expect(new URL(page.url()).pathname).toBe("/");
    }
  });

  test("a sentence goes to check, then reading; too little is refused; reload resumes", async ({ page }) => {
    await openHome(page);
    await page.getByRole("button", { name: /Sell your work/ }).first().click();
    await sentence(page).fill("hola");
    await expect(sentence(page)).toHaveValue("hola");
    await page.getByTestId("onb-send").click();
    await expect(page.getByTestId("onb-confirm")).toBeVisible();
    await page.getByTestId("onb-confirm-send").click();
    await expect(page.getByTestId("onb-too-little")).toBeVisible();
    await evidence(page, "03-too-little");
    await page.getByTestId("onb-too-little-back").click();
    await expect(sentence(page)).toHaveValue("hola");

    await sentence(page).fill(ROSA_EN);
    await sentence(page).press("Enter");
    await expect(page.getByTestId("onb-confirm")).toBeVisible();
    await expect(page.getByTestId("onb-confirm-text")).toHaveValue(ROSA_EN);
    await evidence(page, "02-confirm-words");
    await page.getByTestId("onb-confirm-send").click();
    await expect(page.getByTestId("onb-reading")).toBeVisible();
    await expect(page.getByTestId("onb-reading-input")).toHaveText(ROSA_EN);
    await expect(page.getByTestId("onb-step-label")).toHaveText(/2 · Check/);
    await evidence(page, "04-reading");

    await page.getByTestId("onb-close").click();
    await expect(page.getByTestId("onb-toast")).toContainText(/Saved on this phone/);

    await page.reload();
    await expect(page.locator("html[data-onboarding-ready]")).toHaveCount(1, { timeout: 30_000 });
    await page.getByRole("button", { name: /Sell your work/ }).first().click();
    // The resume snapshot is one server action after open; allow for a cold dev server.
    await expect(page.getByTestId("onb-resume")).toContainText(ROSA_EN, { timeout: 15_000 });
    await evidence(page, "05-resume");
    await page.getByTestId("onb-resume-continue").click();
    await expect(page.getByTestId("onb-reading")).toBeVisible();
    await page.getByTestId("onb-close").click();

    await page.reload();
    await expect(page.locator("html[data-onboarding-ready]")).toHaveCount(1, { timeout: 30_000 });
    await page.getByRole("link", { name: /Start a business/ }).first().click();
    await page.getByTestId("onb-resume-fresh").click();
    await expect(page.getByTestId("onb-entry")).toBeVisible();
    await expect(sentence(page)).toHaveValue("");
  });

  test("a pasted link is accepted as a site import", async ({ page }) => {
    await openHome(page);
    await page.getByRole("link", { name: /Start a business/ }).first().click();
    await page.getByTestId("onb-toggle-link").click();
    await page.getByTestId("onb-link").fill("parrillaelpaisa.com");
    await page.getByTestId("onb-send").click();
    await expect(page.getByTestId("onb-reading")).toBeVisible();
    await expect(page.getByTestId("onb-reading-input")).toContainText("parrillaelpaisa.com");
    await expect(dialog(page)).toContainText(/Reading your site/);
  });

  test("Spanish page, Spanish module", async ({ page }) => {
    await openHome(page, "es");
    await page.getByRole("button", { name: /Vende tu trabajo/ }).first().click();
    await expect(dialog(page)).toContainText("Cuéntanos qué haces");
    await expect(page.getByTestId("onb-example")).toContainText(/Por ejemplo:/);
    await evidence(page, "06-entry-es");
    await expect(overlay(page)).toBeVisible();
  });

  test("the app host is untouched by the module", async ({ page }) => {
    const res = await page.goto(`${APP_BASE}/`);
    expect(res?.status()).toBeLessThan(500);
    await expect(page.getByTestId("onb-overlay")).toHaveCount(0);
    expect(MARKETING_BASE).not.toBe(APP_BASE);
  });
});
