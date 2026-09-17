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
  clickSettingsNav,
  openPersonPinBox,
  ownerUserId,
  readCustomAmountLimitCents,
  readStaffPinHashes,
  staffPinIsHashed,
} from "./_wire";

skipUnlessFixture();

test("WIRE-1.3 owner sets a PIN and the custom-amount limit; viewer is refused", async ({ page }) => {
  test.setTimeout(240_000);
  await prepareJourneysPage(page);

  await signInJourneysStaff(page, `/${JOURNEYS_SLUG}/admin/people`, VIEWER_EMAIL);
  const pinsBefore = await readStaffPinHashes();
  const viewerPin = await openPersonPinBox(page, /QA Journeys Owner/);
  await viewerPin.locator("input").fill(OWNER_PIN);
  await viewerPin.locator("[data-people-pin-save]").click();
  // A viewer is stopped at the capability gate (`not_allowed`), before the
  // engine's `not_manager`; the contract says only "Owner/manager only".
  await assertEnglishRefusal(page, WIRE_SENTENCE.notAllowed);
  expect(await readStaffPinHashes(), "a refused PIN must not change any hash").toEqual(pinsBefore);

  await signInJourneysStaff(page, `/${JOURNEYS_SLUG}/admin/people`);
  const pinBox = await openPersonPinBox(page, /QA Journeys Owner/);
  await pinBox.locator("input").fill(OWNER_PIN);
  await pinBox.locator("[data-people-pin-save]").click();
  await expect(page.getByRole("status").filter({ hasText: /saved|set/i }).first()).toBeVisible({
    timeout: 20_000,
  });
  const userId = await ownerUserId();
  expect(await staffPinIsHashed(userId), "PIN must be stored hashed").toBe(true);

  await signInJourneysStaff(page, `/${JOURNEYS_SLUG}/admin/settings`);
  const limit = page.getByTestId("custom-amount-limit");
  await clickSettingsNav(page, "Roles & limits", limit);
  // Save is disabled while the field equals the stored limit, and a previous
  // run leaves $50.00 stored (final run 2026-09-17: the button never became
  // enabled). Move the limit somewhere else first, through the same form, so
  // the $50.00 below is a change the engine really writes and reads back.
  const input = limit.locator("#custom-amount-limit");
  await expect(input).toBeEnabled({ timeout: 20_000 });
  if ((await readCustomAmountLimitCents()) === 5000) {
    await input.fill("60");
    await limit.getByTestId("custom-amount-limit-save").click();
    await expect(limit.getByRole("status")).toBeVisible({ timeout: 20_000 });
    expect(await readCustomAmountLimitCents()).toBe(6000);
  }
  await input.fill("50");
  await limit.getByTestId("custom-amount-limit-save").click();
  await expect(limit.getByText(/saved|current/i).first()).toBeVisible({ timeout: 20_000 });
  expect(await readCustomAmountLimitCents()).toBe(5000);
});
