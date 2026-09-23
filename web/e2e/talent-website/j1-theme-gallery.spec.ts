/**
 * J1: theme gallery end to end (Phase 0), switches ON.
 *
 * Journey on `t_max`: open the site manager, filter designs by category,
 * change the design (preview iframe navigates), change the look (preview
 * restyles in place, no reload), apply design + look, publish the site, the
 * public site is restyled; then apply a second look and confirm the page
 * content is unchanged while the colours change.
 *
 * Fixture identities this spec expects from `./fixtures` (Phase Q seed):
 *   - `t_max`: talent on `talent_portfolio` (Max), with a PUBLISHED multi-page
 *     site (home + at least one inner page), no per-page `__design` tokens on
 *     the home page (a page override would win over the Look by design).
 *     Needs: `siteSlug`, `innerPageSlug`, `talentProfileId`, and a signed-in
 *     `storageState` for the owner.
 *
 * Server: started with TALENT_THEME_GALLERY_ENABLED=true (the harness default,
 * `E2E_TALENT_FLAGS` unset or `on`). The catalog may be unsynced: the gallery,
 * preview and actions all fall back to the in-code built-ins.
 */
import { expect, test, type Page } from "@playwright/test";

import { fixtures, storageStateFor } from "./fixtures";

const FLAGS_OFF = process.env.E2E_TALENT_FLAGS === "off";

test.describe("J1 theme gallery", () => {
  test.skip(FLAGS_OFF, "J1 needs TALENT_THEME_GALLERY_ENABLED on.");
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: storageStateFor("t_max") });

  const tMax = fixtures.t_max;
  const publicHome = `/t/site/${tMax.siteSlug}`;
  const publicInner = `/t/site/${tMax.siteSlug}/${tMax.innerPageSlug}`;

  const previewFrame = (page: Page) => page.locator("[data-theme-gallery-preview] iframe");

  async function previewVar(page: Page, name: string): Promise<string> {
    const frame = page.frameLocator("[data-theme-gallery-preview] iframe");
    return frame
      .locator("[data-talent-theme-preview]")
      .evaluate((el, n) => getComputedStyle(el).getPropertyValue(n).trim(), name);
  }

  async function publicVar(page: Page, path: string, name: string): Promise<string> {
    await page.goto(path, { waitUntil: "networkidle" });
    return page
      .locator("[data-theme-canvas-root]")
      .first()
      .evaluate((el, n) => getComputedStyle(el).getPropertyValue(n).trim(), name);
  }

  async function mainText(page: Page, path: string): Promise<string> {
    await page.goto(path, { waitUntil: "networkidle" });
    return (await page.locator("[data-talent-max-site-main]").innerText()).replace(/\s+/g, " ").trim();
  }

  async function openGallery(page: Page) {
    await page.goto("/talent/site", { waitUntil: "networkidle" });
    await expect(page.locator("[data-theme-gallery]")).toBeVisible();
  }

  async function pickLook(page: Page, index: number): Promise<string> {
    const swatches = page.locator('[data-theme-gallery-look-swatch][data-locked="false"]');
    const swatch = swatches.nth(index);
    const slug = (await swatch.getAttribute("data-theme-gallery-look-swatch")) ?? "";
    await swatch.click();
    return slug;
  }

  async function applyAndPublish(page: Page) {
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: /Use this (theme|look)/ }).click();
    await expect(page.getByText(/Publish your site to make it live/)).toBeVisible();
    await page.getByRole("button", { name: /(Re)?[Pp]ublish site/ }).click();
    await expect(page.getByText(/your site is live/)).toBeVisible();
  }

  let innerTextBefore = "";

  test("design grid filters by category and the preview follows the design", async ({ page }) => {
    innerTextBefore = await mainText(page, publicInner);
    await openGallery(page);

    const cards = page.locator("[data-theme-gallery-design-card]");
    const total = await cards.count();
    expect(total).toBeGreaterThanOrEqual(5);

    const chips = page.locator("[data-theme-gallery-design-step] [role=tab]");
    expect(await chips.count()).toBeGreaterThan(1);
    await chips.nth(1).click();
    const filtered = await cards.count();
    expect(filtered).toBeGreaterThan(0);
    expect(filtered).toBeLessThan(total);
    await chips.first().click();
    await expect(cards).toHaveCount(total);

    const target = page.locator('[data-theme-gallery-design-card][data-locked="false"]').nth(1);
    const slug = await target.getAttribute("data-theme-gallery-design-card");
    await target.click();
    await expect(previewFrame(page)).toHaveAttribute("src", new RegExp(`/template-preview/${slug}\\?kind=talent-theme`));
    await expect(page.frameLocator("[data-theme-gallery-preview] iframe").locator("[data-talent-theme-preview]")).toBeVisible();
  });

  test("a look restyles the preview in place, then apply + publish restyles the public site", async ({ page }) => {
    await openGallery(page);
    await page.locator('[data-theme-gallery-design-card][data-locked="false"]').nth(1).click();
    await page.getByRole("button", { name: /Next: choose a look/ }).click();
    await expect(page.frameLocator("[data-theme-gallery-preview] iframe").locator("[data-talent-theme-preview]")).toBeVisible();

    const srcBefore = await previewFrame(page).getAttribute("src");
    // Marker on the iframe window survives only if the frame is NOT reloaded.
    await page
      .frameLocator("[data-theme-gallery-preview] iframe")
      .locator("body")
      .evaluate(() => ((window as unknown as { __j1Marker?: number }).__j1Marker = 1));
    const bgBefore = await previewVar(page, "--token-color-background");

    await pickLook(page, 2);
    await expect.poll(() => previewVar(page, "--token-color-background")).not.toBe(bgBefore);
    expect(await previewFrame(page).getAttribute("src")).toBe(srcBefore);
    const marker = await page
      .frameLocator("[data-theme-gallery-preview] iframe")
      .locator("body")
      .evaluate(() => (window as unknown as { __j1Marker?: number }).__j1Marker);
    expect(marker).toBe(1);

    const expectedBg = await previewVar(page, "--token-color-background");
    await applyAndPublish(page);

    expect((await publicVar(page, publicHome, "--token-color-background")).toLowerCase()).toBe(
      expectedBg.toLowerCase(),
    );
    // Inner pages keep their content (a Design only replaces the shell + home).
    expect(await mainText(page, publicInner)).toBe(innerTextBefore);
  });

  test("a second look changes colours and keeps the content", async ({ page }) => {
    const homeTextBefore = await mainText(page, publicHome);
    const bgBefore = await publicVar(page, publicHome, "--token-color-background");

    await page.goto("/talent/site", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Next: choose a look/ }).click();
    await expect(page.frameLocator("[data-theme-gallery-preview] iframe").locator("[data-talent-theme-preview]")).toBeVisible();
    await pickLook(page, 4);
    await expect
      .poll(async () => (await previewVar(page, "--token-color-background")).toLowerCase())
      .not.toBe(bgBefore.toLowerCase());
    const expectedBg = await previewVar(page, "--token-color-background");
    await applyAndPublish(page);

    const bgAfter = await publicVar(page, publicHome, "--token-color-background");
    expect(bgAfter.toLowerCase()).toBe(expectedBg.toLowerCase());
    // Re-applying the same design rehydrates the same profile data, so the
    // visible home content is unchanged; the look touches tokens only.
    expect(await mainText(page, publicHome)).toBe(homeTextBefore);
    expect(await mainText(page, publicInner)).toBe(innerTextBefore);
  });
});
