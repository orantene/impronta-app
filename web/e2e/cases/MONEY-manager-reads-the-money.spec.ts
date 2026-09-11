/**
 * MONEY — a manager reads the money, and every figure traces to its rows.
 *
 * WHAT THIS PROVES that the per-case specs do not. The case journeys each take
 * one sale through one channel. This one is about the money SCREENS: that Sales
 * filters and un-filters, that Payments' four figures are each the sum of rows
 * a query can name, that a client record and a project agree with the same
 * rule, and — the part a review already found broken once — that a CANCELLED
 * order and a DRAFT order move none of those figures.
 *
 * THE FIGURES ARE NOT HARDCODED, AND THAT IS DELIBERATE. Several agents are
 * working this fixture, so a spec asserting "$859.00 owed" would fail on their
 * work rather than on a defect. Every assertion here reads the database through
 * `_money-db.ts` — which restates the PAGE's own rule in SQL — and requires the
 * screen to agree with it. To stop that becoming a tautology, each money
 * assertion also computes the WRONG rule (the naive `total - collected` over
 * every attached order) and requires the screen not to show it, so a page that
 * regressed to counting cancelled and draft orders fails here rather than
 * agreeing with a query that made the same mistake.
 *
 * WHAT IT SEEDS, AND HOW. Nothing is hand-inserted. The drawer session, the
 * cash taking, the cancelled sale and the draft sale are all made by driving
 * the counter (a drawer another session abandoned is closed through the
 * Shifts screen first, and the run says so in its annotations); the project is made by clicking Create booking on a real
 * inquiry, and the order that hangs off it is minted by `bookings_write_order`
 * from that inquiry's accepted offer. The one figure this file cannot seed is a
 * card taking: the counter says plainly that it is waiting for a reader
 * (money.md D-POS-4 — no card reader arrangement exists), so "cash separated
 * from card" is proven as far as the interface allows: the cash bucket stands
 * on its own row and every other method present gets its own row too.
 */
import { type Page } from "@playwright/test";
import {
  test,
  expect,
  prepareJourneysPage,
  signInJourneysStaff,
  skipUnlessFixture,
  assertWorkspaceIdentity,
  counterNameBuyer,
} from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import {
  allOrdersInWorkspace,
  cashTakenOnShift,
  drawerSession,
  money,
  openShiftId,
  bookingOnInquiry,
  orderById,
  ordersOnInquiry,
  owedByCurrency,
  owedCents,
  owedOrdersInWorkspace,
  takingsByMethod,
  type OrderFact,
} from "./_money-db";

skipUnlessFixture();

/**
 * The inquiry the project is made from.
 *
 * It is the ONE conversation on this fixture carrying an ACCEPTED offer, which
 * is what `bookings_write_order` needs in order to price the order it mints.
 * Named rather than searched so a failure says "the fixture's accepted offer is
 * gone" instead of quietly picking a different conversation and proving
 * something else. The spec checks it is still accepted before it uses it.
 */

/**
 * How long to wait for another session's open drawer to close on its own
 * before treating it as abandoned. Several journeys share this fixture and the
 * counter one opens and closes a shift in a few minutes; a drawer still open
 * after this is a previous cashier's leftover, and a manager closes it before
 * opening their own. Closing it is done through the Shifts screen, never SQL.
 */
const ABANDONED_DRAWER_AFTER_MS = 180_000;
const PROJECT_INQUIRY_ID = "6a5e9455-e7ed-46dd-a53e-d26064e8b780";

/** The wrong rule, on purpose: what a screen shows if it forgets the status half. */
function naiveOwed(rows: readonly OrderFact[]): number {
  return rows.reduce((sum, r) => sum + Math.max(0, r.totalCents - r.collectedCents), 0);
}

test.beforeEach(async ({ page }) => {
  await prepareJourneysPage(page);
});

// ── Counter helpers. Local because they drive the SEED, not a case journey ──

async function openCounterAt(page: Page, query: string): Promise<void> {
  await page.goto(`/admin/pos?mode=counter${query}`);
  await expect(page.locator("[data-tulala-pos-chrome]")).toHaveCount(1, { timeout: 30_000 });
}

async function counterRail(page: Page, name: RegExp): Promise<void> {
  await page
    .getByRole("navigation", { name: /counter|comptoir|mostrador/i })
    .getByRole("button", { name })
    .click();
}

/**
 * Start the next sale from wherever the counter is. On the paid screen the
 * door is "Next customer" (which starts a sale directly); on an empty Sell
 * surface it is "Start a new sale". Resolves once the URL carries a NEW order.
 */
async function counterNextSale(page: Page, previousOrderId: string | null): Promise<string | null> {
  await counterRail(page, /^sell$/i);
  const next = page.getByRole("button", { name: "Next customer" });
  if ((await next.count()) > 0) {
    await next.click();
    const current = () => {
      const id = new URL(page.url()).searchParams.get("order");
      return id && id !== previousOrderId ? id : null;
    };
    await expect
      .poll(current, { message: "a new sale carries a new order id in its address", timeout: 30_000 })
      .not.toBeNull();
    return current();
  }
  // The counter resumes a draft a previous run walked away from (the Counter
  // boards: a sale is never lost on reload). That sale is not this run's, so
  // it is parked the way a cashier parks one, Hold sale, and the surface is
  // empty again. Nothing is discarded.
  const empty = page.locator("[data-pos-empty]");
  const hold = page.locator("[data-pos-hold]");
  await expect(empty.or(hold).first()).toBeVisible({ timeout: 30_000 });
  if ((await empty.count()) === 0) {
    await hold.click();
    await page.locator("[data-pos-hold-confirm]").click();
  }
  // The board's empty counter (`POSEmptySale`) has no start button: the first
  // tap on a tile opens the sale, so there is no order id yet.
  await expect(empty).toBeVisible({ timeout: 30_000 });
  return null;
}

/**
 * Tap one House pizza into the sale, opening the sale if none is, and return
 * the order id the address then carries.
 *
 * The row is awaited FIRST, so a slow add (observed at 10 s on the shared
 * fixture) is told apart from a basket that never repaints: if the line is in
 * `order_lines` and the basket still says it is empty, the failure names the
 * screen and not the write.
 */
async function counterAddPizza(page: Page, orderId: string | null, previousOrderId: string | null): Promise<string> {
  await page.getByRole("button", { name: "House pizza" }).first().click();
  const current = () => {
    const id = new URL(page.url()).searchParams.get("order");
    return id && id !== previousOrderId ? id : null;
  };
  await expect.poll(current, { message: "the sale must carry its order id in the address", timeout: 30_000 }).not.toBeNull();
  const id = orderId ?? current()!;
  await expect
    .poll(async () => (await orderById(id))?.totalCents ?? 0, {
      message: "the tap must write a priced line on the sale",
      timeout: 45_000,
    })
    .toBeGreaterThan(0);
  await expect(page.locator("[data-pos-line]").first(), "the basket must show the line the tap wrote").toBeVisible({
    timeout: 30_000,
  });
  return id;
}

/**
 * The counter's rail calls the drawer "Cash" (the Counter boards POSCashOpen /
 * POSCashMovements / POSCashClose); the screen is the same shift engine. The
 * rail is client state, so a click that lands before hydration is a click on
 * nothing: it is repeated until the Cash screen (its opening form or its
 * Close drawer & count) is the one shown.
 */
async function openCashScreen(page: Page): Promise<void> {
  const shown = page.locator("#pos-shift-opening").or(page.locator("[data-pos-close-and-count]")).first();
  for (let attempt = 0; attempt < 5 && !(await shown.isVisible()); attempt += 1) {
    await counterRail(page, /^(cash|caja|caisse)$/i);
    await page.waitForTimeout(1_500);
  }
  await expect(shown, "the Cash screen must be the one shown").toBeVisible({ timeout: 30_000 });
}

/**
 * Close the open drawer the way a cashier does on the Cash screen: Close
 * drawer & count, the counted figure, the confirmation, Close drawer. Resolves
 * once the engine has shown its own count result (`POSCashClose`).
 */
async function closeDrawerThroughTheScreen(page: Page, countedCents: number): Promise<void> {
  const closeAndCount = page.locator("[data-pos-close-and-count]");
  await expect(closeAndCount, "an open drawer offers Close drawer & count").toBeVisible({ timeout: 30_000 });
  await closeAndCount.click();
  const countedField = page.locator("#pos-shift-counted");
  await expect(countedField).toBeVisible({ timeout: 20_000 });
  await countedField.fill((countedCents / 100).toFixed(2));
  await page.locator("[data-pos-confirm-count]").check();
  await page.locator("[data-pos-close-shift]").click();
  await expect(page.locator("[data-pos-cash-closed]"), "closing the drawer must show the count result").toBeVisible({
    timeout: 30_000,
  });
}

/** A `Figure`'s value: the `<dd>` that follows the `<dt>` carrying this label. */
function figureValue(page: Page, label: string) {
  return page.locator("dt", { hasText: label }).first().locator("xpath=following-sibling::dd[1]");
}

test("MONEY: a manager reads Sales and Payments, and a cancelled or draft order moves nothing", async ({
  page,
}, testInfo) => {
  test.setTimeout(600_000);
  const shot = async (name: string) => {
    await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
  };
  const sb = isolatedService();

  await signInJourneysStaff(page, "/admin/sales");
  await assertWorkspaceIdentity(page);

  // ────────────────────────────────────────────────────────────────────
  // 1 — SALES, from the sidebar: filtered by kind, by channel, and back.
  // ────────────────────────────────────────────────────────────────────
  await page.goto("/admin");
  const sidebar = page.locator("[data-tulala-app-sidebar]");
  await expect(sidebar, "the workspace rail is how a person starts").toBeVisible({ timeout: 30_000 });
  // The rail's entries are buttons whose accessible name is the label plus
  // its one-line description ("Sales — Bookings, orders, ..."), so they are
  // matched on the label at the start of the name.
  await sidebar.getByRole("button", { name: /^Sales\b/ }).click();
  await expect(page).toHaveURL(/\/admin\/sales(\?|$)/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Sales", level: 1 })).toBeVisible();

  const rows = () => page.locator("tbody tr");
  const unfilteredCount = await rows().count();
  expect(unfilteredCount, "an empty Sales list cannot prove a filter").toBeGreaterThan(0);
  await shot("01-sales-unfiltered");

  // The columns a manager reads (the Sales board's). "Sold via" is the WHAT
  // cell's channel span (`data-sales-channel`); without it the channel filter
  // below would be narrowing on something the screen never shows.
  await expect(page.locator("thead th")).toHaveText([
    "Type",
    "Ref",
    "Customer",
    "What",
    "When",
    "Payment · fulfilment",
    "Amount",
    "Due",
    "Open",
  ]);

  // BY KIND. Orders are the only kind that carries a channel, so this is also
  // what brings the channel strip out.
  const kindNav = page.getByRole("navigation", { name: "Kind" });
  await kindNav.getByRole("link", { name: "Order", exact: true }).click();
  await expect(page).toHaveURL(/kind=order/, { timeout: 30_000 });
  const orderOnly = await rows().count();
  expect(orderOnly, "filtering by kind must narrow the list").toBeLessThan(unfilteredCount);
  for (const cell of await rows().locator("td:nth-child(1)").allInnerTexts()) {
    expect(cell.split("\n")[0].trim(), "every row left is an order").toBe("Order");
  }
  await shot("02-sales-kind-order");

  // BY CHANNEL, on top of the kind. `pos` is the counter's own channel.
  const channelNav = page.getByRole("navigation", { name: "Sold via" });
  await expect(channelNav, "orders carry a channel, so the strip must be there").toBeVisible();
  await channelNav.getByRole("link", { name: "Counter", exact: true }).click();
  await expect(page).toHaveURL(/channel=pos/, { timeout: 30_000 });
  expect(new URL(page.url()).searchParams.get("kind"), "picking a channel must keep the kind").toBe(
    "order",
  );
  const posOnly = await rows().count();
  expect(posOnly).toBeGreaterThan(0);
  expect(posOnly).toBeLessThanOrEqual(orderOnly);
  for (const cell of await rows().locator("[data-sales-channel]").allInnerTexts()) {
    expect(cell.trim(), "every row left was sold at the counter").toBe("Counter");
  }
  expect(
    await rows().locator("[data-sales-channel]").count(),
    "every row left carries the channel it was sold on",
  ).toBe(posOnly);
  await shot("03-sales-kind-order-channel-pos");

  // AND BACK. Both reset chips, and the list is the one we started on.
  // Each reset is awaited on the URL it must PRODUCE, not on one it already
  // had: `kind=order` was in the address before the click, so waiting on it
  // would pass before the navigation happened and read the old list.
  await channelNav.getByRole("link", { name: "All channels", exact: true }).click();
  await expect(page, "clearing the channel drops it from the address").toHaveURL(
    /\/admin\/sales\?kind=order$/,
    { timeout: 30_000 },
  );
  expect(await rows().count(), "clearing the channel restores the kind-only list").toBe(orderOnly);

  await page
    .getByRole("navigation", { name: "Kind" })
    .getByRole("link", { name: "All kinds", exact: true })
    .click();
  await expect(page, "clearing the kind leaves a bare address").toHaveURL(/\/admin\/sales$/, {
    timeout: 30_000,
  });
  expect(
    await rows().count(),
    "clearing both filters returns the unfiltered list, not a narrower one",
  ).toBe(unfilteredCount);
  await shot("04-sales-reset");

  // ────────────────────────────────────────────────────────────────────
  // 2 — THE SEED, through the counter: a drawer session, a cash taking, a
  //     cancelled sale and a draft sale. Nothing here is inserted by hand.
  // ────────────────────────────────────────────────────────────────────
  await openCounterAt(page, "");
  await openCashScreen(page);

  // A drawer another session left open. Wait for it to close on its own, then
  // close it the way a cashier would: Close drawer & count, count it, confirm
  // the count, Close drawer. The closing figure is the float, which is what an
  // untouched drawer holds; if cash was taken on it the variance says so on
  // that session's own row.
  const leftover = await openShiftId();
  if (leftover) {
    const deadline = Date.now() + ABANDONED_DRAWER_AFTER_MS;
    while (Date.now() < deadline && (await openShiftId()) === leftover) {
      await page.waitForTimeout(5_000);
    }
    if ((await openShiftId()) !== null) {
      const stale = (await drawerSession((await openShiftId())!))!;
      await openCashScreen(page);
      await closeDrawerThroughTheScreen(page, stale.openingCashCents);
      await expect.poll(async () => await openShiftId(), { timeout: 30_000 }).toBeNull();
      await shot("05a-abandoned-drawer-closed");
      testInfo.annotations.push({
        type: "abandoned drawer closed through the Cash screen",
        description: `${stale.id} opened with ${money(stale.openingCashCents, "USD")}`,
      });
      await page.getByRole("button", { name: /open a new drawer/i }).click();
    }
  }

  const openingField = page.locator("#pos-shift-opening");
  await expect(openingField, "the opening form is the door to a drawer").toBeVisible({ timeout: 30_000 });
  await openingField.fill("50");
  await page.locator("[data-pos-open-shift]").click();
  await expect.poll(async () => await openShiftId(), { timeout: 30_000 }).not.toBeNull();
  const shiftId = (await openShiftId())!;
  await shot("05-counter-shift-open");

  // A cash sale, with the buyer named, so it lands on a client record.
  const buyer = `money-${Date.now()}@impronta.test`;
  const paidOrderId = await counterAddPizza(page, await counterNextSale(page, null), null);
  await counterNameBuyer(page, buyer);
  await page.locator("[data-pos-charge]").first().click();
  await expect(page.getByRole("tab", { name: /^cash$/i })).toBeVisible({ timeout: 20_000 });
  // Card is not a working tender here and the counter says so rather than
  // looking like it works. This is why the takings table has no card row.
  await page.getByRole("tab", { name: /^card$/i }).click();
  await expect(page.locator("[data-pos-method-status]")).toContainText(/reader|card/i);
  await page.getByRole("tab", { name: /^cash$/i }).click();
  await page.locator("[data-pos-confirm-cash]").click();
  await expect(page.locator("[data-pos-dialog='cash-done']")).toBeVisible({ timeout: 40_000 });
  await page.locator("[data-pos-cash-done]").click();
  await expect(page.getByRole("heading", { name: /^paid$/i })).toBeVisible({ timeout: 40_000 });
  await shot("06-counter-cash-paid");

  const paidOrder = (await orderById(paidOrderId))!;
  expect(paidOrder.status).toBe("paid");
  expect(paidOrder.collectedCents).toBe(paidOrder.totalCents);
  expect(paidOrder.customerId, "naming the buyer must attach a customer").not.toBeNull();
  const cashTakingCents = paidOrder.totalCents;

  // A CANCELLED sale, with a real total behind it.
  const cancelledOrderId = await counterAddPizza(page, await counterNextSale(page, paidOrderId), paidOrderId);
  // `Discard sale` lives in the hold dialog (`POSHoldSale`).
  await page.locator("[data-pos-hold]").click();
  await page.locator("[data-pos-discard]").click();
  await expect
    .poll(async () => (await orderById(cancelledOrderId))?.status, { timeout: 30_000 })
    .toBe("cancelled");
  const cancelledOrder = (await orderById(cancelledOrderId))!;
  expect(
    cancelledOrder.totalCents,
    "a cancelled order with a zero total would prove nothing about cancellation",
  ).toBeGreaterThan(0);

  // A DRAFT sale: opened, an item added, walked away from.
  const draftOrderId = await counterAddPizza(page, await counterNextSale(page, cancelledOrderId), cancelledOrderId);
  await expect
    .poll(async () => (await orderById(draftOrderId))?.totalCents, { timeout: 30_000 })
    .toBeGreaterThan(0);
  const draftOrder = (await orderById(draftOrderId))!;
  expect(draftOrder.status).toBe("draft");

  // The cash just taken must be stamped with THIS drawer, or the drawer's
  // Expected cannot include it. `cashTakenOnShift` is the close rule's own
  // predicate, so the rows it returns are the rows Expected is made of. Other
  // sessions share this fixture; any cash they took meanwhile is in the same
  // rows and belongs in the same figure, which is why Expected is derived
  // from the rows rather than written down as float + one sale.
  const cashRows = await cashTakenOnShift(shiftId);
  expect(
    cashRows.some((r) => r.orderId === paidOrderId && r.grossAmountCents === cashTakingCents),
    "the cash sale is stamped with the open drawer",
  ).toBe(true);
  const expectedCents = 5000 + cashRows.reduce((sum, r) => sum + r.grossAmountCents, 0);
  // Close the drawer with a count that is deliberately NOT the expected figure,
  // so the variance on screen is arithmetic rather than a zero that would look
  // the same whether it was computed or hardcoded.
  const countedCents = expectedCents - 50;
  await openCashScreen(page);
  await closeDrawerThroughTheScreen(page, countedCents);
  await expect.poll(async () => (await drawerSession(shiftId))?.status, { timeout: 30_000 }).toBe("closed");
  const drawer = (await drawerSession(shiftId))!;
  expect(drawer.openingCashCents).toBe(5000);
  expect(drawer.closingCashCents).toBe(countedCents);
  expect(
    drawer.expectedCashCents,
    `expected cash is the float plus the ${cashRows.length} cash row(s) stamped with this shift`,
  ).toBe(expectedCents);
  await shot("07-counter-shift-closed");

  // ────────────────────────────────────────────────────────────────────
  // 3 — PAYMENTS: four figures, four queries.
  // ────────────────────────────────────────────────────────────────────
  await page.goto("/admin");
  await expect(
    sidebar.getByRole("button", { name: /^Payments\b/ }),
    "a manager reaches the money from the rail, not by typing a URL",
  ).toBeVisible({ timeout: 30_000 });
  await sidebar.getByRole("button", { name: /^Payments\b/ }).click();
  await expect(page).toHaveURL(/\/admin\/payments/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Payments", level: 1 })).toBeVisible();

  // TAKINGS BY METHOD — cash on its own row, every other method on its own.
  const takings = await takingsByMethod();
  const cashBucket = takings.find((b) => b.method === "cash" && b.currency === "USD");
  expect(cashBucket, "the cash sale just taken must land in a cash bucket").toBeTruthy();
  const takingsTable = page.locator("table").first();
  const cashRow = takingsTable.locator("tr", { hasText: "Cash" }).first();
  await expect(cashRow).toContainText(money(cashBucket!.totalCents, "USD"));
  await expect(cashRow).toContainText(String(cashBucket!.count));
  for (const bucket of takings) {
    if (bucket.method === "cash" && bucket.currency === "USD") continue;
    await expect(
      takingsTable,
      `${bucket.method} has takings and must have its own row rather than being folded into cash`,
    ).toContainText(money(bucket.totalCents, bucket.currency));
  }

  // STILL OWED — the figure a review found counting cancelled and draft orders,
  // and the one this run found summing a 200-row window and calling it the
  // total. Read the whole owed SET and the whole workspace, not a window.
  const owedSet = await owedOrdersInWorkspace();
  const everyOrder = await allOrdersInWorkspace();
  const owedUsd = owedByCurrency(owedSet).get("USD") ?? 0;
  expect(
    owedByCurrency(everyOrder).get("USD") ?? 0,
    "the owed set and the whole workspace must agree under the same rule",
  ).toBe(owedUsd);
  testInfo.annotations.push({
    type: "still owed",
    description: `${money(owedUsd, "USD")} over ${owedSet.length} owed order(s) of ${everyOrder.length} in the workspace`,
  });
  const owedSection = page.getByTestId("payments-owed");
  await expect(owedSection).toContainText(money(owedUsd, "USD"));

  // The three sales just made are in the workspace, and only the rule tells
  // them apart: two of them have a real total and none is owed.
  for (const [id, what] of [
    [paidOrderId, "paid"],
    [cancelledOrderId, "cancelled"],
    [draftOrderId, "draft"],
  ] as const) {
    expect(everyOrder.some((r) => r.id === id), `the ${what} sale is among the orders read`).toBe(true);
    expect(owedSet.some((r) => r.id === id), `the ${what} sale is not in the owed set`).toBe(false);
  }
  expect(owedCents(cancelledOrder), "a cancelled order owes nothing").toBe(0);
  expect(owedCents(draftOrder), "a draft order owes nothing").toBe(0);
  expect(owedCents(paidOrder), "a collected order owes nothing").toBe(0);

  // And the wrong rule, so the check above is not a tautology: `total -
  // collected` over every row is a bigger number, and it is not on the screen.
  const naiveUsd = naiveOwed(everyOrder.filter((r) => r.currency === "USD"));
  expect(
    naiveUsd,
    "the two rules must differ on this data or the assertion below proves nothing",
  ).toBeGreaterThan(owedUsd);
  await expect(
    owedSection,
    "Still owed must not be total-minus-collected over drafts and cancellations",
  ).not.toContainText(money(naiveUsd, "USD"));

  // REFUNDS — their own tab on the Payments board.
  await page.goto("/admin/payments?tab=refunds");
  const { data: refundRows, error: refundErr } = await sb
    .from("booking_transactions")
    .select("id, gross_amount_cents, currency")
    .eq("source_tenant_id", JOURNEYS_TENANT_ID)
    .eq("status", "refunded");
  expect(refundErr).toBeNull();
  const refundsSection = page.getByTestId("payments-refunds");
  if ((refundRows ?? []).length === 0) {
    await expect(refundsSection).toContainText("No refunds yet.");
  } else {
    for (const raw of refundRows ?? []) {
      const row = raw as { gross_amount_cents: number | string; currency: string | null };
      await expect(refundsSection).toContainText(
        money(Number(row.gross_amount_cents), (row.currency ?? "USD").toUpperCase()),
      );
    }
  }

  // THE DRAWER: what was counted against what was expected, on THIS session's
  // card. Other sessions' cards are on the same page, so the card is found by
  // its own expected and counted figures together.
  await page.goto("/admin/payments?tab=drawers");
  const drawerSectionEl = page.getByTestId("payments-drawers");
  const drawerCard = drawerSectionEl
    .locator("[data-drawer-row]", { has: page.locator("[data-drawer-expected]", { hasText: money(drawer.expectedCashCents!, "USD") }) })
    .filter({ has: page.locator("[data-drawer-counted]", { hasText: money(drawer.closingCashCents!, "USD") }) })
    .first();
  await expect(drawerCard, "the closed drawer has its own row").toBeVisible();
  await expect(drawerCard).toHaveAttribute("data-drawer-status", "closed");
  await expect(drawerCard).toContainText("Closed");
  await expect(drawerCard.locator("[data-drawer-opening]")).toContainText(money(drawer.openingCashCents, "USD"));
  await expect(
    drawerCard.locator("[data-drawer-variance]"),
    "a variance is the count minus the expectation, not a zero",
  ).toContainText(money(drawer.closingCashCents! - drawer.expectedCashCents!, "USD"));
  await shot("08-payments");

  // A FIGURE ON SALES, now that a sale exists whose row is known: the cash
  // sale sits under Order + Counter at its own total, with nothing owed.
  await page.goto("/admin/sales?kind=order&channel=pos");
  const saleRow = page.locator("tbody tr", { hasText: paidOrderId.slice(0, 8) });
  await expect(saleRow, "the counter sale is on the Sales list under its channel").toHaveCount(1);
  await expect(saleRow.locator("[data-sales-channel]")).toHaveText("Counter");
  await expect(saleRow.locator("[data-sales-amount]")).toContainText(money(paidOrder.totalCents, "USD"));
  await expect(saleRow.locator("[data-sales-due]"), "a paid sale is not marked still owed").toHaveAttribute("data-sales-due", "none");
  await expect(saleRow.locator("[data-state]")).toHaveAttribute("data-state", "paid");
  await shot("08b-sales-row-of-the-cash-sale");

  // ────────────────────────────────────────────────────────────────────
  // 4 — THE CLIENT RECORD: what they bought, and what is owed.
  // ────────────────────────────────────────────────────────────────────
  const { data: customerRow } = await sb
    .from("customers")
    .select("id, display_name, email")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("email", buyer)
    .maybeSingle();
  const customerId = (customerRow as { id: string } | null)?.id;
  expect(customerId, "the cash sale must have created a customer to look up").toBeTruthy();

  // W41: the purchases table is the record's fourth tab; the header, the
  // Due-now card and its sentence are on every tab.
  await page.goto(`/admin/clients/${customerId}?tab=purchases`);
  await expect(page.getByText(buyer)).toBeVisible({ timeout: 30_000 });
  const purchaseRow = page.locator("tbody tr", { hasText: paidOrderId.slice(0, 8) });
  await expect(purchaseRow, "the sale they paid for is on their record").toHaveCount(1);
  await expect(purchaseRow, "what they bought, at its own total").toContainText(
    money(paidOrder.totalCents, "USD"),
  );
  await expect(purchaseRow, "and nothing outstanding on it").toContainText(money(0, "USD"));
  await expect(page.locator("body"), "the collect action, refused in words").toContainText(
    "There is nothing to collect. Every record is settled.",
  );
  await shot("09-client-record");

  // ────────────────────────────────────────────────────────────────────
  // 5 — A PROJECT: what was bought, what is owed, and the collect action.
  //
  // "Create booking" is a one-way door: it moves the inquiry to `booked` and
  // mints the order from the accepted offer, and this fixture has ONE such
  // offer. So the section reads the rows as they stand and holds the screen
  // to them either way: it converts when the inquiry is still unconverted,
  // cancels when a pending order exists, and says in its annotations which
  // of those it watched happen on this run.
  // ────────────────────────────────────────────────────────────────────
  const { data: offerRow } = await sb
    .from("inquiry_offers")
    .select("id, status, total_client_price")
    .eq("inquiry_id", PROJECT_INQUIRY_ID)
    .eq("status", "accepted")
    .maybeSingle();
  expect(
    offerRow,
    "the fixture's accepted offer is what prices this project's order; without it there is no project money to read",
  ).toBeTruthy();

  const bookingBefore = await bookingOnInquiry(PROJECT_INQUIRY_ID);
  if (!bookingBefore) {
    const before = await ordersOnInquiry(PROJECT_INQUIRY_ID);
    await page.goto(`/admin/work/${PROJECT_INQUIRY_ID}`);
    const createBooking = page.getByRole("button", { name: /create booking/i });
    await expect(createBooking, "an unconverted inquiry offers Create booking").toBeVisible({ timeout: 30_000 });
    await createBooking.click();
    await expect
      .poll(async () => (await ordersOnInquiry(PROJECT_INQUIRY_ID)).length, {
        message: "Create booking must mint the order from the accepted offer",
        timeout: 60_000,
      })
      .toBeGreaterThan(before.length);
    testInfo.annotations.push({ type: "project", description: "converted on this run: Create booking minted the order" });
  } else {
    testInfo.annotations.push({
      type: "project",
      description: `already converted by an earlier run (booking ${bookingBefore.id}); read as it stands`,
    });
  }

  const booking = (await bookingOnInquiry(PROJECT_INQUIRY_ID))!;
  expect(booking, "Create booking must open a project on this conversation").toBeTruthy();
  const projectId = booking.id;

  const attached = await ordersOnInquiry(PROJECT_INQUIRY_ID);
  expect(attached.length, "the accepted offer must have minted an order").toBeGreaterThan(0);
  const projectOrder = attached.find((o) => o.status === "pending_payment") ?? null;
  const currency = attached[0]!.currency;

  await page.goto(`/admin/projects/${projectId}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });
  const dueBefore = attached.reduce((sum, o) => sum + owedCents(o), 0);
  await expect(
    figureValue(page, "Due now"),
    "the project's Due is the orders desk's answer over the orders attached to it",
  ).toHaveText(money(dueBefore, currency));
  if (dueBefore > 0) {
    await expect(page.locator("body"), "money is owed, so Collect is the one action offered").toContainText(
      "Collect the balance",
    );
  } else {
    await expect(page.locator("body"), "nothing is owed, so Collect is not offered").not.toContainText(
      "Collect the balance",
    );
  }
  await shot("10-project-owed");

  // NOW CANCEL THAT ORDER, at the counter, and read the project again. This is
  // the review's finding on a project: a cancelled order keeps its total and
  // owes nothing.
  if (projectOrder) {
    expect(dueBefore, "a converted offer owes money until somebody collects it").toBeGreaterThan(0);
    await openCounterAt(page, `&order=${projectOrder.id}`);
    // `Discard sale` lives in the hold dialog (`POSHoldSale`).
    await page.locator("[data-pos-hold]").click();
    await page.locator("[data-pos-discard]").click();
    await expect
      .poll(async () => (await orderById(projectOrder.id))?.status, { timeout: 30_000 })
      .toBe("cancelled");
    testInfo.annotations.push({ type: "project", description: `cancelled order ${projectOrder.id} on this run` });
  } else {
    testInfo.annotations.push({
      type: "project",
      description: "no pending order to cancel on this run; the cancel step was watched on the run that converted",
    });
  }

  const afterCancel = await ordersOnInquiry(PROJECT_INQUIRY_ID);
  expect(
    afterCancel.some((o) => o.status === "cancelled" && o.totalCents > 0),
    "the project carries a cancelled order with a real total",
  ).toBe(true);
  expect(
    afterCancel.reduce((sum, o) => sum + owedCents(o), 0),
    "cancelling the only attached order leaves nothing owed",
  ).toBe(0);
  const naiveProject = naiveOwed(afterCancel);
  expect(
    naiveProject,
    "the cancelled order still carries a total, so the wrong rule would still show it",
  ).toBeGreaterThan(0);

  await page.goto(`/admin/projects/${projectId}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });
  // The agreement is still listed, at its full total ...
  await expect(page.locator("body")).toContainText(money(naiveProject, currency));
  // ... and Due is zero, so that total was never inside it.
  await expect(
    figureValue(page, "Due now"),
    "a cancelled order contributes nothing to what is owed",
  ).toHaveText(money(0, currency));
  await expect(
    page.locator("body"),
    "and a cancelled balance is not a balance to collect",
  ).not.toContainText("Collect the balance");
  await shot("11-project-cancelled");
});
