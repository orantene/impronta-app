/**
 * 2.12 Booking policy overrides per offering (W24, Settings › Booking
 * policies › Overrides). Ground truth: a `booking_policy_overrides` row for
 * the item with the deposit and free-cancel hours typed; the cancel path
 * reads it (`refundableCentsFromPolicy` applies overrides first, contract §3).
 * No refusal is named on the board; a cleared cell clears the column.
 */
import { test, expect, prepareJourneysPage, skipUnlessFixture } from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import { openSettingsCard } from "./_wire";

skipUnlessFixture();

const GARLIC = "75742607-c24c-4f08-9c35-4ebc0591b2c7";

test("WIRE-2.12 Overrides: typed cells land as booking_policy_overrides and a cleared cell clears the column", async ({ page }) => {
  test.setTimeout(240_000);
  await prepareJourneysPage(page);
  const sb = isolatedService();
  const read = async () => {
    const { data } = await sb.from("booking_policy_overrides").select("deposit_bps, cancel_free_hours, no_show_fee_cents").eq("tenant_id", JOURNEYS_TENANT_ID).eq("offering_id", GARLIC).maybeSingle();
    return data as { deposit_bps: number | null; cancel_free_hours: number | null; no_show_fee_cents: number | null } | null;
  };
  await sb.from("booking_policy_overrides").delete().eq("tenant_id", JOURNEYS_TENANT_ID).eq("offering_id", GARLIC);
  try {
    await openSettingsCard(page, "Booking policies", "booking-policies-card");
    const row = page.getByTestId(`booking-policy-override-${GARLIC}`);
    await expect(row, "Garlic bread has an override row").toBeVisible({ timeout: 30_000 });
    await row.getByLabel("Deposit %").fill("25");
    await row.getByLabel("Deposit %").blur();
    await expect(page.getByTestId("booking-policies-overrides-save-state")).toContainText(/saved/i, { timeout: 30_000 });
    await row.getByLabel("Free cancel (hours)").fill("48");
    await row.getByLabel("Free cancel (hours)").blur();
    await expect(page.getByTestId("booking-policies-overrides-save-state")).toContainText(/saved/i, { timeout: 30_000 });
    await expect.poll(async () => JSON.stringify(await read()), { timeout: 20_000 }).toBe(JSON.stringify({ deposit_bps: 2500, cancel_free_hours: 48, no_show_fee_cents: null }));

    // A blank cell keeps the default: clearing the deposit clears the column.
    await row.getByLabel("Deposit %").fill("");
    await row.getByLabel("Deposit %").blur();
    await expect(page.getByTestId("booking-policies-overrides-save-state")).toContainText(/saved/i, { timeout: 30_000 });
    await expect.poll(async () => (await read())?.deposit_bps ?? null, { timeout: 20_000 }).toBeNull();
    expect((await read())?.cancel_free_hours).toBe(48);
  } finally {
    await sb.from("booking_policy_overrides").delete().eq("tenant_id", JOURNEYS_TENANT_ID).eq("offering_id", GARLIC);
  }
});
