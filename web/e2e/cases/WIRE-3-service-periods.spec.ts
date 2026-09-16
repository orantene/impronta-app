/**
 * 3.4 Service periods (W14, Settings › Service periods).
 * Ground truth: a `service_periods` row from the card; the reservation slot
 * reader follows periods once they exist (`lib/reservations/periods.ts`).
 * Refusal: a second period on the same days whose window overlaps → `overlap`
 * in words, and only one row exists.
 */
import { test, expect, prepareJourneysPage, skipUnlessFixture } from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import { openSettingsCard } from "./_wire";

skipUnlessFixture();

test("WIRE-3.4 a service period is written; an overlapping one is refused", async ({ page }) => {
  test.setTimeout(240_000);
  await prepareJourneysPage(page);
  const sb = isolatedService();
  const stamp = Date.now();
  const rows = async () => {
    const { data } = await sb.from("service_periods").select("id, name, weekday_mask, starts_local, ends_local, turn_minutes").eq("tenant_id", JOURNEYS_TENANT_ID).like("name", `WIRE %${stamp}`);
    return (data ?? []) as { id: string; name: string; weekday_mask: number; starts_local: string; ends_local: string; turn_minutes: number }[];
  };
  const addPeriod = async (name: string, starts: string, ends: string) => {
    await page.getByTestId("periods-add").click();
    await page.getByTestId("periods-name").fill(name);
    await page.getByTestId("periods-starts").fill(starts);
    await page.getByTestId("periods-ends").fill(ends);
    await page.getByTestId("periods-turn").fill("90");
    await page.getByTestId("periods-save").click();
  };
  try {
    await openSettingsCard(page, "Service periods", "service-periods-card");
    await addPeriod(`WIRE lunch ${stamp}`, "12:00", "16:00");
    await expect(page.getByTestId("periods-save-state")).toHaveAttribute("data-save-state", "saved", { timeout: 30_000 });
    await expect.poll(async () => (await rows()).length, { timeout: 20_000 }).toBe(1);
    const lunch = (await rows())[0];
    expect(lunch.starts_local.slice(0, 5)).toBe("12:00");
    expect(lunch.ends_local.slice(0, 5)).toBe("16:00");
    expect(Number(lunch.turn_minutes)).toBe(90);
    expect(Number(lunch.weekday_mask)).toBeGreaterThan(0);
    await expect(page.getByTestId(`periods-row-${lunch.id}`)).toBeVisible();

    // Refusal: the same weekdays, 15:00–19:00 overlaps 12:00–16:00.
    await addPeriod(`WIRE clash ${stamp}`, "15:00", "19:00");
    await expect(page.getByTestId("periods-save-state")).toHaveAttribute("data-save-state", "failed", { timeout: 30_000 });
    await expect(page.getByTestId("periods-save-state")).toContainText("Those service periods overlap.");
    expect((await rows()).length).toBe(1);
  } finally {
    const mine = (await rows()).map((r) => r.id);
    if (mine.length) await sb.from("service_periods").delete().in("id", mine);
  }
});
