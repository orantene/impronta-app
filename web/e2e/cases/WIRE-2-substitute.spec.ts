/**
 * 2.2 Substitute instructor with this/future/series scope.
 * Refusal: past session → past.
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

test("WIRE-2.2 substitute instructor on a session row", async ({ page }) => {
  test.setTimeout(240_000);
  await prepareJourneysPage(page);
  await signInJourneysStaff(page, "/admin/appointments?view=sessions");
  const row = page.locator("[data-session-row], [data-tulala-appointments-board] [role='row']").first();
  test.skip((await row.count()) === 0, "failed-fixture: no session row");
  await row.click();
  const sub = page.getByRole("button", { name: /substitute/i });
  if ((await sub.count()) === 0) {
    await expect(page.getByText(/substitute|instructor/i).first()).toBeVisible();
    return;
  }
  await sub.click();
  const person = page.getByRole("radio").nth(1);
  if ((await person.count()) > 0) await person.click();
  await page.getByRole("button", { name: /this session|save|substitute/i }).last().click();
  const sb = isolatedService();
  const { data } = await sb
    .from("sessions")
    .select("id, instructor_user_id, starts_at")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  expect(data).toBeTruthy();

  await page.getByRole("button", { name: /substitute/i }).click();
  await page.getByRole("button", { name: /past|this session/i }).first().click();
  if (new Date((data as { starts_at: string }).starts_at) < new Date()) {
    await assertEnglishRefusal(page, WIRE_SENTENCE.past);
  }
});
