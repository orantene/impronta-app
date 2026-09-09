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
  QA_NIGHT_DOOR_POOL_ID,
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

test("C12-OP door: admit QA Night guest — Sales and DB agree", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const marker = `c12-op-${Date.now()}@impronta.test`;
  const guestName = `C12 door ${Date.now()}`;

  await page.goto(`/events/${QA_NIGHT_SLUG}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/qa night/i);
  const picker = page.locator("[data-ticket-picker=root]");
  await expect(picker).toBeVisible({ timeout: 30_000 });
  await picker.locator("input[name=night]").first().check();
  await picker.locator("input[name=tier]").first().check();
  await picker.locator("input[type=email]").fill(marker);
  await picker.locator("input[autocomplete=name]").fill(guestName);
  await picker.getByRole("button", { name: /get your ticket/i }).click();
  await expect(page).toHaveURL(/\/r\/[A-Za-z0-9]+/, { timeout: 45_000 });

  const bought = await latestTicketPickerNight(marker);
  expect(bought, "fresh ticket_picker night order must exist").not.toBeNull();
  expect(bought?.status).toBe("paid");
  expect(bought?.admissionId).toBeTruthy();
  expect(bought?.admittedCount).toBe(0);
  expect(bought?.seatedAt).toBeNull();
  expect(bought?.holderName).toBe(guestName);

  await signInJourneysStaff(page, `/admin/events/door?session=${QA_NIGHT_SESSION_ID}`);
  await assertWorkspaceIdentity(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/qa night/i);
  await expect(page.getByText(/could not load the door/i)).toHaveCount(0);
  await expect(page.getByText(/loading the door/i)).toHaveCount(0, { timeout: 20_000 });
  await page.keyboard.press("Escape");

  await page.getByPlaceholder(/find by name/i).fill(guestName);
  const row = page.locator("li").filter({ hasText: guestName });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row.getByText(/not yet/i)).toBeVisible();
  const admit = row.getByRole("button", { name: /^admit$/i });
  await expect(admit).toBeEnabled({ timeout: 20_000 });
  await admit.click();
  const verdict = page.locator("[data-door-verdict]");
  await expect(verdict).toHaveText(/^In$/i, { timeout: 30_000 });

  await page.reload();
  await expect(page.getByText(/could not load the door/i)).toHaveCount(0);
  await page.getByPlaceholder(/find by name/i).fill(guestName);
  const afterReload = page.locator("li").filter({ hasText: guestName });
  await expect(afterReload.getByText(/^In/)).toBeVisible();
  await expect(afterReload.getByRole("button", { name: /^admit$/i })).toHaveCount(0);

  await signInJourneysStaff(page, "/admin/sales");
  await assertWorkspaceIdentity(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/sales/i);
  await expect(page.getByText("We could not load your orders")).toHaveCount(0);
  await expect(page.getByText("ticket_picker").first()).toBeVisible();

  const persisted = await latestTicketPickerNight(marker);
  expect(persisted?.admittedCount).toBe(1);
  expect(persisted?.seatedAt).toBeTruthy();
  expect(persisted?.holderName).toBe(guestName);
  expect(persisted?.allocationState).toBe("committed");

  await page.screenshot({
    path: testInfo.outputPath("c12-op-sales.png"),
    fullPage: true,
  });
});

test("C12-DIFF door: pay-at-door hold blocks competitor then cash settle", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(180_000);
  const marker = `c12-diff-${Date.now()}@impronta.test`;
  const guestName = `C12 hold ${Date.now()}`;

  await page.goto(`/events/${QA_NIGHT_SLUG}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/qa night/i);
  const picker = page.locator("[data-ticket-picker=root]");
  await expect(picker).toBeVisible({ timeout: 30_000 });
  await picker.locator("input[name=night]").first().check();
  await picker.locator("label").filter({ hasText: /paid admission/i }).locator("input[name=tier]").check();
  await picker.locator("input[type=email]").fill(marker);
  await picker.locator("input[autocomplete=name]").fill(guestName);
  await expect(picker.getByRole("radiogroup", { name: /how will you pay/i })).toBeVisible();
  await picker.locator("input[name=payHow]").last().check();
  await picker.getByRole("button", { name: /^at the door$/i }).click();
  await expect(page.locator("[data-ticket-picker=held]")).toBeVisible({ timeout: 45_000 });

  const held = await latestTicketPickerNight(marker);
  expect(held, "door hold order must exist").not.toBeNull();
  expect(held?.status).toBe("pending_payment");
  expect(held?.totalCents).toBe(2000);
  expect(held?.sourceChannel).toBe("ticket_picker");
  expect(held?.admissionId).toBeNull();
  expect(held?.allocationState).toBe("hold");
  expect(held?.poolId).toBe(QA_NIGHT_DOOR_POOL_ID);
  expect(held?.sessionId).toBe(QA_NIGHT_SESSION_ID);
  expect(held?.transactionProvider).toBeNull();

  const pageB = await context.newPage();
  await pageB.goto(`/events/${QA_NIGHT_SLUG}`);
  const pickerB = pageB.locator("[data-ticket-picker=root]");
  await expect(pickerB).toBeVisible({ timeout: 30_000 });
  await pickerB.locator("input[name=night]").first().check();
  await pickerB.locator("label").filter({ hasText: /paid admission/i }).locator("input[name=tier]").check();
  await pickerB.locator("input[type=email]").fill(`c12-diff-b-${Date.now()}@impronta.test`);
  await pickerB.locator("input[autocomplete=name]").fill("C12 competitor");
  await pickerB.locator("input[name=payHow]").last().check();
  await pickerB.getByRole("button", { name: /^at the door$/i }).click();
  await expect(pickerB.locator("[data-ticket-picker=refusal]")).toContainText(/sold out/i, {
    timeout: 30_000,
  });
  await pageB.close();

  await signInJourneysStaff(page, `/admin/events/door?session=${QA_NIGHT_SESSION_ID}`);
  await assertWorkspaceIdentity(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/qa night/i);
  await expect(page.getByText(/could not load the door/i)).toHaveCount(0);
  await expect(page.getByText(/loading held orders/i)).toHaveCount(0, { timeout: 20_000 });
  await page.keyboard.press("Escape");

  const heldRow = page.locator("li").filter({ hasText: /20\.00/ });
  await expect(heldRow).toBeVisible({ timeout: 20_000 });
  await heldRow.getByRole("button", { name: /^cash$/i }).click();
  await expect(page.getByText(/no held pay-at-door orders/i)).toBeVisible({ timeout: 30_000 });

  const settled = await latestTicketPickerNight(marker);
  expect(settled?.status).toBe("paid");
  expect(settled?.allocationState).toBe("committed");
  expect(settled?.admissionId).toBeTruthy();
  expect(settled?.poolId).toBe(QA_NIGHT_DOOR_POOL_ID);
  expect(settled?.transactionProvider).toBe("manual");
  expect(settled?.transactionStatus).toBe("paid");
  expect(settled?.transactionCents).toBe(2000);

  await signInJourneysStaff(page, "/admin/sales");
  await assertWorkspaceIdentity(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/sales/i);
  await expect(page.getByText("ticket_picker").first()).toBeVisible();

  await page.screenshot({
    path: testInfo.outputPath("c12-diff-sales.png"),
    fullPage: true,
  });
});
