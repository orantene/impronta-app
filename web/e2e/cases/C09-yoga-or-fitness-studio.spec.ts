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
import {
  latestClassWalkIn,
  latestSessionPickerClass,
  LAST_PLACE_CLASS_POOL_ID,
  LAST_PLACE_CLASS_SESSION_ID,
  MORNING_CLASS_SESSION_ID,
} from "./_isolated-db";

skipUnlessFixture();

test.beforeEach(async ({ page }) => {
  await prepareJourneysPage(page);
});

test("C09-CUS smoke: storefront body is reachable — not a journey pass", async ({ page }) => {
  await openStorefront(page);
});

test("C09-CUS class register: storefront session_picker → seat → Sales and DB agree", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const marker = `c09-cus-${Date.now()}@impronta.test`;

  await openStorefront(page);
  const board = page.locator("[data-builder-node-kind='session_picker']");
  await expect(page.getByText("Classes").first()).toBeVisible();
  await expect(board.getByText(/pick a date/i)).toBeVisible({ timeout: 20_000 });
  await expect(board.getByText(/no dates are open/i)).toHaveCount(0);

  await board.locator("input[type=radio]").first().check();
  await board.getByLabel(/^email$/i).fill(marker);
  await board.getByLabel(/^name$/i).fill("C09 guest");
  await board.getByRole("button", { name: /take a seat/i }).click();
  await expect(board.locator("[data-session-picker=done]")).toBeVisible({ timeout: 30_000 });

  await page.reload();
  await expect(page.getByText("Classes").first()).toBeVisible();

  await signInJourneysStaff(page, "/admin/sales");
  await assertWorkspaceIdentity(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/sales/i);
  await expect(page.getByText("We could not load your orders")).toHaveCount(0);
  await expect(page.getByText("session_picker").first()).toBeVisible();
  await expect(page.getByText(/overdue/i)).toHaveCount(0);

  const persisted = await latestSessionPickerClass(marker);
  expect(persisted, "session_picker class order must exist on qa-journeys").not.toBeNull();
  expect(persisted?.status).toBe("paid");
  expect(persisted?.totalCents).toBe(0);
  expect(persisted?.sourceChannel).toBe("session_picker");
  expect(persisted?.customerEmail).toBe(marker);
  expect(persisted?.lineLabel?.toLowerCase()).toContain("complimentary class");
  expect(persisted?.sessionId).toBe(MORNING_CLASS_SESSION_ID);

  await page.screenshot({
    path: testInfo.outputPath("c09-cus-sales.png"),
    fullPage: true,
  });
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

test("C09-DIFF door: website last seat blocks POS walk-in on the same pool", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const guestMarker = `c09-diff-${Date.now()}@impronta.test`;
  const walkInMarker = `c09-diff-pos-${Date.now()}@impronta.test`;

  await openStorefront(page);
  const board = page.locator("[data-builder-node-kind='session_picker']");
  await expect(page.getByText("Classes").first()).toBeVisible();
  const lastPlace = board.locator(`input[name=session][value="${LAST_PLACE_CLASS_SESSION_ID}"]`);
  await expect(lastPlace).toBeEnabled({ timeout: 20_000 });
  await lastPlace.check();
  await board.getByLabel(/^email$/i).fill(guestMarker);
  await board.getByLabel(/^name$/i).fill("C09 last place");
  await board.getByRole("button", { name: /take a seat/i }).click();
  await expect(board.locator("[data-session-picker=done]")).toBeVisible({ timeout: 30_000 });

  const taken = await latestSessionPickerClass(guestMarker);
  expect(taken, "session_picker must take the last Last place seat").not.toBeNull();
  expect(taken?.status).toBe("paid");
  expect(taken?.totalCents).toBe(0);
  expect(taken?.sessionId).toBe(LAST_PLACE_CLASS_SESSION_ID);
  expect(taken?.poolId).toBe(LAST_PLACE_CLASS_POOL_ID);
  expect(taken?.allocationId).toBeTruthy();
  expect(["hold", "committed"]).toContain(taken?.allocationState);

  await page.reload();
  const after = page.locator("[data-builder-node-kind='session_picker']");
  await expect(after.locator(`input[name=session][value="${LAST_PLACE_CLASS_SESSION_ID}"]`)).toBeDisabled({
    timeout: 20_000,
  });
  await expect(after.getByText(/sold out/i).first()).toBeVisible();

  await signInJourneysStaff(page, "/admin/pos");
  await assertWorkspaceIdentity(page);
  await expect(page.getByTitle("Complimentary class")).toBeVisible();
  await page.getByRole("button", { name: "⊕ New sale" }).click();
  await expect(page).toHaveURL(/order=/, { timeout: 20_000 });
  await page.locator("select").filter({ hasText: "Last place class" }).selectOption(LAST_PLACE_CLASS_SESSION_ID);
  await page.getByTitle("Complimentary class").click();
  await expect(page.locator("aside").getByText(/complimentary class/i)).toBeVisible();
  await page.locator("aside").getByLabel(/^email$/i).fill(walkInMarker);
  await page.getByTitle("Collect cash").click();
  await expect(page.locator("aside").getByRole("alert")).toHaveText(/no longer free/i, {
    timeout: 30_000,
  });
  await expect(page.getByText(/payment:\s*paid/i)).toHaveCount(0);

  const refused = await latestClassWalkIn(walkInMarker);
  expect(refused?.status ?? "missing").not.toBe("paid");
  expect(refused?.allocationId ?? null).toBeNull();
  expect(refused?.poolId ?? null).toBeNull();

  const stillHeld = await latestSessionPickerClass(guestMarker);
  expect(stillHeld?.poolId).toBe(LAST_PLACE_CLASS_POOL_ID);
  expect(stillHeld?.allocationId).toBe(taken?.allocationId);
  expect(["hold", "committed"]).toContain(stillHeld?.allocationState);

  await page.goto("/admin/sales");
  await assertWorkspaceIdentity(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/sales/i);
  await expect(page.getByText("session_picker").first()).toBeVisible();
  await expect(page.getByText(/overdue/i)).toHaveCount(0);

  await page.screenshot({
    path: testInfo.outputPath("c09-diff-sales.png"),
    fullPage: true,
  });
});
