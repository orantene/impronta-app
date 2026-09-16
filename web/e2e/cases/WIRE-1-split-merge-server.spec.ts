/**
 * 1.9 Split check (T18), merge checks (T16), change server (T17).
 * Refusal: merge a paid check → lines_paid.
 */
import {
  test,
  expect,
  prepareJourneysPage,
  signInJourneysStaff,
  counterAddItem,
  counterCollectCash,
  expectCounterPaid,
  skipUnlessFixture,
} from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import { FLOOR_T2, FLOOR_T4, openVisitOn, releaseFloorProof } from "./_floor-db";
import { WIRE_SENTENCE, assertEnglishRefusal, latestOrderIdByUrl, readOrder } from "./_wire";

skipUnlessFixture();

type Page = import("@playwright/test").Page;

function card(page: Page, code: string) {
  return page.locator(`li[data-floor-table="${code}"]`);
}
function sheet(page: Page, code: string) {
  return page.locator(`[data-floor-sheet="${code}"]`);
}
async function tapTable(page: Page, code: string) {
  if (await sheet(page, code).isVisible()) return;
  for (let attempt = 0; attempt < 5 && !(await sheet(page, code).isVisible()); attempt += 1) {
    await card(page, code).getByRole("button").first().click();
    await page.waitForTimeout(1_000);
  }
  await expect(sheet(page, code)).toBeVisible({ timeout: 20_000 });
}

test("WIRE-1.9 split, change server, and refuse merging a paid check", async ({ page }) => {
  test.setTimeout(360_000);
  await prepareJourneysPage(page);
  await releaseFloorProof();
  await signInJourneysStaff(page, "/admin/pos?mode=floor");
  await expect(card(page, "T4")).toBeVisible({ timeout: 30_000 });

  if ((await card(page, "T4").getAttribute("data-floor-state")) !== "occupied") {
    await tapTable(page, "T4");
    await sheet(page, "T4").locator("[data-floor-seat]").click();
    await expect(page.locator('[data-pos-sheet="seat-party"]')).toBeVisible();
    await page.locator('[data-pos-sheet="seat-party"]').getByRole("button", { name: /seat 2 guests at T4/i }).click();
    await expect(card(page, "T4")).toHaveAttribute("data-floor-state", "occupied", { timeout: 30_000 });
  }

  const seated = await openVisitOn(FLOOR_T4);
  expect(seated, "failed-fixture: no open visit on T4").not.toBeNull();

  await tapTable(page, "T4");
  await sheet(page, "T4").locator("[data-floor-open-order]").click();
  await expect(page).toHaveURL(/mode=counter&order=/, { timeout: 30_000 });
  // Two different items: a repeat of the same tile adds a unit, not a line.
  await counterAddItem(page, "House pizza");
  await counterAddItem(page, "Garlic bread");

  await page.goto("/admin/pos?mode=floor");
  await expect(card(page, "T4")).toHaveAttribute("data-floor-state", "occupied", { timeout: 30_000 });
  await tapTable(page, "T4");
  await sheet(page, "T4").locator('[data-floor-action="split"]').click();
  const splitLine = page.locator("[data-floor-split-line]").first();
  await expect(splitLine).toBeVisible({ timeout: 20_000 });
  await splitLine.click();
  await page.locator("[data-floor-split-confirm]").click();
  // The split sheet closing is the screen's confirmation; the rows follow it.
  await expect(page.locator('[data-pos-sheet="split-check"]')).toHaveCount(0, { timeout: 20_000 });

  const sb = isolatedService();
  await expect
    .poll(
      async () => {
        const { count: draftCount } = await sb
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("visit_id", seated!.id)
          .eq("status", "draft");
        return draftCount ?? 0;
      },
      { timeout: 20_000, message: "split writes a second draft on the visit" },
    )
    .toBeGreaterThanOrEqual(2);

  await tapTable(page, "T4");
  await sheet(page, "T4").locator('[data-floor-action="change-server"]').click();
  const server = page.locator("[data-floor-server]").first();
  await expect(server).toBeVisible({ timeout: 20_000 });
  const serverId = await server.getAttribute("data-floor-server");
  await server.click();
  await page.locator("[data-floor-server-confirm]").click();
  // The sheet closing is the screen's confirmation; the row follows it.
  await expect(page.locator('[data-pos-sheet="change-server"]')).toHaveCount(0, { timeout: 20_000 });
  await expect
    .poll(
      async () => {
        const { data: afterServer } = await sb.from("visits").select("server_user_id").eq("id", seated!.id).maybeSingle();
        return (afterServer as { server_user_id: string | null } | null)?.server_user_id ?? null;
      },
      { timeout: 20_000, message: "visits.server_user_id must be the chosen person" },
    )
    .toBe(serverId);
  expect(serverId, "a person was offered").toBeTruthy();

  await tapTable(page, "T4");
  await sheet(page, "T4").locator("[data-floor-open-order]").click();
  await expect(page).toHaveURL(/order=/, { timeout: 30_000 });
  const collectedOrderId = await latestOrderIdByUrl(page);
  await counterCollectCash(page);
  await expectCounterPaid(page);
  // The visit carries two checks after the split; read the one just collected.
  const paid = await readOrder(collectedOrderId);
  expect(paid.status).toBe("paid");

  // Refusal: a check with money already taken cannot merge. The engine
  // merges the two visits' DRAFT checks and refuses `lines_paid` when either
  // carries a paid `booking_transactions` row (visit_check_ops.sql); a fully
  // paid check is not a candidate at all. So: T4 keeps its split remainder
  // (draft) with a paid partial on it, T2 gets a fresh seated check, and the
  // merge T2 → T4 must be refused with nothing moved.
  const { data: remainder } = await sb
    .from("orders")
    .select("id")
    .eq("visit_id", seated!.id)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  expect(remainder, "the split remainder stays a draft on T4").toBeTruthy();
  const remainderId = (remainder as { id: string }).id;
  // The ledger needs the order's shell booking (what `settleAtDoor` ensures).
  const shell = await sb
    .from("agency_bookings")
    .insert({
      tenant_id: JOURNEYS_TENANT_ID,
      title: "POS sale",
      status: "confirmed",
      currency_code: "USD",
      total_client_revenue: 1,
      contact_name: "WIRE-1.9 seed",
      order_id: remainderId,
    })
    .select("id")
    .single();
  expect(shell.error, shell.error?.message).toBeNull();
  const shellId = (shell.data as { id: string }).id;
  const partial = await sb
    .from("booking_transactions")
    .insert({
      booking_id: shellId,
      order_id: remainderId,
      source_tenant_id: JOURNEYS_TENANT_ID,
      gross_amount_cents: 100,
      net_amount_cents: 100,
      currency: "USD",
      provider: "manual",
      provider_reference: `wire-1.9-partial:${remainderId}`,
      status: "draft",
      metadata: { seeded_by: "WIRE-1.9", paid_via: "cash" },
    })
    .select("id")
    .single();
  expect(partial.error, partial.error?.message).toBeNull();
  const partialId = (partial.data as { id: string }).id;
  // The ledger's lifecycle: draft → payment_requested → paid.
  const requested = await sb
    .from("booking_transactions")
    .update({ status: "payment_requested", requested_at: new Date().toISOString() })
    .eq("id", partialId);
  expect(requested.error, requested.error?.message).toBeNull();
  const paidPartial = await sb
    .from("booking_transactions")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", partialId);
  expect(paidPartial.error, paidPartial.error?.message).toBeNull();

  try {
    await page.goto("/admin/pos?mode=floor");
    await expect(card(page, "T2")).toHaveAttribute("data-floor-state", "free", { timeout: 30_000 });
    await tapTable(page, "T2");
    await sheet(page, "T2").locator("[data-floor-seat]").click();
    await expect(page.locator('[data-pos-sheet="seat-party"]')).toBeVisible();
    await page.locator('[data-pos-sheet="seat-party"]').getByRole("button", { name: /^seat \d+ guests? at T2$/i }).click();
    await expect(card(page, "T2")).toHaveAttribute("data-floor-state", "occupied", { timeout: 30_000 });
    await tapTable(page, "T2");
    await sheet(page, "T2").locator("[data-floor-open-order]").click();
    await expect(page).toHaveURL(/mode=counter&order=/, { timeout: 30_000 });
    await counterAddItem(page, "Garlic bread");
    const t2Visit = await openVisitOn(FLOOR_T2);
    expect(t2Visit, "T2 must carry an open visit").not.toBeNull();
    const { data: t2Draft } = await sb.from("orders").select("id").eq("visit_id", t2Visit!.id).eq("status", "draft").maybeSingle();
    const t2DraftId = (t2Draft as { id: string } | null)?.id ?? null;
    expect(t2DraftId, "T2's check is a draft").toBeTruthy();
    const { count: t2LinesBefore } = await sb.from("order_lines").select("id", { count: "exact", head: true }).eq("order_id", t2DraftId!);

    await page.goto("/admin/pos?mode=floor");
    await tapTable(page, "T4");
    await sheet(page, "T4").locator('[data-floor-action="move-or-join"]').click();
    const chooser = page.locator('[data-pos-sheet="table-change"]');
    await expect(chooser).toBeVisible();
    await chooser.locator('[data-floor-change="merge"] button').click();
    const mergeFrom = page.locator('[data-floor-merge-from="T2"]');
    await expect(mergeFrom).toBeVisible({ timeout: 20_000 });
    await mergeFrom.click();
    await page.locator("[data-floor-merge-confirm]").click();
    const banner = page.locator("[data-floor-refusal]");
    if ((await banner.count()) > 0) {
      await expect(banner).toContainText("Paid lines cannot move.");
    } else {
      await assertEnglishRefusal(page, WIRE_SENTENCE.linesPaid);
    }
    const { count: t2LinesAfter } = await sb.from("order_lines").select("id", { count: "exact", head: true }).eq("order_id", t2DraftId!);
    expect(t2LinesAfter, "no line moved off T2's check").toBe(t2LinesBefore);
    const { data: t2After } = await sb.from("orders").select("status").eq("id", t2DraftId!).maybeSingle();
    expect((t2After as { status: string } | null)?.status).toBe("draft");
  } finally {
    await sb.from("booking_transactions").delete().eq("id", partialId);
    await sb.from("agency_bookings").delete().eq("id", shellId);
  }
});
