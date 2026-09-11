/**
 * C06 [representative] — restaurant.
 * Smoke stays honest. C06-OP walk-in cash is a real journey on qa-journeys.
 */
import {
  test,
  expect,
  openWorkspace,
  openStorefront,
  prepareJourneysPage,
  skipUnlessFixture,
  signInJourneysStaff,
  assertWorkspaceIdentity,
  counterStartSale,
  counterAddItem,
  counterNameBuyer,
  counterCollectCash,
  expectCounterPaid,
} from "./_harness";
import {
  latestMenuPizza,
  latestPaidPosPizza,
  latestReserveThenOrder,
  latestTableReservation,
  releaseJourneyTableReservations,
} from "./_isolated-db";

skipUnlessFixture();

test.beforeEach(async ({ page }) => {
  await prepareJourneysPage(page);
});

/**
 * Give the four tables back. A confirmed reservation now COMMITS its table, so
 * without this the suite eats one of the "Two-to-four tops" per run and the
 * fifth run fails with an empty widget that looks like an availability bug.
 * Runs after every test rather than only the reservation ones, because a
 * failed run halfway through still booked a table.
 */
test.afterEach(async () => {
  await releaseJourneyTableReservations();
});

test("C06-CUS smoke: storefront body is reachable — not a journey pass", async ({ page }) => {
  await openStorefront(page);
});

test("C06-CUS public menu: House pizza on storefront → send → Sales and DB agree", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const marker = `c06-cus-${Date.now()}@impronta.test`;

  await openStorefront(page);
  await expect(page.getByText("House pizza").first()).toBeVisible();
  await expect(page.getByText("Menu items are not published yet.")).toHaveCount(0);

  await page.getByRole("button", { name: "Increase House pizza" }).click();
  await expect(page.getByText(/in your order/i)).toBeVisible();

  // Scoped to the menu board, like the sibling tests below. Page-wide
  // `getByLabel(/^name$/i)` passed only while the storefront was rendering
  // fewer blocks than it should: the class-registration block carries its own
  // Name field, so once the CMS reads were repaired this matched two inputs
  // and failed strict mode. A locator that depends on a section being broken
  // is not a passing journey.
  const menu = page.locator(".site-builder-node--menu-board");
  await menu.getByLabel(/^name$/i).fill("C06 guest");
  await menu.getByLabel(/^email$/i).fill(marker);
  await menu.getByLabel(/^phone$/i).fill("55501006");
  await page.locator(".site-builder-node--menu-board-submit").click();
  await expect(page.locator(".site-builder-node--menu-board-form-status")).toContainText(
    /order sent|your order is in/i,
    { timeout: 30_000 },
  );
  await expect(page.locator(".site-builder-node--menu-board-form-error")).toHaveCount(0);

  await page.reload();
  await expect(page.getByText("House pizza").first()).toBeVisible();

  await signInJourneysStaff(page, "/admin/sales");
  await assertWorkspaceIdentity(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/sales/i);
  await expect(page.getByText("We could not load your orders")).toHaveCount(0);
  await expect(page.getByText("menu").first()).toBeVisible();
  // Asserted on the ROW rather than on loose page text, so the amount and the
  // money state have to belong to the same order. `$18.00` alone matched a POS
  // row from another case, which is how this could have kept passing while
  // showing the operator the wrong thing.
  const salesRow = page.getByRole("row", { name: /C06 guest/i }).first();
  await expect(salesRow).toContainText("$18.00");
  await expect(salesRow).toContainText(/still owed/i);
  await expect(salesRow, "an uncollected order must never read as paid").not.toContainText(
    /\bpaid\b/i,
  );

  const persisted = await latestMenuPizza(marker);
  expect(persisted, "menu pizza order must exist on qa-journeys").not.toBeNull();
  // `pending_payment`, and the previous `paid` here was the defect rather than
  // the baseline. The fixture seeds House pizza with `reserve_mode: 'full'` —
  // an $18 product paid in full — so nothing has been collected at the point
  // a guest sends the order from the storefront. It read `paid` while the
  // isolated database disagreed with its own seed, and an $18 order marked
  // paid with no money collected is exactly the false-paid state the money
  // rules forbid: it tells the operator's Sales list a debt was settled.
  expect(persisted?.status).toBe("pending_payment");
  expect(persisted?.totalCents).toBe(1800);
  expect(persisted?.sourceChannel).toBe("menu");
  expect(persisted?.customerEmail).toBe(marker);
  expect(persisted?.lineLabel?.toLowerCase()).toContain("house pizza");

  await page.screenshot({
    path: testInfo.outputPath("c06-cus-sales.png"),
    fullPage: true,
  });
});

test("C06-CUS reservation: storefront reserve_table → hold → Sales and DB agree", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const marker = `c06-cus-rsv-${Date.now()}@impronta.test`;

  await openStorefront(page);
  const board = page.locator("[data-builder-node-kind='reserve_table']");
  await expect(page.getByText("Reserve a table").first()).toBeVisible();
  await expect(board.getByText(/this restaurant is not taking bookings/i)).toHaveCount(0);
  await expect(board.getByText(/checking the book/i)).toHaveCount(0, { timeout: 20_000 });

  const slotButtons = board.getByRole("button", { name: /^\d{1,2}:\d{2}/ });
  await expect(slotButtons.first()).toBeVisible({ timeout: 20_000 });
  await slotButtons.first().click();

  await board.getByLabel(/^name$/i).fill("C06 diner");
  await board.getByLabel(/^email$/i).fill(marker);
  await board.getByRole("button", { name: /^reserve at /i }).click();
  await expect(board.getByRole("status")).toContainText(/you are booked|nothing to pay/i, {
    timeout: 30_000,
  });

  await page.reload();
  await expect(page.getByText("Reserve a table").first()).toBeVisible();

  await signInJourneysStaff(page, "/admin/sales");
  await assertWorkspaceIdentity(page);
  await expect(page.getByText("reservation").first()).toBeVisible();

  const persisted = await latestTableReservation(marker);
  expect(persisted, "reservation order must exist on qa-journeys").not.toBeNull();
  expect(persisted?.sourceChannel).toBe("reservation");
  expect(persisted?.customerEmail).toBe(marker);
  expect(persisted?.admissionId, "reservation must write an admission").toBeTruthy();
  expect(persisted?.partySize).toBe(2);

  // THE TABLE IS ACTUALLY HELD, which is the part that was untrue. A free
  // reservation used to be written as an order owing $0 behind a 15-minute
  // payment deadline: `decideOrderExpiry` cancelled it a quarter of an hour
  // after the guest booked, and the table stopped counting even sooner because
  // `remaining()` only counts a hold while `expires_at > now()`.
  expect(persisted?.totalCents, "the table itself is free").toBe(0);
  expect(persisted?.status, "an order for nothing is settled, not awaiting $0").toBe("paid");
  expect(
    persisted?.holdExpiresAt,
    "a confirmed reservation must carry no payment deadline — the deadline cancelled it",
  ).toBeNull();
  expect(
    persisted?.allocationState,
    "the table must be COMMITTED; a hold lapses and the venue can resell it",
  ).toBe("committed");

  await page.screenshot({
    path: testInfo.outputPath("c06-cus-reservation.png"),
    fullPage: true,
  });
});

test("C06-CUS reserve-then-order: one guest reserves a table then orders pizza", async ({
  page,
}, testInfo) => {
  test.setTimeout(150_000);
  const marker = `c06-cus-both-${Date.now()}@impronta.test`;

  await openStorefront(page);

  const board = page.locator("[data-builder-node-kind='reserve_table']");
  await expect(page.getByText("Reserve a table").first()).toBeVisible();
  await expect(board.getByText(/checking the book/i)).toHaveCount(0, { timeout: 20_000 });

  const slotButtons = board.getByRole("button", { name: /^\d{1,2}:\d{2}/ });
  await expect(slotButtons.first()).toBeVisible({ timeout: 20_000 });
  await slotButtons.first().click();
  await board.getByLabel(/^name$/i).fill("C06 diner");
  await board.getByLabel(/^email$/i).fill(marker);
  await board.getByRole("button", { name: /^reserve at /i }).click();
  await expect(board.getByRole("status")).toContainText(/you are booked|nothing to pay/i, {
    timeout: 30_000,
  });

  const menu = page.locator(".site-builder-node--menu-board");
  await expect(page.getByText("House pizza").first()).toBeVisible();
  await page.getByRole("button", { name: "Increase House pizza" }).click();
  await expect(page.getByText(/in your order/i)).toBeVisible();
  await menu.getByLabel(/^name$/i).fill("C06 diner");
  await menu.getByLabel(/^email$/i).fill(marker);
  await menu.getByLabel(/^phone$/i).fill("55501006");
  await page.locator(".site-builder-node--menu-board-submit").click();
  await expect(page.locator(".site-builder-node--menu-board-form-status")).toContainText(
    /order sent|your order is in/i,
    { timeout: 30_000 },
  );

  await page.reload();
  await expect(page.getByText("Reserve a table").first()).toBeVisible();
  await expect(page.getByText("House pizza").first()).toBeVisible();

  await signInJourneysStaff(page, "/admin/sales");
  await assertWorkspaceIdentity(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/sales/i);
  await expect(page.getByText("We could not load your orders")).toHaveCount(0);
  await expect(page.getByText("reservation").first()).toBeVisible();
  await expect(page.getByText("menu").first()).toBeVisible();

  // Scoped to this guest's row, for the same reason as the public-menu case:
  // a bare `$18.00` anywhere on the page is satisfied by another case's order.
  const menuRow = page.getByRole("row", { name: /C06 diner/i }).first();
  await expect(menuRow).toContainText("$18.00");
  await expect(menuRow).toContainText(/still owed/i);
  await expect(menuRow, "an uncollected order must never read as paid").not.toContainText(
    /\bpaid\b/i,
  );

  const persisted = await latestReserveThenOrder(marker);
  expect(persisted, "same guest must have both reservation and menu orders").not.toBeNull();
  expect(persisted?.reservation.sourceChannel).toBe("reservation");
  expect(persisted?.reservation.admissionId).toBeTruthy();
  expect(persisted?.reservation.partySize).toBe(2);
  // The table half of this journey holds a real table, and separately from
  // the pizza: two orders for one guest, and only one of them owes money.
  expect(persisted?.reservation.status).toBe("paid");
  expect(persisted?.reservation.allocationState).toBe("committed");
  expect(persisted?.reservation.holdExpiresAt).toBeNull();
  // `pending_payment`, and the `paid` this used to assert was the same money
  // lie corrected in the public-menu case above: House pizza is seeded
  // `reserve_mode: 'full'`, so sending the order from the storefront collects
  // nothing. This copy survived because the test never got this far — it was
  // failing earlier on the reservation slots (D-018).
  expect(persisted?.menu.status).toBe("pending_payment");
  expect(persisted?.menu.totalCents).toBe(1800);
  expect(persisted?.menu.sourceChannel).toBe("menu");
  expect(persisted?.menu.lineLabel?.toLowerCase()).toContain("house pizza");
  expect(persisted?.reservation.customerEmail).toBe(marker);
  expect(persisted?.menu.customerEmail).toBe(marker);

  await page.screenshot({
    path: testInfo.outputPath("c06-cus-reserve-then-order.png"),
    fullPage: true,
  });
});

test("C06-OP smoke: operator Sales heading is reachable — not a journey pass", async ({ page }) => {
  await openWorkspace(page, "sales");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("C06-OP walk-in cash: New sale → House pizza → collect → Sales and DB agree", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const marker = `c06-op-${Date.now()}@impronta.test`;

  // Re-expressed for the wired counter (P3). The journey is unchanged — new
  // sale, House pizza, name the buyer, take cash — but the prototype screen it
  // used to drive is gone: `⊕ New sale` / `getByTitle` / a `payment: paid`
  // status line were that screen's own affordances, not this journey's. The
  // money assertions below are untouched.
  await signInJourneysStaff(page, "/admin/pos?mode=counter");
  await assertWorkspaceIdentity(page);
  await expect(page.getByRole("button", { name: "House pizza" }).first()).toBeVisible();

  // The board's counter (`POSEmptySale`): no start button; the first tap on a
  // tile opens the sale and puts the pizza on it.
  await counterStartSale(page);
  await counterAddItem(page, "House pizza");
  await expect(page.locator("[data-pos-total]")).toHaveText(/\$18\.00/, { timeout: 20_000 });

  // The buyer's email is what `startCollection` hands `ensureCustomer`, which
  // is how this order gets a `customer_id` and how `latestPaidPosPizza` finds
  // it below. Named through the customer sheet.
  await counterNameBuyer(page, marker);
  await counterCollectCash(page);
  await expectCounterPaid(page);

  await page.goto("/admin/sales");
  await assertWorkspaceIdentity(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/sales/i);
  await expect(page.getByText("We could not load your orders")).toHaveCount(0);
  await expect(page.getByText("pos").first()).toBeVisible();
  await expect(page.getByText("$18.00").first()).toBeVisible();
  await expect(page.getByText("paid").first()).toBeVisible();

  const persisted = await latestPaidPosPizza(marker);
  expect(persisted, "paid POS pizza must exist on qa-journeys").not.toBeNull();
  expect(persisted?.status).toBe("paid");
  expect(persisted?.totalCents).toBe(1800);
  expect(persisted?.sourceChannel).toBe("pos");
  expect(persisted?.customerEmail).toBe(marker);
  expect(persisted?.lineLabel?.toLowerCase()).toContain("house pizza");

  await page.screenshot({
    path: testInfo.outputPath("c06-op-sales.png"),
    fullPage: true,
  });
});
