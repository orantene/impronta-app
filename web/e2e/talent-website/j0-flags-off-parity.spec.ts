/**
 * J0: flags-off parity for the talent theme gallery (Phase 0).
 *
 * With TALENT_THEME_GALLERY_ENABLED unset, an existing Max site must render
 * exactly as it does on `main`, and none of the gallery surfaces may exist.
 *
 * Fixture identities this spec expects from `./fixtures` (Phase Q seed):
 *   - `t_max`: talent on `talent_portfolio` (Max), with a PUBLISHED multi-page
 *     site (home + at least one inner page), no theme columns set
 *     (`theme_design_slug`, `theme_look_slug` null, `design_tokens` = {}).
 *     Needs: `siteSlug`, `innerPageSlug`, `talentProfileId`, and a signed-in
 *     `storageState` for the owner.
 *
 * How the harness runs it: against a server started WITHOUT the three
 * talent-website switches (`E2E_TALENT_FLAGS=off`). The DOM baselines
 * (`__snapshots__/j0-*.html`) are produced by running this same spec on a
 * `main` build with `--update-snapshots`, then compared on the PR build.
 * Screenshots use Playwright's pixel comparison the same way.
 */
import { expect, test, type Page } from "@playwright/test";

import { fixtures, storageStateFor } from "./fixtures";

const FLAGS_OFF = process.env.E2E_TALENT_FLAGS === "off";

test.describe("J0 flags-off parity", () => {
  test.skip(!FLAGS_OFF, "J0 runs only against a server with the talent-website switches off.");

  const tMax = fixtures.t_max;

  /** Serialized DOM with per-build noise removed (nonces, build ids, hashed
   * asset names, React ids), so only a real render change fails the diff. */
  async function normalizedDom(page: Page): Promise<string> {
    const html = await page.locator("[data-theme-canvas-root]").first().evaluate((el) => el.outerHTML);
    return html
      .replace(/\snonce="[^"]*"/g, "")
      .replace(/\/_next\/static\/[^"')\s]+/g, "/_next/static/<asset>")
      .replace(/(id|for|aria-labelledby|aria-controls|aria-describedby)="(?:_R_|:r)[^"]*"/g, '$1="<rid>"')
      .replace(/©\s*\d{4}/g, "© <year>");
  }

  for (const route of ["home", "inner"] as const) {
    test(`public ${route} page renders unchanged`, async ({ page }) => {
      const path =
        route === "home" ? `/t/site/${tMax.siteSlug}` : `/t/site/${tMax.siteSlug}/${tMax.innerPageSlug}`;
      const res = await page.goto(path, { waitUntil: "networkidle" });
      expect(res?.status()).toBe(200);

      expect(await normalizedDom(page)).toMatchSnapshot(`j0-t_max-${route}.html`);
      await expect(page).toHaveScreenshot(`j0-t_max-${route}.png`, {
        fullPage: true,
        animations: "disabled",
        maxDiffPixelRatio: 0.001,
      });
    });
  }

  test("site manager shows the legacy starter gallery, not the theme gallery", async ({ browser }) => {
    const context = await browser.newContext({ storageState: storageStateFor("t_max") });
    const page = await context.newPage();
    await page.goto("/talent/site", { waitUntil: "networkidle" });

    // The legacy gallery renders the Max-site starter templates.
    await expect(page.getByText(/starter template/i).first()).toBeVisible();
    await expect(page.locator("[data-theme-gallery]")).toHaveCount(0);
    await expect(page.locator("[data-theme-gallery-design-card]")).toHaveCount(0);
    await context.close();
  });

  test("talent-theme preview family does not exist", async ({ browser }) => {
    const context = await browser.newContext({ storageState: storageStateFor("t_max") });
    const page = await context.newPage();
    const res = await page.goto(
      `/template-preview/default?kind=talent-theme&talentProfileId=${tMax.talentProfileId}`,
    );
    expect(res?.status()).toBe(404);
    await context.close();
  });
});
