/**
 * VENUE, one service, end to end, from the sidebar.
 *
 * A party arrives without a booking, the desk puts them on tonight's book,
 * seats them at a table, the floor reads occupied, the check is opened from
 * the floor card, food goes to the kitchen, the order is amended after it has
 * gone and the kitchen has to acknowledge it a second time, the check is
 * collected, and the table is handed back for bussing.
 *
 * WHY THE WALK-IN AND NOT THE SEEDED BOOK. The four admissions in
 * `seed_journeys_program.sql` are hand-inserted rows: seating one of those
 * would prove the seating half and take the booking on trust. `Add a walk-in`
 * is the only door in the product that CREATES an admission from a screen, so
 * the reservation this journey seats is one the interface itself made.
 *
 * WHY THE AMENDMENT IS A SECOND SEND AND NOT A SECOND TICKET. That is the
 * whole point of `submitOrderToPreparation`'s amend branch: a re-send bumps
 * `revision`, re-queues the ticket and CLEARS `acknowledged_at`, so a station
 * that already said "heard" has to say it again about food that changed. A
 * second ticket row would be the defect.
 *
 * EVERY MOVE IS ONE THE INTERFACE OFFERS. The point of sale replaces the
 * admin chrome (no rail on that screen), so the way back is the identity
 * bar's "Workspace" segment, and the check is re-opened from the floor card
 * each time, never by typing an address.
 *
 * Follows `_harness.ts`: the fixture prepares nothing this journey could have
 * created itself, the browser performs every business action, and a login page
 * cannot pass.
 */
import {
  test,
  expect,
  prepareJourneysPage,
  signInJourneysStaff,
  skipUnlessFixture,
  assertWorkspaceIdentity,
} from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import { releaseVenueJourneyParty, venueJourneyRows } from "./_venue-db";

skipUnlessFixture();

/** The venue's own zone, from the fixture. Nothing on these screens may use another. */
const VENUE_ZONE = "America/Mexico_City";

/**
 * The browser is put on a zone that is neither the venue's nor the server's,
 * so "the venue's clock" is a three-way distinction and not a coincidence:
 * Vercel renders in UTC, this device claims Tokyo, and every time on the
 * screen has to be Mexico City.
 */
test.use({ timezoneId: "Asia/Tokyo" });

test.beforeEach(async ({ page }) => {
  await prepareJourneysPage(page);
});

/** Give the floor and the band pool back, whatever happened above. */
test.afterEach(async () => {
  await releaseVenueJourneyParty();
});

type Page = import("@playwright/test").Page;

/**
 * The rail button for a destination.
 *
 * Matched on the START of its accessible name: each rail row carries an
 * `aria-label` of "<Destination>, <what it is for>", so an exact-name match
 * finds nothing and a bare substring match would find two rows the day a
 * second destination mentions the first.
 */
function railButton(page: Page, destination: string) {
  return page
    .locator("[data-tulala-app-sidebar]")
    .getByRole("button", { name: new RegExp(`^${destination}\\b`, "i") })
    .first();
}

/** The floor card for one table, found by the code printed on it. */
function tableCard(page: Page, code: string) {
  return page.locator("li").filter({ has: page.getByText(code, { exact: true }) }).first();
}

/**
 * The kitchen's card for THIS table's food. Two pizza tickets on one evening
 * are two cards; the table code the ticket now carries is what tells them
 * apart, for the cook and for this locator alike.
 */
function tableTicket(page: Page, code: string) {
  return page
    .locator("li")
    .filter({ hasText: /house pizza/i })
    // Adjacent spans concatenate in textContent ("Table T4New"), so a word
    // boundary never comes; "not followed by another digit" is the real test.
    .filter({ hasText: new RegExp(`table ${code}(?![0-9])`, "i") })
    .first();
}

/**
 * Leave the point of sale the way a person does: the identity bar's
 * "Workspace | <mode>" switch. The POS has no rail of its own.
 */
async function leaveCounter(page: Page) {
  await page
    .getByRole("group", { name: /workspace or point of sale/i })
    .getByRole("button", { name: /^workspace$/i })
    .click();
  await expect(page.locator("[data-tulala-app-sidebar]")).toBeVisible({ timeout: 30_000 });
}

/** From the floor, open the check that belongs to a table's visit. */
async function openCheckFromFloor(page: Page, code: string): Promise<string> {
  await railButton(page, "Spaces").click();
  await expect(page).toHaveURL(/\/admin\/tables/, { timeout: 30_000 });
  const card = tableCard(page, code);
  await expect(card).toContainText(/occupied/i, { timeout: 30_000 });
  await card.getByRole("button", { name: /open check/i }).click();
  await expect(page).toHaveURL(/\/admin\/pos\?.*order=/, { timeout: 40_000 });
  const orderId = new URL(page.url()).searchParams.get("order");
  expect(orderId, "the floor must hand the counter the visit's own check").toBeTruthy();
  await expect(page.getByRole("button", { name: "House pizza" }).first()).toBeVisible({
    timeout: 30_000,
  });
  return orderId!;
}

/** Send what is on the check to the kitchen as a TABLE ticket. */
async function sendToKitchen(page: Page) {
  // A check opened from the floor carries its table, so `Here` sends a TABLE
  // ticket (the counter's `Send N items`); there is no destination select.
  const send = page.locator("[data-pos-send]");
  await send.click();
  // The counter's sign the ticket went: once the engine has answered the
  // action reads `Send again` (a second send is an amendment).
  await expect(send).toHaveText(/send again|enviar de nuevo|renvoyer/i, { timeout: 30_000 });
}

test("VENUE-OP: walk-in booked, seated, fed, amended, collected and the table handed back", async ({
  page,
}, testInfo) => {
  test.setTimeout(360_000);

  const stamp = Date.now();
  const guest = `Prove Tables ${stamp}`;
  const sb = isolatedService();

  // ── The desk ───────────────────────────────────────────────────────
  await signInJourneysStaff(page, "/admin");
  await assertWorkspaceIdentity(page);

  await railButton(page, "Reservations").click();
  await expect(page).toHaveURL(/\/admin\/reservations/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^reservations$/i);
  // A read that failed and an empty book are different screens; neither is
  // the one this journey runs on.
  await expect(page.getByText(/we could not load the book/i)).toHaveCount(0);
  await expect(page.getByText(/no venue yet|no service windows yet/i)).toHaveCount(0);

  // Take the party. Three covers, because a two-top will not hold them and
  // that is what makes the table choice a real one.
  await page.getByRole("button", { name: /add a walk-in/i }).click();
  await page.getByLabel(/^name$/i).fill(guest);
  await page.getByLabel(/^party$/i).fill("3");
  await page.getByRole("button", { name: /add to the book/i }).click();

  const bookRow = page.getByRole("row", { name: new RegExp(guest) });
  await expect(bookRow, "the walk-in must land on tonight's book").toBeVisible({
    timeout: 30_000,
  });
  await expect(bookRow).toContainText(/arriving/i);
  await page.screenshot({ path: testInfo.outputPath("desk-walk-in-on-the-book.png"), fullPage: true });

  // ── Seat them ──────────────────────────────────────────────────────
  await bookRow.getByRole("button", { name: /^seat$/i }).click();
  await expect(page.getByText(/seat this party at/i)).toBeVisible();
  // Only tables that FIT are offered. A party of three must never be shown a
  // two-top, and the fixture's floor has several.
  await expect(
    page.getByRole("button", { name: /^T2$/ }),
    "a two-top must not be offered to a party of three",
  ).toHaveCount(0);
  const fourTop = page.getByRole("button", { name: /^T4$/ });
  await expect(fourTop).toBeVisible();
  await fourTop.click();

  await expect(
    page.getByRole("row", { name: new RegExp(guest) }),
    "the desk must show the party seated at the table it chose",
  ).toContainText(/seated/i, { timeout: 30_000 });
  await expect(page.getByRole("row", { name: new RegExp(guest) })).toContainText("T4");
  await page.screenshot({ path: testInfo.outputPath("desk-party-seated.png"), fullPage: true });

  // The booking row agrees before the floor is even opened: the admission is
  // on the table, everybody is admitted, and the stamp is real.
  const seatedRow = await venueJourneyRows(guest);
  expect(seatedRow.admission, "the walk-in must exist as an admission").not.toBeNull();
  expect(seatedRow.admission?.spaceId).toBe(seatedRow.tableFourTopId);
  expect(seatedRow.admission?.partySize).toBe(3);
  expect(seatedRow.admission?.admittedCount).toBe(3);
  expect(seatedRow.admission?.seatedAt).not.toBeNull();

  // ── The floor ──────────────────────────────────────────────────────
  await railButton(page, "Spaces").click();
  await expect(page).toHaveURL(/\/admin\/tables/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^tables$/i);
  await expect(page.getByText(/we could not load the floor/i)).toHaveCount(0);

  // Every time on this screen belongs to the venue, and the screen says so.
  await expect(
    page.getByText(new RegExp(`times shown in ${VENUE_ZONE}`, "i")),
    "the floor must name the clock it prints in",
  ).toBeVisible();

  const fourTopCard = tableCard(page, "T4");
  await expect(fourTopCard).toContainText(/occupied/i);
  await expect(fourTopCard).toContainText(/table check/i);
  await expect(fourTopCard, "the card must carry the party it was opened for").toContainText(
    /party of 3/i,
  );
  await page.screenshot({ path: testInfo.outputPath("floor-t4-occupied.png"), fullPage: true });

  // ── The check ──────────────────────────────────────────────────────
  await fourTopCard.getByRole("button", { name: /open check/i }).click();
  await expect(page).toHaveURL(/\/admin\/pos\?.*order=/, { timeout: 40_000 });

  const orderId = new URL(page.url()).searchParams.get("order");
  expect(orderId, "the floor must hand the counter the visit's own check").toBeTruthy();

  const pizza = page.getByRole("button", { name: "House pizza" }).first();
  await expect(pizza).toBeVisible({ timeout: 30_000 });
  await pizza.click();
  const charge = page.locator("[data-pos-charge]").first();
  await expect(charge).toHaveText(/\$18\.00/, { timeout: 30_000 });

  // ── To the kitchen ─────────────────────────────────────────────────
  await sendToKitchen(page);
  await leaveCounter(page);

  await railButton(page, "Preparation").click();
  await expect(page).toHaveURL(/\/admin\/preparation/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^preparation$/i);
  await expect(page.getByText(/we could not load the board/i)).toHaveCount(0);
  await expect(
    page.getByText(new RegExp(`times shown in ${VENUE_ZONE}`, "i")),
    "the kitchen must name the clock it prints in",
  ).toBeVisible();

  const ticket = tableTicket(page, "T4");
  await expect(ticket, "the kitchen must see a ticket that names the table").toBeVisible({
    timeout: 30_000,
  });
  // The status is its own badge; textContent runs the spans together
  // ("Table T4NewHouse pizza"), so the badge is asserted as an element.
  await expect(ticket.getByText("New", { exact: true })).toBeVisible();
  await expect(ticket).toContainText(/destination: table t4/i);
  await expect(ticket, "a first send is not an amendment").not.toContainText(/acknowledge again/i);
  await page.screenshot({ path: testInfo.outputPath("kitchen-ticket-new.png"), fullPage: true });

  await ticket.getByRole("button", { name: /^acknowledge$/i }).click();
  await expect(tableTicket(page, "T4")).toContainText(/acknowledged/i, { timeout: 30_000 });

  const acknowledged = await venueJourneyRows(guest, orderId!);
  expect(acknowledged.ticket, "sending to preparation must write a ticket").not.toBeNull();
  expect(acknowledged.ticket?.revision).toBe(1);
  expect(acknowledged.ticket?.status).toBe("acknowledged");
  expect(acknowledged.ticket?.acknowledgedAt).not.toBeNull();
  expect(acknowledged.ticket?.destination).toBe("table");
  expect(acknowledged.ticket?.visitId).toBe(acknowledged.visit?.id);

  // ── The amendment ──────────────────────────────────────────────────
  // The guests order a second pizza after the first ticket has gone. The
  // kitchen must be told, on the ticket it already has.
  const reopened = await openCheckFromFloor(page, "T4");
  expect(reopened, "the floor must re-open the SAME check").toBe(orderId);
  await page.getByRole("button", { name: "House pizza" }).first().click();
  await expect(page.locator("[data-pos-charge]").first()).toHaveText(/\$36\.00/, {
    timeout: 30_000,
  });
  await sendToKitchen(page);
  await leaveCounter(page);

  await railButton(page, "Preparation").click();
  await expect(page).toHaveURL(/\/admin\/preparation/, { timeout: 30_000 });
  const amended = tableTicket(page, "T4");
  await expect(amended, "an amendment must say so in words, not by a number changing").toContainText(
    /amended\. acknowledge again\./i,
    { timeout: 30_000 },
  );
  await expect(amended).toContainText(/revision 2/i);
  await expect(amended.getByText("New", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("kitchen-ticket-amended.png"), fullPage: true });

  await amended.getByRole("button", { name: /^acknowledge$/i }).click();
  await expect(tableTicket(page, "T4")).toContainText(/acknowledged/i, { timeout: 30_000 });

  const reacked = await venueJourneyRows(guest, orderId!);
  expect(reacked.ticketCount, "an amendment is a revision, never a second ticket").toBe(1);
  expect(reacked.ticket?.revision).toBe(2);
  expect(reacked.ticket?.status).toBe("acknowledged");
  expect(reacked.revisionCount, "each send snapshots what the kitchen was told").toBe(2);

  // ── Collect, then hand the table back ──────────────────────────────
  await openCheckFromFloor(page, "T4");
  await page.locator("[data-pos-charge]").first().click();
  await expect(page.getByRole("tab", { name: /^cash$/i })).toBeVisible({ timeout: 30_000 });
  await page.locator("[data-pos-confirm-cash]").click();
  await expect(page.locator("[data-pos-dialog='cash-done']")).toBeVisible({ timeout: 40_000 });
  await page.locator("[data-pos-cash-done]").click();
  await expect(page.getByRole("heading", { name: /^paid$/i })).toBeVisible({ timeout: 40_000 });
  await page.screenshot({ path: testInfo.outputPath("check-paid.png"), fullPage: true });
  await leaveCounter(page);

  await railButton(page, "Spaces").click();
  await expect(page).toHaveURL(/\/admin\/tables/, { timeout: 30_000 });
  const closing = tableCard(page, "T4");
  await expect(closing).toContainText(/occupied/i);
  await closing.getByRole("button", { name: /end visit/i }).click();

  const bussing = tableCard(page, "T4");
  await expect(
    bussing,
    "a table that was just vacated is not ready, it is unbussed",
  ).toContainText(/needs reset/i, { timeout: 30_000 });
  await expect(bussing).not.toContainText(/occupied/i);

  await page.screenshot({
    path: testInfo.outputPath("venue-floor-after-close.png"),
    fullPage: true,
  });

  // ── The database agrees ────────────────────────────────────────────
  const final = await venueJourneyRows(guest, orderId!);
  expect(final.visit?.status, "the visit is closed").toBe("closed");
  expect(final.visit?.closedAt).not.toBeNull();
  expect(final.visit?.partySize).toBe(3);
  expect(final.visit?.serviceKind).toBe("table");
  expect(final.visit?.spaceId).toBe(final.tableFourTopId);
  expect(final.order?.status, "the check is settled").toBe("paid");
  expect(final.order?.totalCents).toBe(3600);
  expect(final.order?.visitId).toBe(final.visit?.id);
  expect(final.ticket?.revision).toBe(2);
  expect(final.ticketCount).toBe(1);
  expect(final.tableNeedsResetAt, "the floor's needs-reset flag is a real column").not.toBeNull();

  // The vacated time the card shows is the VENUE's wall clock. Computed from
  // the instant the database holds, formatted in Mexico City, compared against
  // what a browser claiming Tokyo actually rendered.
  const vacatedInVenueZone = new Intl.DateTimeFormat("en", {
    timeZone: VENUE_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(final.tableNeedsResetAt!));
  await expect(
    bussing,
    "the vacated time must be the venue's clock, not the device's and not the server's",
  ).toContainText(vacatedInVenueZone);

  // And it is genuinely a different number from both other clocks, so the
  // assertion above could have failed.
  const inTokyo = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(final.tableNeedsResetAt!));
  const inUtc = new Intl.DateTimeFormat("en", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(final.tableNeedsResetAt!));
  expect(vacatedInVenueZone).not.toBe(inTokyo);
  expect(vacatedInVenueZone).not.toBe(inUtc);

  // Nothing above wrote to another workspace.
  const { data: strays } = await sb
    .from("visits")
    .select("tenant_id")
    .eq("id", final.visit!.id)
    .maybeSingle();
  expect((strays as { tenant_id: string } | null)?.tenant_id).toBe(JOURNEYS_TENANT_ID);
});
