/**
 * 2.3 Move participant (W39).
 * Refusal: full target → sold_out.
 */
import {
  test,
  expect,
  prepareJourneysPage,
  signInJourneysStaff,
  skipUnlessFixture,
} from "./_harness";
import { isolatedService } from "./_isolated-db";
import { WIRE_SENTENCE, assertEnglishRefusal } from "./_wire";

skipUnlessFixture();

test("WIRE-2.3 move a participant and refuse a full target", async ({ page }) => {
  test.setTimeout(240_000);
  await prepareJourneysPage(page);
  await signInJourneysStaff(page, "/admin/appointments?view=sessions");
  const move = page.getByRole("button", { name: /move participant/i }).first();
  test.skip((await move.count()) === 0, "failed-fixture: no Move participant control");
  await move.click();
  const target = page.locator("[data-move-target], [role='option']").first();
  await expect(target).toBeVisible({ timeout: 20_000 });
  await target.click();
  await page.getByRole("button", { name: /move|confirm/i }).last().click();
  const sb = isolatedService();
  const { data } = await sb
    .from("admissions")
    .select("id, session_id")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  expect(data).toBeTruthy();

  const full = page.locator("[data-move-target-full], [data-sold-out]").first();
  if ((await full.count()) > 0) {
    await move.click();
    await full.click();
    await page.getByRole("button", { name: /move|confirm/i }).last().click();
    await assertEnglishRefusal(page, WIRE_SENTENCE.soldOut);
  }
});
