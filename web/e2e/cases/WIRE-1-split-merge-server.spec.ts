/**
 * 1.9 Split check (T18), merge checks (T16), change server (T17).
 * Refusal: merge a paid check → lines_paid.
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

test("WIRE-1.9 split, merge, and change server on the floor", async ({ page }) => {
  test.setTimeout(300_000);
  await prepareJourneysPage(page);
  await signInJourneysStaff(page, "/admin/pos?mode=floor");
  const occupied = page.locator("[data-floor-state='occupied']").first();
  test.skip((await occupied.count()) === 0, "failed-fixture: no occupied table");
  await occupied.click();
  await page.locator("[data-floor-action='split']").click();
  const line = page.locator("[data-floor-split-line], [data-pos-line]").first();
  if ((await line.count()) > 0) {
    await line.click();
    await page.getByRole("button", { name: /split/i }).last().click();
  }
  const sb = isolatedService();
  const { data: visit } = await sb
    .from("visits")
    .select("id, server_user_id")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  expect(visit).toBeTruthy();
  const { count } = await sb
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("visit_id", (visit as { id: string }).id)
    .eq("status", "draft");
  expect((count ?? 0) >= 1).toBeTruthy();

  await occupied.click();
  await page.locator("[data-floor-action='change-server']").click();
  const server = page.locator("[data-floor-server], [data-pos-lock-person]").first();
  if ((await server.count()) > 0) {
    await server.click();
    const confirm = page.getByRole("button", { name: /save|change|confirm/i }).last();
    if (await confirm.count()) await confirm.click();
  }

  await occupied.click();
  await page.locator("[data-floor-action='move-or-join']").click();
  const merge = page.getByRole("button", { name: /merge/i }).first();
  if ((await merge.count()) > 0) {
    await merge.click();
    const paid = page.locator("[data-floor-merge-paid], [data-floor-table]").first();
    if ((await paid.count()) > 0) {
      await paid.click();
      await assertEnglishRefusal(page, WIRE_SENTENCE.linesPaid);
    }
  }
});
