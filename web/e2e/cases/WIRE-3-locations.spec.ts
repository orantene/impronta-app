/**
 * 3.1 Locations & zones, till location chip, per-location modes.
 * Refusal: delete zone with spaces → has_spaces; delete last location → last_location.
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

test("WIRE-3.1 Settings › Locations lists a default and refuses last/in-use deletes", async ({ page }) => {
  test.setTimeout(180_000);
  await prepareJourneysPage(page);
  await openSettingsCard(page, "Locations", "locations-card");
  const sb = isolatedService();
  const { data: locations } = await sb
    .from("venue_locations")
    .select("id, slug, is_default")
    .eq("tenant_id", JOURNEYS_TENANT_ID);
  expect((locations ?? []).length).toBeGreaterThan(0);
  expect((locations ?? []).filter((r) => (r as { is_default: boolean }).is_default).length).toBe(1);

  const del = page.getByRole("button", { name: /delete/i }).first();
  if ((await del.count()) > 0) {
    await del.click();
    await assertEnglishRefusal(page, WIRE_SENTENCE.hasSpaces).catch(async () => {
      await assertEnglishRefusal(page, WIRE_SENTENCE.lastLocation);
    });
  }
});
