/**
 * POS-FLOOR: the host runs the room from the till.
 *
 * One journey through the Tables mode of the point of sale, on the fixture
 * floor of the QA workspace, with the rows read back after every write:
 *
 *   switch the mode on in Settings (the product's own door), open the mode,
 *   seat a walk-in of two on T4, meet the kitchen's refusal for an empty
 *   check, open the check into the counter and add a pizza, come back and
 *   send it to the kitchen, move the party to T5, meet the engine's refusal
 *   for ending a visit with an unpaid check, collect the check at the
 *   counter, end the visit, mark T5 ready. Then the join: four at a two-top
 *   is refused in words and the join it offers seats them on one visit.
 *
 * THE SCREEN IS THE BOARD'S (`POSLiveFloor`, `POSTableActions`,
 * `POSSeatParty`, `POSMoveParty`, `POSDeparted`, `POSTableReset`): a tap on
 * a tile opens its card, the card's moves open the sheets and dialogs, and a
 * joined pair is ONE tile named `T2+T3`. The facts asserted are the same as
 * before the re-skin (rows read back after every write); only the words and
 * the doors are the board's.
 *
 * Every refusal is asserted as the sentence, and asserted NOT to be the code.
 */
import { test, expect, prepareJourneysPage, signInJourneysStaff, skipUnlessFixture, assertNotAuthWall, assertWorkspaceIdentity, counterAddItem, counterCollectCash, expectCounterPaid } from "./_harness";
import {
  FLOOR_T2,
  FLOOR_T3,
  FLOOR_T4,
  FLOOR_T5,
  needsResetAt,
  openVisitOn,
  orderForVisit,
  releaseFloorProof,
  ticketsForOrder,
  visitById,
} from "./_floor-db";

skipUnlessFixture();

// The browser is deliberately NOT on the venue's clock (America/Mexico_City).
test.use({ timezoneId: "Asia/Tokyo" });

test.beforeEach(async ({ page }) => {
  await prepareJourneysPage(page);
  await releaseFloorProof();
});

test.afterEach(async () => {
  await releaseFloorProof();
});

type Page = import("@playwright/test").Page;

function card(page: Page, code: string) {
  return page.locator(`li[data-floor-table="${code}"]`);
}
/** The table's card (T04), opened by a tap on its tile. */
function sheet(page: Page, code: string) {
  return page.locator(`[data-floor-sheet="${code}"]`);
}
/**
 * Open a table's card. A tap on the tile that is already open CLOSES it (the
 * tile is a toggle, so a host can put the card away), so a card that is
 * already showing, as it is right after an action on that same table, is
 * left alone. A click that lands before hydration is a click on nothing, so
 * the tap is repeated until the card is there.
 */
async function tapTable(page: Page, code: string) {
  if (await sheet(page, code).isVisible()) return;
  for (let attempt = 0; attempt < 5 && !(await sheet(page, code).isVisible()); attempt += 1) {
    await card(page, code).getByRole("button").first().click();
    await page.waitForTimeout(1_000);
  }
  await expect(sheet(page, code)).toBeVisible({ timeout: 20_000 });
}
/** The header's second line: `Dinner 12:00–22:00 · 1 of 6 tables seated · …`. */
function summary(page: Page) {
  return page.locator("[data-pos-header] p").first();
}
/** T23: the card's "Party left" opens the dialog whose one action ends the visit. */
async function endVisit(page: Page, code: string) {
  await tapTable(page, code);
  await sheet(page, code).locator('[data-floor-action="party-left"]').click();
  await page.locator('[data-pos-dialog="party-left"] [data-floor-end-visit]').click();
}
/** T24: the card's "Mark ready" opens the reset dialog; `X is ready` clears the column. */
async function markReady(page: Page, code: string) {
  await tapTable(page, code);
  await sheet(page, code).locator('[data-floor-action="mark-ready"]').click();
  await page.locator('[data-pos-dialog="table-reset"] [data-floor-mark-ready]').click();
}
async function expectRefusal(page: Page, sentence: string) {
  const banner = page.locator("[data-floor-refusal]");
  await expect(banner).toBeVisible({ timeout: 30_000 });
  await expect(banner).toHaveText(sentence);
  await expect(banner).not.toContainText(/_/);
}

test("POS-FLOOR: seat, send to the kitchen, move, end, mark ready; and the join a refusal offers", async ({
  page,
}, testInfo) => {
  test.setTimeout(420_000);
  const shot = (name: string) => page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });

  // ── The door: Settings › Selling modes › Tables ─────────────────────────
  await signInJourneysStaff(page, "/admin/settings");
  await assertNotAuthWall(page);
  // Settings after the fidelity pass is a section list, not an h1 workspace
  // page. The identity check that requires a level-1 heading is for the POS
  // chrome later in this journey.
  // The settings nav is client state; a click that lands before hydration
  // is a click on nothing, so it is repeated until the section is the one shown.
  const posSection = page.locator('[data-settings-section="pos"]');
  for (let attempt = 0; attempt < 5 && !(await posSection.isVisible()); attempt += 1) {
    await page.getByRole("button", { name: /^point of sale/i }).click();
    await page.waitForTimeout(1_000);
  }
  await expect(posSection).toBeVisible({ timeout: 30_000 });
  const modesCard = page.getByTestId("pos-modes-card");
  await expect(modesCard).toBeVisible({ timeout: 30_000 });
  // Both the mode under test AND the counter: "Open check" lands on the
  // counter's basket, and the fixture workspace's settings are shared with
  // every other proof running on this database, so neither is assumed.
  for (const name of [/^(tables|mesas)/i, /^(counter|mostrador)/i]) {
    const modeSwitch = modesCard.getByRole("switch", { name });
    await expect(modeSwitch).toBeEnabled({ timeout: 30_000 });
    if ((await modeSwitch.getAttribute("aria-checked")) !== "true") {
      await modeSwitch.click();
      await expect(modeSwitch).toHaveAttribute("aria-checked", "true", { timeout: 30_000 });
    }
  }
  await shot("00-settings-floor-on");

  // ── The mode, from its own address, with its own rail ──────────────────
  await page.goto("/admin/pos?mode=floor");
  await expect(page).toHaveURL(/mode=floor/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^(floor|salón)$/i);
  const rail = page.getByRole("navigation", { name: /^(tables|mesas)$/i });
  await expect(rail.getByRole("button", { name: /^floor$|^salón$/i })).toBeVisible();
  // The board's rail: Floor · Orders · Prep · Receipts · Issues (a row's
  // count badge is part of its accessible name: "Orders1").
  await expect(rail.getByRole("button", { name: /^(orders|pedidos)/i })).toBeVisible();
  await expect(rail.getByRole("button", { name: /^(prep|cocina)/i })).toBeVisible();
  // The panel's three tabs, and the legend's six states.
  await expect(page.getByRole("tab", { name: /^(arriving|por llegar)/i })).toBeVisible();
  await expect(page.getByRole("tab", { name: /^(seated|sentados)/i })).toBeVisible();
  await expect(page.getByText(/^needs reset$|^por preparar$/i).first()).toBeVisible();
  await expect(summary(page)).toContainText(/of 6 tables seated/i);
  await expect(card(page, "T4")).toHaveAttribute("data-floor-state", "free");
  await expect(card(page, "T4")).toContainText(/free · 4/i);
  await shot("01-floor");

  // ── Seat a walk-in of two on T4: the card (T04), then the seat sheet (T05) ─
  await tapTable(page, "T4");
  await expect(sheet(page, "T4")).toContainText(/free · seats 2–4/i);
  await sheet(page, "T4").locator("[data-floor-seat]").click();
  const seatSheet = page.locator('[data-pos-sheet="seat-party"]');
  await expect(seatSheet).toBeVisible();
  await expect(seatSheet.locator("[data-floor-party]")).toContainText("2");
  await shot("02-sheet-free-t4");
  await seatSheet.getByRole("button", { name: /^seat 2 guests at T4$/i }).click();
  await expect(card(page, "T4")).toHaveAttribute("data-floor-state", "occupied", { timeout: 30_000 });
  // The tile says the party and how long: `2 · 0 min`.
  await expect(card(page, "T4")).toContainText(/2 · \d+ min/);
  await tapTable(page, "T4");
  await expect(sheet(page, "T4")).toContainText(/party of 2/i);
  await expect(sheet(page, "T4").locator("[data-floor-kitchen]")).toHaveText(/nothing sent to the kitchen yet/i);
  await shot("03-t4-seated");

  const seated = await openVisitOn(FLOOR_T4);
  expect(seated, "seating writes an open visit on T4").not.toBeNull();
  expect(seated!.partySize).toBe(2);
  expect(seated!.serviceKind).toBe("table");
  const order = await orderForVisit(seated!.id);
  expect(order, "an open visit carries its check").not.toBeNull();

  // ── The seated list is the same rows, a second way in ───────────────────
  await page.getByRole("tab", { name: /^(seated|sentados)/i }).click();
  await expect(page.locator('[data-floor-seated="T4"]')).toBeVisible();
  await expect(page.locator('[data-floor-seated="T4"]')).toContainText(/walk-in · 2/i);
  await shot("04-seated-list");
  await page.getByRole("tab", { name: /^(arriving|por llegar)/i }).click();

  // ── The kitchen refuses an empty check, in words ───────────────────────
  await tapTable(page, "T4");
  await sheet(page, "T4").locator('[data-floor-action="send-kitchen"]').click();
  await expectRefusal(page, "Put something on the check before sending it to the kitchen. Open the check to add items.");
  await shot("05-refusal-kitchen-empty");
  expect(await ticketsForOrder(order!.id), "a refused send writes no ticket").toHaveLength(0);

  // ── Open order: the counter, on the SAME order ─────────────────────────
  await sheet(page, "T4").locator("[data-floor-open-order]").click();
  await expect(page).toHaveURL(new RegExp(`mode=counter&order=${order!.id}`), { timeout: 30_000 });
  await counterAddItem(page, "House pizza");
  await expect(page.locator("[data-pos-charge]").first()).toHaveText(/\$18\.00/, { timeout: 30_000 });
  await shot("06-counter-check-t4");

  // ── Back on the floor: send to the kitchen ─────────────────────────────
  await page.goto("/admin/pos?mode=floor");
  await expect(card(page, "T4")).toHaveAttribute("data-floor-state", "occupied", { timeout: 30_000 });
  await tapTable(page, "T4");
  await expect(sheet(page, "T4")).toContainText(/\$18\.00 unpaid/i);
  await expect(sheet(page, "T4").getByRole("link", { name: /collect \$18\.00/i })).toBeVisible();
  await sheet(page, "T4").locator('[data-floor-action="send-kitchen"]').click();
  const notice = page.locator("[data-floor-notice]");
  await expect(notice).toHaveText("Sent to the kitchen as ticket revision 1.", { timeout: 30_000 });
  await expect(sheet(page, "T4").locator("[data-floor-kitchen]")).toHaveText(/kitchen: sent, not yet acknowledged \(revision 1\)/i, { timeout: 30_000 });
  await shot("07-sent-to-kitchen");
  const tickets = await ticketsForOrder(order!.id);
  expect(tickets, "one ticket for the check").toHaveLength(1);
  expect(tickets[0]!.status).toBe("queued");
  expect(tickets[0]!.revision).toBe(1);
  expect(tickets[0]!.destination).toBe("table");
  expect(tickets[0]!.visitId).toBe(seated!.id);

  // ── Move the party to T5: the chooser (T12), then the move sheet (T13) ──
  await sheet(page, "T4").locator('[data-floor-action="move-or-join"]').click();
  const chooser = page.locator('[data-pos-sheet="table-change"]');
  await expect(chooser).toBeVisible();
  // Joining a seated party and merging checks have no writer: drawn disabled over a sentence.
  await expect(chooser.locator('[data-floor-change="join"] button')).toBeDisabled();
  await expect(chooser.locator('[data-floor-change="merge"] button')).toBeDisabled();
  await chooser.locator('[data-floor-change="move"] button').click();
  const mover = page.locator('[data-pos-sheet="move-party"]');
  await expect(mover).toBeVisible();
  await expect(mover).toContainText(/\$18\.00 check · 1 kitchen ticket/i);
  await mover.locator('[data-floor-move-to="T5"]').click();
  await mover.locator("[data-floor-move-confirm]").click();
  await expect(card(page, "T5")).toHaveAttribute("data-floor-state", "occupied", { timeout: 30_000 });
  await expect(card(page, "T5")).toContainText(/2 · \d+ min/);
  await expect(card(page, "T4")).toHaveAttribute("data-floor-state", "free");
  await expect(card(page, "T4")).toContainText(/needs reset/i);
  await expect(sheet(page, "T5")).toBeVisible();
  await expect(sheet(page, "T5")).toContainText(/party of 2/i);
  await shot("08-moved-to-t5");
  const moved = await visitById(seated!.id);
  expect(moved!.spaceId, "the SAME visit now sits on T5").toBe(FLOOR_T5);
  expect(moved!.status).toBe("open");
  expect(await needsResetAt(FLOOR_T4), "T4 needs a reset after the move").not.toBeNull();
  expect((await orderForVisit(seated!.id))!.id, "the check followed the party").toBe(order!.id);

  // ── The engine refuses to end a visit with an unpaid check (T23) ───────
  await endVisit(page, "T5");
  await expectRefusal(page, "Collect or cancel the check before resetting the table.");
  // The dialog's other ways out have no writer: each is disabled over its sentence.
  const departed = page.locator('[data-pos-dialog="party-left"]');
  await expect(departed.getByRole("radio")).toHaveCount(3);
  for (const radio of await departed.getByRole("radio").all()) await expect(radio).toBeDisabled();
  await shot("09-refusal-outstanding");
  expect((await visitById(seated!.id))!.status, "a refused end changes nothing").toBe("open");
  await departed.getByRole("button", { name: /^back$/i }).click();

  // ── Collect at the counter, end the visit, mark ready ──────────────────
  await tapTable(page, "T5");
  await sheet(page, "T5").locator("[data-floor-open-order]").click();
  await expect(page).toHaveURL(new RegExp(`order=${order!.id}`), { timeout: 30_000 });
  await counterCollectCash(page);
  await expectCounterPaid(page);
  await shot("10-check-paid");
  expect((await orderForVisit(seated!.id))!.status).toBe("paid");

  await page.goto("/admin/pos?mode=floor");
  await endVisit(page, "T5");
  await expect(card(page, "T5")).toHaveAttribute("data-floor-state", "free", { timeout: 30_000 });
  await expect(card(page, "T5")).toContainText(/needs reset/i);
  await tapTable(page, "T5");
  await expect(sheet(page, "T5")).toContainText(/vacated \d\d:\d\d/i);
  await shot("11-t5-ended-needs-reset");
  const ended = await visitById(seated!.id);
  expect(ended!.status).toBe("closed");
  expect(ended!.closedAt).not.toBeNull();
  const vacatedAt = await needsResetAt(FLOOR_T5);
  expect(vacatedAt).not.toBeNull();
  // The vacated time on the card is the VENUE's hour, not Tokyo's, not UTC's.
  const venueHour = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Mexico_City",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(vacatedAt!));
  await expect(sheet(page, "T5")).toContainText(`vacated ${venueHour}`);

  // T24: the reset dialog says when the party left, in the venue's hour, and `T5 is ready` clears it.
  await sheet(page, "T5").locator('[data-floor-action="mark-ready"]').click();
  const reset = page.locator('[data-pos-dialog="table-reset"]');
  await expect(reset).toContainText(`Party left ${venueHour}`);
  await reset.locator("[data-floor-mark-ready]").click();
  await expect(card(page, "T5")).not.toContainText(/needs reset/i, { timeout: 30_000 });
  await shot("12-t5-ready");
  expect(await needsResetAt(FLOOR_T5), "mark ready clears the column").toBeNull();
  // T4 was left needing a reset by the move; mark it ready too.
  await markReady(page, "T4");
  await expect(card(page, "T4")).not.toContainText(/needs reset/i, { timeout: 30_000 });

  // ── Four at a two-top: refused in words, and the join it offers ────────
  await tapTable(page, "T2");
  await sheet(page, "T2").locator("[data-floor-seat]").click();
  await expect(seatSheet).toBeVisible();
  const more = seatSheet.getByRole("button", { name: /one more guest/i });
  await more.click();
  await more.click();
  await more.click();
  await expect(seatSheet.locator("[data-floor-party]")).toContainText("4");
  // Four does not fit T2 alone: the sheet SAYS so on the option and already
  // offers the join the rules allow; the refusal itself is still reached by
  // asking for the seating the engine will refuse (the host may override,
  // the engine decides).
  await expect(seatSheet.getByRole("radio", { name: /^T2 · seats 1–2/ })).toContainText(/does not fit this party/i);
  await seatSheet.getByRole("button", { name: /^seat 4 guests at T2$/i }).click();
  await expectRefusal(page, "This party is larger than the table allows.");
  const joinOption = seatSheet.getByRole("radio", { name: /^T2 \+ T3 · joined · seats/i });
  await expect(joinOption).toBeVisible();
  await shot("13-refusal-party-too-large-join-offer");
  await joinOption.click();
  await seatSheet.getByRole("button", { name: /^seat 4 guests at T2 \+ T3$/i }).click();
  // A joined pair is ONE tile, named as the board names it, and one seating in the headline.
  await expect(card(page, "T2")).toHaveAttribute("data-floor-state", "occupied", { timeout: 30_000 });
  await expect(card(page, "T2")).toContainText(/T2\+T3/);
  await expect(card(page, "T2")).toContainText(/4 · \d+ min/);
  await expect(card(page, "T3")).toHaveCount(0);
  await tapTable(page, "T2");
  await expect(sheet(page, "T2")).toContainText(/joined with T3/i);
  await expect(sheet(page, "T2")).toContainText(/party of 4/i);
  // A joined party cannot be moved or joined again: the card says why, in words.
  await expect(sheet(page, "T2").locator('[data-floor-action="move-or-join"]')).toBeDisabled();
  await expect(sheet(page, "T2").locator('[data-floor-action="move-or-join"]')).toContainText(/un-join the tables/i);
  await expect(summary(page)).toContainText(/[0-9] of 6 tables seated/i);
  await shot("14-joined-t2-t3");
  const joined = await openVisitOn(FLOOR_T2);
  expect(joined!.joinedSpaceId).toBe(FLOOR_T3);
  expect(joined!.partySize).toBe(4);
  expect(await openVisitOn(FLOOR_T3), "the joined half carries no visit of its own").toBeNull();

  // An empty check is $0 and closes; both halves come back needing a reset.
  await endVisit(page, "T2");
  await expect(card(page, "T2")).toContainText(/needs reset/i, { timeout: 30_000 });
  await expect(card(page, "T3")).toContainText(/needs reset/i);
  expect(await needsResetAt(FLOOR_T3), "the joined half needs a reset too").not.toBeNull();
  await markReady(page, "T2");
  await expect(card(page, "T2")).not.toContainText(/needs reset/i, { timeout: 30_000 });
  await shot("15-joined-ended");
  expect((await visitById(joined!.id))!.status).toBe("closed");
});
