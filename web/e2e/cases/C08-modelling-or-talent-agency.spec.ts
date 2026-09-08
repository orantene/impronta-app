/**
 * C08 [representative] — modelling / talent agency.
 * Smoke stays honest. C08-CUS guest directory inquiry is a real journey on qa-journeys.
 */
import {
  test,
  expect,
  openWorkspace,
  openStorefront,
  prepareJourneysPage,
  skipUnlessFixture,
  assertNotAuthWall,
} from "./_harness";
import { latestGuestDirectoryInquiry } from "./_isolated-db";

skipUnlessFixture();

test.beforeEach(async ({ page }) => {
  await prepareJourneysPage(page);
});

test("C08-CUS smoke: storefront body is reachable — not a journey pass", async ({ page }) => {
  await openStorefront(page);
});

test("C08-OP smoke: operator Sales heading is reachable — not a journey pass", async ({ page }) => {
  await openWorkspace(page, "sales");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("C08-CUS inquiry: directory guest chat submits and DB agrees", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const marker = `c08-cus-${Date.now()}@impronta.test`;
  const brief = "Need two models for a catalog shoot next month.";

  await page.goto("/directory?inquiry=open");
  await assertNotAuthWall(page);

  const composer = page.getByPlaceholder(/type your message|write a reply/i);
  await expect(composer).toBeVisible({ timeout: 30_000 });
  await composer.fill(brief);

  const sendLine = page.getByRole("button", { name: /send message/i }).first();
  if (await sendLine.isVisible().catch(() => false)) {
    await sendLine.click();
  } else {
    await page.getByRole("button", { name: /send to agency/i }).click();
  }

  await expect(page.getByPlaceholder(/^first name$/i)).toBeVisible({ timeout: 20_000 });
  await page.getByPlaceholder(/^first name$/i).fill("Cora");
  await page.getByPlaceholder(/^last name$/i).fill("Cuevas");
  await page.getByPlaceholder(/^email$/i).fill(marker);
  await page.getByRole("button", { name: /^send message$/i }).click();

  await expect(
    page.getByText(/inquiry sent|sent\. the agency will reply|your inquiry is on its way/i).first(),
  ).toBeVisible({ timeout: 40_000 });

  const persisted = await latestGuestDirectoryInquiry(marker);
  expect(persisted, "guest directory inquiry must exist on qa-journeys").not.toBeNull();
  expect(persisted?.contactEmail).toBe(marker);
  expect(persisted?.contactName?.toLowerCase()).toContain("cora");
  expect(persisted?.status).toMatch(/submitted|draft|coordination/);
  expect(
    `${persisted?.message ?? ""} ${persisted?.sourcePage ?? ""}`.toLowerCase(),
  ).toMatch(/catalog|directory|agency/);

  await page.screenshot({
    path: testInfo.outputPath("c08-cus-inquiry.png"),
    fullPage: true,
  });
});
