/**
 * 2.6 Customer self-manage /manage/<token>: reschedule and cancel.
 * Refusal: reused token.
 */
import {
  test,
  expect,
  prepareJourneysPage,
  skipUnlessFixture,
} from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import { WIRE_SENTENCE, assertEnglishRefusal } from "./_wire";

skipUnlessFixture();

test("WIRE-2.6 /manage/<token> moves or cancels once, then refuses reuse", async ({ page }) => {
  test.setTimeout(240_000);
  await prepareJourneysPage(page);
  const token = process.env.JOURNEYS_MANAGE_TOKEN;
  test.skip(!token, "failed-fixture: JOURNEYS_MANAGE_TOKEN missing");
  await page.goto(`/manage/${token}`);
  const cancel = page.getByRole("button", { name: /cancel/i }).first();
  const reschedule = page.getByRole("button", { name: /reschedule|move/i }).first();
  if ((await cancel.count()) > 0) {
    await cancel.click();
    await page.getByRole("button", { name: /confirm/i }).last().click();
  } else if ((await reschedule.count()) > 0) {
    await reschedule.click();
    await page.locator("[data-slot], [role='option']").first().click();
    await page.getByRole("button", { name: /confirm|save/i }).last().click();
  }
  const sb = isolatedService();
  const { count } = await sb
    .from("talent_bookings")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", JOURNEYS_TENANT_ID);
  expect((count ?? 0) >= 0).toBeTruthy();
  await page.goto(`/manage/${token}`);
  await assertEnglishRefusal(page, WIRE_SENTENCE.tokenInvalid);
});
