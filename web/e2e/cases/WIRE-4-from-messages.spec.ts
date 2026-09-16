/**
 * 4.3 "From Messages" origin on Orders (Held sales), Receipts and the
 * kitchen ticket. Ground truth: `orders.source_channel='messages'` is what
 * each surface renders as the origin badge (seam 3, `sale-read.ts`).
 *
 * SEEDED: a draft and a paid order from a conversation, plus a prep ticket
 * on the draft; the fixture's own messages orders are older than the
 * Receipts window (one week).
 */
import { test, expect, prepareJourneysPage, signInJourneysStaff, skipUnlessFixture } from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import { clickUntil } from "./_wire";

skipUnlessFixture();

test("WIRE-4.3 Held sales, Receipts and the station say the sale came from Messages", async ({ page }) => {
  test.setTimeout(240_000);
  await prepareJourneysPage(page);
  const sb = isolatedService();
  const stamp = Date.now();
  const { data: customer } = await sb.from("customers").insert({ tenant_id: JOURNEYS_TENANT_ID, email: `wire-4-3-${stamp}@impronta.test`, display_name: "WIRE from Messages" }).select("id").single();
  const customerId = (customer as { id: string }).id;
  const mk = async (status: "draft" | "paid") => {
    const { data, error } = await sb
      .from("orders")
      .insert({ tenant_id: JOURNEYS_TENANT_ID, customer_id: customerId, status, source_channel: "messages", currency: "USD", subtotal_cents: 1800, total_cents: 1800 })
      .select("id")
      .single();
    if (error || !data) throw new Error(`seed ${status}: ${error?.message ?? "none"}`);
    const id = (data as { id: string }).id;
    await sb.from("order_lines").insert({ tenant_id: JOURNEYS_TENANT_ID, order_id: id, offering_id: "33330012-0000-4000-8000-000000000002", label: "House pizza", units: 1, unit_cents: 1800, total_cents: 1800, owner_tenant_id: JOURNEYS_TENANT_ID });
    return id;
  };
  const draftId = await mk("draft");
  const paidId = await mk("paid");
  const { data: ticket } = await sb
    .from("preparation_tickets")
    .insert({ tenant_id: JOURNEYS_TENANT_ID, order_id: draftId, station: "kitchen", destination: "counter", status: "queued" })
    .select("id")
    .single();
  const ticketId = (ticket as { id: string }).id;
  await sb.from("preparation_ticket_revisions").insert({ ticket_id: ticketId, revision: 1, snapshot: { lines: [{ label: "House pizza", units: 1 }], destination: "counter", station: "kitchen" } });
  try {
    // Orders desk: the counter's Held sales list.
    await signInJourneysStaff(page, "/admin/pos?mode=counter");
    await clickUntil(page.locator("[data-pos-open-held]"), page.locator("[data-pos-held]"));
    const held = page.locator(`[data-pos-held-sale="${draftId}"]`);
    await expect(held).toBeVisible({ timeout: 30_000 });
    await expect(held.locator("[data-pos-sale-origin='messages']")).toHaveText("from Messages");

    // Receipts.
    await clickUntil(page.getByRole("button", { name: "Receipts", exact: true }), page.locator("[data-pos-sale-origin='messages']").first());
    await expect(page.locator("[data-pos-sale-origin='messages']").first()).toContainText("from Messages");

    // The station's ticket.
    await signInJourneysStaff(page, "/admin/preparation");
    const card = page.locator(`[data-prep-ticket="${ticketId}"]`);
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card.locator("[data-prep-origin='messages']")).toBeVisible();
  } finally {
    await sb.from("preparation_ticket_revisions").delete().eq("ticket_id", ticketId);
    await sb.from("preparation_tickets").delete().eq("id", ticketId);
    await sb.from("order_lines").delete().in("order_id", [draftId, paidId]);
    await sb.from("orders").delete().in("id", [draftId, paidId]);
    await sb.from("customers").delete().eq("id", customerId);
  }
});
