/**
 * 1.8 Table move with expected version (T13).
 * Refusal: stale version → conflict.
 */
import {
  test,
  expect,
  prepareJourneysPage,
  signInJourneysStaff,
  skipUnlessFixture,
} from "./_harness";
import { isolatedService } from "./_isolated-db";
import { FLOOR_T4, FLOOR_T5, openVisitOn, releaseFloorProof, visitById } from "./_floor-db";
import { WIRE_SENTENCE, assertEnglishRefusal } from "./_wire";

skipUnlessFixture();

type Page = import("@playwright/test").Page;

function card(page: Page, code: string) {
  return page.locator(`li[data-floor-table="${code}"]`);
}
function sheet(page: Page, code: string) {
  return page.locator(`[data-floor-sheet="${code}"]`);
}
async function tapTable(page: Page, code: string) {
  if (await sheet(page, code).isVisible()) return;
  for (let attempt = 0; attempt < 5 && !(await sheet(page, code).isVisible()); attempt += 1) {
    await card(page, code).getByRole("button").first().click();
    await page.waitForTimeout(1_000);
  }
  await expect(sheet(page, code)).toBeVisible({ timeout: 20_000 });
}

test("WIRE-1.8 Tables › Move changes visits.space_id and refuses a stale version", async ({ page }) => {
  test.setTimeout(300_000);
  await prepareJourneysPage(page);
  await releaseFloorProof();
  await signInJourneysStaff(page, "/admin/pos?mode=floor");
  await expect(card(page, "T4")).toBeVisible({ timeout: 30_000 });

  if ((await card(page, "T4").getAttribute("data-floor-state")) !== "occupied") {
    await tapTable(page, "T4");
    await sheet(page, "T4").locator("[data-floor-seat]").click();
    const seatSheet = page.locator('[data-pos-sheet="seat-party"]');
    await expect(seatSheet).toBeVisible();
    await seatSheet.getByRole("button", { name: /seat 2 guests at T4/i }).click();
    await expect(card(page, "T4")).toHaveAttribute("data-floor-state", "occupied", { timeout: 30_000 });
  }

  const seated = await openVisitOn(FLOOR_T4);
  expect(seated, "failed-fixture: no open visit on T4").not.toBeNull();
  const fromSpace = seated!.spaceId;

  await tapTable(page, "T4");
  await sheet(page, "T4").locator('[data-floor-action="move-or-join"]').click();
  const chooser = page.locator('[data-pos-sheet="table-change"]');
  await expect(chooser).toBeVisible();
  await chooser.locator('[data-floor-change="move"] button').click();
  const mover = page.locator('[data-pos-sheet="move-party"]');
  await expect(mover).toBeVisible();
  await mover.locator('[data-floor-move-to="T5"]').click();
  await mover.locator("[data-floor-move-confirm]").click();
  await expect(card(page, "T5")).toHaveAttribute("data-floor-state", "occupied", { timeout: 30_000 });

  const moved = await visitById(seated!.id);
  expect(moved!.spaceId, "visit must sit on T5").toBe(FLOOR_T5);
  expect(moved!.spaceId).not.toBe(fromSpace);
  expect(moved!.version).toBeGreaterThan(seated!.version);

  await isolatedService()
    .from("visits")
    .update({ version: moved!.version + 5 })
    .eq("id", seated!.id);

  await tapTable(page, "T5");
  await sheet(page, "T5").locator('[data-floor-action="move-or-join"]').click();
  await expect(page.locator('[data-pos-sheet="table-change"]')).toBeVisible();
  await page.locator('[data-floor-change="move"] button').click();
  await expect(page.locator('[data-pos-sheet="move-party"]')).toBeVisible();
  await page.locator('[data-floor-move-to="T4"]').click();
  await page.locator("[data-floor-move-confirm]").click();
  const refusal = page.locator("[data-floor-refusal]");
  if ((await refusal.count()) > 0) {
    await expect(refusal).toBeVisible();
    await expect(refusal).toContainText(/this just changed|reload/i);
  } else {
    await assertEnglishRefusal(page, WIRE_SENTENCE.conflict);
  }
  const afterConflict = await visitById(seated!.id);
  expect(afterConflict!.spaceId).toBe(FLOOR_T5);
});
