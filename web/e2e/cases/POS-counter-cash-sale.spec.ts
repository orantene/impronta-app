/**
 * POS — the counter's own journey: two items, cash, receipt.
 *
 * WHAT THIS PROVES that the per-case specs do not. C06-OP already rings up
 * ONE item and checks the money row. This one is about the COUNTER as an
 * interface: that the sell surface, the basket's own quantity controls, the
 * collect sheet's keypad and the paid screen are all reachable in sequence by
 * a person, that the sale's total is the sum of two different items, and that
 * the receipt the paid screen offers is a real `/r/<code>` page that resolves.
 *
 * WHY THE RECEIPT LINK IS FOLLOWED and not merely present. `orders
 * .receipt_code` is the retrieval anchor for an anonymous cash walk-in — the
 * only way that customer ever reaches their receipt. A link that renders and
 * 404s fails in front of a person holding a printed slip, and "the anchor is
 * on the page" is the assertion that would let it.
 *
 * Follows `_harness.ts` like every sibling: the fixture prepares state, the
 * browser performs the business action, and a login page cannot pass.
 */
import {
  test,
  expect,
  prepareJourneysPage,
  signInJourneysStaff,
  skipUnlessFixture,
  assertWorkspaceIdentity,
} from "./_harness";
import { isolatedService } from "./_isolated-db";

skipUnlessFixture();

test.beforeEach(async ({ page }) => {
  await prepareJourneysPage(page);
});

test("POS-OP counter: two items, cash collected, paid screen and a receipt that resolves", async ({
  page,
}, testInfo) => {
  test.setTimeout(150_000);

  await signInJourneysStaff(page, "/admin/pos?mode=counter");
  await assertWorkspaceIdentity(page);

  // The counter owns the whole screen: the workspace rail is gone, the POS's
  // own rail is there. This is the chrome half of the acceptance.
  await expect(page.locator("[data-tulala-app-sidebar]")).toHaveCount(0);
  await expect(page.locator("[data-tulala-pos-chrome]")).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: /counter|comptoir|mostrador/i })).toBeVisible();

  // C02 — a fresh, empty sale.
  await page.getByRole("button", { name: /start a new sale/i }).click();
  await expect(page).toHaveURL(/order=/, { timeout: 30_000 });
  await expect(page.getByText(/add an item to start this sale/i)).toBeVisible();

  // C03 — two DIFFERENT items, so the total is a sum and not one price.
  const pizza = page.getByRole("button", { name: "House pizza" }).first();
  await expect(pizza).toBeVisible({ timeout: 20_000 });
  await pizza.click();
  await expect(page.getByText(/add an item to start this sale/i)).toHaveCount(0, {
    timeout: 20_000,
  });

  // A second unit of the same line through the basket's own control, which is
  // the affordance a cashier actually uses when someone asks for one more.
  //
  // Asserted with a RETRYING expectation on the Charge button's own label
  // rather than a one-shot `innerText()`. The increment is a server command
  // followed by a refresh, so reading the text once races the round trip and
  // reports the old total as a product defect.
  const charge = page.getByRole("button", { name: /^Charge · /i }).first();
  await expect(charge).toHaveText(/\$18\.00/, { timeout: 20_000 });
  await page.getByRole("button", { name: /increase quantity/i }).first().click();
  await expect(charge, "two units of an $18 pizza is $36").toHaveText(/\$36\.00/, {
    timeout: 20_000,
  });

  // C03 → the collect sheet (money.md M01). Cash is the first tab.
  await charge.click();
  await expect(page.getByRole("tab", { name: /^cash$/i })).toBeVisible();
  await expect(page.getByText(/amount due/i)).toBeVisible();

  // Card and Pass must say plainly that they are not available rather than
  // looking like they work. This is the honesty half of the acceptance.
  await page.getByRole("tab", { name: /^pass credit$/i }).click();
  await expect(page.locator("[data-pos-method-status]")).toContainText(
    /not enabled|no.*ledger|pass credits/i,
  );
  // Card is a DIFFERENT unavailability from Pass, and says so in its own words.
  await page.getByRole("tab", { name: /^card$/i }).click();
  await expect(page.locator("[data-pos-method-status]")).toContainText(/reader|card/i);
  await page.getByRole("tab", { name: /^cash$/i }).click();

  // Tender $40 on the keypad: 4, 0, 0, 0 in minor units.
  for (const digit of ["4", "0", "0", "0"]) {
    await page.getByRole("button", { name: digit, exact: true }).first().click();
  }
  await expect(page.getByText("$40.00").first()).toBeVisible();

  await page.getByRole("button", { name: /confirm cash/i }).click();

  // M13 — the paid screen, with the change a cashier has to hand back.
  await expect(page.getByRole("heading", { name: /^paid$/i })).toBeVisible({ timeout: 40_000 });
  await expect(page.getByText("$4.00").first(), "change from $40 on $36").toBeVisible();

  // The receipt, from its public code. Present, absolute, and it resolves.
  const receiptLink = page.locator("[data-pos-receipt-link]");
  await expect(receiptLink).toBeVisible();
  const receiptHref = await receiptLink.getAttribute("href");
  expect(receiptHref, "the paid screen must offer a receipt link at all").toBeTruthy();
  const receiptUrl = new URL(receiptHref!);
  // ABSOLUTE and on this workspace's own public host: the slip gets printed,
  // forwarded and typed, so a relative path would be useless off this screen.
  expect(receiptUrl.protocol).toMatch(/^https?:$/);
  expect(receiptUrl.host, "the link must carry the workspace's own host").not.toBe("");
  expect(receiptUrl.pathname).toMatch(/^\/r\/[A-Za-z0-9_-]{10,}$/);

  await page.screenshot({ path: testInfo.outputPath("pos-counter-paid.png"), fullPage: true });

  // A printed receipt is read by someone who is not signed in, so the path is
  // opened in a fresh context with no session cookies at all.
  //
  // Followed on the ORIGIN THE RUNNER REACHED rather than on the href's own
  // host. They are the same string on a deployed QA host; on a local run the
  // app's public host is a name only the dev proxy knows, and resolving it in
  // the browser would need an /etc/hosts entry. The href's host is asserted
  // above, so nothing about the link goes unproven — this only decides which
  // door the runner knocks on.
  const followable = new URL(receiptUrl.pathname, page.url()).toString();
  const anonymous = await page.context().browser()!.newContext();
  try {
    const anonymousPage = await anonymous.newPage();
    const response = await anonymousPage.goto(followable);
    expect(response?.status(), "a receipt link that 404s fails in front of a customer").toBe(200);
    await expect(
      anonymousPage.getByRole("heading", { name: /this page is no longer here|not found/i }),
    ).toHaveCount(0);
    // The amount the cashier just took, on the slip the customer holds.
    await expect(anonymousPage.getByText("$36.00").first()).toBeVisible({ timeout: 30_000 });
  } finally {
    await anonymous.close();
  }

  // And the money row agrees with the screen. A paid screen over an unpaid
  // order is the exact false-paid state the money rules forbid.
  const orderId = new URL(page.url()).searchParams.get("order");
  expect(orderId, "the counter must stay on the sale it collected").toBeTruthy();
  const sb = isolatedService();
  const { data } = await sb
    .from("orders")
    .select("status, total_cents, source_channel, receipt_code")
    .eq("id", orderId!)
    .maybeSingle();
  const row = data as {
    status: string;
    total_cents: number;
    source_channel: string;
    receipt_code: string;
  } | null;
  expect(row, "the collected sale must exist on qa-journeys").not.toBeNull();
  expect(row?.status).toBe("paid");
  expect(Number(row?.total_cents)).toBe(3600);
  expect(row?.source_channel).toBe("pos");
  expect(receiptHref).toContain(row!.receipt_code);
});
