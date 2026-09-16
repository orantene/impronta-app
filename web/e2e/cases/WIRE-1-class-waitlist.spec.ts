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
import { isolatedService } from "./_isolated-db";
import { WIRE_SENTENCE, assertEnglishRefusal, clickUntil } from "./_wire";
import { seedClassWaitlist } from "./_wire-seed";

skipUnlessFixture();

test("WIRE-1.10 Front desk waitlist offer, accept, and expired refusal", async ({ page }) => {
  test.setTimeout(240_000);
  await prepareJourneysPage(page);
  const seed = await seedClassWaitlist({ count: 2 });
  const sb = isolatedService();
  try {
    await signInJourneysStaff(page, `/admin/pos?mode=classes&day=${seed.dayOffset}`);
    const entry = page.locator(`[data-pos-classes-entry="${seed.entryIds[0]}"]`);
    // The desk's rail row "Waitlist" is the door (the address carries only the day).
    await clickUntil(page.getByRole("button", { name: "Waitlist" }), entry);
    await expect(entry, "the seeded waiting person is on the desk").toBeVisible({ timeout: 30_000 });
    await expect(entry).toHaveAttribute("data-pos-classes-entry-state", "waiting");

    await entry.getByRole("button", { name: "Offer the place" }).click();
    await expect(entry).toHaveAttribute("data-pos-classes-entry-state", "offered", { timeout: 20_000 });
    const { data: offer } = await sb
      .from("waitlist_offers")
      .select("id, expires_at, accepted_at, declined_at")
      .eq("waitlist_entry_id", seed.entryIds[0])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    expect(offer, "waitlist_offers row").toBeTruthy();
    expect((offer as { expires_at: string }).expires_at).toBeTruthy();
    const offerId = (offer as { id: string }).id;

    // Refusal: the hold timer ran out before they took it.
    const expire = await sb.from("waitlist_offers").update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", offerId);
    expect(expire.error, expire.error?.message).toBeNull();
    await entry.getByRole("button", { name: "They took it" }).click();
    await assertEnglishRefusal(page, WIRE_SENTENCE.expired);
    const { data: afterExpired } = await sb.from("waitlist_offers").select("accepted_at, allocation_id").eq("id", offerId).maybeSingle();
    expect((afterExpired as { accepted_at: string | null } | null)?.accepted_at).toBeFalsy();
    // The offer reserved a hold (contract §7); a refused accept never confirms it
    // (the expire-orders cron releases lapsed holds).
    const heldId = (afterExpired as { allocation_id: string | null } | null)?.allocation_id;
    if (heldId) {
      const { data: held } = await sb.from("capacity_allocations").select("state").eq("id", heldId).maybeSingle();
      expect((held as { state: string } | null)?.state).not.toBe("committed");
    }

    // Accept: the second person, offered and taken inside the timer.
    const next = page.locator(`[data-pos-classes-entry="${seed.entryIds[1]}"]`);
    await expect(next).toBeVisible({ timeout: 20_000 });
    await next.getByRole("button", { name: "Offer the place" }).click();
    await expect(next).toHaveAttribute("data-pos-classes-entry-state", "offered", { timeout: 20_000 });
    await next.getByRole("button", { name: "They took it" }).click();
    await expect(next).toHaveAttribute("data-pos-classes-entry-state", /accepted|seated/, { timeout: 20_000 });
    await expect
      .poll(
        async () => {
          const { data: accepted } = await sb
            .from("waitlist_offers")
            .select("accepted_at, allocation_id")
            .eq("waitlist_entry_id", seed.entryIds[1])
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          const row = accepted as { accepted_at: string | null; allocation_id: string | null } | null;
          if (!row?.accepted_at || !row.allocation_id) return null;
          const { data: alloc } = await sb.from("capacity_allocations").select("state").eq("id", row.allocation_id).maybeSingle();
          return (alloc as { state: string } | null)?.state ?? null;
        },
        { timeout: 20_000, message: "accepted offer carries accepted_at and a committed allocation" },
      )
      .toBe("committed");
  } finally {
    await seed.cleanup();
  }
});
