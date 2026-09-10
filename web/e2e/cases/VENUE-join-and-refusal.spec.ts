/**
 * VENUE, the refusal a host actually meets, and the move it offers instead.
 *
 * A party of four walks in and the host taps a two-top. The engine refuses
 * (`party_too_large`), the floor says so IN WORDS, and, because T2 and T3
 * have a `space_combinations` row that covers three to four, it offers the
 * join rather than leaving the host to work it out. Tapping the offer seats
 * the party across both tables on ONE visit and ONE check, which is the whole
 * point of T15: two tables pushed together are not two checks.
 *
 * WHY THIS IS A SEPARATE JOURNEY FROM THE SERVICE ONE. The refusal has to be
 * reached, not staged: the only honest way to see `party_too_large` on a
 * screen is to ask for a seating the engine will refuse, and that means the
 * floor has to be in a state where the refusal is the correct answer. Folding
 * it into the service journey would have meant seating a party twice.
 */
import {
  test,
  expect,
  prepareJourneysPage,
  signInJourneysStaff,
  skipUnlessFixture,
  assertWorkspaceIdentity,
} from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import { releaseVenueJourneyParty, TABLE_TWO_TOP_ID, TABLE_THREE_TOP_ID } from "./_venue-db";

skipUnlessFixture();

test.use({ timezoneId: "Asia/Tokyo" });

test.beforeEach(async ({ page }) => {
  await prepareJourneysPage(page);
});

test.afterEach(async () => {
  await releaseVenueJourneyParty();
});

/** The floor card for one table, found by the code printed on it. */
function tableCard(page: import("@playwright/test").Page, code: string) {
  return page.locator("li").filter({ has: page.getByText(code, { exact: true }) }).first();
}

test("VENUE-JOIN: four at a two-top is refused in words, and the join it offers seats them on one check", async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);

  await signInJourneysStaff(page, "/admin/tables");
  await assertWorkspaceIdentity(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^tables$/i);
  await expect(page.getByText(/we could not load the floor/i)).toHaveCount(0);

  const twoTop = tableCard(page, "T2");
  await expect(twoTop, "the fixture floor must carry a two-top").toBeVisible({ timeout: 30_000 });
  await expect(twoTop).not.toContainText(/occupied/i);

  await twoTop.getByRole("button", { name: /seat party/i }).click();
  const party = twoTop.getByLabel(/party size/i);
  await expect(party).toBeVisible();
  await party.fill("4");
  await twoTop.getByRole("button", { name: /seat here/i }).click();

  // The refusal, as a sentence. Asserted twice: once that it is the right
  // sentence, once that it is not the code, `refusalText` answers with the
  // generic sentence for a code it does not know, so "not a token" and "the
  // right words" are two different failures.
  const banner = page.locator("p.text-destructive").first();
  await expect(banner).toBeVisible({ timeout: 30_000 });
  await expect(banner).toHaveText("This party is larger than the table allows.");
  await expect(banner).not.toContainText(/party_too_large|_/);

  // And the floor does not stop at "no": it offers the combination the venue
  // actually has, by the code on the other table.
  await expect(twoTop).toContainText(/no single free table fits 4\. join two:/i);
  const joinWithT3 = twoTop.getByRole("button", { name: /join with T3/i });
  await expect(joinWithT3, "T2 + T3 combine for 3 to 4; the picker must say so").toBeVisible();

  await page.screenshot({
    path: testInfo.outputPath("floor-refusal-and-join-offer.png"),
    fullPage: true,
  });

  await joinWithT3.click();

  // Both halves read occupied, and each says which table it is joined with:
  // not a second, orphaned occupancy.
  await expect(tableCard(page, "T2")).toContainText(/occupied/i, { timeout: 30_000 });
  await expect(tableCard(page, "T2")).toContainText(/joined with T3/i);
  await expect(tableCard(page, "T3")).toContainText(/occupied/i);
  await expect(tableCard(page, "T3")).toContainText(/joined with T2/i);
  await expect(tableCard(page, "T2")).toContainText(/party of 4/i);

  await page.screenshot({
    path: testInfo.outputPath("floor-joined-seating.png"),
    fullPage: true,
  });

  // ONE visit and ONE check across two tables.
  const sb = isolatedService();
  const { data: visits, error } = await sb
    .from("visits")
    .select("id, space_id, joined_space_id, party_size, status, service_kind")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("status", "open")
    .in("space_id", [TABLE_TWO_TOP_ID, TABLE_THREE_TOP_ID]);
  if (error) throw new Error(error.message);
  const rows = (visits ?? []) as Array<{
    id: string;
    space_id: string;
    joined_space_id: string | null;
    party_size: number;
    service_kind: string;
  }>;
  expect(rows.length, "two tables pushed together are one seating").toBe(1);
  expect(rows[0]!.space_id).toBe(TABLE_TWO_TOP_ID);
  expect(rows[0]!.joined_space_id).toBe(TABLE_THREE_TOP_ID);
  expect(Number(rows[0]!.party_size)).toBe(4);
  expect(rows[0]!.service_kind).toBe("table");

  const { data: orders, error: orderErr } = await sb
    .from("orders")
    .select("id, visit_id, status")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("visit_id", rows[0]!.id);
  if (orderErr) throw new Error(orderErr.message);
  expect((orders ?? []).length, "one seating, one check").toBe(1);

  // Give the floor back through the interface, not through the database: an
  // unpaid check with nothing on it is $0 and closes, and both halves come
  // back needing a reset.
  await tableCard(page, "T2").getByRole("button", { name: /end visit/i }).click();
  await expect(tableCard(page, "T2")).toContainText(/needs reset/i, { timeout: 30_000 });
  await expect(tableCard(page, "T3")).toContainText(/needs reset/i);
  await expect(tableCard(page, "T2")).not.toContainText(/occupied/i);

  // T24, a bussed table is marked ready by the person who bussed it.
  await tableCard(page, "T2").getByRole("button", { name: /mark ready/i }).click();
  await expect(tableCard(page, "T2")).not.toContainText(/needs reset/i, { timeout: 30_000 });
});
