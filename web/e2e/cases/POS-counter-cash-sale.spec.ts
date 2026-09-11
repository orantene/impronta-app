/**
 * POS — the counter's own journey: a shift, two items, cash, a receipt, and
 * the three refusals a cashier really meets.
 *
 * WHAT THIS PROVES that the per-case specs do not. C06-OP already rings up
 * ONE item and checks the money row. This one is about the COUNTER as an
 * interface: that a person reaches it the way a person reaches it — the top
 * bar's own Workspace/Counter switch, not a typed URL — that the sell
 * surface, the basket's quantity controls, the collect sheet's keypad and the
 * paid screen are all reachable in sequence, that the sale's total is the sum
 * of two DIFFERENT items, and that the receipt the paid screen offers is a
 * real `/r/<code>` page that resolves.
 *
 * WHY THE SWITCH AND NOT A URL. `/admin/pos` stays reachable by address on
 * purpose (the route's own comment says so: the counter ships dark while its
 * URL stays open for whoever is building it). So a spec that types the
 * address proves the screen and not the DOOR, and the door is behind
 * `platform_settings.workspace_pos_enabled` — the one thing that decides
 * whether any cashier can ever get there. Entering through it is what makes
 * this a journey rather than a page test.
 *
 * WHY THE RECEIPT LINK IS FOLLOWED and not merely present. `orders
 * .receipt_code` is the retrieval anchor for an anonymous cash walk-in — the
 * only way that customer ever reaches their receipt. A link that renders and
 * 404s fails in front of a person holding a printed slip, and "the anchor is
 * on the page" is the assertion that would let it.
 *
 * WHY THREE REFUSALS. A till that takes money must also be able to say no,
 * and say it in words. The three below are the ones a counter meets on a real
 * shift: the sale was already collected by somebody else, the sale changed
 * under the operator's hands, and the item will not be sold to a stranger.
 * Each is driven from the interface — never injected — and each is asserted
 * as a SENTENCE, with the engine's own vocabulary (`not_draft`, `conflict`,
 * `no_contact`) asserted absent, because a cashier reading `no_contact` off a
 * screen is the defect `lib/pos/refusal-reason.ts` exists to close.
 *
 * TWO TILLS ARE TWO TABS. The fixture workspace has exactly one member who
 * may take money (the owner; the other is a `viewer`, whom the mode
 * vocabulary correctly gives no POS at all). So "someone else" here is a
 * second tab holding the same sale — which is what the refusals actually turn
 * on: they are decided by the ORDER's state and version under a row lock, not
 * by who is charging. Nothing about them would change with two logins.
 *
 * Follows `_harness.ts` like every sibling: the fixture prepares state, the
 * browser performs the business action, and a login page cannot pass.
 */
import type { Page } from "@playwright/test";

import {
  test,
  expect,
  prepareJourneysPage,
  signInJourneysStaff,
  skipUnlessFixture,
  assertWorkspaceIdentity,
} from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";

skipUnlessFixture();

/**
 * The catalogue this journey sells from, and the sums it checks.
 *
 * Two DIFFERENT items on purpose: a total that is one price times a quantity
 * cannot tell a working line-sum apart from a screen echoing one number back.
 * `House pizza` is in the committed fixture; `Garlic bread` and
 * `QA gala ticket` were added through the workspace's own Menu screen (see
 * this journey's evidence README) rather than inserted.
 */
const PIZZA = { title: "House pizza", cents: 1800 } as const;
const BREAD = { title: "Garlic bread", cents: 650 } as const;
/** Its offering carries `requires_identity`, so it refuses an unnamed buyer. */
const TICKET = { title: "QA gala ticket", cents: 1200 } as const;

/** Two pizzas and a garlic bread. */
const SALE_TOTAL_CENTS = PIZZA.cents * 2 + BREAD.cents;
const TENDERED_CENTS = 5000;
const CHANGE_CENTS = TENDERED_CENTS - SALE_TOTAL_CENTS;

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * The browser-facing admin base for THIS run's host shape.
 *
 * `/admin` on a host that already names the tenant (the deployed
 * `staging-qa-journeys.tulala.digital`, and every custom domain);
 * `/qa-journeys/admin` on the shared app host a local `next dev` serves. The
 * counter's own links are built from `x-impronta-original-pathname`, so a
 * hard-coded `/admin` here would only ever be right on one of the two.
 */
const ADMIN_BASE = process.env.JOURNEYS_ADMIN_BASE ?? "/admin";

/** The counter's address in this run's host shape. */
function posHref(orderId?: string): string {
  const order = orderId ? `&order=${encodeURIComponent(orderId)}` : "";
  return `${ADMIN_BASE}/pos?mode=counter${order}`;
}

/**
 * The engine's machine words. None of them may ever appear on the screen: the
 * banner's whole job is to replace them with a sentence, and asserting only
 * that a sentence is present would still pass if the raw word were beside it.
 */
const ENGINE_WORDS =
  /\b(not_draft|no_contact|engine_error|already_collected|exceeds_outstanding|conflict|wrong_tenant|version_conflict)\b/;

/**
 * The counter's own rail, in any of the three languages the product ships.
 * Its accessible name is `dashboard.pos.counter.rail.label`.
 */
function counterRail(page: Page) {
  return page.getByRole("navigation", { name: /^(counter|mostrador|comptoir)$/i });
}

/**
 * The refusal banner, as a cashier meets it: one alert, one sentence.
 *
 * Found by `data-pos-refusal`, the hook `PosRefusalBanner` puts beside its
 * sentence, and NOT by "the first alert on the page": the shell carries other
 * `role="alert"` live regions that are empty until something uses them, and
 * the first run of this journey read one of those, saw "", and reported a
 * working refusal as a missing one. The role is still asserted, so a banner
 * that stopped being an alert would still fail here.
 */
async function expectRefusalSentence(page: Page, sentence: RegExp): Promise<string> {
  const banner = page.locator("[data-pos-refusal]").first();
  await expect(banner, "a refusal must reach the operator as a visible banner").toBeVisible({
    timeout: 30_000,
  });
  await expect(banner, "the refusal must be announced as an alert").toHaveAttribute(
    "role",
    "alert",
  );
  const text = (await banner.innerText()).trim();
  expect(text, "a refusal must be a sentence, not a status code").toMatch(sentence);
  expect(text, "the engine's own vocabulary must never reach a cashier").not.toMatch(ENGINE_WORDS);
  return text;
}

/**
 * Enter the point of sale the way a person does: the top bar's own switch.
 *
 * When this workspace has more than one point-of-sale mode enabled, the
 * switch's own component (`PosModeSwitch`) opens a menu on the first click
 * instead of navigating directly — by design, so a person can choose which
 * mode. The fixture workspace's settings are shared with every other proof
 * on this database, so how many modes are on is never assumed: open the
 * menu, and if it is showing, choose Counter from it; if the workspace has
 * only Counter on, the same click already navigated and no menu appears.
 */
async function enterCounterFromTopBar(page: Page): Promise<void> {
  const control = page.getByRole("group", { name: /workspace or point of sale/i });
  await expect(
    control,
    "the top bar switch is the only desktop door into the counter; " +
      "it needs platform_settings.workspace_pos_enabled on this database",
  ).toBeVisible({ timeout: 30_000 });
  await control.getByRole("button", { name: /^counter$/i }).click();
  const menu = page.getByRole("menu", { name: /choose a point of sale mode/i });
  if (await menu.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await menu.getByRole("menuitem", { name: /^counter$/i }).click();
  }
  await expect(page).toHaveURL(
    new RegExp(`${ADMIN_BASE.replace(/\//g, "\\/")}\\/pos\\?mode=counter`),
    { timeout: 30_000 },
  );
  // The counter owns the whole screen: the workspace rail is gone, the POS's
  // own rail is there. This is the chrome half of the acceptance.
  await expect(page.locator("[data-tulala-app-sidebar]")).toHaveCount(0);
  await expect(page.locator("[data-tulala-pos-chrome]")).toHaveCount(1);
  await expect(counterRail(page)).toBeVisible();
}

/**
 * A shift of THIS run's own, so the cash has a drawer to belong to and the
 * opening is something this journey watched rather than inherited.
 *
 * A shift is workspace-wide and outlives a test, so the previous run's drawer
 * is usually still open when this one starts. Using it would make "open a
 * shift" a step nobody performed. So: if a shift is open, close it the way a
 * cashier does (count the drawer, Close the shift), then open a fresh one
 * with its own float. Both halves go through the shift screen; nothing is
 * written around the interface. The engine's `already_open` refusal is what
 * would fire if this tried to open a second one instead.
 */
async function openFreshShift(page: Page): Promise<void> {
  await counterRail(page).getByRole("button", { name: /^(shifts|turnos|quarts)$/i }).click();
  const openingField = page.locator("#pos-shift-opening");
  const countedField = page.locator("#pos-shift-counted");
  await expect(openingField.or(countedField).first()).toBeVisible({ timeout: 20_000 });
  if (await countedField.count()) {
    await countedField.fill("100.00");
    await page.getByRole("button", { name: /close the shift/i }).click();
    await expect(openingField, "closing the shift must hand back the opening form").toBeVisible({
      timeout: 30_000,
    });
  }
  await openingField.fill("100.00");
  await page.getByRole("button", { name: /open the shift/i }).click();
  await expect(countedField, "the shift must actually open").toBeVisible({ timeout: 30_000 });
}

/** Back to the sell surface. */
async function openSellSurface(page: Page): Promise<void> {
  await counterRail(page).getByRole("button", { name: /^(sell|vender|vendre)$/i }).click();
}

/** Add one unit of a catalog item by its own name. */
async function addItem(page: Page, title: string): Promise<void> {
  const tile = page.getByRole("button", { name: title }).first();
  await expect(tile, `${title} must be on the sell surface`).toBeVisible({ timeout: 20_000 });
  await tile.click();
}

/** The Charge button, whose label carries the running total. */
function chargeButton(page: Page) {
  return page.getByRole("button", { name: /^Charge · /i }).first();
}

/** Open the collect sheet and take cash, tendering exactly what is due. */
async function collectCash(page: Page): Promise<void> {
  await chargeButton(page).click();
  await expect(page.getByRole("tab", { name: /^cash$/i })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /confirm cash/i }).click();
}

/** A fresh, empty sale. Resolves once the URL carries its order id. */
async function startSale(page: Page): Promise<string> {
  await page.getByRole("button", { name: /start a new sale/i }).click();
  await expect(page).toHaveURL(/order=/, { timeout: 30_000 });
  await expect(page.getByText(/add an item to start this sale/i)).toBeVisible();
  const orderId = new URL(page.url()).searchParams.get("order");
  expect(orderId, "a new sale must carry its order id in the address").toBeTruthy();
  return orderId!;
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await prepareJourneysPage(page);
});

test("POS-OP counter: shift open, two items, cash collected, receipt resolved, money rows agree", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);

  // A person starts on their workspace, not on the till's own address.
  await signInJourneysStaff(page, ADMIN_BASE);
  await assertWorkspaceIdentity(page);
  await enterCounterFromTopBar(page);
  // The chrome as the switch delivered it: this is the frame the sidebar
  // defect lived in, so it is kept as a picture and not only as a count.
  await page.screenshot({ path: testInfo.outputPath("switch-entry-chrome.png"), fullPage: false });

  const shiftOpenedAfter = new Date();
  await openFreshShift(page);
  await openSellSurface(page);

  // C02 — a fresh, empty sale.
  const orderId = await startSale(page);

  // C03 — two DIFFERENT items, so the total is a sum and not one price.
  await addItem(page, PIZZA.title);
  await expect(page.getByText(/add an item to start this sale/i)).toHaveCount(0, {
    timeout: 20_000,
  });

  // A second unit of the first line through the basket's own control, which is
  // the affordance a cashier actually uses when someone asks for one more.
  //
  // Asserted with a RETRYING expectation on the Charge button's own label
  // rather than a one-shot `innerText()`. The increment is a server command
  // followed by a refresh, so reading the text once races the round trip and
  // reports the old total as a product defect.
  await expect(chargeButton(page)).toHaveText(new RegExp(money(PIZZA.cents).replace("$", "\\$")), {
    timeout: 20_000,
  });
  await page.getByRole("button", { name: /increase quantity/i }).first().click();
  await expect(chargeButton(page), "two units of an $18 pizza is $36").toHaveText(
    /\$36\.00/,
    { timeout: 20_000 },
  );

  await addItem(page, BREAD.title);
  await expect(
    chargeButton(page),
    "two pizzas plus a garlic bread is the sum of two different prices",
  ).toHaveText(new RegExp(money(SALE_TOTAL_CENTS).replace("$", "\\$").replace(".", "\\.")), {
    timeout: 20_000,
  });

  // C03 → the collect sheet (money.md M01). Cash is the first tab.
  await chargeButton(page).click();
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

  // Tender $50 on the keypad — MORE than the total, which is the ordinary
  // case at a counter and the only one that produces change to hand back.
  for (const digit of ["5", "0", "0", "0"]) {
    await page.getByRole("button", { name: digit, exact: true }).first().click();
  }
  await expect(page.getByText(money(TENDERED_CENTS)).first()).toBeVisible();

  await page.getByRole("button", { name: /confirm cash/i }).click();

  // M13 — the paid screen, with the change a cashier has to hand back.
  await expect(page.getByRole("heading", { name: /^paid$/i })).toBeVisible({ timeout: 40_000 });
  await expect(
    page.getByText(money(CHANGE_CENTS)).first(),
    "change from $50.00 on $42.50",
  ).toBeVisible();

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
    await expect(anonymousPage.getByText(money(SALE_TOTAL_CENTS)).first()).toBeVisible({
      timeout: 30_000,
    });
    await anonymousPage.screenshot({
      path: testInfo.outputPath("pos-counter-receipt.png"),
      fullPage: true,
    });
  } finally {
    await anonymous.close();
  }

  // ── And the database agrees with the screen ──────────────────────────
  //
  // A paid screen over an unpaid order is the exact false-paid state the money
  // rules forbid, so every row the sale should have written is read back: the
  // order, its two lines, the money row, and the shift that money belongs to.
  expect(
    new URL(page.url()).searchParams.get("order"),
    "the counter must stay on the sale it collected",
  ).toBe(orderId);

  const sb = isolatedService();
  const { data: orderRow } = await sb
    .from("orders")
    .select("id, tenant_id, status, total_cents, source_channel, receipt_code")
    .eq("id", orderId)
    .maybeSingle();
  const order = orderRow as {
    tenant_id: string;
    status: string;
    total_cents: number;
    source_channel: string;
    receipt_code: string;
  } | null;
  expect(order, "the collected sale must exist on qa-journeys").not.toBeNull();
  expect(order?.tenant_id).toBe(JOURNEYS_TENANT_ID);
  expect(order?.status).toBe("paid");
  expect(Number(order?.total_cents)).toBe(SALE_TOTAL_CENTS);
  expect(order?.source_channel).toBe("pos");
  expect(receiptHref).toContain(order!.receipt_code);

  const { data: lineRows } = await sb
    .from("order_lines")
    .select("label, units, unit_cents, total_cents")
    .eq("order_id", orderId)
    .order("sort_order", { ascending: true });
  const lines = (lineRows ?? []) as Array<{
    label: string | null;
    units: number;
    unit_cents: number;
    total_cents: number;
  }>;
  expect(lines.length, "two different items are two lines, not one merged one").toBe(2);
  const pizzaLine = lines.find((l) => (l.label ?? "").includes(PIZZA.title));
  const breadLine = lines.find((l) => (l.label ?? "").includes(BREAD.title));
  expect(pizzaLine, "the pizza line must be on the order").toBeTruthy();
  expect(breadLine, "the garlic bread line must be on the order").toBeTruthy();
  expect(Number(pizzaLine?.units), "the basket's + control wrote a second unit").toBe(2);
  expect(Number(pizzaLine?.total_cents)).toBe(PIZZA.cents * 2);
  expect(Number(breadLine?.units)).toBe(1);
  expect(Number(breadLine?.total_cents)).toBe(BREAD.cents);
  expect(
    Number(pizzaLine?.total_cents) + Number(breadLine?.total_cents),
    "the order total is the sum of its lines",
  ).toBe(Number(order?.total_cents));

  const { data: txnRows } = await sb
    .from("booking_transactions")
    .select("id, status, gross_amount_cents, metadata")
    .eq("order_id", orderId);
  const txns = (txnRows ?? []) as Array<{
    status: string;
    gross_amount_cents: number;
    metadata: Record<string, unknown> | null;
  }>;
  const paidTxns = txns.filter((t) => t.status === "paid");
  expect(paidTxns.length, "one collection is one money row, never two").toBe(1);
  expect(Number(paidTxns[0].gross_amount_cents)).toBe(SALE_TOTAL_CENTS);
  expect(
    (paidTxns[0].metadata ?? {})["paid_via"],
    "the money row must record how the money arrived",
  ).toBe("cash");
  expect(
    Number((paidTxns[0].metadata ?? {})["change_cents"]),
    "the change handed back is recorded beside the money",
  ).toBe(CHANGE_CENTS);

  // The shift the cash belongs to. `settleAtDoor` stamps the open shift's id
  // on the money row's metadata; a till with a drawer open that writes cash
  // belonging to no shift is a cash-up that can never be reconciled.
  const shiftId = (paidTxns[0].metadata ?? {})["shift_id"];
  expect(typeof shiftId, "cash collected on an open shift must name that shift").toBe("string");
  const { data: shiftRow } = await sb
    .from("pos_shifts")
    .select("id, tenant_id, status, opening_cash_cents, opened_at")
    .eq("id", shiftId as string)
    .maybeSingle();
  const shift = shiftRow as {
    tenant_id: string;
    status: string;
    opening_cash_cents: number;
    opened_at: string;
  } | null;
  expect(shift, "the stamped shift must be a real row").not.toBeNull();
  expect(shift?.tenant_id).toBe(JOURNEYS_TENANT_ID);
  expect(shift?.status).toBe("open");
  expect(Number(shift?.opening_cash_cents), "the float typed on the shift screen").toBe(10_000);
  // The shift the money landed in is the one THIS run opened through the
  // shift screen, not a drawer some earlier run left open.
  expect(
    new Date(shift!.opened_at).getTime(),
    "the shift must have been opened by this journey, after it started",
  ).toBeGreaterThanOrEqual(shiftOpenedAfter.getTime() - 1_000);
});

test("POS-OP counter refusal: a sale someone else already collected against", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);

  await signInJourneysStaff(page, ADMIN_BASE);
  await enterCounterFromTopBar(page);
  await openSellSurface(page);
  const orderId = await startSale(page);
  await addItem(page, PIZZA.title);
  await expect(chargeButton(page)).toHaveText(/\$18\.00/, { timeout: 20_000 });

  // A second till holding the SAME sale, opened before either one charges.
  const second = await page.context().newPage();
  await prepareJourneysPage(second);
  await second.goto(posHref(orderId));
  await expect(chargeButton(second)).toHaveText(/\$18\.00/, { timeout: 30_000 });

  // The second till gets there first and takes the money.
  await collectCash(second);
  await expect(second.getByRole("heading", { name: /^paid$/i })).toBeVisible({ timeout: 40_000 });

  // The first till, which knows nothing about that, tries to charge it too.
  await collectCash(page);
  const sentence = await expectRefusalSentence(page, /changed|collected|balance/i);
  await page.screenshot({
    path: testInfo.outputPath("refusal-already-collected.png"),
    fullPage: true,
  });
  // Not a dead end: the banner itself carries the next move.
  await expect(
    page.getByRole("alert").first().getByRole("button", { name: /^(reload|recargar|recharger)$/i }),
    "a stale sale must offer the operator a way forward, inside the refusal itself",
  ).toBeVisible();
  expect(sentence.length, "the refusal must be words").toBeGreaterThan(12);

  // The screen said no AND the money agrees: the customer paid once.
  const sb = isolatedService();
  const { data: txnRows } = await sb
    .from("booking_transactions")
    .select("id, status, gross_amount_cents")
    .eq("order_id", orderId);
  const paidTxns = ((txnRows ?? []) as Array<{ status: string; gross_amount_cents: number }>)
    .filter((t) => t.status === "paid");
  expect(paidTxns.length, "a refused second charge must not take the money again").toBe(1);
  expect(Number(paidTxns[0].gross_amount_cents)).toBe(PIZZA.cents);
  await second.close();
});

test("POS-OP counter refusal: a sale changed underneath the operator", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);

  await signInJourneysStaff(page, ADMIN_BASE);
  await enterCounterFromTopBar(page);
  await openSellSurface(page);
  const orderId = await startSale(page);
  await addItem(page, PIZZA.title);
  await expect(chargeButton(page)).toHaveText(/\$18\.00/, { timeout: 20_000 });

  // A second till adds a line to the same sale. The order's version moves.
  const second = await page.context().newPage();
  await prepareJourneysPage(second);
  await second.goto(posHref(orderId));
  await expect(chargeButton(second)).toHaveText(/\$18\.00/, { timeout: 30_000 });
  await addItem(second, BREAD.title);
  await expect(chargeButton(second)).toHaveText(/\$24\.50/, { timeout: 20_000 });

  // The first till is still looking at $18.00 and charges that.
  await expect(
    chargeButton(page),
    "the first till must still be holding the version it loaded",
  ).toHaveText(/\$18\.00/);
  await collectCash(page);
  const sentence = await expectRefusalSentence(page, /changed|reload/i);
  await page.screenshot({ path: testInfo.outputPath("refusal-stale-sale.png"), fullPage: true });
  expect(sentence.length, "the refusal must be words").toBeGreaterThan(12);

  // Nothing was taken at the stale price.
  const sb = isolatedService();
  const { data: txnRows } = await sb
    .from("booking_transactions")
    .select("id, status")
    .eq("order_id", orderId);
  const paid = ((txnRows ?? []) as Array<{ status: string }>).filter((t) => t.status === "paid");
  expect(paid.length, "a stale charge must take nothing at all").toBe(0);
  const { data: orderRow } = await sb
    .from("orders")
    .select("status, total_cents")
    .eq("id", orderId)
    .maybeSingle();
  const order = orderRow as { status: string; total_cents: number } | null;
  expect(order?.status, "the sale is still open for the operator to reload").not.toBe("paid");
  expect(Number(order?.total_cents), "the sale is worth what the second till made it").toBe(
    PIZZA.cents + BREAD.cents,
  );
  await second.close();
});

test("POS-OP counter refusal: an item that needs the customer's name, sold without one", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);

  await signInJourneysStaff(page, ADMIN_BASE);
  await enterCounterFromTopBar(page);
  await openSellSurface(page);
  const orderId = await startSale(page);
  await addItem(page, TICKET.title);
  await expect(chargeButton(page)).toHaveText(/\$12\.00/, { timeout: 20_000 });

  // Cash, no name typed anywhere: the ordinary anonymous walk-in, which this
  // one item is entitled to refuse.
  await collectCash(page);
  const sentence = await expectRefusalSentence(page, /name/i);
  await page.screenshot({ path: testInfo.outputPath("refusal-needs-name.png"), fullPage: true });
  expect(sentence.length, "the refusal must be words").toBeGreaterThan(12);

  // Nothing was taken, and the balance was not left claimed by the attempt.
  const sb = isolatedService();
  const { data: beforeRows } = await sb
    .from("booking_transactions")
    .select("id, status")
    .eq("order_id", orderId);
  expect(
    ((beforeRows ?? []) as Array<{ status: string }>).filter((t) => t.status === "paid").length,
    "a refused sale must take nothing",
  ).toBe(0);

  // NOT A DEAD END. The sentence says what is missing, and doing that thing
  // sells the ticket — which is the difference between a refusal and a wall.
  const buyer = `qa-counter-${Date.now()}@impronta.test`;
  await page.getByRole("button", { name: /back to the sale/i }).click();
  await page.locator("#pos-buyer-email").fill(buyer);
  await collectCash(page);
  await expect(page.getByRole("heading", { name: /^paid$/i })).toBeVisible({ timeout: 40_000 });
  await page.screenshot({ path: testInfo.outputPath("needs-name-recovered.png"), fullPage: true });

  const { data: orderRow } = await sb
    .from("orders")
    .select("status, total_cents, customer_id")
    .eq("id", orderId)
    .maybeSingle();
  const order = orderRow as {
    status: string;
    total_cents: number;
    customer_id: string | null;
  } | null;
  expect(order?.status, "naming the buyer must let the same sale through").toBe("paid");
  expect(Number(order?.total_cents)).toBe(TICKET.cents);
  expect(order?.customer_id, "the named buyer must be on the order").toBeTruthy();
  const { data: customerRow } = await sb
    .from("customers")
    .select("email")
    .eq("id", order!.customer_id as string)
    .maybeSingle();
  expect((customerRow as { email: string | null } | null)?.email).toBe(buyer);
});
