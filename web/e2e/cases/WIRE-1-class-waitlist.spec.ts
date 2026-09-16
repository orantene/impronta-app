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
  const entry = page.locator("[data-pos-classes-entry]").first();
  test.skip((await entry.count()) === 0, "failed-fixture: no class waitlist row");
  const entryId = await entry.getAttribute("data-pos-classes-entry");
  expect(entryId).toBeTruthy();

  const state = await entry.getAttribute("data-pos-classes-entry-state");
  if (state === "waiting" || state === "expired") {
    await entry.getByRole("button", { name: /offer the place|offer/i }).click();
    await expect(entry).toHaveAttribute("data-pos-classes-entry-state", "offered", { timeout: 20_000 });
  }
  await expect(entry).toHaveAttribute("data-pos-classes-entry-state", "offered");

  const sb = isolatedService();
  const { data: offer } = await sb
    .from("waitlist_offers")
    .select("id, status, expires_at, accepted_at")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  expect(offer, "waitlist_offers row").toBeTruthy();

  await isolatedService()
    .from("waitlist_offers")
    .update({ expires_at: new Date(Date.now() - 60_000).toISOString(), status: "expired" })
    .eq("id", (offer as { id: string }).id);

  await entry.getByRole("button", { name: /took it|accept/i }).click();
  await assertEnglishRefusal(page, WIRE_SENTENCE.expired);
  const { data: afterExpired } = await sb
    .from("waitlist_offers")
    .select("status, accepted_at")
    .eq("id", (offer as { id: string }).id)
    .maybeSingle();
  expect((afterExpired as { accepted_at: string | null } | null)?.accepted_at).toBeFalsy();

  const next = page.locator("[data-pos-classes-entry][data-pos-classes-entry-state='waiting']").first();
  if ((await next.count()) > 0) {
    await next.getByRole("button", { name: /offer the place|offer/i }).click();
    await expect(next).toHaveAttribute("data-pos-classes-entry-state", "offered", { timeout: 20_000 });
    await next.getByRole("button", { name: /took it|accept/i }).click();
    await expect(next).toHaveAttribute("data-pos-classes-entry-state", /accepted|seated/, {
      timeout: 20_000,
    });
    const { data: accepted } = await sb
      .from("waitlist_offers")
      .select("status, accepted_at")
      .eq("tenant_id", JOURNEYS_TENANT_ID)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    expect((accepted as { status: string } | null)?.status).toMatch(/accepted|seated/);
  }
});
