/**
 * C01 [R] — Nail salon. Smoke stays honest. C01-CUS technician deposit
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
import { latestGelManicureDeposit } from "./_isolated-db";

skipUnlessFixture();

test.beforeEach(async ({ page }) => {
  await prepareJourneysPage(page);
});

test("C01-CUS smoke: storefront body is reachable — not a journey pass", async ({ page }) => {
  await openStorefront(page);
});

test("C01-OP smoke: operator Sales heading is reachable — not a journey pass", async ({ page }) => {
  await openWorkspace(page, "sales");
});

test("C01-CUS deposit: /book Gel manicure → slot → deposit checkout and DB agree", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const marker = `c01-cus-${Date.now()}@impronta.test`;

  await page.goto("/book");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(/host not registered/i)).toHaveCount(0);
  await expect(page.getByText("Gel manicure").first()).toBeVisible();
  await expect(page.getByText(/no open times/i)).toHaveCount(0);

  const slot = page.locator("[data-testid=slot-picker] button").first();
  await expect(slot).toBeVisible({ timeout: 30_000 });
  await slot.click();

  const contact = page.locator("[data-guest-instant-contact]");
  await contact.locator("input[type=text]").fill("C01 guest");
  await contact.locator("input[type=email]").fill(marker);
  await page.getByRole("button", { name: /confirm this time/i }).click();

  await expect(page).toHaveURL(/checkout\/(success|cancel)|checkout\.stripe\.com/i, {
    timeout: 45_000,
  });

  await signInJourneysStaff(page, "/admin/sales");
  await assertWorkspaceIdentity(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/sales/i);
  await expect(page.getByText("We could not load your orders")).toHaveCount(0);
  await expect(page.getByText(/gel manicure/i).first()).toBeVisible();

  const persisted = await latestGelManicureDeposit(marker);
  expect(persisted, "gel manicure deposit order must exist on qa-journeys").not.toBeNull();
  expect(persisted?.sourceChannel).toBe("instant_book");
  expect(persisted?.totalCents).toBe(5000);
  expect(persisted?.collectCents).toBe(2500);
  expect(persisted?.checkoutType).toBe("deposit");
  expect(persisted?.customerEmail).toBe(marker);
  expect(persisted?.lineLabel?.toLowerCase()).toContain("gel manicure");
  expect(persisted?.bookingId).toBeTruthy();
  expect(persisted?.holdId).toBeTruthy();
  // Isolated env has no Stripe secret: mock checkout leaves the charge open.
  // Do not treat pending_payment as a collected deposit.
  expect(["pending_payment", "paid"]).toContain(persisted?.status);

  await page.screenshot({
    path: testInfo.outputPath("c01-cus-sales.png"),
    fullPage: true,
  });
});
