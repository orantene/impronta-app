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
} from "./_harness";
import { latestPaidPosPizza } from "./_isolated-db";

skipUnlessFixture();

test.beforeEach(async ({ page }) => {
  await prepareJourneysPage(page);
});

test("C06-CUS smoke: storefront body is reachable — not a journey pass", async ({ page }) => {
  await openStorefront(page);
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

  await signInJourneysStaff(page, "/admin/pos");
  await assertWorkspaceIdentity(page);
  await expect(page.getByRole("button", { name: /house pizza/i })).toBeVisible();

  await page.getByRole("button", { name: /new sale/i }).click();
  await expect(page).toHaveURL(/order=/);
  await expect(page.getByRole("button", { name: /house pizza/i })).toBeEnabled();

  await page.getByRole("button", { name: /house pizza/i }).click();
  await expect(page.getByText(/house pizza/i).first()).toBeVisible();
  await expect(page.getByText(/outstanding/i)).toBeVisible();

  await page.getByLabel(/^email$/i).fill(marker);
  await page.getByRole("button", { name: /collect cash/i }).click();
  await expect(page.getByText(/payment:\s*paid/i)).toBeVisible({ timeout: 30_000 });

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
