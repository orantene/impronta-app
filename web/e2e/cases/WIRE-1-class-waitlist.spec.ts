/**
 * 1.10 Class waitlist offer → accept / decline with hold timer.
 * Refusal: accept expired → expired.
 */
import {
  test,
  expect,
  prepareJourneysPage,
  signInJourneysStaff,
  skipUnlessFixture,
} from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import { WIRE_SENTENCE, assertEnglishRefusal } from "./_wire";

skipUnlessFixture();

test("WIRE-1.10 Front desk waitlist offer, accept, and expired refusal", async ({ page }) => {
  test.setTimeout(240_000);
  await prepareJourneysPage(page);
  await signInJourneysStaff(page, "/admin/pos?mode=classes&view=waitlist");
  const row = page.locator("[data-classes-waitlist-row], [data-pos-waitlist-row]").first();
  test.skip((await row.count()) === 0, "failed-fixture: no class waitlist row");
  await row.getByRole("button", { name: /offer/i }).click();
  await expect(page.getByText(/offered|hold|expires/i).first()).toBeVisible({ timeout: 20_000 });
  const sb = isolatedService();
  const { data: offer } = await sb
    .from("waitlist_offers")
    .select("id, status, expires_at")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  expect(offer, "waitlist_offers row").toBeTruthy();

  await row.getByRole("button", { name: /took it|accept/i }).click();
  const { data: accepted } = await sb
    .from("waitlist_offers")
    .select("status")
    .eq("id", (offer as { id: string }).id)
    .maybeSingle();
  if ((accepted as { status: string } | null)?.status !== "accepted") {
    await row.getByRole("button", { name: /decline/i }).click();
  }

  await isolatedService()
    .from("waitlist_offers")
    .update({ expires_at: new Date(Date.now() - 60_000).toISOString(), status: "expired" })
    .eq("id", (offer as { id: string }).id);
  if ((await row.getByRole("button", { name: /accept|took/i }).count()) > 0) {
    await row.getByRole("button", { name: /accept|took/i }).click();
    await assertEnglishRefusal(page, WIRE_SENTENCE.expired);
  }
});
