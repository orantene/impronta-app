/**
 * C09 [representative] — yoga / fitness studio.
 * Smoke stays honest. C09-OP walk-in class is a real journey on qa-journeys.
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
import { latestClassWalkIn, MORNING_CLASS_SESSION_ID } from "./_isolated-db";

skipUnlessFixture();

test.beforeEach(async ({ page }) => {
  await prepareJourneysPage(page);
});

test("C09-CUS smoke: storefront body is reachable — not a journey pass", async ({ page }) => {
  await openStorefront(page);
});

test("C09-OP smoke: operator Sales heading is reachable — not a journey pass", async ({ page }) => {
  await openWorkspace(page, "sales");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("C09-OP walk-in class: New sale → Complimentary class → collect → Sales and DB agree", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const marker = `c09-op-${Date.now()}@impronta.test`;

  await signInJourneysStaff(page, "/admin/pos");
  await assertWorkspaceIdentity(page);
  await expect(page.getByTitle("Complimentary class")).toBeVisible();
  await expect(page.getByRole("combobox").filter({ hasText: "Morning class" })).toBeVisible();

  await page.getByRole("button", { name: "⊕ New sale" }).click();
  await expect(page).toHaveURL(/order=/, { timeout: 20_000 });
  await expect(page.getByTitle("Complimentary class")).toBeEnabled();

  await page.getByTitle("Complimentary class").click();
  await expect(page.locator("aside").getByText(/complimentary class/i)).toBeVisible();

  await page.locator("aside").getByLabel(/^email$/i).fill(marker);
  await page.getByTitle("Collect cash").click();
  await expect(page.getByText(/payment:\s*paid/i)).toBeVisible({ timeout: 30_000 });

  await page.goto("/admin/sales");
  await assertWorkspaceIdentity(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/sales/i);
  await expect(page.getByText("We could not load your orders")).toHaveCount(0);
  await expect(page.getByText("pos").first()).toBeVisible();
  await expect(page.getByText(/overdue/i)).toHaveCount(0);

  const persisted = await latestClassWalkIn(marker);
  expect(persisted, "walk-in class order must exist on qa-journeys").not.toBeNull();
  expect(persisted?.status).toBe("paid");
  expect(persisted?.totalCents).toBe(0);
  expect(persisted?.sourceChannel).toBe("pos");
  expect(persisted?.customerEmail).toBe(marker);
  expect(persisted?.lineLabel?.toLowerCase()).toContain("complimentary class");
  expect(persisted?.sessionId).toBe(MORNING_CLASS_SESSION_ID);

  await page.screenshot({
    path: testInfo.outputPath("c09-op-sales.png"),
    fullPage: true,
  });
});
