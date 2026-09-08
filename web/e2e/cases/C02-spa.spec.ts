/**
 * C02 [delta] — spa. Smoke stays honest. C02-CUS last-resource and the
 * successful couples set are real journeys on qa-journeys.
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
  latestCouplesMassage,
  latestCouplesSet,
  latestSpaMassage,
  latestTherapistHold,
  overlappingTherapistHoldCount,
  THERAPIST_B_ID,
} from "./_isolated-db";

skipUnlessFixture();

test.beforeEach(async ({ page }) => {
  await prepareJourneysPage(page);
});

test("C02-CUS smoke: storefront body is reachable — not a journey pass", async ({ page }) => {
  await openStorefront(page);
});

test("C02-OP smoke: operator Sales heading is reachable — not a journey pass", async ({ page }) => {
  await openWorkspace(page, "sales");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("C02-CUS last-resource: Massage takes therapist B, Couples set refuses the same slot", async ({
  page,
}, testInfo) => {
  test.setTimeout(150_000);
  const blocker = `c02-b-${Date.now()}@impronta.test`;
  const challenger = `c02-c-${Date.now()}@impronta.test`;

  await page.goto("/book");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(/host not registered/i)).toHaveCount(0);
  // Wrapping <label> also contains the option texts, so getByLabel(/^service$/) never matches.
  await page.locator("select").selectOption({ label: "Massage" });
  await expect(page.getByText(/no open times/i)).toHaveCount(0);

  const slot = page.locator("[data-testid=slot-picker] button").first();
  await expect(slot).toBeVisible({ timeout: 30_000 });
  const slotLabel = ((await slot.innerText()) ?? "").trim();
  expect(slotLabel.length).toBeGreaterThan(0);
  await slot.click();

  await page.getByRole("textbox", { name: /your name/i }).fill("C02 blocker");
  await page.getByRole("textbox", { name: /your email/i }).fill(blocker);
  await page.getByRole("button", { name: /confirm this time/i }).click();
  await expect(page).toHaveURL(/instant_booked=1|\/c\//, { timeout: 45_000 });

  const massage = await latestSpaMassage(blocker);
  expect(massage, "therapist B massage must exist on qa-journeys").not.toBeNull();
  expect(massage?.status).toBe("paid");
  expect(massage?.totalCents).toBe(0);
  expect(massage?.sourceChannel).toBe("instant_book");
  expect(massage?.lineLabel?.toLowerCase()).toContain("massage");
  expect(massage?.lineLabel?.toLowerCase()).not.toContain("couples");
  expect(massage?.roomAllocationId).toBeNull();

  const t2Hold = await latestTherapistHold(THERAPIST_B_ID);
  expect(t2Hold, "therapist B hold must exist").not.toBeNull();

  await page.goto("/book");
  await page.locator("select").selectOption({ label: "Couples massage" });
  const couplesSlot = page.locator("[data-testid=slot-picker] button", { hasText: slotLabel }).first();
  await expect(couplesSlot).toBeVisible({ timeout: 30_000 });
  await couplesSlot.click();
  await page.getByRole("textbox", { name: /your name/i }).fill("C02 challenger");
  await page.getByRole("textbox", { name: /your email/i }).fill(challenger);
  await page.getByRole("button", { name: /confirm this time/i }).click();
  await expect(page.getByText(/just taken|not free|could not hold|couldn't complete/i)).toBeVisible({
    timeout: 30_000,
  });

  expect(await latestCouplesMassage(challenger)).toBeNull();
  expect(await overlappingTherapistHoldCount("33330003-0000-4000-8000-000000000001", t2Hold!.startsAt)).toBe(0);

  await signInJourneysStaff(page, "/admin/sales");
  await assertWorkspaceIdentity(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/sales/i);
  await expect(page.getByText("We could not load your orders")).toHaveCount(0);
  await expect(page.getByText("instant_book").first()).toBeVisible();
  await expect(page.getByText(/overdue/i)).toHaveCount(0);

  await page.screenshot({
    path: testInfo.outputPath("c02-cus-sales.png"),
    fullPage: true,
  });
});

test("C02-CUS couples set: two therapists and Room A held together", async ({
  page,
}, testInfo) => {
  test.setTimeout(150_000);
  const marker = `c02-set-${Date.now()}@impronta.test`;

  await page.goto("/book");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(/host not registered/i)).toHaveCount(0);
  await page.locator("select").selectOption({ label: "Couples massage" });
  await expect(page.getByText(/no open times/i)).toHaveCount(0);

  // Second slot: last-resource (and leftover Massage holds) take the first.
  const slot = page.locator("[data-testid=slot-picker] button").nth(1);
  await expect(slot).toBeVisible({ timeout: 30_000 });
  await slot.click();

  await page.getByRole("textbox", { name: /your name/i }).fill("C02 couples");
  await page.getByRole("textbox", { name: /your email/i }).fill(marker);
  await page.getByRole("button", { name: /confirm this time/i }).click();
  await expect(page).toHaveURL(/instant_booked=1|\/c\//, { timeout: 45_000 });

  const booked = await latestCouplesSet(marker);
  expect(booked, "couples set must persist on qa-journeys").not.toBeNull();
  expect(booked?.order.status).toBe("paid");
  expect(booked?.order.totalCents).toBe(0);
  expect(booked?.order.sourceChannel).toBe("instant_book");
  expect(booked?.order.lineLabel?.toLowerCase()).toContain("couples");
  expect(booked?.order.roomAllocationId).toBeTruthy();
  expect(booked?.primaryHoldId).toBeTruthy();
  expect(booked?.companionHoldId).toBeTruthy();
  expect(booked?.primaryHoldId).not.toBe(booked?.companionHoldId);

  await signInJourneysStaff(page, "/admin/sales");
  await assertWorkspaceIdentity(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/sales/i);
  await expect(page.getByText("We could not load your orders")).toHaveCount(0);
  await expect(page.getByText("instant_book").first()).toBeVisible();
  await expect(page.getByText(/overdue/i)).toHaveCount(0);

  await page.screenshot({
    path: testInfo.outputPath("c02-cus-couples-sales.png"),
    fullPage: true,
  });
});
