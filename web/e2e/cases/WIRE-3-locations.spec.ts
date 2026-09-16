/**
 * 3.1 Locations & zones (W23), the till's location chip, per-location modes.
 * Ground truth: `venue_locations` (exactly one default), a
 * `venue_location_zones` row from Add zone, `settings.pos.locations.<slug>.modes`
 * (the POS card writes `default.modes`, WIRE-0), the counter's location chip.
 * Refusal: delete a zone that still has a table → `has_spaces`, in words,
 * and the zone stays. `last_location` has no door on this card (there is no
 * close/delete-location control); it stays an engine refusal only.
 */
import { test, expect, prepareJourneysPage, signInJourneysStaff, skipUnlessFixture } from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import { WIRE_SENTENCE, openSettingsCard, readEnabledPosModes } from "./_wire";

skipUnlessFixture();

const SPACE_B1 = "33330011-0000-4000-8000-000000000014";

test("WIRE-3.1 one default location; a zone is added, refuses deletion while a table sits on it, then goes", async ({ page }) => {
  test.setTimeout(240_000);
  await prepareJourneysPage(page);
  const sb = isolatedService();
  const zoneName = `WIRE zone ${Date.now()}`;
  let zoneId: string | null = null;
  try {
    await openSettingsCard(page, "Locations", "locations-card");
    await expect(page.getByTestId("locations-row-default")).toBeVisible({ timeout: 20_000 });
    const { data: locations } = await sb.from("venue_locations").select("id, slug, is_default, status").eq("tenant_id", JOURNEYS_TENANT_ID);
    const rows = (locations ?? []) as { slug: string; is_default: boolean }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((r) => r.is_default).length, "exactly one default location").toBe(1);
    expect(rows.find((r) => r.is_default)?.slug).toBe("default");

    // Per-location modes: the POS card's writes live under the default slug (WIRE-0).
    expect((await readEnabledPosModes()).sort()).toEqual(["classes", "counter", "door", "floor", "projects"]);

    // Add a zone through the card.
    await page.getByTestId("locations-add-zone").click();
    await page.getByTestId("locations-new-zone-name").fill(zoneName);
    await page.getByTestId("locations-new-zone-confirm").click();
    await expect(page.getByTestId("locations-save-state")).toHaveAttribute("data-save-state", "saved", { timeout: 30_000 });
    await expect
      .poll(
        async () => {
          const { data } = await sb.from("venue_location_zones").select("id, kind").eq("tenant_id", JOURNEYS_TENANT_ID).eq("name", zoneName).maybeSingle();
          zoneId = (data as { id: string } | null)?.id ?? null;
          return zoneId;
        },
        { timeout: 20_000 },
      )
      .not.toBeNull();

    // Park a table on the zone; the delete must be refused in words.
    const park = await sb.from("spaces").update({ zone_id: zoneId }).eq("id", SPACE_B1);
    expect(park.error, park.error?.message).toBeNull();
    await page.getByTestId(`locations-zone-delete-${zoneId}`).click();
    await expect(page.getByTestId("locations-save-state")).toHaveAttribute("data-save-state", "failed", { timeout: 30_000 });
    await expect(page.getByTestId("locations-save-state")).toContainText(WIRE_SENTENCE.hasSpaces);
    const { count: still } = await sb.from("venue_location_zones").select("id", { count: "exact", head: true }).eq("id", zoneId!);
    expect(still).toBe(1);

    // Free the table; the delete goes through.
    const free = await sb.from("spaces").update({ zone_id: null }).eq("id", SPACE_B1);
    expect(free.error, free.error?.message).toBeNull();
    await page.getByTestId(`locations-zone-delete-${zoneId}`).click();
    await expect(page.getByTestId("locations-save-state")).toHaveAttribute("data-save-state", "saved", { timeout: 30_000 });
    await expect
      .poll(async () => (await sb.from("venue_location_zones").select("id", { count: "exact", head: true }).eq("id", zoneId!)).count ?? 0, { timeout: 20_000 })
      .toBe(0);
    zoneId = null;

    // The till's location chip names the default location.
    await signInJourneysStaff(page, "/admin/pos?mode=counter");
    await expect(page.locator("[data-pos-location]")).toContainText("QA Floor", { timeout: 30_000 });
  } finally {
    await sb.from("spaces").update({ zone_id: null }).eq("id", SPACE_B1);
    if (zoneId) await sb.from("venue_location_zones").delete().eq("id", zoneId);
  }
});
