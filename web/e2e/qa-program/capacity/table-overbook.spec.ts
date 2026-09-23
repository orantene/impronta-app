import { releaseJourneyTableReservations, TABLE_GROUP_POOL_ID } from "../../cases/_isolated-db";
import {
  attachConsoleGuard,
  expect,
  openAdminMessages,
  openFirstInboxRow,
  openPlusTray,
  prepareJourneysPage,
  shot,
  test,
} from "../_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "../../cases/_isolated-db";

/**
 * Table overbooking (Round 2).
 * Space-group pool units_total=4: fill to capacity via SQL, then storefront
 * reserve and Messages Tables row must refuse with a sentence (not crash).
 *
 * SEAM D-MSG-156: table LINE writer still missing on Messages Confirm; this
 * spec proves storefront refusal + Items picker busy, not Confirm conflict.
 */
async function fillTableGroupToCapacity(): Promise<void> {
  const admin = isolatedService();
  await releaseJourneyTableReservations();
  const now = new Date().toISOString();
  // Release any leftover allocations on the table group pool first.
  await admin
    .from("capacity_allocations")
    .update({ state: "released", released_at: now })
    .eq("pool_id", TABLE_GROUP_POOL_ID)
    .in("state", ["hold", "committed"]);
  const { error } = await admin.from("capacity_allocations").insert({
    tenant_id: JOURNEYS_TENANT_ID,
    pool_id: TABLE_GROUP_POOL_ID,
    pool_path: [TABLE_GROUP_POOL_ID],
    units: 4,
    state: "committed",
    starts_at: null,
    ends_at: null,
    expires_at: null,
    released_at: null,
  });
  if (error) throw new Error(error.message);
}

test.describe("QA capacity — table overbook", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(180_000);

  test("table pool full → reserve refuses + Messages Tables busy", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    test.skip(
      !process.env.SUPABASE_SERVICE_ROLE_KEY,
      "SUPABASE_SERVICE_ROLE_KEY required to fill table group pool",
    );
    await fillTableGroupToCapacity();

    await prepareJourneysPage(page);
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60_000 });
    const reserve = page.getByText(/reservar|reserve|book a table|party of/i).first();
    await expect(reserve, "storefront reservation door missing").toBeVisible({ timeout: 20_000 });
    await reserve.click();
    await page.waitForTimeout(800);
    // Attempt a party that would need a table — expect sold out / not available.
    const submit = page
      .getByRole("button", { name: /reserve|book|request|continue|find/i })
      .first();
    const alreadyRefused = page
      .getByText(/sold out|not available|no tables|fully booked|just taken|no longer free/i)
      .first();
    if (await alreadyRefused.isVisible().catch(() => false)) {
      // Widget already shows refusal without a further click.
    } else {
      await expect(
        submit,
        "reservation submit missing and no sold-out sentence yet — cannot prove table overbook",
      ).toBeVisible({ timeout: 15_000 });
      await submit.click();
    }
    await expect(
      alreadyRefused,
      "table overbook must refuse with a readable sentence",
    ).toBeVisible({ timeout: 30_000 });
    await shot(page, "cap-table-storefront-refused");

    await openAdminMessages(page);
    await openFirstInboxRow(page);
    await openPlusTray(page);
    await page.locator('[data-tray-item="add_items"]').click();
    const items = page.locator("[data-items-picker], [data-sheet]").first();
    await expect(items, "Items picker did not open").toBeVisible({ timeout: 20_000 });
    const tablesChip = items.locator("[data-items-chips]").getByText(/^tables$/i).first();
    await expect(tablesChip, "Tables category chip missing").toBeVisible({ timeout: 15_000 });
    await tablesChip.click();
    const busy = items.locator("[data-items-row][data-availability='busy']").first();
    await expect(
      busy,
      "Messages Tables row not busy after pool filled to 4",
    ).toBeVisible({ timeout: 20_000 });
    await shot(page, "cap-table-messages-busy");

    expect(errors, errors.join("\n")).toEqual([]);
  });
});
