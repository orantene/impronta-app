/**
 * 4.6 Customer thread `/c/t/<token>` (MC01–MC14): the signed link a customer
 * follows. The door: a `/pay/<code>` page for an order that came from a
 * conversation links "Back to the conversation" to `/c/t/<token>`
 * (`signThreadToken` runs in the app; nothing else mints it). Ground truth:
 * the cards on the page are the conversation's card messages and their
 * states come from `inquiry_messages.card_payload.state`. MC20 (visitor
 * continuation code) has no implementation on main (no `continuation` in
 * `lib/messaging`); recorded as not run.
 */
import { test, expect, prepareJourneysPage, skipUnlessFixture } from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";

skipUnlessFixture();

test("WIRE-4.6 /pay/<code> leads to /c/t/<token>; the cards and their states match the conversation", async ({ page }) => {
  test.setTimeout(180_000);
  await prepareJourneysPage(page);
  const sb = isolatedService();
  // A payment request card whose link is still open: its code opens /pay.
  const { data: card } = await sb
    .from("inquiry_messages")
    .select("inquiry_id, card_payload")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("message_kind", "payment_request")
    .order("created_at", { ascending: false })
    .limit(5);
  const rows = (card ?? []) as { inquiry_id: string; card_payload: { state: string; paymentLinkCode: string } }[];
  expect(rows.length, "failed-fixture: a payment_request card").toBeGreaterThan(0);
  const pick = rows[0];
  const code = pick.card_payload.paymentLinkCode;

  await page.goto(`/pay/${code}`);
  const back = page.getByRole("link", { name: "Back to the conversation" });
  await expect(back, "the pay page links back to the conversation").toBeVisible({ timeout: 30_000 });
  const href = await back.getAttribute("href");
  expect(href).toMatch(/^\/c\/t\/v1\./);
  await page.goto(href!);
  await expect(page.locator("[data-pos-messages='customer']")).toBeVisible({ timeout: 30_000 });

  // Every card kind on the page is a card message of this conversation.
  const { data: msgs } = await sb.from("inquiry_messages").select("message_kind, card_payload").eq("inquiry_id", pick.inquiry_id).not("card_payload", "is", null);
  const kinds = new Set(((msgs ?? []) as { message_kind: string }[]).map((m) => m.message_kind));
  const shown = await page.locator("[data-card-kind]").evaluateAll((els) => els.map((el) => el.getAttribute("data-card-kind")));
  expect(shown.length, "cards on the page").toBeGreaterThan(0);
  for (const k of shown) expect(kinds, `card ${k} is a message of the conversation`).toContain(k);
  expect(shown).toContain("payment_request");
  // The payment card's state: `sent` draws the pay door; `paid` draws none.
  const payCard = page.locator("[data-card-kind='payment_request']").first();
  if (pick.card_payload.state === "sent") {
    await expect(payCard.getByRole("link", { name: "Pay securely" })).toHaveAttribute("href", `/pay/${code}`);
  } else {
    await expect(payCard.getByRole("link", { name: "Pay securely" })).toHaveCount(0);
  }
});
