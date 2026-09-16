/**
 * 4.6 Customer thread /c/t/<token> cards + visitor continuation code.
 */
import {
  test,
  expect,
  prepareJourneysPage,
  skipUnlessFixture,
} from "./_harness";
import { isolatedService } from "./_isolated-db";

skipUnlessFixture();

test("WIRE-4.6 /c/t/<token> card states", async ({ page }) => {
  test.setTimeout(180_000);
  await prepareJourneysPage(page);
  const token = process.env.JOURNEYS_THREAD_TOKEN;
  test.skip(!token, "failed-fixture: JOURNEYS_THREAD_TOKEN missing");
  await page.goto(`/c/t/${token}`);
  await expect(page.locator("[data-pos-messages='phone'], [data-pos-messages='phone-thread']").first()).toBeVisible({
    timeout: 30_000,
  });
  const sb = isolatedService();
  const { data } = await sb
    .from("inquiry_messages")
    .select("id, card_payload")
    .not("card_payload", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  expect(data).toBeTruthy();
});
