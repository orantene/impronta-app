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
 * reserve must refuse with a sentence (not crash).
 *
 * Messages Items: `loadTableRows` only emits free slots (D-MSG-333), so a full
 * pool yields no Tables chip — prove that absence, not a busy row.
 *
 * SEAM D-MSG-156: table LINE writer still missing on Messages Confirm; this
 * spec proves storefront refusal + Items omits full tables, not Confirm conflict.
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

  test("table pool full → reserve refuses + Messages omits Tables chip", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    test.skip(
      !process.env.SUPABASE_SERVICE_ROLE_KEY,
      "SUPABASE_SERVICE_ROLE_KEY required to fill table group pool",
    );
    await fillTableGroupToCapacity();

    await prepareJourneysPage(page);
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60_000 });
    // Same door C06 uses — loose getByText(/reservar|party of/) races the
    // availability probe and then looks for a submit that never appears when
    // the day is already full ("Pick a time" stays disabled).
    const board = page.locator("[data-builder-node-kind='reserve_table']");
    await expect(board, "storefront reserve_table block missing").toBeVisible({
      timeout: 20_000,
    });
    await expect(board.getByText(/checking the book/i)).toHaveCount(0, { timeout: 20_000 });
    await expect(
      board.getByText(
        /sold out|not available|no tables|fully booked|just taken|no longer free|try another date/i,
      ).first(),
      "table overbook must refuse with a readable sentence on the reserve_table board",
    ).toBeVisible({ timeout: 30_000 });
    await shot(page, "cap-table-storefront-refused");

    await openAdminMessages(page);
    await openFirstInboxRow(page);
    await openPlusTray(page);
    await page.locator('[data-tray-item="add_items"]').click();
    const items = page.locator("[data-items-picker], [data-sheet]").first();
    await expect(items, "Items picker did not open").toBeVisible({ timeout: 20_000 });
    // D-MSG-333: full pool → loadTableRows returns [] → Tables chip absent.
    await expect(
      items.locator("[data-items-chips]").getByText(/^tables$/i),
      "Tables chip must stay absent when every free slot is gone (catalog omits full slots)",
    ).toHaveCount(0);
    await shot(page, "cap-table-messages-no-tables-chip");

    expect(errors, errors.join("\n")).toEqual([]);
  });
});
