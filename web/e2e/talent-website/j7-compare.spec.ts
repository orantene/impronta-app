/**
 * J7: the compare drawer after the Pro fold, and the grandfathered Pro talent
 * (Phase 1), switches ON.
 *
 * Founder decision 2026-09-23: one paid talent tier, "Web Office". `talent_pro`
 * is never sold or shown as its own tier again, but the people already on it
 * keep everything they paid for. Two things to prove:
 *
 *   1. The compare drawer renders exactly two tier columns, Free and Web
 *      Office, and no "Pro" or "Portfolio" column survives anywhere in it.
 *   2. `t_pro_legacy` (`talent_pro`) still has media embeds and the press band
 *      on their profile: the cards read "Manage", not "Unlock", and clicking
 *      them opens their own drawers rather than the upgrade compare drawer.
 *
 * The drawer is opened through the shell's own `tulala:open-shell-drawer`
 * bridge (`internal/open-drawer-bridge.ts`), which is how the rest of the app
 * opens it, so the journey never depends on where a particular CTA happens to
 * sit on the page.
 *
 * Server: started with TALENT_FREE_WEBSITE_ENABLED=true (the harness default,
 * `E2E_TALENT_FLAGS` unset or `on`).
 */
import { expect, test, type Page } from "@playwright/test";

import { FIXTURE_PASSWORD, talentFixture } from "./fixtures";

const FLAGS_OFF = process.env.E2E_TALENT_FLAGS === "off";

const tProLegacy = talentFixture("t_pro_legacy");
const tFree = talentFixture("t_free_site");

const PROFILE = "/talent/profile";

async function signInAs(page: Page, key: "t_pro_legacy" | "t_free_site", nextPath: string) {
  const fixture = key === "t_pro_legacy" ? tProLegacy : tFree;
  const params = new URLSearchParams({
    email: fixture.email,
    password: FIXTURE_PASSWORD,
    next: nextPath,
  });
  const res = await page.goto(`/api/dev/signin?${params.toString()}`, {
    waitUntil: "domcontentloaded",
  });
  expect(res, "dev signin returned no response").not.toBeNull();
}

/** Ask the admin shell to open a drawer, the same way the app does. */
async function openDrawer(page: Page, drawerId: string): Promise<void> {
  await page.evaluate((id) => {
    window.dispatchEvent(
      new CustomEvent("tulala:open-shell-drawer", { detail: { drawerId: id } }),
    );
  }, drawerId);
}

const drawerPanel = (page: Page) => page.locator("[data-tulala-drawer-panel]");

test.describe("J7 compare drawer + grandfathered Pro", () => {
  test.skip(FLAGS_OFF, "J7 needs TALENT_FREE_WEBSITE_ENABLED on.");

  test("the compare drawer shows Free and Web Office only", async ({ page }) => {
    await signInAs(page, "t_free_site", PROFILE);
    // The shell must be mounted before the bridge event has a listener.
    await expect(page.locator("[data-tulala-shell], main").first()).toBeVisible({
      timeout: 120_000,
    });
    await openDrawer(page, "talent-tier-compare");
    await expect(drawerPanel(page)).toBeVisible({ timeout: 60_000 });

    const columns = drawerPanel(page).locator("[data-talent-tier-compare-column]");
    await expect(columns).toHaveCount(2);
    await expect(drawerPanel(page).locator('[data-talent-tier-compare-column="free"]')).toBeVisible();
    await expect(drawerPanel(page).locator('[data-talent-tier-compare-column="max"]')).toBeVisible();
    await expect(
      drawerPanel(page).locator('[data-talent-tier-compare-column="pro"]'),
      "the folded Pro tier must not have a compare column",
    ).toHaveCount(0);

    // The feature matrix has the same two columns, labelled Free / Web Office.
    const matrixCols = drawerPanel(page).locator("[data-talent-tier-compare-col]");
    await expect(matrixCols).toHaveCount(2);
    await expect(drawerPanel(page).locator('[data-talent-tier-compare-col="max"]')).toHaveText(
      /Web Office|Oficina Web/,
    );

    // No tier label anywhere in the drawer still reads Pro or Portfolio.
    const drawerText = (await drawerPanel(page).innerText()).replace(/\s+/g, " ");
    expect(drawerText, "a folded tier label survived in the compare drawer").not.toMatch(
      /\bPortfolio tier\b|\bPro tier\b|\bUpgrade to Pro\b|\bUpgrade to Portfolio\b/,
    );
  });

  test("a grandfathered talent_pro keeps embeds and the press band", async ({ page }) => {
    await signInAs(page, "t_pro_legacy", PROFILE);

    const embeds = page.getByRole("button", { name: /Manage embeds/i });
    const press = page.getByRole("button", { name: /Manage press/i });
    await expect(embeds, "a grandfathered Pro still manages embeds").toBeVisible({
      timeout: 120_000,
    });
    await expect(press, "a grandfathered Pro still manages the press band").toBeVisible();
    await expect(page.getByRole("button", { name: /Unlock embeds/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Unlock press band/i })).toHaveCount(0);

    // Clicking opens the feature's own drawer, not the upgrade compare drawer.
    await embeds.click();
    await expect(drawerPanel(page)).toBeVisible({ timeout: 60_000 });
    await expect(drawerPanel(page).locator("[data-talent-tier-compare-column]")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(drawerPanel(page)).toHaveCount(0, { timeout: 30_000 });

    await press.click();
    await expect(drawerPanel(page)).toBeVisible({ timeout: 60_000 });
    await expect(drawerPanel(page).locator("[data-talent-tier-compare-column]")).toHaveCount(0);
  });

  test("a free talent sees the locked state on the same two cards", async ({ page }) => {
    await signInAs(page, "t_free_site", PROFILE);
    await expect(page.getByRole("button", { name: /Unlock embeds/i })).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.getByRole("button", { name: /Unlock press band/i })).toBeVisible();

    // And the locked card routes to the compare drawer, which is the upsell.
    await page.getByRole("button", { name: /Unlock embeds/i }).click();
    await expect(drawerPanel(page).locator("[data-talent-tier-compare-column]")).toHaveCount(2, {
      timeout: 60_000,
    });
  });
});
