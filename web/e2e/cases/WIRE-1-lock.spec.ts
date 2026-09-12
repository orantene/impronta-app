/**
 * 1.4 Lock till / unlock / switch operator.
 * Refusal: wrong PIN.
 */
import {
  test,
  expect,
  prepareJourneysPage,
  openCounter,
  skipUnlessFixture,
} from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import { OWNER_PIN, WIRE_SENTENCE, WRONG_PIN, assertEnglishRefusal, pressKeypad } from "./_wire";

skipUnlessFixture();

test("WIRE-1.4 lock, refuse a wrong PIN, then unlock", async ({ page }) => {
  test.setTimeout(240_000);
  await prepareJourneysPage(page);
  await openCounter(page);
  await page.locator("[data-pos-lock]").click();
  await expect(page.locator("[data-pos-lock-screen]")).toBeVisible({ timeout: 20_000 });

  const sb = isolatedService();
  const { data: locked } = await sb
    .from("pos_device_sessions")
    .select("id, locked_at, unlocked_at, operator_user_id")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .order("locked_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  expect(locked, "failed-fixture: no pos_device_sessions row after lock").toBeTruthy();
  expect((locked as { locked_at: string | null }).locked_at).toBeTruthy();

  await pressKeypad(page, WRONG_PIN);
  await page.locator("[data-pos-lock-submit]").click();
  await assertEnglishRefusal(page, WIRE_SENTENCE.pinInvalid);
  await expect(page.locator("[data-pos-lock-screen]")).toBeVisible();

  await pressKeypad(page, OWNER_PIN);
  await page.locator("[data-pos-lock-submit]").click();
  await expect(page.locator("[data-pos-lock-screen]")).toHaveCount(0, { timeout: 20_000 });
  const { data: unlocked } = await sb
    .from("pos_device_sessions")
    .select("unlocked_at, operator_user_id")
    .eq("id", (locked as { id: string }).id)
    .maybeSingle();
  expect((unlocked as { unlocked_at: string | null } | null)?.unlocked_at).toBeTruthy();
});
