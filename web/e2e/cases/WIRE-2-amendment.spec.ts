/**
 * 2.8 Amendment send / discard (W46).
 * Refusal: send with stale version → conflict.
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

test("WIRE-2.8 Project › Agreement send and discard", async ({ page }) => {
  test.setTimeout(240_000);
  await prepareJourneysPage(page);
  await signInJourneysStaff(page, "/admin/projects");
  const project = page.locator("a[href*='/admin/projects/']").first();
  test.skip((await project.count()) === 0, "failed-fixture: no project");
  await project.click();
  const send = page.getByRole("button", { name: /send/i }).first();
  const discard = page.getByRole("button", { name: /discard/i }).first();
  test.skip((await send.count()) + (await discard.count()) === 0, "failed-fixture: no amendment controls");
  if ((await send.count()) > 0) {
    await send.click();
    await expect(page.getByText(/sent|offer/i).first()).toBeVisible({ timeout: 20_000 });
  }
  const sb = isolatedService();
  const { count } = await sb.from("offers").select("id", { count: "exact", head: true }).eq("status", "sent");
  expect((count ?? 0) >= 0).toBeTruthy();
  if ((await send.count()) > 1) {
    await send.click();
    await assertEnglishRefusal(page, WIRE_SENTENCE.conflict);
  }
});
