/**
 * 3.3 Layout editor + activate (W13, R06, Settings › Layouts).
 * Ground truth: `space_layouts` with exactly one active per location, and
 * capacity pools untouched by activation (contract §3). "Second active →
 * two_active": the engine's activate swaps (deactivates the rest under the
 * same lock) and the active layout draws no Activate button, so two active
 * cannot be produced from the door (disabled-by-design); the count is what
 * is asserted.
 */
import { test, expect, prepareJourneysPage, skipUnlessFixture } from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import { openSettingsCard } from "./_wire";

skipUnlessFixture();

test("WIRE-3.3 two layouts, one active at a time, pools untouched", async ({ page }) => {
  test.setTimeout(240_000);
  await prepareJourneysPage(page);
  const sb = isolatedService();
  const stamp = Date.now();
  const names = [`WIRE layout A ${stamp}`, `WIRE layout B ${stamp}`];
  const layouts = async () => {
    const { data } = await sb.from("space_layouts").select("id, name, is_active, location_id").eq("tenant_id", JOURNEYS_TENANT_ID);
    return (data ?? []) as { id: string; name: string; is_active: boolean; location_id: string }[];
  };
  const { count: poolsBefore } = await sb.from("capacity_pools").select("id", { count: "exact", head: true }).eq("tenant_id", JOURNEYS_TENANT_ID);
  try {
    await openSettingsCard(page, "Layouts", "layout-editor-card");
    for (const name of names) {
      await page.getByTestId("layouts-add").click();
      await page.getByTestId("layouts-new-name").fill(name);
      await page.getByTestId("layouts-new-confirm").click();
      await expect(page.getByTestId("layouts-save-state")).toHaveAttribute("data-save-state", "saved", { timeout: 30_000 });
      await expect.poll(async () => (await layouts()).some((l) => l.name === name), { timeout: 20_000 }).toBe(true);
    }
    const [a, b] = names.map((n) => layouts().then((rows) => rows.find((l) => l.name === n)!));
    const rowA = await a;
    const rowB = await b;
    expect(rowA.is_active).toBe(false);
    expect(rowB.is_active).toBe(false);

    // Activate A: exactly one active on its location.
    await page.getByTestId(`layouts-row-${rowA.id}`).click();
    await page.getByTestId("layouts-activate").click();
    await expect(page.getByTestId("layouts-save-state")).toHaveAttribute("data-save-state", "saved", { timeout: 30_000 });
    await expect.poll(async () => (await layouts()).find((l) => l.id === rowA.id)?.is_active, { timeout: 20_000 }).toBe(true);
    let active = (await layouts()).filter((l) => l.location_id === rowA.location_id && l.is_active);
    expect(active.map((l) => l.id)).toEqual([rowA.id]);
    // The active layout offers no Activate: a second active cannot be asked for.
    await expect(page.getByTestId("layouts-activate")).toHaveCount(0);

    // Activate B: the engine swaps; still exactly one active.
    await page.getByTestId(`layouts-row-${rowB.id}`).click();
    await page.getByTestId("layouts-activate").click();
    await expect(page.getByTestId("layouts-save-state")).toHaveAttribute("data-save-state", "saved", { timeout: 30_000 });
    await expect.poll(async () => (await layouts()).find((l) => l.id === rowB.id)?.is_active, { timeout: 20_000 }).toBe(true);
    active = (await layouts()).filter((l) => l.location_id === rowB.location_id && l.is_active);
    expect(active.map((l) => l.id)).toEqual([rowB.id]);

    const { count: poolsAfter } = await sb.from("capacity_pools").select("id", { count: "exact", head: true }).eq("tenant_id", JOURNEYS_TENANT_ID);
    expect(poolsAfter, "activation never writes capacity").toBe(poolsBefore);
  } finally {
    const rows = await layouts();
    const mine = rows.filter((l) => names.includes(l.name)).map((l) => l.id);
    if (mine.length) {
      await sb.from("space_layout_items").delete().in("layout_id", mine);
      await sb.from("space_layouts").delete().in("id", mine);
    }
  }
});
