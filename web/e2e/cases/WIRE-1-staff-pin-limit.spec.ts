/**
 * 1.3 Set staff PIN (People › Access) and custom-amount limit (Settings › Roles & limits).
 * Refusal: non-manager cannot set a PIN.
 */
import {
  test,
  expect,
  prepareJourneysPage,
  signInJourneysStaff,
  skipUnlessFixture,
  JOURNEYS_SLUG,
} from "./_harness";
import {
  OWNER_PIN,
  VIEWER_EMAIL,
  WIRE_SENTENCE,
  assertEnglishRefusal,
  ownerUserId,
  readCustomAmountLimitCents,
  staffPinIsHashed,
} from "./_wire";

skipUnlessFixture();

test("WIRE-1.3 owner sets a PIN and the custom-amount limit; viewer is refused", async ({ page }) => {
  test.setTimeout(240_000);
  await prepareJourneysPage(page);

  await signInJourneysStaff(page, `/${JOURNEYS_SLUG}/admin/people`, VIEWER_EMAIL);
  const viewerPin = page.locator("[data-people-register-pin]").first();
  if ((await viewerPin.count()) > 0) {
    await viewerPin.locator("input").fill(OWNER_PIN);
    await viewerPin.locator("[data-people-pin-save]").click();
    await assertEnglishRefusal(page, WIRE_SENTENCE.notManager);
  } else {
    await expect(page.getByText(WIRE_SENTENCE.notManager).or(page.getByText(/only a manager/i))).toBeVisible({
      timeout: 15_000,
    });
  }

  await signInJourneysStaff(page, `/${JOURNEYS_SLUG}/admin/people`);
  const pinBox = page.locator("[data-people-register-pin]").first();
  await expect(pinBox).toBeVisible({ timeout: 30_000 });
  await pinBox.locator("input").fill(OWNER_PIN);
  await pinBox.locator("[data-people-pin-save]").click();
  await expect(page.getByRole("status").filter({ hasText: /saved|set/i }).first()).toBeVisible({ timeout: 20_000 });
  const userId = await ownerUserId();
  expect(await staffPinIsHashed(userId), "PIN must be stored hashed").toBe(true);

  await signInJourneysStaff(page, `/${JOURNEYS_SLUG}/admin/settings`);
  await page.getByRole("button", { name: /roles & limits/i }).click();
  const limit = page.getByTestId("custom-amount-limit");
  await expect(limit).toBeVisible({ timeout: 20_000 });
  await limit.locator("#custom-amount-limit").fill("50");
  await limit.getByTestId("custom-amount-limit-save").click();
  await expect(limit.getByText(/saved|current/i).first()).toBeVisible({ timeout: 20_000 });
  expect(await readCustomAmountLimitCents()).toBe(5000);
});
