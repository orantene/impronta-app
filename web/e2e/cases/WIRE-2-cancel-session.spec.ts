/**
 * 2.4 Cancel session with scope + paid seats banner (W39 panel).
 * Ground truth: the scoped sessions are cancelled, their pools deactivated,
 * valid admissions voided, and a `ticket_refund_intents` row opened for each
 * paid seat. Refusal: a cancelled session's panel closes the door itself
 * (disabled-by-design with its reason); the engine's `already_cancelled` is
 * unreachable from the screen.
 */
import { test, expect, prepareJourneysPage, signInJourneysStaff, skipUnlessFixture } from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import { clickUntil } from "./_wire";
import { seedSeries } from "./_wire-seed";

skipUnlessFixture();

async function openSessionPanel(page: import("@playwright/test").Page, sessionId: string) {
  const row = page.locator(`[data-session-row="${sessionId}"]`);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await clickUntil(row.getByRole("button").first(), page.getByTestId("session-panel"));
}

test("WIRE-2.4 cancel with scope Future cancels the later sessions, voids seats, queues refunds; a cancelled one is closed", async ({ page }) => {
  test.setTimeout(300_000);
  await prepareJourneysPage(page);
  const sb = isolatedService();
  const seed = await seedSeries({ title: `WIRE cancel ${Date.now()}`, statuses: ["scheduled", "scheduled", "scheduled"], seats: 2 });
  const [s1, s2, s3] = seed.sessionIds;
  // A paid seat on s2: a valid admission plus a paid order line for that session.
  const { data: adm, error: admErr } = await sb
    .from("admissions")
    .insert({ tenant_id: JOURNEYS_TENANT_ID, session_id: s2, status: "valid", party_size: 1, holder_name: "WIRE paid seat" })
    .select("id")
    .single();
  expect(admErr, admErr?.message).toBeNull();
  const admissionId = (adm as { id: string }).id;
  const { data: buyer, error: buyerErr } = await sb
    .from("customers")
    .insert({ tenant_id: JOURNEYS_TENANT_ID, email: `wire-cancel-${Date.now()}@impronta.test`, display_name: "WIRE paid seat" })
    .select("id")
    .single();
  expect(buyerErr, buyerErr?.message).toBeNull();
  const customerId = (buyer as { id: string }).id;
  const { data: order, error: orderErr } = await sb
    .from("orders")
    .insert({ tenant_id: JOURNEYS_TENANT_ID, customer_id: customerId, status: "paid", source_channel: "pos", currency: "USD", subtotal_cents: 1500, total_cents: 1500 })
    .select("id")
    .single();
  expect(orderErr, orderErr?.message).toBeNull();
  const orderId = (order as { id: string }).id;
  const { data: line, error: lineErr } = await sb
    .from("order_lines")
    .insert({ tenant_id: JOURNEYS_TENANT_ID, order_id: orderId, session_id: s2, label: "WIRE paid seat", units: 1, unit_cents: 1500, total_cents: 1500, owner_tenant_id: JOURNEYS_TENANT_ID })
    .select("id")
    .single();
  expect(lineErr, lineErr?.message).toBeNull();
  const lineId = (line as { id: string }).id;
  try {
    await signInJourneysStaff(page, "/admin/appointments?view=sessions");
    await openSessionPanel(page, s2);
    await page.getByRole("button", { name: "Future sessions", exact: true }).click();
    await page.getByTestId("session-cancel").click();
    const form = page.getByTestId("session-cancel-form");
    await expect(form).toBeVisible({ timeout: 20_000 });
    await form.getByTestId("session-cancel-reason").fill("WIRE-2.4 instructor ill");
    await form.getByRole("button", { name: "Cancel session", exact: true }).click();
    await expect(page.getByTestId("session-cancel-message")).toHaveText("2 session(s) cancelled.", { timeout: 30_000 });
    await expect(page.getByTestId("session-cancel-refunds"), "paid seats banner").toBeVisible();

    const { data: rows } = await sb.from("sessions").select("id, status").in("id", seed.sessionIds);
    const status = Object.fromEntries(((rows ?? []) as { id: string; status: string }[]).map((r) => [r.id, r.status]));
    expect(status[s1]).toBe("scheduled");
    expect(status[s2]).toBe("cancelled");
    expect(status[s3]).toBe("cancelled");
    const { data: pools } = await sb.from("capacity_pools").select("subject_id, is_active").in("subject_id", seed.sessionIds);
    for (const p of (pools ?? []) as { subject_id: string; is_active: boolean }[]) {
      expect(p.is_active, `pool on ${p.subject_id === s1 ? "s1" : "cancelled session"}`).toBe(p.subject_id === s1);
    }
    const { data: voided } = await sb.from("admissions").select("status").eq("id", admissionId).maybeSingle();
    expect((voided as { status: string } | null)?.status).toBe("void");
    const { data: intent } = await sb.from("ticket_refund_intents").select("reason, order_id").eq("order_line_id", lineId).maybeSingle();
    expect((intent as { reason: string } | null)?.reason).toBe("session_cancelled");
    expect((intent as { order_id: string } | null)?.order_id).toBe(orderId);

    // Refusal: the cancelled session's door is closed with its reason; nothing changes.
    await openSessionPanel(page, s3);
    const door = page.getByTestId("session-cancel");
    await expect(door).toBeDisabled();
    await expect(door).toHaveAttribute("title", "This session is no longer on sale, so its places cannot change.");
    await expect(page.getByTestId("session-cancel-form")).toHaveCount(0);
    const { count: intents } = await sb.from("ticket_refund_intents").select("id", { count: "exact", head: true }).eq("order_id", orderId);
    expect(intents).toBe(1);
  } finally {
    await sb.from("ticket_refund_intents").delete().eq("order_id", orderId);
    await sb.from("order_lines").delete().eq("id", lineId);
    await sb.from("orders").delete().eq("id", orderId);
    await sb.from("customers").delete().eq("id", customerId);
    await seed.cleanup();
  }
});
