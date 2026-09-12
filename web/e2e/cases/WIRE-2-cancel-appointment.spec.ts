/**
 * 2.5 Cancel appointment (staff) with policy.
 * Refusal: non-cancellable → not_reschedulable / not_cancellable.
 */
import {
  test,
  expect,
  prepareJourneysPage,
  signInJourneysStaff,
  skipUnlessFixture,
} from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import { WIRE_SENTENCE } from "./_wire";

skipUnlessFixture();

test("WIRE-2.5 staff cancel on an appointment row", async ({ page }) => {
  test.setTimeout(240_000);
  await prepareJourneysPage(page);
  await signInJourneysStaff(page, "/admin/appointments?view=list");
  const row = page.locator("[data-appointment-row]").first();
  test.skip((await row.count()) === 0, "failed-fixture: no appointment row");
  await row.click();
  const cancel = page.getByRole("button", { name: /^cancel$/i }).first();
  await cancel.click();
  await page.getByRole("button", { name: /confirm|cancel booking/i }).last().click();
  const sb = isolatedService();
  const { data } = await sb
    .from("talent_bookings")
    .select("id, status")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .in("status", ["cancelled", "canceled"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  expect(data).toBeTruthy();

  await cancel.click();
  await expect(
    page
      .getByText(WIRE_SENTENCE.notCancellable, { exact: true })
      .or(page.getByText(WIRE_SENTENCE.notReschedulable, { exact: true })),
  ).toBeVisible({ timeout: 20_000 });
});
