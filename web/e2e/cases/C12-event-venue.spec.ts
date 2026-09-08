/**
 * C12 [R] — event venue. Smoke stays honest. C12-CUS $0 night ticket
 * is a real journey on qa-journeys when the isolated env is set.
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
} from "./_harness";
import {
  latestTicketPickerNight,
  QA_NIGHT_SESSION_ID,
  QA_NIGHT_SLUG,
} from "./_isolated-db";

skipUnlessFixture();

test.beforeEach(async ({ page }) => {
  await prepareJourneysPage(page);
});

test("C12-CUS smoke: storefront body is reachable — not a journey pass", async ({ page }) => {
  await openStorefront(page);
});

test("C12-OP smoke: operator Sales heading is reachable — not a journey pass", async ({ page }) => {
  await openWorkspace(page, "sales");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/sales/i);
});

test("C12-CUS ticket: /events/qa-night General admission → receipt and DB agree", async ({
  page,
}, testInfo) => {
  test.setTimeout(150_000);
  const marker = `c12-cus-${Date.now()}@impronta.test`;

  await page.goto(`/events/${QA_NIGHT_SLUG}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/qa night/i);
  await expect(page.getByText(/host not registered/i)).toHaveCount(0);
  const picker = page.locator("[data-ticket-picker=root]");
  await expect(picker).toBeVisible({ timeout: 30_000 });
  await expect(picker.getByText(/this block is not set up/i)).toHaveCount(0);
  await expect(picker.getByText(/no night is on sale/i)).toHaveCount(0);

  await picker.locator("input[name=night]").first().check();
  await picker.locator("input[name=tier]").first().check();
  await picker.locator("input[type=email]").fill(marker);
  await picker.locator("input[autocomplete=name]").fill("C12 guest");
  await picker.getByRole("button", { name: /get your ticket/i }).click();
  await expect(page).toHaveURL(/\/r\/[A-Za-z0-9]+/, { timeout: 45_000 });

  const persisted = await latestTicketPickerNight(marker);
  expect(persisted, "ticket_picker night order must exist on qa-journeys").not.toBeNull();
  expect(persisted?.status).toBe("paid");
  expect(persisted?.totalCents).toBe(0);
  expect(persisted?.sourceChannel).toBe("ticket_picker");
  expect(persisted?.customerEmail).toBe(marker);
  expect(persisted?.sessionId).toBe(QA_NIGHT_SESSION_ID);
  expect(persisted?.admissionId).toBeTruthy();
  expect(persisted?.allocationId).toBeTruthy();
  expect(persisted?.allocationState).toBe("committed");
  expect(persisted?.receiptCode).toBeTruthy();

  await signInJourneysStaff(page, "/admin/sales");
  await assertWorkspaceIdentity(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/sales/i);
  await expect(page.getByText("We could not load your orders")).toHaveCount(0);
  await expect(page.getByText("ticket_picker").first()).toBeVisible();
  await expect(page.getByText(/overdue/i)).toHaveCount(0);

  await page.screenshot({
    path: testInfo.outputPath("c12-cus-sales.png"),
    fullPage: true,
  });
});
