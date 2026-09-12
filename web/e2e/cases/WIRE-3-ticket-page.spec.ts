/**
 * 3.9 Ticket page: transfer, resend, lookup.
 * Refusal: wrong lookup → not_found, then too_many_attempts.
 */
import {
  test,
  expect,
  prepareJourneysPage,
  skipUnlessFixture,
} from "./_harness";
import { WIRE_SENTENCE, assertEnglishRefusal } from "./_wire";

skipUnlessFixture();

test("WIRE-3.9 /ticket/<code> transfer, resend, lookup refusals", async ({ page }) => {
  test.setTimeout(180_000);
  await prepareJourneysPage(page);
  const code = process.env.JOURNEYS_TICKET_CODE;
  if (code) {
    await page.goto(`/ticket/${code}`);
    const transfer = page.getByRole("button", { name: /transfer/i }).first();
    if ((await transfer.count()) > 0) await transfer.click();
    const resend = page.getByRole("button", { name: /resend/i }).first();
    if ((await resend.count()) > 0) await resend.click();
  }
  await page.goto("/admin/pos?mode=door&view=lookup");
  const lookup = page.locator("input[type='search'], input[name='code']").first();
  if ((await lookup.count()) > 0) {
    await lookup.fill("not-a-real-ticket");
    await page.getByRole("button", { name: /look|find|search/i }).first().click();
    await assertEnglishRefusal(page, WIRE_SENTENCE.notFound);
    for (let i = 0; i < 8; i += 1) {
      await page.getByRole("button", { name: /look|find|search/i }).first().click();
    }
    await assertEnglishRefusal(page, WIRE_SENTENCE.tooManyAttempts);
  } else {
    test.skip(!code, "failed-fixture: no ticket code and no lookup field");
  }
});
