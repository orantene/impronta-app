/**
 * 3.2 Party waitlist: join → notify → seat → leave (T08, MW17), on the
 * Tables (floor) mode. Ground truth: `party_waitlist.status` moves waiting →
 * notified → seated / left; Seat opens a `visits` row on the chosen table.
 * Refusal: seating on a table that got occupied meanwhile → `space_occupied`
 * in words, and the party stays waiting.
 */
import { test, expect, prepareJourneysPage, signInJourneysStaff, skipUnlessFixture } from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import { FLOOR_T5, releaseFloorProof } from "./_floor-db";
import { WIRE_SENTENCE, assertEnglishRefusal } from "./_wire";

skipUnlessFixture();

type Page = import("@playwright/test").Page;

async function joinWaitlist(page: Page, name: string): Promise<string> {
  const sb = isolatedService();
  await page.locator("[data-floor-walk-in]").click();
  await expect(page.locator('[data-pos-sheet="walk-in"]')).toBeVisible({ timeout: 20_000 });
  await page.locator("[data-floor-walkin-name]").fill(name);
  await page.locator("[data-floor-walkin-waitlist]").click();
  await expect(page.locator('[data-pos-sheet="walk-in"]')).toHaveCount(0, { timeout: 20_000 });
  let id: string | null = null;
  await expect
    .poll(
      async () => {
        const { data } = await sb.from("party_waitlist").select("id, status").eq("tenant_id", JOURNEYS_TENANT_ID).eq("holder_name", name).maybeSingle();
        id = (data as { id: string } | null)?.id ?? null;
        return (data as { status: string } | null)?.status ?? null;
      },
      { timeout: 20_000, message: `party_waitlist row for ${name}` },
    )
    .toBe("waiting");
  return id!;
}

/**
 * The Waiting tab's row for a party opens the waiting-list sheet (Seat now /
 * Offer table / Remove, D-140); Seat now on that party's row opens the Seat
 * sheet for it.
 */
async function openSeatForParty(page: Page, entryId: string) {
  await page.getByRole("tab", { name: /^Waiting/ }).click();
  const row = page.locator(`[data-floor-waiting="${entryId}"]`).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.click();
  const waitingSheet = page.locator('[data-pos-sheet="waiting"]');
  await expect(waitingSheet, "a party row opens the waiting-list sheet").toBeVisible({ timeout: 20_000 });
  const li = waitingSheet.locator(`li[data-floor-waiting="${entryId}"]`);
  await expect(li.getByRole("button", { name: "Offer table" })).toBeVisible();
  await expect(li.getByRole("button", { name: "Remove" })).toBeVisible();
  await li.getByRole("button", { name: "Seat now" }).click();
  const seatSheet = page.locator('[data-pos-sheet="seat-party"]');
  await expect(seatSheet).toBeVisible({ timeout: 20_000 });
  return seatSheet;
}

test("WIRE-3.2 waiting list: join, offer, seat on T5, refuse a taken table, leave", async ({ page }) => {
  test.setTimeout(300_000);
  await prepareJourneysPage(page);
  const sb = isolatedService();
  await releaseFloorProof();
  const stamp = Date.now();
  const status = async (id: string) => {
    const { data } = await sb.from("party_waitlist").select("status, notified_at, seated_visit_id").eq("id", id).maybeSingle();
    return data as { status: string; notified_at: string | null; seated_visit_id: string | null } | null;
  };
  const ids: string[] = [];
  let blockerVisit: string | null = null;
  try {
    await signInJourneysStaff(page, "/admin/pos?mode=floor");
    await expect(page.locator('li[data-floor-table="T5"]')).toHaveAttribute("data-floor-state", "free", { timeout: 30_000 });

    // Join, then Seat now on T5: the party is seated and a visit opens on T5.
    const a = await joinWaitlist(page, `WIRE party A ${stamp}`);
    ids.push(a);
    let seatSheet = await openSeatForParty(page, a);
    await seatSheet.getByRole("radio", { name: /^T5 · / }).click();
    await seatSheet.getByRole("button", { name: /^seat \d+ guests? at T5$/i }).click();
    await expect(page.locator('li[data-floor-table="T5"]')).toHaveAttribute("data-floor-state", "occupied", { timeout: 30_000 });
    await expect.poll(async () => (await status(a))?.status, { timeout: 20_000 }).toBe("seated");
    const visitId = (await status(a))?.seated_visit_id;
    expect(visitId, "seated_visit_id").toBeTruthy();
    const { data: visit } = await sb.from("visits").select("space_id, status").eq("id", visitId!).maybeSingle();
    expect((visit as { space_id: string } | null)?.space_id).toBe(FLOOR_T5);
    expect((visit as { status: string } | null)?.status).toBe("open");

    // Refusal: a second party picks T3 while it is free; T3 gets taken
    // underneath (a visit opened by another till); the seat is refused.
    const b = await joinWaitlist(page, `WIRE party B ${stamp}`);
    ids.push(b);
    seatSheet = await openSeatForParty(page, b);
    await seatSheet.getByRole("radio", { name: /^T3 · / }).click();
    const { data: blocker, error: blockErr } = await sb
      .from("visits")
      .insert({ tenant_id: JOURNEYS_TENANT_ID, space_id: "33330011-0000-4000-8000-000000000012", public_token: `wire-3-2-${stamp}`, status: "open", party_size: 2 })
      .select("id")
      .single();
    expect(blockErr, blockErr?.message).toBeNull();
    blockerVisit = (blocker as { id: string }).id;
    await seatSheet.getByRole("button", { name: /^seat \d+ guests? at T3$/i }).click();
    await assertEnglishRefusal(page, WIRE_SENTENCE.spaceOccupied);
    expect((await status(b))?.status).toBe("waiting");
    await page.keyboard.press("Escape");

    // Notify and leave: the board's Waiting list must offer them for a party.
    // The sheet that carries "Offer table" / "Remove" (`WaitingSheet`) is what
    // a party row must open; on this host the row opens Seat instead.
    await page.goto("/admin/pos?mode=floor");
    await page.getByRole("tab", { name: /^Waiting/ }).click();
    await page.locator(`[data-floor-waiting="${b}"]`).first().click();
    const waitingSheet = page.locator('[data-pos-sheet="waiting"]');
    await expect(waitingSheet, "a party row must open the waiting-list sheet with Offer table / Remove").toBeVisible({ timeout: 20_000 });
    const li = waitingSheet.locator(`li[data-floor-waiting="${b}"]`);
    await li.getByRole("button", { name: "Offer table" }).click();
    await expect(page.getByText("Offer recorded. No text was sent.", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => (await status(b))?.status, { timeout: 20_000 }).toBe("notified");
    expect((await status(b))?.notified_at).toBeTruthy();
    await li.getByRole("button", { name: "Remove" }).click();
    await expect.poll(async () => (await status(b))?.status, { timeout: 20_000 }).not.toBe("notified");
  } finally {
    if (blockerVisit) await sb.from("visits").delete().eq("id", blockerVisit);
    await releaseFloorProof();
    if (ids.length) await sb.from("party_waitlist").delete().in("id", ids);
  }
});
