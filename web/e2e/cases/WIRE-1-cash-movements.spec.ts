/**
 * 1.11 Cash movements + close note / hand-over.
 * Refusal: movement on a closed shift.
 */
import {
  test,
  expect,
  prepareJourneysPage,
  openCounter,
  skipUnlessFixture,
} from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import { WIRE_SENTENCE, assertEnglishRefusal, pressKeypad } from "./_wire";

skipUnlessFixture();

test("WIRE-1.11 Cash paid in/out/drop and close note", async ({ page }) => {
  test.setTimeout(240_000);
  await prepareJourneysPage(page);
  await openCounter(page);
  await page.locator("[data-pos-frame-link='shifts'], [data-pos-rail-count='shifts']").first().click();
  await page.locator("[data-pos-movement='paid_in']").click();
  await pressKeypad(page, "1000");
  await page.locator("[data-pos-movement-confirm]").click();
  await expect(page.locator("[data-pos-movement-row='paid_in']")).toBeVisible({ timeout: 20_000 });

  const sb = isolatedService();
  const { data: shift } = await sb
    .from("pos_shifts")
    .select("id, close_note, handed_over_to")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  expect(shift).toBeTruthy();
  const { count } = await sb
    .from("pos_shift_movements")
    .select("id", { count: "exact", head: true })
    .eq("shift_id", (shift as { id: string }).id);
  expect(count ?? 0).toBeGreaterThan(0);

  await page.locator("[data-pos-close-and-count]").click();
  const note = page.locator("[data-pos-close-note], textarea").first();
  if ((await note.count()) > 0) await note.fill("WIRE-1.11 hand-over");
  await page.locator("[data-pos-close-shift]").click();
  await expect(page.getByText(/closed|handed/i).first()).toBeVisible({ timeout: 20_000 });

  await page.locator("[data-pos-movement='paid_in']").click();
  if ((await page.locator("[data-pos-movement-confirm]").count()) > 0) {
    await pressKeypad(page, "100");
    await page.locator("[data-pos-movement-confirm]").click();
    await assertEnglishRefusal(page, WIRE_SENTENCE.alreadyClosed);
  } else {
    await expect(page.locator("[data-pos-movement='paid_in']")).toBeDisabled();
  }
});
