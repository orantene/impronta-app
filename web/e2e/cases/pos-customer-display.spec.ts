/**
 * POS — the customer display (design boards D01 to D08) follows the
 * cashier's sale from idle to paid to a receipt, on a second window.
 *
 * WHAT THIS PROVES. The display is opened the way a person opens it: the
 * "Customer display" link on the counter's own rail, which opens a new
 * window. That window shows the workspace's welcome while nothing is open
 * (D01); the moment the cashier starts a sale and adds an item it shows the
 * lines and the figure to pay (D02), read from the same order row the
 * counter charges; the customer's "Looks right" reaches the confirm screen
 * (D04) and Back returns; the cashier's cash collection turns it into the
 * thank-you screen (D07) with the amount and the tender; "Email me" reaches
 * the contact screen (D08), a bad address is refused in a sentence, a good
 * one is sent, and the row agrees: the address is now the sale's customer.
 * Then the screen clears on its own and does not re-adopt the finished sale.
 *
 * NOTHING IS INJECTED. The display is driven by what the counter does in the
 * other tab and by taps on the display itself; every assertion about money
 * is against the order and money rows the run wrote. The tip the customer
 * taps on D02 is asserted as `orders.tip_cents` and never as a line
 * (Package 1 closes D-POS-11).
 *
 * NOT PROVEN HERE: the declined screen (D06) needs a card attempt that
 * fails, and this environment has no card reader and no Stripe keys; the
 * waiting screen (D05) is reachable only through the same path. Both are
 * covered by the pure model's tests (`lib/pos/display-model.test.ts`).
 */
import type { Page } from "@playwright/test";

import {
  test,
  expect,
  prepareJourneysPage,
  openCounter,
  counterStartSale,
  counterAddItem,
  counterCollectCash,
  expectCounterPaid,
  skipUnlessFixture,
} from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";

skipUnlessFixture();

const PIZZA = { title: "House pizza", cents: 1800 } as const;
/** 10% of the pizza, the tile the customer taps on D02. */
const TIP = { cents: 180 } as const;

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function screen(display: Page, name: string) {
  return display.locator(`[data-pos-display-screen="${name}"]`);
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await prepareJourneysPage(page);
});

test("POS-CD customer display: idle, review, confirm, paid, receipt sent, cleared", async ({ page }, testInfo) => {
  test.setTimeout(240_000);

  await openCounter(page);

  // The door: the counter's own rail carries the link, and it opens a new
  // window so a second screen can show it.
  const link = page.locator("[data-pos-frame-link='display']");
  await expect(link, "the counter's rail must offer the customer display").toBeVisible({ timeout: 30_000 });
  await expect(link).toHaveAttribute("target", "_blank");
  const [display] = await Promise.all([page.context().waitForEvent("page"), link.click()]);
  await display.waitForLoadState("domcontentloaded");
  await expect(display).toHaveURL(/\/admin\/pos\/display/);

  // D01 — idle, the workspace's own name, nothing else.
  await expect(screen(display, "idle")).toBeVisible({ timeout: 60_000 });
  await expect(display.getByRole("heading", { level: 1 })).toContainText(/QA Journeys/i);
  await display.screenshot({ path: testInfo.outputPath("cd-01-idle.png"), fullPage: true });

  // The cashier starts a sale and adds one item in the OTHER window.
  // The first tap on a tile opens the sale and puts the pizza on it
  // (`POSEmptySale`); the order id reaches the address with it.
  await counterStartSale(page);
  await counterAddItem(page, PIZZA.title);
  const orderId = new URL(page.url()).searchParams.get("order");
  expect(orderId, "the counter must carry its order id").toBeTruthy();

  // D02 — the display follows: the line, the figure to pay, and the tip
  // chooser (10 / 15 / 20 percent of the services, Other, No tip).
  await expect(screen(display, "review"), "the display must pick up the sale within a few polls").toBeVisible({
    timeout: 30_000,
  });
  await expect(display.locator("[data-pos-display-lines]")).toContainText(PIZZA.title);
  await expect(display.locator("[data-pos-display-to-pay]")).toHaveText(money(PIZZA.cents));
  await expect(display.locator('[data-pos-display-tip="choose"]')).toBeVisible();
  await expect(display.locator('[data-pos-display-tip-percent="10"]')).toContainText(money(TIP.cents));
  await display.screenshot({ path: testInfo.outputPath("cd-02-review.png"), fullPage: true });

  // The customer picks 10%: the tip is the ORDER'S OWN column (`tip_cents`,
  // `posSetTip`), never a line, and the figure to pay moves by exactly it.
  await display.locator('[data-pos-display-tip-percent="10"]').click();
  await expect(display.locator('[data-pos-display-tip="added"]')).toBeVisible({ timeout: 30_000 });
  await expect(display.locator("[data-pos-display-tip-row]")).toContainText(money(TIP.cents));
  await expect(display.locator("[data-pos-display-to-pay]")).toHaveText(money(PIZZA.cents + TIP.cents));
  await display.screenshot({ path: testInfo.outputPath("cd-02-tip-added.png"), fullPage: true });

  // The figure is the order row's own, not something the screen summed.
  const admin = isolatedService();
  const draft = await admin
    .from("orders")
    .select("total_cents, tip_cents, status, tenant_id")
    .eq("id", orderId!)
    .maybeSingle();
  expect(draft.error).toBeNull();
  expect(draft.data?.tenant_id).toBe(JOURNEYS_TENANT_ID);
  expect(Number(draft.data?.tip_cents), "the tip is orders.tip_cents").toBe(TIP.cents);
  expect(Number(draft.data?.total_cents), "total = subtotal - discount + tax + tip").toBe(PIZZA.cents + TIP.cents);
  expect(draft.data?.status).toBe("draft");
  const lineCount = await admin.from("order_lines").select("id", { count: "exact", head: true }).eq("order_id", orderId!);
  expect(lineCount.count, "a tip is never a line").toBe(1);

  // D04 — the customer says it looks right, sees the one figure, and can go back.
  await display.getByRole("button", { name: /looks right/i }).click();
  await expect(screen(display, "confirm")).toBeVisible();
  await expect(screen(display, "confirm")).toContainText(money(PIZZA.cents + TIP.cents));
  await display.screenshot({ path: testInfo.outputPath("cd-04-confirm.png"), fullPage: true });
  await display.getByRole("button", { name: /^back$/i }).click();
  await expect(screen(display, "review")).toBeVisible();

  // The cashier takes cash. The display must turn into the thank-you on its own.
  await counterCollectCash(page);
  await expectCounterPaid(page);
  await expect(screen(display, "paid"), "a paid order must reach the display").toBeVisible({ timeout: 30_000 });
  await expect(display.locator("[data-pos-display-paid]")).toContainText(money(PIZZA.cents + TIP.cents));
  await expect(display.locator("[data-pos-display-paid]")).toContainText(/cash/i);
  // Text receipts are not offered, and the screen says so rather than hiding it.
  await expect(display.locator("[data-pos-display-text-not-offered]")).toBeVisible();
  await expect(display.getByRole("button", { name: /text me/i })).toBeDisabled();
  await display.screenshot({ path: testInfo.outputPath("cd-07-paid.png"), fullPage: true });

  const paidRow = await admin
    .from("orders")
    .select("status, customer_id")
    .eq("id", orderId!)
    .maybeSingle();
  expect(paidRow.data?.status).toBe("paid");
  const customerBefore = paidRow.data?.customer_id ?? null;

  // D08 — the receipt contact. A bad address is refused in a sentence...
  await display.getByRole("button", { name: /email me/i }).click();
  await expect(screen(display, "contact")).toBeVisible();
  const field = display.locator("#pos-display-email");
  // "foo@bar" passes the browser's own check and fails the server's, so the
  // refusal that reaches the screen is the SERVER's sentence.
  await field.fill("foo@bar");
  await display.getByRole("button", { name: /^send$/i }).click();
  const refusal = display.locator("[data-pos-display-refusal]");
  await expect(refusal).toBeVisible({ timeout: 60_000 });
  await expect(refusal).toHaveAttribute("role", "alert");
  await expect(refusal).toContainText(/does not look like an email address/i);
  await expect(refusal).not.toContainText(/\b(invalid|not_paid|send_failed|unavailable)\b/);
  await display.screenshot({ path: testInfo.outputPath("cd-08-contact-refused.png"), fullPage: true });

  // ...and a good one is sent, and becomes the sale's customer.
  const email = `qa-display-${Date.now()}@impronta.test`;
  await field.fill(email);
  await display.getByRole("button", { name: /^send$/i }).click();
  await expect(screen(display, "sent")).toBeVisible({ timeout: 60_000 });
  const sentLine = display.locator("[data-pos-display-sent]");
  await expect(sentLine).toContainText(email);
  const sentText = (await sentLine.innerText()).trim();
  await display.screenshot({ path: testInfo.outputPath("cd-08-sent.png"), fullPage: true });

  const customer = await admin
    .from("customers")
    .select("id, email, tenant_id")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("email", email)
    .maybeSingle();
  expect(customer.error).toBeNull();
  expect(customer.data?.id, "the typed address must exist as this workspace's customer").toBeTruthy();
  const attached = await admin.from("orders").select("customer_id").eq("id", orderId!).maybeSingle();
  if (customerBefore === null) {
    expect(attached.data?.customer_id, "a walk-in sale gains the customer who asked for the receipt").toBe(
      customer.data!.id,
    );
  } else {
    expect(attached.data?.customer_id, "a customer the cashier attached is never overwritten").toBe(customerBefore);
  }

  await testInfo.attach("display-sent-line", { body: sentText, contentType: "text/plain" });
  await testInfo.attach("display-order", {
    body: JSON.stringify({ orderId, email, customerId: customer.data?.id, customerBefore }, null, 2),
    contentType: "application/json",
  });

  // The screen clears on its own, and the finished sale is not re-adopted
  // even though the counter's beacon still names it.
  await expect(screen(display, "idle"), "a sent receipt must clear the screen").toBeVisible({ timeout: 30_000 });
  await display.waitForTimeout(5_000);
  await expect(screen(display, "idle")).toBeVisible();
  await display.screenshot({ path: testInfo.outputPath("cd-09-cleared.png"), fullPage: true });

  await display.close();
});
