/**
 * 1.9 Split check (T18), merge checks (T16), change server (T17).
 * Refusal: merge a paid check → lines_paid.
 */
import {
  test,
  expect,
  prepareJourneysPage,
  signInJourneysStaff,
  counterAddItem,
  counterCollectCash,
  expectCounterPaid,
  skipUnlessFixture,
} from "./_harness";
import { isolatedService } from "./_isolated-db";
import { FLOOR_T4, openVisitOn, orderForVisit, releaseFloorProof } from "./_floor-db";
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

test("WIRE-1.9 split, change server, and refuse merging a paid check", async ({ page }) => {
  test.setTimeout(360_000);
  await prepareJourneysPage(page);
  await releaseFloorProof();
  await signInJourneysStaff(page, "/admin/pos?mode=floor");
  await expect(card(page, "T4")).toBeVisible({ timeout: 30_000 });

  if ((await card(page, "T4").getAttribute("data-floor-state")) !== "occupied") {
    await tapTable(page, "T4");
    await sheet(page, "T4").locator("[data-floor-seat]").click();
    await expect(page.locator('[data-pos-sheet="seat-party"]')).toBeVisible();
    await page.locator('[data-pos-sheet="seat-party"]').getByRole("button", { name: /seat 2 guests at T4/i }).click();
    await expect(card(page, "T4")).toHaveAttribute("data-floor-state", "occupied", { timeout: 30_000 });
  }

  const seated = await openVisitOn(FLOOR_T4);
  expect(seated, "failed-fixture: no open visit on T4").not.toBeNull();

  await tapTable(page, "T4");
  await sheet(page, "T4").locator("[data-floor-open-order]").click();
  await expect(page).toHaveURL(/mode=counter&order=/, { timeout: 30_000 });
  await counterAddItem(page, "House pizza");
  await counterAddItem(page, "House pizza");

  await page.goto("/admin/pos?mode=floor");
  await expect(card(page, "T4")).toHaveAttribute("data-floor-state", "occupied", { timeout: 30_000 });
  await tapTable(page, "T4");
  await sheet(page, "T4").locator('[data-floor-action="split"]').click();
  const splitLine = page.locator("[data-floor-split-line]").first();
  await expect(splitLine).toBeVisible({ timeout: 20_000 });
  await splitLine.click();
  await page.locator("[data-floor-split-confirm]").click();

  const sb = isolatedService();
  const { count: draftCount } = await sb
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("visit_id", seated!.id)
    .eq("status", "draft");
  expect(draftCount ?? 0, "split writes a second draft on the visit").toBeGreaterThanOrEqual(2);

  await tapTable(page, "T4");
  await sheet(page, "T4").locator('[data-floor-action="change-server"]').click();
  const server = page.locator("[data-floor-server]").first();
  await expect(server).toBeVisible({ timeout: 20_000 });
  const serverId = await server.getAttribute("data-floor-server");
  await server.click();
  await page.locator("[data-floor-server-confirm]").click();
  const { data: afterServer } = await sb
    .from("visits")
    .select("server_user_id")
    .eq("id", seated!.id)
    .maybeSingle();
  if (serverId) {
    expect((afterServer as { server_user_id: string | null } | null)?.server_user_id).toBe(serverId);
  } else {
    expect((afterServer as { server_user_id: string | null } | null)?.server_user_id).toBeTruthy();
  }

  await tapTable(page, "T4");
  await sheet(page, "T4").locator("[data-floor-open-order]").click();
  await expect(page).toHaveURL(/order=/, { timeout: 30_000 });
  await counterCollectCash(page);
  await expectCounterPaid(page);
  const paid = await orderForVisit(seated!.id);
  expect(paid?.status).toBe("paid");

  await page.goto("/admin/pos?mode=floor");
  await tapTable(page, "T4");
  await sheet(page, "T4").locator('[data-floor-action="move-or-join"]').click();
  const chooser = page.locator('[data-pos-sheet="table-change"]');
  await expect(chooser).toBeVisible();
  await chooser.locator('[data-floor-change="merge"] button').click();
  const mergeFrom = page.locator("[data-floor-merge-from]").first();
  if ((await mergeFrom.count()) > 0) {
    await mergeFrom.click();
    await page.locator("[data-floor-merge-confirm]").click();
  }
  const banner = page.locator("[data-floor-refusal]");
  if ((await banner.count()) > 0) {
    await expect(banner).toContainText(/paid lines cannot move/i);
  } else {
    await assertEnglishRefusal(page, WIRE_SENTENCE.linesPaid);
  }
});
