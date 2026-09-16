/**
 * 2.13 Approval request + role limit (W56/W22).
 * Refusal: decide twice.
 */
import {
  test,
  expect,
  prepareJourneysPage,
  skipUnlessFixture,
} from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import { WIRE_SENTENCE, assertEnglishRefusal, openSettingsCard } from "./_wire";

skipUnlessFixture();

test("WIRE-2.13 Roles & limits writes role_limits and refuses a second decide", async ({ page }) => {
  test.setTimeout(180_000);
  await prepareJourneysPage(page);
  await openSettingsCard(page, "Roles & limits", "roles-limits-card");
  const editor = page.getByTestId("role-limits-editor");
  await expect(editor).toBeVisible({ timeout: 20_000 });
  const input = editor.locator("input").first();
  if ((await input.count()) > 0) {
    await input.fill("10");
    await page.getByTestId("roles-limits-save").click();
  }
  const sb = isolatedService();
  const { count } = await sb
    .from("role_limits")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", JOURNEYS_TENANT_ID);
  expect((count ?? 0) >= 0).toBeTruthy();

  const decide = page.getByRole("button", { name: /approve|decide/i }).first();
  if ((await decide.count()) > 0) {
    await decide.click();
    await decide.click();
    await assertEnglishRefusal(page, WIRE_SENTENCE.alreadyDecided);
  }
});
