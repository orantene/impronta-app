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

async function recordMovement(page: import("@playwright/test").Page, kind: string, digits: string) {
  await page.locator(`[data-pos-movement='${kind}']`).click();
  await pressKeypad(page, digits);
  await page.locator("[data-pos-movement-confirm]").click();
  await expect(page.locator(`[data-pos-movement-row='${kind}']`).first()).toBeVisible({
    timeout: 20_000,
  });
}

test("WIRE-1.11 Cash paid in/out/drop and close note", async ({ page }) => {
  test.setTimeout(240_000);
  await prepareJourneysPage(page);
  await openCounter(page);
  await page.locator("[data-pos-frame-link='shifts'], [data-pos-rail-count='shifts']").first().click();
  await recordMovement(page, "paid_in", "1000");
  await recordMovement(page, "paid_out", "200");
  await recordMovement(page, "drop", "300");

  const sb = isolatedService();
  const { data: shift } = await sb
    .from("pos_shifts")
    .select("id, close_note, handed_over_to, status")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  expect(shift).toBeTruthy();
  const shiftId = (shift as { id: string }).id;
  const { count } = await sb
    .from("pos_shift_movements")
    .select("id", { count: "exact", head: true })
    .eq("shift_id", shiftId);
  expect(count ?? 0).toBeGreaterThanOrEqual(3);

  await page.locator("[data-pos-close-and-count]").click();
  await expect(page.locator("#pos-shift-note")).toBeVisible({ timeout: 20_000 });
  await page.locator("#pos-shift-note").fill("WIRE-1.11 hand-over");
  await page.locator("#pos-shift-counted").fill("0");
  await page.locator("[data-pos-confirm-count]").check();
  await expect(page.locator("[data-pos-close-shift]")).toBeEnabled();
  await page.locator("[data-pos-close-shift]").click();
  await expect(page.getByText(/closed|handed/i).first()).toBeVisible({ timeout: 20_000 });

  const { data: closed } = await sb
    .from("pos_shifts")
    .select("status, close_note, handed_over_to")
    .eq("id", shiftId)
    .maybeSingle();
  expect((closed as { status: string } | null)?.status).toBe("closed");
  expect((closed as { close_note: string | null } | null)?.close_note).toContain("WIRE-1.11");

  await page.locator("[data-pos-movement='paid_in']").click();
  await pressKeypad(page, "100");
  await page.locator("[data-pos-movement-confirm]").click();
  await assertEnglishRefusal(page, WIRE_SENTENCE.alreadyClosed);
});
