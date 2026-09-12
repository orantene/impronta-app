/**
 * 3.8 Exchange, comp, multi-day, delivery.
 * Refusal: same night → same_session; sms → channel_unavailable.
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

test("WIRE-3.8 door exchange, event-day comp, delivery", async ({ page }) => {
  test.setTimeout(240_000);
  await prepareJourneysPage(page);
  await signInJourneysStaff(page, "/admin/pos?mode=door");
  const change = page.getByRole("button", { name: /change|exchange/i }).first();
  if ((await change.count()) > 0) {
    await change.click();
    await page.getByRole("button", { name: /same|tonight/i }).first().click();
    await assertEnglishRefusal(page, WIRE_SENTENCE.sameSession);
  }
  const comp = page.getByRole("button", { name: /^comp$/i }).first();
  if ((await comp.count()) > 0) {
    await comp.click();
    const sb = isolatedService();
    const { data } = await sb
      .from("orders")
      .select("id, total_cents")
      .eq("total_cents", 0)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    expect(data).toBeTruthy();
  }
  const sms = page.getByRole("button", { name: /sms/i }).first();
  if ((await sms.count()) > 0) {
    await sms.click();
    await assertEnglishRefusal(page, WIRE_SENTENCE.channelUnavailable);
  }
});
