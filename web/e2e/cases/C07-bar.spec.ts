/**
 * C07 [delta] — C07-bar. Smoke stays honest.
 * C07-OP tab collect-at-close and C07-CUS guest check are real journeys on qa-journeys.
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
  expectCounterPaid,
} from "./_harness";
import {
  TABLE_1_SPACE_ID,
  latestOpenTable1Visit,
  latestTabCollectAtClose,
  releaseTable1Floor,
} from "./_isolated-db";

skipUnlessFixture();

test.beforeEach(async ({ page }) => {
  await prepareJourneysPage(page);
});

test("C07-CUS smoke: storefront body is reachable — not a journey pass", async ({ page }) => {
  await openStorefront(page);
});

test("C07-OP smoke: operator Sales heading is reachable — not a journey pass", async ({ page }) => {
  await openWorkspace(page, "sales");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("C07-CUS tab: guest reads open check then ended after close", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  const marker = `c07-cus-${Date.now()}@impronta.test`;
  await releaseTable1Floor();

  await signInJourneysStaff(page, "/admin/tables");
  await assertWorkspaceIdentity(page);
  const row = page.locator("li").filter({ has: page.locator("strong", { hasText: "T1" }) });
  await expect(row.getByText(/free/i)).toBeVisible();
  await row.getByRole("button", { name: /^open tab$/i }).click();
  await expect(row.getByText(/tab\s*·\s*occupied/i)).toBeVisible({ timeout: 20_000 });
  await row.getByRole("button", { name: /^open check$/i }).click();
  await expect(page).toHaveURL(/order=/, { timeout: 20_000 });
  await counterAddItem(page, "House pizza");

  const opened = await latestOpenTable1Visit();
  expect(opened?.publicToken).toBeTruthy();
  expect(opened?.serviceKind).toBe("tab");

  const guest = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://qa-journeys.local:3103",
  });
  const guestPage = await guest.newPage();
  await prepareJourneysPage(guestPage);
  const visitPath = `/visit/${opened!.publicToken}`;
  await guestPage.goto(visitPath);
  await expect(guestPage.getByRole("heading", { level: 1 })).toHaveText(/your table/i);
  await expect(guestPage.getByText(/house pizza/i)).toBeVisible();
  await expect(guestPage.getByText(/total:\s*1800\s*usd/i)).toBeVisible();
  await guestPage.reload();
  await expect(guestPage.getByText(/house pizza/i)).toBeVisible();

  await counterNameBuyer(page, marker);
  await counterCollectCash(page);
  await expectCounterPaid(page);
  await page.goto("/admin/tables");
  await assertWorkspaceIdentity(page);
  await row.getByRole("button", { name: /^close visit$/i }).click();
  await expect(row.getByText(/free/i)).toBeVisible({ timeout: 20_000 });

  await guestPage.reload();
  await expect(guestPage.getByRole("heading", { level: 1 })).toHaveText(/this visit has ended/i);

  const persisted = await latestTabCollectAtClose(marker);
  expect(persisted, "paid tab pizza the guest saw must exist on qa-journeys").not.toBeNull();
  expect(persisted?.status).toBe("paid");
  expect(persisted?.totalCents).toBe(1800);
  expect(persisted?.sourcePage).toBe(`tab:${TABLE_1_SPACE_ID}`);
  expect(persisted?.visitStatus).toBe("closed");
  expect(persisted?.serviceKind).toBe("tab");

  await guestPage.screenshot({
    path: testInfo.outputPath("c07-cus-ended.png"),
    fullPage: true,
  });
  await guest.close();
});

test("C07-OP tab: Open tab → pizza cash at close and DB agree", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const marker = `c07-op-${Date.now()}@impronta.test`;
  await releaseTable1Floor();

  await signInJourneysStaff(page, "/admin/tables");
  await assertWorkspaceIdentity(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/tables/i);

  const row = page.locator("li").filter({ has: page.locator("strong", { hasText: "T1" }) });
  await expect(row).toBeVisible();
  await expect(row.getByText(/free/i)).toBeVisible();

  await row.getByRole("button", { name: /^open visit$/i }).click();
  await expect(row.getByText(/table\s*·\s*occupied/i)).toBeVisible({ timeout: 20_000 });
  await row.getByRole("button", { name: /^close visit$/i }).click();
  await expect(row.getByText(/free/i)).toBeVisible({ timeout: 20_000 });

  await row.getByRole("button", { name: /^open tab$/i }).click();
  await expect(row.getByText(/tab\s*·\s*occupied/i)).toBeVisible({ timeout: 20_000 });
  await expect(row.getByText(/table\s*·\s*occupied/i)).toHaveCount(0);

  await row.getByRole("button", { name: /^open check$/i }).click();
  await expect(page).toHaveURL(/order=/, { timeout: 20_000 });
  // Re-expressed for the wired counter (P3): the tab's check opens the same
  // counter, and the item is added from the sell surface by its own name.
  await counterAddItem(page, "House pizza");

  await page.goto("/admin/tables");
  await assertWorkspaceIdentity(page);
  await expect(row.getByText(/tab\s*·\s*occupied/i)).toBeVisible();
  await row.getByRole("button", { name: /^close visit$/i }).click();
  await expect(page.getByText(/collect or cancel the check before resetting the table/i)).toBeVisible({
    timeout: 20_000,
  });
  await expect(row.getByText(/tab\s*·\s*occupied/i)).toBeVisible();

  await row.getByRole("button", { name: /^open check$/i }).click();
  await expect(page).toHaveURL(/order=/, { timeout: 20_000 });
  await expect(page.getByText(/house pizza/i).first()).toBeVisible();
  await counterNameBuyer(page, marker);
  await counterCollectCash(page);
  await expectCounterPaid(page);

  await page.goto("/admin/tables");
  await assertWorkspaceIdentity(page);
  await expect(row.getByText(/tab\s*·\s*occupied/i)).toBeVisible();
  await row.getByRole("button", { name: /^close visit$/i }).click();
  await expect(row.getByText(/free/i)).toBeVisible({ timeout: 20_000 });

  const persisted = await latestTabCollectAtClose(marker);
  expect(persisted, "paid tab pizza at close must exist on qa-journeys").not.toBeNull();
  expect(persisted?.status).toBe("paid");
  expect(persisted?.totalCents).toBe(1800);
  expect(persisted?.sourceChannel).toBe("pos");
  expect(persisted?.customerEmail).toBe(marker);
  expect(persisted?.lineLabel?.toLowerCase()).toContain("house pizza");
  expect(persisted?.sourcePage).toBe(`tab:${TABLE_1_SPACE_ID}`);
  expect(persisted?.visitId).toBeTruthy();
  expect(persisted?.visitStatus).toBe("closed");
  expect(persisted?.serviceKind).toBe("tab");
  expect(persisted?.spaceId).toBe(TABLE_1_SPACE_ID);
  expect(persisted?.closedAt).toBeTruthy();

  await page.goto("/admin/sales");
  await assertWorkspaceIdentity(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/sales/i);
  await expect(page.getByText("pos").first()).toBeVisible();
  await expect(page.getByText("$18.00").first()).toBeVisible();

  await page.screenshot({
    path: testInfo.outputPath("c07-op-sales.png"),
    fullPage: true,
  });
});
