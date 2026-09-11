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
 * Every refusal is asserted as the sentence, and asserted NOT to be the code.
 */
import { test, expect, prepareJourneysPage, signInJourneysStaff, skipUnlessFixture, assertWorkspaceIdentity, counterAddItem, counterCollectCash, expectCounterPaid } from "./_harness";
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
function sheet(page: Page, code: string) {
  return page.locator(`aside[data-floor-sheet="${code}"]`);
}
/**
 * Open a table's sheet. A tap on the card that is already open CLOSES it (the
 * card is a toggle, so a host can put the sheet away), so a sheet that is
 * already showing, as it is right after an action on that same table, is
 * left alone.
 */
async function tapTable(page: Page, code: string) {
  if (await sheet(page, code).isVisible()) return;
  await card(page, code).getByRole("button").first().click();
  await expect(sheet(page, code)).toBeVisible({ timeout: 20_000 });
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
  await assertWorkspaceIdentity(page);
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
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^(tables|mesas)$/i);
  const rail = page.getByRole("navigation", { name: /^(tables|mesas)$/i });
  await expect(rail.getByRole("button", { name: /^floor$|^salón$/i })).toBeVisible();
  await expect(rail.getByRole("button", { name: /seated parties|grupos sentados/i })).toBeVisible();
  await expect(page.getByText(/the venue's clock/i)).toBeVisible();
  await expect(card(page, "T4")).toHaveAttribute("data-floor-state", "free");
  await shot("01-floor");

  // ── Seat a walk-in of two on T4 ────────────────────────────────────────
  await tapTable(page, "T4");
  await expect(sheet(page, "T4").locator("[data-floor-party]")).toHaveText("2");
  await shot("02-sheet-free-t4");
  await sheet(page, "T4").getByRole("button", { name: /^seat 2 at T4$/i }).click();
  await expect(card(page, "T4")).toHaveAttribute("data-floor-state", "occupied", { timeout: 30_000 });
  await expect(card(page, "T4")).toContainText(/party of 2/i);
  await expect(card(page, "T4")).toContainText(/nothing sent to the kitchen yet/i);
  await shot("03-t4-seated");

  const seated = await openVisitOn(FLOOR_T4);
  expect(seated, "seating writes an open visit on T4").not.toBeNull();
  expect(seated!.partySize).toBe(2);
  expect(seated!.serviceKind).toBe("table");
  const order = await orderForVisit(seated!.id);
  expect(order, "an open visit carries its check").not.toBeNull();

  // ── The seated list is the same rows, a second way in ───────────────────
  await rail.getByRole("button", { name: /seated parties|grupos sentados/i }).click();
  await expect(card(page, "T4")).toBeVisible();
  await shot("04-seated-list");
  await rail.getByRole("button", { name: /^floor$|^salón$/i }).click();

  // ── The kitchen refuses an empty check, in words ───────────────────────
  await tapTable(page, "T4");
  await sheet(page, "T4").getByRole("button", { name: /send to kitchen/i }).click();
  await expectRefusal(page, "Put something on the check before sending it to the kitchen. Open the check to add items.");
  await shot("05-refusal-kitchen-empty");
  expect(await ticketsForOrder(order!.id), "a refused send writes no ticket").toHaveLength(0);

  // ── Open check: the counter, on the SAME order ─────────────────────────
  await sheet(page, "T4").getByRole("button", { name: /open check/i }).click();
  await expect(page).toHaveURL(new RegExp(`mode=counter&order=${order!.id}`), { timeout: 30_000 });
  await counterAddItem(page, "House pizza");
  await expect(page.locator("[data-pos-charge]").first()).toHaveText(/\$18\.00/, { timeout: 30_000 });
  await shot("06-counter-check-t4");

  // ── Back on the floor: send to the kitchen ─────────────────────────────
  await page.goto("/admin/pos?mode=floor");
  await expect(card(page, "T4")).toContainText(/check \$18\.00/i, { timeout: 30_000 });
  await tapTable(page, "T4");
  await sheet(page, "T4").getByRole("button", { name: /send to kitchen/i }).click();
  const notice = page.locator("[data-floor-notice]");
  await expect(notice).toHaveText("Sent to the kitchen as ticket revision 1.", { timeout: 30_000 });
  await expect(card(page, "T4")).toContainText(/kitchen: sent, not yet acknowledged \(revision 1\)/i, { timeout: 30_000 });
  await shot("07-sent-to-kitchen");
  const tickets = await ticketsForOrder(order!.id);
  expect(tickets, "one ticket for the check").toHaveLength(1);
  expect(tickets[0]!.status).toBe("queued");
  expect(tickets[0]!.revision).toBe(1);
  expect(tickets[0]!.destination).toBe("table");
  expect(tickets[0]!.visitId).toBe(seated!.id);

  // ── Move the party to T5 ───────────────────────────────────────────────
  await sheet(page, "T4").getByRole("button", { name: /move this party to/i }).click();
  await sheet(page, "T4").locator('[data-floor-move-to="T5"]').click();
  await expect(card(page, "T5")).toHaveAttribute("data-floor-state", "occupied", { timeout: 30_000 });
  await expect(card(page, "T5")).toContainText(/party of 2/i);
  await expect(card(page, "T4")).toHaveAttribute("data-floor-state", "free");
  await expect(card(page, "T4")).toContainText(/needs reset/i);
  await expect(sheet(page, "T5")).toBeVisible();
  await shot("08-moved-to-t5");
  const moved = await visitById(seated!.id);
  expect(moved!.spaceId, "the SAME visit now sits on T5").toBe(FLOOR_T5);
  expect(moved!.status).toBe("open");
  expect(await needsResetAt(FLOOR_T4), "T4 needs a reset after the move").not.toBeNull();
  expect((await orderForVisit(seated!.id))!.id, "the check followed the party").toBe(order!.id);

  // ── The engine refuses to end a visit with an unpaid check ─────────────
  await sheet(page, "T5").getByRole("button", { name: /end visit/i }).click();
  await expectRefusal(page, "Collect or cancel the check before resetting the table.");
  await shot("09-refusal-outstanding");
  expect((await visitById(seated!.id))!.status, "a refused end changes nothing").toBe("open");

  // ── Collect at the counter, end the visit, mark ready ──────────────────
  await sheet(page, "T5").getByRole("button", { name: /open check/i }).click();
  await expect(page).toHaveURL(new RegExp(`order=${order!.id}`), { timeout: 30_000 });
  await counterCollectCash(page);
  await expectCounterPaid(page);
  await shot("10-check-paid");
  expect((await orderForVisit(seated!.id))!.status).toBe("paid");

  await page.goto("/admin/pos?mode=floor");
  await tapTable(page, "T5");
  await sheet(page, "T5").getByRole("button", { name: /end visit/i }).click();
  await expect(card(page, "T5")).toHaveAttribute("data-floor-state", "free", { timeout: 30_000 });
  await expect(card(page, "T5")).toContainText(/needs reset/i);
  await expect(card(page, "T5")).toContainText(/vacated \d\d:\d\d/i);
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
  await expect(card(page, "T5")).toContainText(`vacated ${venueHour}`);

  await tapTable(page, "T5");
  await sheet(page, "T5").getByRole("button", { name: /mark ready/i }).click();
  await expect(card(page, "T5")).not.toContainText(/needs reset/i, { timeout: 30_000 });
  await shot("12-t5-ready");
  expect(await needsResetAt(FLOOR_T5), "mark ready clears the column").toBeNull();
  // T4 was left needing a reset by the move; mark it ready too.
  await tapTable(page, "T4");
  await sheet(page, "T4").getByRole("button", { name: /mark ready/i }).click();
  await expect(card(page, "T4")).not.toContainText(/needs reset/i, { timeout: 30_000 });

  // ── Four at a two-top: refused in words, and the join it offers ────────
  await tapTable(page, "T2");
  const more = sheet(page, "T2").getByRole("button", { name: /one more guest/i });
  await more.click();
  await more.click();
  await more.click();
  await expect(sheet(page, "T2").locator("[data-floor-party]")).toHaveText("4");
  // Four does not fit T2 alone, so the sheet already offers the join; the
  // refusal itself is still reached by asking for the seating the engine
  // will refuse.
  await sheet(page, "T2").getByRole("button", { name: /^seat 4 at T2$/i }).click();
  await expectRefusal(page, "This party is larger than the table allows.");
  const joinButton = sheet(page, "T2").getByRole("button", { name: /^seat 4 across T2 \+ T3$/i });
  await expect(joinButton).toBeVisible();
  await shot("13-refusal-party-too-large-join-offer");
  await joinButton.click();
  await expect(card(page, "T2")).toHaveAttribute("data-floor-state", "occupied", { timeout: 30_000 });
  await expect(card(page, "T3")).toHaveAttribute("data-floor-state", "occupied");
  await expect(card(page, "T2")).toContainText(/joined with T3/i);
  await expect(card(page, "T3")).toContainText(/joined with T2/i);
  await expect(card(page, "T2")).toContainText(/party of 4/i);
  await expect(page.locator("[data-floor-summary]")).toContainText(/^[0-9] of 6 tables seated/i);
  await shot("14-joined-t2-t3");
  const joined = await openVisitOn(FLOOR_T2);
  expect(joined!.joinedSpaceId).toBe(FLOOR_T3);
  expect(joined!.partySize).toBe(4);
  expect(await openVisitOn(FLOOR_T3), "the joined half carries no visit of its own").toBeNull();

  // An empty check is $0 and closes; both halves come back needing a reset.
  await tapTable(page, "T2");
  await sheet(page, "T2").getByRole("button", { name: /end visit/i }).click();
  await expect(card(page, "T2")).toContainText(/needs reset/i, { timeout: 30_000 });
  await expect(card(page, "T3")).toContainText(/needs reset/i);
  await tapTable(page, "T2");
  await sheet(page, "T2").getByRole("button", { name: /mark ready/i }).click();
  await expect(card(page, "T2")).not.toContainText(/needs reset/i, { timeout: 30_000 });
  await shot("15-joined-ended");
  expect((await visitById(joined!.id))!.status).toBe("closed");
});
