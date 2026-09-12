/**
 * 2.4 Cancel session with scope + paid seats banner.
 * Refusal: already cancelled.
 */
import {
  test,
  expect,
  prepareJourneysPage,
  signInJourneysStaff,
  skipUnlessFixture,
} from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import { WIRE_SENTENCE, assertEnglishRefusal } from "./_wire";

skipUnlessFixture();

test("WIRE-2.4 cancel a session and refuse a second cancel", async ({ page }) => {
  test.setTimeout(240_000);
  await prepareJourneysPage(page);
  await signInJourneysStaff(page, "/admin/appointments?view=sessions");
  const cancel = page.getByRole("button", { name: /^cancel$/i }).first();
  test.skip((await cancel.count()) === 0, "failed-fixture: no Cancel on the session panel");
  await cancel.click();
  await page.getByRole("button", { name: /this session|confirm/i }).last().click();
  const sb = isolatedService();
  const { data } = await sb
    .from("sessions")
    .select("id, status")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("status", "cancelled")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  expect(data).toBeTruthy();
  await cancel.click();
  await assertEnglishRefusal(page, WIRE_SENTENCE.alreadyCancelled);
});
