import {
  fillMorningClassToCapacity,
  LAST_PLACE_CLASS_POOL_ID,
  LAST_PLACE_CLASS_SESSION_ID,
  MORNING_CLASS_POOL_ID,
  releaseLastPlaceClassSeat,
  releaseMorningClassSeats,
} from "../../cases/_isolated-db";
import { isolatedService, JOURNEYS_TENANT_ID } from "../../cases/_isolated-db";
import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  expect,
  openAdminMessages,
  openFirstInboxRow,
  openPlusTray,
  prepareJourneysPage,
  shot,
  signInJourneysStaff,
  test,
} from "../_harness";

/**
 * Class capacity refusals (Round 2).
 *
 * Storefront session_picker may be absent from the restaurant homepage; the
 * required Messages proof is Items picker busy/sold-out after the pool is
 * full, plus POS walk-in refusal for the last-seat / 13th seat.
 *
 * D-MSG-317: fixture sessions must be in the future or every capacity door
 * reads "no night / no dates".
 */
async function commitPoolUnits(poolId: string, units: number): Promise<void> {
  const admin = isolatedService();
  const now = new Date().toISOString();
  await admin
    .from("capacity_allocations")
    .update({ state: "released", released_at: now })
    .eq("pool_id", poolId)
    .in("state", ["hold", "committed"]);
  const { error } = await admin.from("capacity_allocations").insert({
    tenant_id: JOURNEYS_TENANT_ID,
    pool_id: poolId,
    pool_path: [poolId],
    units,
    state: "committed",
    starts_at: null,
    ends_at: null,
    expires_at: null,
    released_at: null,
  });
  if (error) throw new Error(error.message);
}

test.describe("QA capacity — class seat limit", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(240_000);

  test("last place full → Messages Classes busy sold out", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      await releaseLastPlaceClassSeat();
      await commitPoolUnits(LAST_PLACE_CLASS_POOL_ID, 1);
    }

    await openAdminMessages(page);
    await openFirstInboxRow(page);
    await openPlusTray(page);
    await page.locator('[data-tray-item="add_items"]').click();
    const picker = page.locator("[data-items-picker], [data-sheet]").first();
    await expect(picker, "Items picker did not open").toBeVisible({ timeout: 20_000 });
    const classesChip = picker.locator("[data-items-chips]").getByText(/^classes$/i).first();
    await expect(classesChip, "Classes category chip missing").toBeVisible({ timeout: 15_000 });
    await classesChip.click();
    const busy = picker.locator("[data-items-row][data-availability='busy']").first();
    await expect(
      busy,
      "Messages Items has no busy class row after Last place pool filled — seed 1 committed unit on LAST_PLACE_CLASS_POOL_ID",
    ).toBeVisible({ timeout: 20_000 });
    const sub = ((await busy.innerText()) || "").replace(/\s+/g, " ");
    expect(sub, `expected sold out / full; got: ${sub}`).toMatch(/sold out|full|no longer free/i);
    await shot(page, "cap-class-messages-busy");
    void LAST_PLACE_CLASS_SESSION_ID;

    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("morning filled to 12 → POS 13th seat refused with sentence", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      await fillMorningClassToCapacity();
    }

    await prepareJourneysPage(page);
    await signInJourneysStaff(page, "/admin/pos");
    await expect(page.getByText(/host not registered/i)).toHaveCount(0);
    // Counter: Complimentary class → Morning class when chooser appears.
    const start = page.getByRole("button", { name: /new sale|start sale|sell/i }).first();
    if (await start.isVisible().catch(() => false)) await start.click();
    const tile = page.getByRole("button", { name: /^Complimentary class/i }).first();
    await expect(tile, "Complimentary class POS tile missing").toBeVisible({ timeout: 30_000 });
    await tile.click();
    const chooser = page.getByRole("dialog", { name: /complimentary class/i });
    if (await chooser.isVisible().catch(() => false)) {
      await chooser.getByRole("button", { name: /morning class/i }).click();
    }
    await page.waitForTimeout(1500);
    // Name buyer if prompted, then collect — expect sold-out / just taken alert.
    const email = page.getByLabel(/^email$/i).first();
    if (await email.isVisible().catch(() => false)) {
      await email.fill(`qa-cap-13th-${Date.now()}@impronta.test`);
    }
    const collect = page.getByRole("button", { name: /collect|cash|pay|charge/i }).first();
    if (await collect.isVisible().catch(() => false)) await collect.click();
    await expect(
      page.getByRole("alert").or(page.getByText(/sold out|just taken|no longer free|not available/i)).first(),
      "13th Morning seat must refuse with a sentence (not crash, not Paid)",
    ).toBeVisible({ timeout: 40_000 });
    await expect(page.getByRole("heading", { name: /^paid$/i })).toHaveCount(0);
    await shot(page, "cap-class-13th-refused");

    if (process.env.SUPABASE_SERVICE_ROLE_KEY) await releaseMorningClassSeats();
    void MORNING_CLASS_POOL_ID;
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
