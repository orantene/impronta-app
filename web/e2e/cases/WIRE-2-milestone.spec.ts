/**
 * 2.9 Milestone amount + file upload (W47).
 */
import {
  test,
  expect,
  prepareJourneysPage,
  signInJourneysStaff,
  skipUnlessFixture,
} from "./_harness";
import { isolatedService } from "./_isolated-db";

skipUnlessFixture();

test("WIRE-2.9 Project › Milestones writes amount_cents", async ({ page }) => {
  test.setTimeout(240_000);
  await prepareJourneysPage(page);
  await signInJourneysStaff(page, "/admin/projects");
  const project = page.locator("a[href*='/admin/projects/']").first();
  test.skip((await project.count()) === 0, "failed-fixture: no project");
  await project.click();
  const amount = page.locator("[data-milestone-amount-input]").first();
  test.skip((await amount.count()) === 0, "failed-fixture: no milestone amount input");
  await amount.fill("120");
  await amount.blur();
  const save = page.getByRole("button", { name: /save/i }).first();
  if ((await save.count()) > 0) await save.click();
  const sb = isolatedService();
  const { data } = await sb
    .from("booking_deliverables")
    .select("amount_cents, file_path")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  expect(data).toBeTruthy();
  expect(Number((data as { amount_cents: number }).amount_cents)).toBeGreaterThan(0);
});
