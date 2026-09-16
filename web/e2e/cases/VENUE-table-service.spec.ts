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

/**
 * The rail shows a destination's children under the row that is lit, so
 * Preparation (Orders' kitchen view) is reached through Orders.
 */
async function openPreparation(page: Page) {
  await railButton(page, "Orders").click();
  await expect(page).toHaveURL(/\/admin\/orders/, { timeout: 30_000 });
  await railButton(page, "Preparation").click();
  await expect(page).toHaveURL(/\/admin\/preparation/, { timeout: 30_000 });
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
    .locator("li[data-prep-ticket]")
    .filter({ hasText: /house pizza/i })
    // The card leads with the table's code and says "Table" beside it.
    // Adjacent spans concatenate in textContent ("T4Table"), so a word
    // boundary never comes; "not followed by another digit" is the real test.
    .filter({ hasText: new RegExp(`${code}(?![0-9])`, "i") })
    .filter({ hasText: /table/i })
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
  // The Live Floor (`LiveFloor.dc.html`).
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^live floor$/i);
  // A read that failed and an empty book are different screens; neither is
  // the one this journey runs on.
  await expect(page.getByText(/we could not load the book/i)).toHaveCount(0);
  await expect(page.getByText(/no venue yet|no service windows yet/i)).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /^arriving/i })).toBeVisible();

  // Take the party (T07, the Walk-in sheet). Three covers, because a two-top
  // will not hold them and that is what makes the table choice a real one.
  // A click that lands before hydration is a click on nothing, so the door
  // is knocked until the sheet is there.
  const walkInSheet = page.locator('[data-pos-sheet="walk-in"]');
  for (let attempt = 0; attempt < 5 && !(await walkInSheet.isVisible()); attempt += 1) {
    await page.locator("[data-floor-walk-in]").click();
    await page.waitForTimeout(1_000);
  }
  await expect(walkInSheet).toBeVisible({ timeout: 20_000 });
  await walkInSheet.getByLabel(/^name$/i).fill(guest);
  await walkInSheet.getByRole("button", { name: /one more guest/i }).click();
  await expect(walkInSheet.locator("[data-floor-party]")).toContainText("3");
  // RIGHT NOW offers only the tables that fit three: never a two-top.
  await expect(walkInSheet.locator('[data-floor-walkin-fit="T2"]'), "a two-top must not be offered to a party of three").toHaveCount(0);
  await expect(walkInSheet.locator('[data-floor-walkin-fit="T4"]')).toBeVisible();
  await walkInSheet.locator("[data-floor-walkin-waitlist]").click();
  // After the fidelity re-skin the walk-in sheet leaves a POS overlay up;
  // the Waiting tab is in the page behind it and cannot be clicked until
  // the overlay is dismissed. Same end state: the party on tonight's book.
  const overlayClose = page.locator('[data-pos-overlay] [aria-label="Close"]');
  if (await overlayClose.isVisible().catch(() => false)) {
    await overlayClose.click();
  }
  await expect(walkInSheet).toHaveCount(0, { timeout: 20_000 });

  // The party lands on tonight's book: on the Waiting list (here, no table yet).
  await page.getByRole("tab", { name: /^waiting/i }).click();
  const bookRow = page.locator("[data-floor-party]").filter({ hasText: guest });
  await expect(bookRow, "the walk-in must land on tonight's book").toBeVisible({
    timeout: 30_000,
  });
  await expect(bookRow).toContainText(/waiting/i);
  await page.screenshot({ path: testInfo.outputPath("desk-walk-in-on-the-book.png"), fullPage: true });

  // ── Seat them (T08 → T05) ──────────────────────────────────────────
  await bookRow.click();
  const waiting = page.locator('[data-pos-sheet="waiting"]');
  await expect(waiting).toBeVisible();
  await waiting.locator("[data-floor-waiting]").filter({ hasText: guest }).getByRole("button", { name: /^seat now$/i }).click();
  const seatSheet = page.locator('[data-pos-sheet="seat-party"]');
  await expect(seatSheet).toBeVisible();
  await expect(seatSheet).toContainText(new RegExp(`Seat ${guest} · 3`));
  // Only tables that FIT are offered. A party of three must never be shown a
  // two-top, and the fixture's floor has several.
  await expect(
    seatSheet.getByRole("radio", { name: /^T2 · seats/ }),
    "a two-top must not be offered to a party of three",
  ).toHaveCount(0);
  const fourTop = seatSheet.getByRole("radio", { name: /^T4 · seats/ });
  await expect(fourTop).toBeVisible();
  await fourTop.click();
  await seatSheet.getByRole("button", { name: /^seat 3 guests at T4$/i }).click();

  // The Seated tab shows the party at the table it chose.
  await page.getByRole("tab", { name: /^seated/i }).click();
  const seatedTile = page.locator('[data-floor-seated="T4"]');
  await expect(seatedTile, "the desk must show the party seated at the table it chose").toContainText(new RegExp(guest), { timeout: 30_000 });
  await expect(seatedTile).toContainText(/seated/i);
  await expect(seatedTile).toContainText("T4");
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

  await openPreparation(page);
  // The station board (T26): `Kitchen`, the venue's clock, tabs Queued · Preparing · Ready.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^kitchen/i);
  await expect(page.getByText(/we could not load the board/i)).toHaveCount(0);
  await expect(
    page.getByText(new RegExp(`times shown in ${VENUE_ZONE}`, "i")),
    "the kitchen must name the clock it prints in",
  ).toBeVisible();

  await page.getByRole("tab", { name: /^queued/i }).click();
  const ticket = tableTicket(page, "T4");
  await expect(ticket, "the kitchen must see a ticket that names the table").toBeVisible({
    timeout: 30_000,
  });
  // Every line of a first send is new; the pill is its own element because
  // textContent runs the spans together ("T4TableHouse pizzaNew").
  await expect(ticket.getByText("New", { exact: true })).toBeVisible();
  await expect(ticket).toContainText(/table/i);
  await expect(ticket).toContainText(/3 guests/i);
  await expect(ticket).toContainText(/fired \d\d:\d\d/i);
  await expect(ticket, "a first send is not an amendment").not.toContainText(/acknowledge again/i);
  await page.screenshot({ path: testInfo.outputPath("kitchen-ticket-new.png"), fullPage: true });

  // `Start` acknowledges the ticket; it moves to the Preparing tab.
  await ticket.getByRole("button", { name: /^start$/i }).click();
  await page.getByRole("tab", { name: /^preparing/i }).click();
  await expect(tableTicket(page, "T4")).toContainText(/preparing/i, { timeout: 30_000 });
  await expect(tableTicket(page, "T4").getByRole("button", { name: /mark ready/i })).toBeVisible();

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

  await openPreparation(page);
  // An amendment re-queues the ticket: the board opens on the Queued tab
  // and the K09 banner names the table and the revision.
  const amended = tableTicket(page, "T4");
  await expect(amended, "an amendment must say so in words, not by a number changing").toContainText(
    /amended\. acknowledge again\./i,
    { timeout: 30_000 },
  );
  await expect(amended).toContainText(/revision 2/i);
  // Only the line the amendment added is new: the second pizza grew the
  // units of the one line, so that line carries the pill.
  await expect(amended.getByText("New", { exact: true })).toBeVisible();
  await expect(page.locator("[data-prep-amendment]")).toContainText(/T4 · ticket amended · revision 2/i);
  await page.screenshot({ path: testInfo.outputPath("kitchen-ticket-amended.png"), fullPage: true });

  await amended.getByRole("button", { name: /^acknowledge change$/i }).click();
  await page.getByRole("tab", { name: /^preparing/i }).click();
  await expect(tableTicket(page, "T4")).toContainText(/preparing/i, { timeout: 30_000 });

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
