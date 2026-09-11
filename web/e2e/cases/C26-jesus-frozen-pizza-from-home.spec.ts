/**
 * C26 [representative] — frozen pizza from home.
 * Smoke stays honest. C26-OP pickup handoff is a real journey on qa-journeys.
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
  counterAddItem,
  counterCollectCash,
  counterNameBuyer,
  counterStartSale,
  expectCounterPaid,
  openCounter,
} from "./_harness";
import { latestPosPizzaPickup } from "./_isolated-db";

skipUnlessFixture();

test.beforeEach(async ({ page }) => {
  await prepareJourneysPage(page);
});

test("C26-CUS smoke: storefront body is reachable — not a journey pass", async ({ page }) => {
  await openStorefront(page);
});

test("C26-OP smoke: operator Sales heading is reachable — not a journey pass", async ({ page }) => {
  await openWorkspace(page, "sales");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

function pickupWindowLocal(): string {
  const when = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}T${pad(when.getHours())}:${pad(when.getMinutes())}`;
}

test("C26-OP pickup: New sale → House pizza → cash → prep handoff and DB agree", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const marker = `c26-op-${Date.now()}@impronta.test`;
  const promised = pickupWindowLocal();

  // Re-expressed for the wired counter (P3): the same journey through the
  // affordances that exist now. The prep half is unchanged in substance —
  // pickup destination, a real pickup window, send to preparation — and its
  // proof moved from the old screen's `preparation: queued` status line to
  // the preparation BOARD below, which is where the ticket actually has to
  // appear for the journey to mean anything.
  await openCounter(page);
  await counterStartSale(page);
  await counterAddItem(page, "House pizza");
  await counterNameBuyer(page, marker);
  await counterCollectCash(page);
  await expectCounterPaid(page);

  // The paid screen keeps the send controls (`Here | To go`, `Ready at`,
  // `Send 1 item`): a pickup is paid at the counter and only then sent.
  await page.getByRole("button", { name: /^(to go|para llevar|à emporter)$/i }).click();
  await page.locator("#pos-pickup-at").fill(promised);
  await page.locator("[data-pos-send]").click();
  await expect(page.locator("[data-pos-send]")).toHaveText(/send again|enviar de nuevo|renvoyer/i, { timeout: 30_000 });

  await signInJourneysStaff(page, "/admin/preparation");
  await assertWorkspaceIdentity(page);
  // The station board (T26): `Kitchen`, tabs Queued · Preparing · Ready.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^kitchen/i);
  await expect(page.getByText(/could not load the board/i)).toHaveCount(0);

  // The board lists tickets oldest first and other journeys leave pickup
  // tickets on it; the one this pass just sent is the NEWEST of its kind.
  const ticket = page.locator("li[data-prep-ticket]").filter({ hasText: /house pizza/i }).filter({ hasText: /pickup/i });
  await page.getByRole("tab", { name: /^queued/i }).click();
  await expect(ticket.last()).toBeVisible({ timeout: 20_000 });
  // A queued pickup starts, then is marked ready, then handed off: one step per tab.
  await ticket.last().getByRole("button", { name: /^start$/i }).click();
  await page.getByRole("tab", { name: /^preparing/i }).click();
  await expect(ticket.last().getByRole("button", { name: /mark ready/i })).toBeVisible({ timeout: 20_000 });
  await ticket.last().getByRole("button", { name: /mark ready/i }).click();
  await page.getByRole("tab", { name: /^ready/i }).click();
  await expect(ticket.last().getByRole("button", { name: /confirm handoff/i })).toBeVisible({
    timeout: 20_000,
  });
  await ticket.last().getByRole("button", { name: /confirm handoff/i }).click();
  await expect(ticket.last().getByRole("button", { name: /confirm handoff/i })).toHaveCount(0, {
    timeout: 20_000,
  });

  const persisted = await latestPosPizzaPickup(marker);
  expect(persisted, "paid POS pizza pickup must exist on qa-journeys").not.toBeNull();
  expect(persisted?.status).toBe("paid");
  expect(persisted?.totalCents).toBe(1800);
  expect(persisted?.sourceChannel).toBe("pos");
  expect(persisted?.customerEmail).toBe(marker);
  expect(persisted?.lineLabel?.toLowerCase()).toContain("house pizza");
  expect(persisted?.ticketId).toBeTruthy();
  expect(persisted?.destination).toBe("pickup");
  expect(persisted?.ticketStatus).toBe("ready");
  expect(persisted?.promisedAt).toBeTruthy();
  expect(persisted?.handedOffAt).toBeTruthy();

  await page.goto("/admin/sales");
  await assertWorkspaceIdentity(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/sales/i);
  await expect(page.getByText("pos").first()).toBeVisible();
  await expect(page.getByText("$18.00").first()).toBeVisible();

  await page.screenshot({
    path: testInfo.outputPath("c26-op-sales.png"),
    fullPage: true,
  });
});
