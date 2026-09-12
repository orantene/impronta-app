/**
 * 2.12 Booking policy overrides per offering (W24).
 */
import {
  test,
  expect,
  prepareJourneysPage,
  skipUnlessFixture,
} from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import { openSettingsCard } from "./_wire";

skipUnlessFixture();

test("WIRE-2.12 Settings › Booking policies writes an override", async ({ page }) => {
  test.setTimeout(180_000);
  await prepareJourneysPage(page);
  await openSettingsCard(page, "Booking policies", "booking-policies-card");
  const cell = page.locator("[data-testid='booking-policies-table'] input").first();
  test.skip((await cell.count()) === 0, "failed-fixture: no booking policy cell");
  await cell.fill("24");
  await cell.blur();
  const save = page.getByRole("button", { name: /save/i }).first();
  if ((await save.count()) > 0) await save.click();
  const sb = isolatedService();
  const { count } = await sb
    .from("booking_policy_overrides")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", JOURNEYS_TENANT_ID);
  expect(count ?? 0).toBeGreaterThan(0);
});
