/**
 * J3: read-time scoping for a free personal website (Phase 1), switches ON.
 *
 * The free site is a REAL site that is deliberately smaller, not a broken one.
 * `t_free_site` (`talent_basic`, published, one extra page, one active custom
 * domain row) must serve:
 *
 *   home          200, with the "Made with Tulala" badge
 *   /<extra>      404 (`scopeMaxSitePagesToPlan` drops it before page select)
 *   nav           home only (the extra page is not linkable either)
 *   custom domain 404 (migration 20261231279000: `talent_site_domain_lookup`
 *                 requires `talent_profile_has_max`)
 *
 * and `t_max` (`talent_portfolio`) must be completely unaffected on all four.
 *
 * Hosts: the custom-domain checks must reach the dev server by NAME, because
 * the proxy gates on `Host` and a browser will not let a test forge that
 * header. `supabase/ci/RUNBOOK.md` has the /etc/hosts entry for
 * `free-site.test` and `max-site.test` (the two `customDomain` values in
 * `./fixtures`).
 *
 * Server: started with TALENT_FREE_WEBSITE_ENABLED=true (the harness default,
 * `E2E_TALENT_FLAGS` unset or `on`).
 */
import { expect, test } from "@playwright/test";

import { EXTRA_PAGE_SLUG, talentFixture } from "./fixtures";

const FLAGS_OFF = process.env.E2E_TALENT_FLAGS === "off";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3400";
const PORT = new URL(BASE_URL).port || "80";

const tFree = talentFixture("t_free_site");
const tMax = talentFixture("t_max");

const freeHome = `/t/site/${tFree.siteSlug}`;
const freeExtra = `/t/site/${tFree.siteSlug}/${EXTRA_PAGE_SLUG}`;
const maxHome = `/t/site/${tMax.siteSlug}`;
const maxExtra = `/t/site/${tMax.siteSlug}/${EXTRA_PAGE_SLUG}`;

const freeDomainOrigin = `http://${tFree.customDomain}:${PORT}`;
const maxDomainOrigin = `http://${tMax.customDomain}:${PORT}`;

test.describe("J3 free-site read-time scoping", () => {
  test.skip(FLAGS_OFF, "J3 needs TALENT_FREE_WEBSITE_ENABLED on.");

  test("a free talent serves home and nothing else", async ({ page }) => {
    const home = await page.goto(freeHome, { waitUntil: "domcontentloaded" });
    expect(home?.status(), "the free home page must serve").toBe(200);
    await expect(page.locator("[data-talent-max-site-main]")).toBeVisible();
    await expect(page.locator("[data-talent-max-site-main]")).toContainText(tFree.displayName);
    // Free tier keeps the platform badge (`talentPlanRemovesPlatformBadge`).
    await expect(page.locator("[data-talent-max-site-badge]")).toBeVisible();

    const extra = await page.goto(freeExtra, { waitUntil: "domcontentloaded" });
    expect(
      extra?.status(),
      `${freeExtra} must 404: an extra page is a Web Office capability`,
    ).toBe(404);
  });

  test("the free site's nav offers the home page only", async ({ page }) => {
    await page.goto(freeHome, { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-talent-max-site-main]")).toBeVisible();

    // No link anywhere in the rendered shell may point at a scoped-away page.
    const extraLinks = page.locator(`a[href*="/${EXTRA_PAGE_SLUG}"]`);
    await expect(extraLinks).toHaveCount(0);

    // Whatever inner-site links do exist all resolve to the home page.
    const innerHrefs = await page
      .locator(`a[href^="/t/site/${tFree.siteSlug}"]`)
      .evaluateAll((nodes) =>
        nodes.map((n) => (n as HTMLAnchorElement).getAttribute("href") ?? ""),
      );
    for (const href of innerHrefs) {
      expect(
        href.replace(/\/$/, ""),
        `nav link ${href} escapes the home-only scope`,
      ).toBe(freeHome.replace(/\/$/, ""));
    }
  });

  test("the free talent's custom domain does not resolve", async ({ page }) => {
    const res = await page.goto(`${freeDomainOrigin}/`, { waitUntil: "domcontentloaded" });
    expect(
      res?.status(),
      "a custom domain is a Web Office capability: the RPC must not resolve it",
    ).toBe(404);
  });

  test("t_max is unaffected: home, inner page, nav and custom domain all work", async ({
    page,
  }) => {
    const home = await page.goto(maxHome, { waitUntil: "domcontentloaded" });
    expect(home?.status()).toBe(200);
    await expect(page.locator("[data-talent-max-site-main]")).toContainText(tMax.displayName);
    // A paid tier removes the platform badge.
    await expect(page.locator("[data-talent-max-site-badge]")).toHaveCount(0);

    const extra = await page.goto(maxExtra, { waitUntil: "domcontentloaded" });
    expect(extra?.status(), "a Web Office talent keeps every published page").toBe(200);

    await page.goto(maxHome, { waitUntil: "domcontentloaded" });
    await expect(
      page.locator(`a[href*="/${EXTRA_PAGE_SLUG}"]`).first(),
      "a Web Office talent's nav still links its inner pages",
    ).toBeVisible();

    const domain = await page.goto(`${maxDomainOrigin}/`, { waitUntil: "domcontentloaded" });
    expect(domain?.status(), "a Web Office custom domain still resolves").toBe(200);
    await expect(page.locator("[data-talent-max-site-main]")).toContainText(tMax.displayName);
  });
});
