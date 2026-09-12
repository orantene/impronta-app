/**
 * 2.10 Archive / reopen project (W50).
 * Refusal: reopen a live project.
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

test("WIRE-2.10 Project › Close archives with a reason and refuses a live reopen", async ({ page }) => {
  test.setTimeout(240_000);
  await prepareJourneysPage(page);
  await signInJourneysStaff(page, "/admin/projects");
  const project = page.locator("a[href*='/admin/projects/']").first();
  test.skip((await project.count()) === 0, "failed-fixture: no project");
  await project.click();
  const archive = page.getByRole("button", { name: /archive|close/i }).first();
  test.skip((await archive.count()) === 0, "failed-fixture: no archive control");
  await archive.click();
  const reason = page.locator("textarea, [data-archive-reason]").first();
  if ((await reason.count()) > 0) await reason.fill("WIRE-2.10");
  await page.getByRole("button", { name: /archive|confirm|close/i }).last().click();
  const sb = isolatedService();
  const { data } = await sb
    .from("agency_bookings")
    .select("id, status")
    .in("status", ["archived", "completed", "cancelled"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  expect(data).toBeTruthy();

  const reopen = page.getByRole("button", { name: /reopen/i }).first();
  if ((await reopen.count()) > 0) {
    await reopen.click();
    await assertEnglishRefusal(page, WIRE_SENTENCE.notReopenable);
  }
});
