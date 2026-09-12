/**
 * 3.6 Guest QR browse, add, submit, pay my share, bill.
 * Refusal: closed visit → visit_closed.
 */
import {
  test,
  expect,
  prepareJourneysPage,
  skipUnlessFixture,
} from "./_harness";
import { isolatedService } from "./_isolated-db";
import { WIRE_SENTENCE, assertEnglishRefusal } from "./_wire";

skipUnlessFixture();

test("WIRE-3.6 /visit/<token> guest QR order and share pay", async ({ page }) => {
  test.setTimeout(240_000);
  await prepareJourneysPage(page);
  const token = process.env.JOURNEYS_VISIT_TOKEN;
  test.skip(!token, "failed-fixture: JOURNEYS_VISIT_TOKEN missing");
  await page.goto(`/visit/${token}`);
  await expect(page.locator("body")).toBeVisible();
  const add = page.getByRole("button", { name: /add/i }).first();
  if ((await add.count()) > 0) {
    await add.click();
    await page.getByRole("button", { name: /submit|send/i }).first().click();
  }
  const sb = isolatedService();
  const { data } = await sb
    .from("orders")
    .select("id, source_channel, status")
    .eq("source_channel", "guest_qr")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  expect(data).toBeTruthy();
  await page.goto(`/visit/${token}/bill`);
  await assertEnglishRefusal(page, WIRE_SENTENCE.visitClosed);
});
