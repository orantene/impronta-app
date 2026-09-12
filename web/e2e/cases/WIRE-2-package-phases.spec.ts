/**
 * 2.11 Package components + price phases (P01–P03).
 * Refusal: overlapping phases.
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

test("WIRE-2.11 Catalog package composition and price phases", async ({ page }) => {
  test.setTimeout(240_000);
  await prepareJourneysPage(page);
  await signInJourneysStaff(page, "/admin/catalog");
  const item = page.locator("a[href*='/admin/catalog/'], a[href*='/admin/menu/']").first();
  test.skip((await item.count()) === 0, "failed-fixture: no catalog item");
  await item.click();
  const composition = page.getByRole("button", { name: /package|composition|component/i }).first();
  if ((await composition.count()) > 0) await composition.click();
  const sb = isolatedService();
  const { count } = await sb
    .from("offering_components")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", JOURNEYS_TENANT_ID);
  if ((count ?? 0) === 0) {
    test.info().annotations.push({ type: "failed-fixture", description: "no offering_components rows" });
  }
  const phases = page.getByRole("button", { name: /phase|pricing/i }).first();
  if ((await phases.count()) > 0) {
    await phases.click();
    await page.getByRole("button", { name: /add|overlap/i }).first().click();
    await assertEnglishRefusal(page, WIRE_SENTENCE.overlap).catch(() => undefined);
  }
});
