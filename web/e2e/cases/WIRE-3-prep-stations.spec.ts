/**
 * 3.5 Prep stations + fire by course (W15, T26).
 * Ground truth: a `prep_stations` row from Settings › Prep stations;
 * `order_lines.course_seq` (set on the check) and a `preparation_tickets`
 * revision whose snapshot carries only that course's lines after "Fire
 * starters" on the table. Refusal: deleting a station with a live ticket →
 * `station_in_use` in words, and the row stays.
 *
 * `course_seq` has no editor on the counter yet (no line control writes it),
 * so the two lines' courses are stamped as fixture state before firing.
 */
import { test, expect, prepareJourneysPage, signInJourneysStaff, openCounter, counterAddItem, skipUnlessFixture } from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import { FLOOR_T4, openVisitOn, releaseFloorProof } from "./_floor-db";
import { openSettingsCard } from "./_wire";

skipUnlessFixture();

type Page = import("@playwright/test").Page;
function card(page: Page, code: string) {
  return page.locator(`li[data-floor-table="${code}"]`);
}
function sheet(page: Page, code: string) {
  return page.locator(`[data-floor-sheet="${code}"]`);
}
async function tapTable(page: Page, code: string) {
  for (let attempt = 0; attempt < 5 && !(await sheet(page, code).isVisible()); attempt += 1) {
    await card(page, code).getByRole("button").first().click();
    await page.waitForTimeout(1_000);
  }
  await expect(sheet(page, code)).toBeVisible({ timeout: 20_000 });
}

test("WIRE-3.5 a station is written and refuses deletion while a ticket is live; Fire starters tickets only course 1", async ({ page }) => {
  test.setTimeout(360_000);
  await prepareJourneysPage(page);
  const sb = isolatedService();
  const stamp = Date.now();
  const code = `wk${String(stamp).slice(-6)}`;
  let stationId: string | null = null;
  let ticketId: string | null = null;
  const station = async () => {
    const { data } = await sb.from("prep_stations").select("id, name, kind").eq("tenant_id", JOURNEYS_TENANT_ID).eq("code", code).maybeSingle();
    return data as { id: string; name: string; kind: string } | null;
  };
  try {
    // ── Settings › Prep stations ───────────────────────────────────────
    await openSettingsCard(page, "Prep stations", "prep-stations-card");
    await page.getByTestId("stations-add").click();
    await page.getByTestId("stations-code").fill(code);
    await page.getByTestId("stations-name").fill(`WIRE kitchen ${stamp}`);
    await page.getByTestId("stations-save").click();
    await expect(page.getByTestId("stations-save-state")).toHaveAttribute("data-save-state", "saved", { timeout: 30_000 });
    await expect.poll(async () => (await station())?.id ?? null, { timeout: 20_000 }).not.toBeNull();
    stationId = (await station())!.id;

    // A live ticket on the station (as a submitted check leaves it).
    const { data: anyOrder } = await sb.from("orders").select("id").eq("tenant_id", JOURNEYS_TENANT_ID).eq("status", "paid").limit(1).maybeSingle();
    const { data: ticket, error: ticketErr } = await sb
      .from("preparation_tickets")
      .insert({ tenant_id: JOURNEYS_TENANT_ID, order_id: (anyOrder as { id: string }).id, station: code, destination: "table", status: "queued", station_id: stationId })
      .select("id")
      .single();
    expect(ticketErr, ticketErr?.message).toBeNull();
    ticketId = (ticket as { id: string }).id;
    await page.getByTestId(`stations-row-${code}`).click();
    await page.getByTestId("stations-delete").click();
    await expect(page.getByTestId("stations-save-state")).toHaveAttribute("data-save-state", "failed", { timeout: 30_000 });
    await expect(page.getByTestId("stations-save-state")).toContainText("That station still has tickets or items.");
    expect((await station())?.id).toBe(stationId);

    await sb.from("preparation_tickets").delete().eq("id", ticketId);
    ticketId = null;
    await page.getByTestId("stations-delete").click();
    await expect(page.getByTestId("stations-save-state")).toHaveAttribute("data-save-state", "saved", { timeout: 30_000 });
    await expect.poll(async () => (await station())?.id ?? null, { timeout: 20_000 }).toBeNull();
    stationId = null;

    // ── Tables › T4 › Fire starters ────────────────────────────────────
    await releaseFloorProof();
    await signInJourneysStaff(page, "/admin/pos?mode=floor");
    await expect(card(page, "T4")).toHaveAttribute("data-floor-state", "free", { timeout: 30_000 });
    await tapTable(page, "T4");
    await sheet(page, "T4").locator("[data-floor-seat]").click();
    const seatSheet = page.locator('[data-pos-sheet="seat-party"]');
    await expect(seatSheet).toBeVisible();
    await seatSheet.getByRole("button", { name: /^seat \d+ guests? at T4$/i }).click();
    await expect(card(page, "T4")).toHaveAttribute("data-floor-state", "occupied", { timeout: 30_000 });
    const visit = await openVisitOn(FLOOR_T4);
    expect(visit, "open visit on T4").not.toBeNull();
    await tapTable(page, "T4");
    await sheet(page, "T4").locator("[data-floor-open-order]").click();
    await expect(page).toHaveURL(/mode=counter&order=/, { timeout: 30_000 });
    await counterAddItem(page, "House pizza");
    await counterAddItem(page, "Garlic bread");
    const { data: draft } = await sb.from("orders").select("id").eq("visit_id", visit!.id).eq("status", "draft").maybeSingle();
    const orderId = (draft as { id: string }).id;
    const { data: lines } = await sb.from("order_lines").select("id, label").eq("order_id", orderId);
    const pizza = ((lines ?? []) as { id: string; label: string }[]).find((l) => /pizza/i.test(l.label))!;
    const garlic = ((lines ?? []) as { id: string; label: string }[]).find((l) => /garlic/i.test(l.label))!;
    expect(pizza && garlic, "both lines on the check").toBeTruthy();
    await sb.from("order_lines").update({ course_seq: 1 }).eq("id", pizza.id);
    await sb.from("order_lines").update({ course_seq: 2 }).eq("id", garlic.id);
    const { count: ticketsBefore } = await sb.from("preparation_tickets").select("id", { count: "exact", head: true }).eq("order_id", orderId);

    await page.goto("/admin/pos?mode=floor");
    await tapTable(page, "T4");
    await sheet(page, "T4").locator('[data-floor-action="fire-course-1"]').click();
    await expect
      .poll(async () => (await sb.from("preparation_tickets").select("id", { count: "exact", head: true }).eq("order_id", orderId)).count ?? 0, { timeout: 30_000 })
      .toBe((ticketsBefore ?? 0) + 1);
    const { data: fired } = await sb.from("preparation_tickets").select("id, status").eq("order_id", orderId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const { data: rev } = await sb.from("preparation_ticket_revisions").select("snapshot").eq("ticket_id", (fired as { id: string }).id).order("revision", { ascending: false }).limit(1).maybeSingle();
    const snap = (rev as { snapshot: { lines: { label: string }[] } } | null)?.snapshot;
    expect(snap?.lines.map((l) => l.label), "only course 1 on the ticket").toEqual([pizza.label]);
  } finally {
    if (ticketId) await sb.from("preparation_tickets").delete().eq("id", ticketId);
    if (stationId) await sb.from("prep_stations").delete().eq("id", stationId);
    await releaseFloorProof();
  }
});
