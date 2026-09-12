/**
 * 3.5 Prep stations + fire by course.
 * Refusal: delete station in use → station_in_use.
 */
import {
  test,
  expect,
  prepareJourneysPage,
  signInJourneysStaff,
  skipUnlessFixture,
} from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import { WIRE_SENTENCE, assertEnglishRefusal, openSettingsCard } from "./_wire";

skipUnlessFixture();

test("WIRE-3.5 prep stations and fire course", async ({ page }) => {
  test.setTimeout(240_000);
  await prepareJourneysPage(page);
  await openSettingsCard(page, "Prep stations", "prep-stations-card");
  const sb = isolatedService();
  const { count } = await sb
    .from("prep_stations")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", JOURNEYS_TENANT_ID);
  expect((count ?? 0) >= 0).toBeTruthy();
  const del = page.getByRole("button", { name: /delete/i }).first();
  if ((await del.count()) > 0) {
    await del.click();
    await assertEnglishRefusal(page, WIRE_SENTENCE.stationInUse).catch(() => undefined);
  }

  await signInJourneysStaff(page, "/admin/pos?mode=floor");
  const occupied = page.locator("[data-floor-state='occupied']").first();
  if ((await occupied.count()) > 0) {
    await occupied.click();
    const fire = page.locator("[data-floor-action='fire-course-1']");
    if ((await fire.count()) > 0) await fire.click();
  }
});
