/**
 * pos-enable — the platform kill switch, proven end to end.
 *
 * `platform_settings.workspace_pos_enabled` shipped with no control: HQ could
 * only flip it with SQL, and the workspace's own Settings > Point of sale
 * panel offered toggles that could never do anything while the platform
 * switch was off. This journey proves the fix through the real screens:
 *
 *   1. Sign in as the platform super-admin, open /platform/admin/settings,
 *      find the new "The point of sale" row in the Workspace UI card, and
 *      round-trip it off then on through the real save action and a fresh
 *      page load (the real reader, `loadPlatformWorkspaceUi`).
 *   2. With the platform switch off, the workspace owner's own Settings >
 *      Point of sale panel explains the platform is off instead of offering
 *      toggles that cannot work.
 *   3. With the platform switch back on, the same panel turns Counter on
 *      through `setPosModes`, and a reload proves the write survived through
 *      `getPosModes` (the real reader), not just the optimistic UI.
 *   4. The top bar's Workspace/Counter switch appears for the owner and not
 *      for the viewer ("assistant" in product language — `lib/pos/modes.ts`
 *      gives a `viewer`-rank person no POS modes at all).
 *
 * Uses `qa-journeys-platform-admin@impronta.test`, a fixture super_admin
 * seeded on the ISOLATED qa-journeys database only (see
 * docs/plans/program/evidence/pos-enable/README.md) — production's real
 * platform owner is never used for automated QA.
 *
 * One test, not four: each state depends on the previous write actually
 * landing, so splitting into independent `test()` blocks either re-derives
 * the same setup three times or races shared platform-wide state between
 * workers. A single serial journey mirrors prove-counter's own pattern.
 */
import type { Page } from "@playwright/test";

import {
  test,
  expect,
  prepareJourneysPage,
  signInJourneysStaff,
  assertNotAuthWall,
} from "./_harness";

const PLATFORM_ADMIN_EMAIL = "qa-journeys-platform-admin@impronta.test";
const OWNER_EMAIL = "qa-journeys-owner@impronta.test";
const VIEWER_EMAIL = "qa-journeys-viewer@impronta.test";
const TENANT_SLUG = "qa-journeys";

test.beforeEach(async ({ page }) => {
  await prepareJourneysPage(page);
});

/** Set the platform POS switch to `desired` from a page already signed in as the platform admin. */
async function setPlatformPosEnabled(page: Page, desired: boolean): Promise<void> {
  await page.goto("/platform/admin/settings");
  await assertNotAuthWall(page);
  const card = page.getByTestId("platform-workspace-ui-card");
  const row = card.locator("label", { has: page.getByText("The point of sale", { exact: true }) });
  const checkbox = row.locator('input[type="checkbox"]');
  await expect(checkbox).toBeVisible();
  const isChecked = await checkbox.isChecked();
  if (isChecked === desired) return;
  await checkbox.click();
  await card.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved. Applies to every workspace.")).toBeVisible();
}

test("the platform POS switch and the workspace panel agree, end to end", async ({ page }) => {
  // ── 1. Platform admin turns the switch OFF, through the real action ──────
  await signInJourneysStaff(page, "/platform/admin/settings", PLATFORM_ADMIN_EMAIL);
  await setPlatformPosEnabled(page, false);

  // Reload — the real reader (`loadPlatformWorkspaceUi`) must agree, not
  // just the optimistic UI the click already updated.
  await page.reload();
  await assertNotAuthWall(page);
  const offCheckbox = page
    .getByTestId("platform-workspace-ui-card")
    .locator("label", { has: page.getByText("The point of sale", { exact: true }) })
    .locator('input[type="checkbox"]');
  await expect(offCheckbox).not.toBeChecked();
  await page.screenshot({
    path: "../docs/plans/program/evidence/pos-enable/screenshots/1-platform-switch-off.png",
    fullPage: true,
  });

  // ── 2. With the platform off, the workspace panel explains it plainly ────
  await signInJourneysStaff(page, `/${TENANT_SLUG}/admin/settings`, OWNER_EMAIL);
  await assertNotAuthWall(page);
  await page.getByRole("button", { name: "Point of sale", exact: true }).click();
  const cardOff = page.getByTestId("pos-modes-card");
  await expect(cardOff).toBeVisible();
  await expect(page.getByTestId("pos-modes-platform-off")).toBeVisible({ timeout: 20000 });
  await expect(cardOff.getByRole("switch")).toHaveCount(0);
  await page.screenshot({
    path: "../docs/plans/program/evidence/pos-enable/screenshots/2-workspace-panel-platform-off.png",
    fullPage: true,
  });

  // ── 3. Platform admin turns the switch back ON ────────────────────────────
  await signInJourneysStaff(page, "/platform/admin/settings", PLATFORM_ADMIN_EMAIL);
  await setPlatformPosEnabled(page, true);

  // ── 4. Owner's panel now offers real toggles; turn Counter on ────────────
  await signInJourneysStaff(page, `/${TENANT_SLUG}/admin/settings`, OWNER_EMAIL);
  await page.getByRole("button", { name: "Point of sale", exact: true }).click();
  const cardOn = page.getByTestId("pos-modes-card");
  await expect(cardOn).toBeVisible();
  await expect(page.getByText("Loading…", { exact: true })).toHaveCount(0, { timeout: 20000 });
  await expect(page.getByTestId("pos-modes-platform-off")).toHaveCount(0);
  const counterSwitch = cardOn.getByRole("switch").first();
  await expect(counterSwitch).toBeVisible({ timeout: 20000 });
  if ((await counterSwitch.getAttribute("aria-checked")) !== "true") {
    await counterSwitch.click();
    await expect(page.getByTestId("pos-modes-card").getByText("Saved", { exact: true })).toBeVisible();
  }
  await page.screenshot({
    path: "../docs/plans/program/evidence/pos-enable/screenshots/3-workspace-panel-counter-on.png",
    fullPage: true,
  });

  // Reload — the real reader (`getPosModes`) must agree.
  await page.reload();
  await page.getByRole("button", { name: "Point of sale", exact: true }).click();
  const counterSwitchAfterReload = page.getByTestId("pos-modes-card").getByRole("switch").first();
  await expect(counterSwitchAfterReload).toHaveAttribute("aria-checked", "true", { timeout: 20000 });

  // ── 5. Top bar switch: visible for the owner, absent for the viewer ──────
  await signInJourneysStaff(page, `/${TENANT_SLUG}/admin`, OWNER_EMAIL);
  await assertNotAuthWall(page);
  await expect(page.getByRole("button", { name: /^Workspace/ })).toBeVisible({ timeout: 20000 });
  await page.screenshot({
    path: "../docs/plans/program/evidence/pos-enable/screenshots/4-topbar-switch-owner.png",
    fullPage: true,
  });

  await signInJourneysStaff(page, `/${TENANT_SLUG}/admin`, VIEWER_EMAIL);
  await assertNotAuthWall(page);
  await expect(page.getByRole("button", { name: /^Workspace/ })).toHaveCount(0, { timeout: 20000 });
  await page.screenshot({
    path: "../docs/plans/program/evidence/pos-enable/screenshots/5-topbar-switch-absent-viewer.png",
    fullPage: true,
  });
});
