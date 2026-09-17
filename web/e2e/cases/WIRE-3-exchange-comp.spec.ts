/**
 * 3.8 Exchange (E11), comp (E12), delivery (E15); multi-day (E14) is not
 * driven here (a series purchase needs the public checkout across nights;
 * recorded as not run). Ground truth: comp = a zero-priced order + a valid
 * `admissions` row; exchange moves `admissions.session_id` and bumps
 * `token_version`; delivery writes `admissions.delivery`.
 * Refusals: same night → the exchange picker offers only OTHER nights
 * (disabled-by-design; `same_session` unreachable from the door); sms /
 * wallet → drawn "Not offered" with no action (disabled-by-design;
 * `channel_unavailable` unreachable from the door).
 *
 * SEEDED: two future nights on the fixture's published event.
 */
import { test, expect, prepareJourneysPage, signInJourneysStaff, skipUnlessFixture } from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import { clickUntil } from "./_wire";
import { seedEventNight } from "./_wire-seed";

skipUnlessFixture();

const ZONE = "America/Mexico_City";
function localDay(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: ZONE, day: "numeric" }).format(new Date(iso));
}

test("WIRE-3.8 comp a ticket on Event Day (E12)", async ({ page }) => {
  test.setTimeout(360_000);
  await prepareJourneysPage(page);
  const sb = isolatedService();
  // Nights are cloned onto the fixture's QA Night event, whose own night the
  // seed puts at now + 2 days; two nights on one local day share a Dates
  // button, and the comp landed on the fixture's night (r2/r3 2026-09-17).
  // Days 4 and 5 keep clear of it.
  const nightA = await seedEventNight({ daysOut: 4, hour: 20 });
  const nightB = await seedEventNight({ daysOut: 5, hour: 20 });
  const stamp = Date.now();
  const holder = `WIRE comp ${stamp}`;
  let admissionId: string | null = null;
  let orderId: string | null = null;
  try {
    // ── Comp (E12): Events › event › Day ───────────────────────────────
    await signInJourneysStaff(page, `/admin/events?event=${nightA.eventId}&tab=day`);
    // The event's own Dates group (`EventDetail`): a page-wide `button[aria-pressed]`
    // matched another event's night on the same day (r2 2026-09-17: the comp
    // landed on the fixture's QA Night, which shares night A's date).
    const dateButton = page
      .getByRole("group", { name: "Dates", exact: true })
      .locator("button[aria-pressed]")
      .filter({ hasText: new RegExp(`\\b${localDay(nightA.startsAt)}\\b`) })
      .first();
    await expect(dateButton, "the seeded night is a date on the event").toBeVisible({ timeout: 30_000 });
    await dateButton.click();
    const comp = page.getByTestId("events-comp");
    await expect(comp).toBeVisible({ timeout: 30_000 });
    await comp.getByTestId("events-comp-name").fill(holder);
    await comp.getByTestId("events-comp-email").fill(`wire-comp-${stamp}@impronta.test`);
    await comp.getByTestId("events-comp-reason").fill("WIRE-3.8 press pass");
    const tierSelect = comp.getByTestId("events-comp-tier");
    const tiers = await tierSelect.locator("option").evaluateAll((els) => els.map((o) => (o as HTMLOptionElement).value).filter((v) => v.length > 0));
    expect(tiers.length, "failed-fixture: the event has a tier").toBeGreaterThan(0);
    await tierSelect.selectOption(tiers[0]);
    await comp.getByTestId("events-comp-save").click();
    await expect(comp.getByRole("status")).toHaveText("Complimentary ticket issued.", { timeout: 30_000 });
    await expect
      .poll(
        async () => {
          const { data } = await sb.from("admissions").select("id, status, session_id, order_line_id").eq("tenant_id", JOURNEYS_TENANT_ID).eq("holder_name", holder).maybeSingle();
          admissionId = (data as { id: string } | null)?.id ?? null;
          return data ? `${(data as { status: string }).status}:${(data as { session_id: string }).session_id}` : null;
        },
        { timeout: 20_000 },
      )
      .toBe(`valid:${nightA.sessionId}`);
    const { data: adm } = await sb.from("admissions").select("order_line_id, token_version").eq("id", admissionId!).maybeSingle();
    const { data: line } = await sb.from("order_lines").select("order_id, total_cents").eq("id", (adm as { order_line_id: string }).order_line_id).maybeSingle();
    orderId = (line as { order_id: string }).order_id;
    expect(Number((line as { total_cents: number }).total_cents), "a comp line is zero-priced").toBe(0);
    const { data: order } = await sb.from("orders").select("total_cents, status, customer_id, receipt_code").eq("id", orderId).maybeSingle();
    expect(Number((order as { total_cents: number }).total_cents)).toBe(0);
    // D-142: the paid comp order is reachable: the holder's customer (from
    // the email) and a receipt code, so orders_identified_before_payment holds.
    expect((order as { status: string }).status).toBe("paid");
    expect((order as { customer_id: string | null }).customer_id, "the holder is the order's customer").toBeTruthy();
    expect(((order as { receipt_code: string | null }).receipt_code ?? "").length).toBeGreaterThanOrEqual(16);
    const versionBefore = Number((adm as { token_version: number }).token_version ?? 0);

  } finally {
    if (admissionId) {
      const { data: a } = await sb.from("admissions").select("allocation_id").eq("id", admissionId).maybeSingle();
      await sb.from("admissions").delete().eq("id", admissionId);
      const alloc = (a as { allocation_id: string | null } | null)?.allocation_id;
      if (alloc) await sb.from("capacity_allocations").delete().eq("id", alloc);
    }
    if (orderId) {
      await sb.from("order_lines").delete().eq("order_id", orderId);
      await sb.from("agency_bookings").delete().eq("order_id", orderId);
      await sb.from("orders").delete().eq("id", orderId);
    }
    await nightB.cleanup();
    await nightA.cleanup();
  }
});

/** A paid ticket on night A, shaped the way the ticket picker leaves it. */
async function seedPaidTicket(sessionId: string, holder: string) {
  const sb = isolatedService();
  const stamp = Date.now();
  const { data: customer } = await sb.from("customers").insert({ tenant_id: JOURNEYS_TENANT_ID, email: `wire-ticket-${stamp}@impronta.test`, display_name: holder }).select("id").single();
  const customerId = (customer as { id: string }).id;
  const { data: order } = await sb
    .from("orders")
    .insert({ tenant_id: JOURNEYS_TENANT_ID, customer_id: customerId, status: "paid", source_channel: "ticket_picker", currency: "USD", subtotal_cents: 1200, total_cents: 1200 })
    .select("id")
    .single();
  const orderId = (order as { id: string }).id;
  const { data: line } = await sb
    .from("order_lines")
    .insert({ tenant_id: JOURNEYS_TENANT_ID, order_id: orderId, session_id: sessionId, label: "WIRE ticket", units: 1, unit_cents: 1200, total_cents: 1200, owner_tenant_id: JOURNEYS_TENANT_ID })
    .select("id")
    .single();
  const { data: adm, error } = await sb
    .from("admissions")
    .insert({ tenant_id: JOURNEYS_TENANT_ID, session_id: sessionId, order_line_id: (line as { id: string }).id, customer_id: customerId, holder_name: holder, holder_email: `wire-ticket-${stamp}@impronta.test`, status: "valid", party_size: 1 })
    .select("id, token_version")
    .single();
  if (error || !adm) throw new Error(`seedPaidTicket: ${error?.message ?? "none"}`);
  return {
    admissionId: (adm as { id: string }).id,
    tokenVersion: Number((adm as { token_version: number }).token_version ?? 0),
    cleanup: async () => {
      await sb.from("admissions").delete().eq("id", (adm as { id: string }).id);
      await sb.from("order_lines").delete().eq("order_id", orderId);
      await sb.from("orders").delete().eq("id", orderId);
      await sb.from("customers").delete().eq("id", customerId);
    },
  };
}

test("WIRE-3.8 exchange a ticket to another night at the door (E11) and deliver it by print (E15)", async ({ page }) => {
  test.setTimeout(300_000);
  await prepareJourneysPage(page);
  const sb = isolatedService();
  const nightA = await seedEventNight({ daysOut: 4, hour: 20 });
  const nightB = await seedEventNight({ daysOut: 5, hour: 20 });
  const holder = `WIRE ticket ${Date.now()}`;
  const ticket = await seedPaidTicket(nightA.sessionId, holder);
  const admissionId = ticket.admissionId;
  const versionBefore = ticket.tokenVersion;
  try {
    // ── Exchange (E11): Door › night A › Lookup › Change ────────────────
    await signInJourneysStaff(page, "/admin/pos?mode=door");
    await clickUntil(page.locator(`[data-door-session="${nightA.sessionId}"]`), page.locator("[data-door-lookup-toggle]"));
    await clickUntil(page.getByRole("button", { name: "Lookup", exact: true }), page.locator("[data-door-lookup-query]"));
    await page.locator("[data-door-lookup-query]").fill(holder);
    const change = page.locator(`[data-door-change="${admissionId}"]`);
    await expect(change, "the comp ticket is on tonight's door").toBeVisible({ timeout: 30_000 });
    await change.click();
    const panel = page.locator("[data-door-change-panel]");
    await expect(panel).toBeVisible({ timeout: 20_000 });
    const nights = panel.getByTestId("door-exchange-night");
    const options = await nights.locator("option").evaluateAll((els) => els.map((o) => (o as HTMLOptionElement).value));
    expect(options, "the same night is not offered (same_session closed at the door)").not.toContain(nightA.sessionId);
    expect(options).toContain(nightB.sessionId);
    await nights.selectOption(nightB.sessionId);
    await panel.getByTestId("door-exchange").click();
    await expect(panel.locator("[data-door-change-outcome='done']")).toHaveText("Moved to the new night. The old code no longer admits.", { timeout: 30_000 });
    await expect
      .poll(
        async () => {
          const { data } = await sb.from("admissions").select("session_id, token_version").eq("id", admissionId).maybeSingle();
          return `${(data as { session_id: string } | null)?.session_id}:${(data as { token_version: number } | null)?.token_version}`;
        },
        { timeout: 20_000 },
      )
      .toBe(`${nightB.sessionId}:${versionBefore + 1}`);

    // ── Delivery (E15): Door › night B › Lookup › Delivery ──────────────
    await signInJourneysStaff(page, "/admin/pos?mode=door");
    await clickUntil(page.locator(`[data-door-session="${nightB.sessionId}"]`), page.locator("[data-door-lookup-toggle]"));
    await clickUntil(page.getByRole("button", { name: "Lookup", exact: true }), page.locator("[data-door-lookup-query]"));
    await page.locator("[data-door-lookup-query]").fill(holder);
    await expect(page.locator(`[data-door-change="${admissionId}"]`)).toBeVisible({ timeout: 30_000 });
    await page.locator(`[data-door-change="${admissionId}"]`).locator("xpath=following-sibling::button[1]").click();
    const delivery = page.locator("[data-door-delivery-panel]");
    await expect(delivery).toBeVisible({ timeout: 20_000 });
    await expect(delivery.getByText("Not offered · text messages are not set up", { exact: true })).toBeVisible();
    await expect(delivery.getByTestId("door-deliver-sms")).toHaveCount(0);
    await expect(delivery.getByTestId("door-deliver-wallet")).toHaveCount(0);
    await delivery.getByTestId("door-deliver-print").click();
    await expect
      .poll(
        async () => {
          const { data } = await sb.from("admissions").select("delivery").eq("id", admissionId).maybeSingle();
          return JSON.stringify((data as { delivery: unknown } | null)?.delivery ?? null);
        },
        { timeout: 20_000 },
      )
      .toMatch(/print/);
  } finally {
    await ticket.cleanup();
    await nightB.cleanup();
    await nightA.cleanup();
  }
});
