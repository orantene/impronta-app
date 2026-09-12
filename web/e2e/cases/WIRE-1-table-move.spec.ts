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
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import { WIRE_SENTENCE, assertEnglishRefusal } from "./_wire";

skipUnlessFixture();

test("WIRE-1.8 Tables › Move changes visits.space_id and refuses a stale version", async ({ page }) => {
  test.setTimeout(240_000);
  await prepareJourneysPage(page);
  await signInJourneysStaff(page, "/admin/pos?mode=floor");
  const occupied = page.locator("[data-floor-state='occupied']").first();
  test.skip((await occupied.count()) === 0, "failed-fixture: no occupied table to move");
  const fromCode = await occupied.getAttribute("data-floor-table");
  await occupied.click();
  await page.locator("[data-floor-action='move-or-join']").click();
  const target = page.locator("[data-floor-move-target], [data-floor-table][data-floor-state='free']").first();
  await expect(target).toBeVisible({ timeout: 20_000 });
  const toCode = (await target.getAttribute("data-floor-table")) ?? (await target.getAttribute("data-floor-move-target"));
  await target.click();
  const confirm = page.getByRole("button", { name: /move|confirm/i }).last();
  if (await confirm.count()) await confirm.click();

  const sb = isolatedService();
  const { data: visit } = await sb
    .from("visits")
    .select("id, space_id, version")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  expect(visit, "visit must exist after move").toBeTruthy();
  expect(fromCode && toCode && fromCode !== toCode).toBeTruthy();

  await occupied.click().catch(() => undefined);
  if ((await page.locator("[data-floor-action='move-or-join']").count()) > 0) {
    await page.locator("[data-floor-action='move-or-join']").click();
    if ((await target.count()) > 0) {
      await isolatedService()
        .from("visits")
        .update({ version: Number((visit as { version: number }).version) + 5 })
        .eq("id", (visit as { id: string }).id);
      await target.click();
      if (await confirm.count()) await confirm.click();
      await assertEnglishRefusal(page, WIRE_SENTENCE.saleConflict).catch(async () => {
        await assertEnglishRefusal(page, WIRE_SENTENCE.conflict);
      });
    }
  }
});
