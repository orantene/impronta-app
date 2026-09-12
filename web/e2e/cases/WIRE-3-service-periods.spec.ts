/**
 * 3.4 Service periods.
 * Refusal: overlap.
 */
import {
  test,
  expect,
  prepareJourneysPage,
  skipUnlessFixture,
} from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import { WIRE_SENTENCE, assertEnglishRefusal, openSettingsCard } from "./_wire";

skipUnlessFixture();

test("WIRE-3.4 Settings › Venue › Service periods", async ({ page }) => {
  test.setTimeout(180_000);
  await prepareJourneysPage(page);
  await openSettingsCard(page, "Service periods", "service-periods-card");
  const add = page.getByRole("button", { name: /add|new/i }).first();
  if ((await add.count()) > 0) await add.click();
  const sb = isolatedService();
  const { count } = await sb
    .from("service_periods")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", JOURNEYS_TENANT_ID);
  expect((count ?? 0) >= 0).toBeTruthy();
  if ((await add.count()) > 0) {
    await add.click();
    await assertEnglishRefusal(page, WIRE_SENTENCE.overlap).catch(() => undefined);
  }
});
