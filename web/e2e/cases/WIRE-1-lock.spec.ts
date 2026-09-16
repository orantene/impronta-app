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

test("WIRE-1.4 lock, refuse a wrong PIN, unlock, then switch operator", async ({ page }) => {
  test.setTimeout(240_000);
  await prepareJourneysPage(page);
  await openCounter(page);
  await page.locator("[data-pos-lock]").click();
  await expect(page.locator("[data-pos-lock-screen='locked']")).toBeVisible({ timeout: 20_000 });

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
  const sessionId = (locked as { id: string }).id;
  const operatorBefore = (locked as { operator_user_id: string | null }).operator_user_id;

  const { data: shiftBefore } = await sb
    .from("pos_shifts")
    .select("id, status")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  await pressKeypad(page, WRONG_PIN);
  await page.locator("[data-pos-lock-submit]").click();
  await assertEnglishRefusal(page, WIRE_SENTENCE.pinInvalid);
  await expect(page.locator("[data-pos-lock-screen]")).toBeVisible();

  await pressKeypad(page, OWNER_PIN);
  await page.locator("[data-pos-lock-submit]").click();
  await expect(page.locator("[data-pos-lock-screen]")).toHaveCount(0, { timeout: 20_000 });
  await expect(page.locator("[data-pos-tile]").first()).toBeVisible({ timeout: 20_000 });
  const { data: unlocked } = await sb
    .from("pos_device_sessions")
    .select("unlocked_at, operator_user_id")
    .eq("id", sessionId)
    .maybeSingle();
  expect((unlocked as { unlocked_at: string | null } | null)?.unlocked_at).toBeTruthy();
  expect((unlocked as { operator_user_id: string | null } | null)?.operator_user_id).toBeTruthy();

  await page.locator("[data-pos-cashier]").click();
  await page.getByRole("menuitem", { name: /switch operator/i }).click();
  await expect(page.locator("[data-pos-lock-screen='switch']")).toBeVisible({ timeout: 20_000 });
  const person = page.locator("[data-pos-lock-person]").first();
  await expect(person).toBeVisible();
  await person.click();
  await pressKeypad(page, OWNER_PIN);
  await page.locator("[data-pos-lock-submit]").click();
  await expect(page.locator("[data-pos-lock-screen]")).toHaveCount(0, { timeout: 20_000 });

  const { data: switched } = await sb
    .from("pos_device_sessions")
    .select("operator_user_id")
    .eq("id", sessionId)
    .maybeSingle();
  expect((switched as { operator_user_id: string | null } | null)?.operator_user_id).toBeTruthy();
  if (operatorBefore) {
    expect((switched as { operator_user_id: string }).operator_user_id).toBeTruthy();
  }
  if (shiftBefore) {
    const { data: shiftAfter } = await sb
      .from("pos_shifts")
      .select("id, status")
      .eq("id", (shiftBefore as { id: string }).id)
      .maybeSingle();
    expect((shiftAfter as { status: string } | null)?.status).toBe("open");
  }
});
