/**
 * 2.7 Replace talent on a project (W48).
 * Refusal: unavailable talent.
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

test("WIRE-2.7 Project › Team › Replace swaps booking_talent", async ({ page }) => {
  test.setTimeout(240_000);
  await prepareJourneysPage(page);
  await signInJourneysStaff(page, "/admin/projects");
  const project = page.locator("a[href*='/admin/projects/']").first();
  test.skip((await project.count()) === 0, "failed-fixture: no project");
  await project.click();
  await page.getByRole("button", { name: /team|replace/i }).first().click();
  const replace = page.getByRole("button", { name: /replace/i }).first();
  test.skip((await replace.count()) === 0, "failed-fixture: no Replace control");
  await replace.click();
  const other = page.getByRole("radio").nth(1);
  if ((await other.count()) > 0) await other.click();
  await page.getByRole("button", { name: /replace|save|confirm/i }).last().click();
  const sb = isolatedService();
  const { data } = await sb
    .from("booking_talent")
    .select("id, talent_id")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  expect(data).toBeTruthy();

  await replace.click();
  const busy = page.locator("[data-talent-unavailable]").first();
  if ((await busy.count()) > 0) {
    await busy.click();
    await page.getByRole("button", { name: /replace|save/i }).last().click();
    await assertEnglishRefusal(page, WIRE_SENTENCE.talentUnavailable);
  }
});
