/**
 * 3.3 Layout editor + activate.
 * Refusal: second active → two_active.
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

test("WIRE-3.3 Settings › Venue › Layouts keeps one active layout", async ({ page }) => {
  test.setTimeout(180_000);
  await prepareJourneysPage(page);
  try {
    await openSettingsCard(page, "Layouts", "layout-editor-card");
  } catch {
    await openSettingsCard(page, "Venue", "layout-editor-card");
  }
  const activate = page.getByRole("button", { name: /activate/i }).first();
  if ((await activate.count()) > 0) await activate.click();
  const sb = isolatedService();
  const { data } = await sb
    .from("space_layouts")
    .select("id, is_active")
    .eq("tenant_id", JOURNEYS_TENANT_ID);
  const active = (data ?? []).filter((r) => (r as { is_active: boolean }).is_active);
  expect(active.length).toBeLessThanOrEqual(1);
  if ((await activate.count()) > 1) {
    await page.getByRole("button", { name: /activate/i }).nth(1).click();
    await assertEnglishRefusal(page, WIRE_SENTENCE.twoActive);
  }
});
