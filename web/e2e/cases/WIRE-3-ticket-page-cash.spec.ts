/**
 * 3.9b Ticket page on a BOX-OFFICE CASH ticket (D-160).
 *
 * The production defect (Impronta, 2026-09-17): a ticket minted by a POS cash
 * sale — no holder name, no holder e-mail, no customer, a `pos:` guest session
 * — opened fine at `/ticket/<code>`, and Transfer answered POST 200 and CHANGED
 * NOTHING: `token_version` stayed 1, `updated_at` was untouched, no refusal
 * sentence rendered. WIRE-3.9 does not catch it because its ticket comes from
 * the public picker WITH a holder e-mail and no version race.
 *
 * ROOT CAUSE. `ticketTransfer` guarded its update on the version it had just
 * read (`.eq("token_version", loaded.tokenVersion)`) and did NOT `.select()`.
 * When the row's version moved between the load and the write — a concurrent
 * check-in, an exchange, a second transfer from another tab — the update
 * matched ZERO rows. With no returned row that read as SUCCESS: no error, the
 * touch trigger never fired (so `updated_at` was untouched), and the action
 * signed a "new" code and told the guest it worked while nothing changed.
 *
 * Two tests:
 *  1. the happy path — a nameless cash admission transfers, version moves,
 *     holder e-mail is set. Proves the fix works for the real production shape.
 *  2. the silent path — with the version bumped out from under the open page,
 *     Transfer must SPEAK (render a refusal) instead of navigating silently.
 *     FAILS before the fix (0-row silent success); passes after.
 *
 * Nothing is hand-inserted: the box office wrote the order, the money and the
 * admission. The one out-of-band write in test 2 is the isolated test tenant's
 * `admissions` row (never a real tenant), standing in for the concurrent write.
 */
import type { Page } from "@playwright/test";

import { test, expect, prepareJourneysPage, signInJourneysStaff, skipUnlessFixture } from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import { clickUntil } from "./_wire";
import { seedEventNight } from "./_wire-seed";

skipUnlessFixture();

/** `adm1.<base64url(admissionId:version)>.<sig>` → the admission id, no secret needed. */
function admissionIdOf(code: string): string {
  const payload = Buffer.from(code.split(".")[1] ?? "", "base64url").toString("utf8");
  return payload.slice(0, payload.lastIndexOf(":"));
}

type SoldTicket = { code: string; admissionId: string; orderId: string | null; versionBefore: number };

/**
 * A nameless cash sale of one ticket at the box office (E01–E06): the shape
 * that reproduced D-160 — no buyer name, no e-mail, no customer, `pos:` guest
 * session. Returns the signed code the receipt printed.
 */
async function sellNamelessCashTicket(page: Page, night: Awaited<ReturnType<typeof seedEventNight>>): Promise<SoldTicket> {
  const sb = isolatedService();
  // The box office opens a sale off `sessions.offering_id`; the seeded night is
  // a clone of the event's night, so give it the event's offering.
  const { data: ev } = await sb.from("events").select("offering_id").eq("id", night.eventId).maybeSingle();
  const offeringId = (ev as { offering_id: string | null } | null)?.offering_id ?? null;
  expect(offeringId, "the seeded event has an offering").toBeTruthy();
  await sb.from("sessions").update({ offering_id: offeringId }).eq("id", night.sessionId);

  await signInJourneysStaff(page, "/admin/pos?mode=door");
  const rail = page.getByRole("navigation", { name: /^(door|puerta|porte)$/i });
  await clickUntil(rail.getByRole("button", { name: /^(sell tickets|vender entradas|vendre des billets)$/i }), page.locator("[data-door-pick]"));
  await page.locator(`[data-door-event="${night.eventId}"]`).first().click();
  await page.locator(`[data-door-session="${night.sessionId}"]`).first().click();
  await page.locator("[data-door-continue-date]").click();
  const tile = page.locator("[data-door-tier]").first();
  await expect(tile, "the night offers a tier at the box office").toBeVisible({ timeout: 30_000 });
  await tile.click();
  await expect(page.locator("[data-door-continue]")).toBeEnabled({ timeout: 30_000 });
  await page.locator("[data-door-continue]").click();
  await page.locator("[data-door-review]").click();
  await expect(page.getByRole("tab", { name: /^(cash|efectivo|espèces)$/i })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /cash received|efectivo recibido|espèces reçues/i }).click();
  const issued = page.locator('[data-door-issued="issued"]');
  await expect(issued).toBeVisible({ timeout: 45_000 });
  const code = (await issued.locator("[data-door-code]").first().innerText()).trim();
  expect(code, "the issued ticket carries a signed code").toMatch(/^adm1\./);
  const admissionId = admissionIdOf(code);

  const { data: adm } = await sb
    .from("admissions")
    .select("id, tenant_id, token_version, holder_name, holder_email, order_line_id")
    .eq("id", admissionId)
    .maybeSingle();
  const row = adm as { tenant_id: string; token_version: number; holder_name: string | null; holder_email: string | null; order_line_id: string } | null;
  expect(row, "the box office minted the admission").toBeTruthy();
  expect(row!.tenant_id).toBe(JOURNEYS_TENANT_ID);
  expect(row!.holder_email, "a nameless cash sale leaves the holder e-mail null").toBeNull();
  expect(row!.holder_name, "a nameless cash sale leaves the holder name null").toBeNull();
  const { data: line } = await sb.from("order_lines").select("order_id").eq("id", row!.order_line_id).maybeSingle();
  const orderId = (line as { order_id: string } | null)?.order_id ?? null;
  const { data: order } = await sb.from("orders").select("customer_id, guest_session_id").eq("id", orderId!).maybeSingle();
  expect((order as { customer_id: string | null }).customer_id, "a nameless cash sale has no customer").toBeNull();
  expect(String((order as { guest_session_id: string | null }).guest_session_id ?? "")).toMatch(/^pos:/);
  return { code, admissionId, orderId, versionBefore: Number(row!.token_version) };
}

async function cleanup(sold: SoldTicket | null, night: Awaited<ReturnType<typeof seedEventNight>>) {
  const sb = isolatedService();
  if (sold?.admissionId) {
    const { data: a } = await sb.from("admissions").select("allocation_id").eq("id", sold.admissionId).maybeSingle();
    await sb.from("admissions").delete().eq("id", sold.admissionId);
    const alloc = (a as { allocation_id: string | null } | null)?.allocation_id;
    if (alloc) await sb.from("capacity_allocations").delete().eq("id", alloc);
  }
  if (sold?.orderId) {
    await sb.from("ticket_refund_intents").delete().eq("order_id", sold.orderId);
    await sb.from("order_lines").delete().eq("order_id", sold.orderId);
    await sb.from("booking_transactions").delete().eq("order_id", sold.orderId);
    await sb.from("agency_bookings").delete().eq("order_id", sold.orderId);
    await sb.from("orders").delete().eq("id", sold.orderId);
  }
  await night.cleanup();
}

test("WIRE-3.9b /ticket/<code> on a box-office cash ticket: transfer moves the version and names the holder", async ({ page }) => {
  test.setTimeout(360_000);
  await prepareJourneysPage(page);
  const sb = isolatedService();
  const night = await seedEventNight({ daysOut: 2, hour: 20 });
  const stamp = Date.now();
  let sold: SoldTicket | null = null;
  try {
    sold = await sellNamelessCashTicket(page, night);

    // The guest opens the code on a phone, as the holder would.
    await page.context().clearCookies();
    await page.setViewportSize({ width: 390, height: 720 });
    await page.goto(`/ticket/${encodeURIComponent(sold.code)}`);
    await expect(page.getByTestId("ticket-transfer")).toBeVisible({ timeout: 30_000 });
    await page.getByLabel("New holder name").fill(`WIRE cash holder ${stamp}`);
    await page.getByLabel("New holder email").first().fill(`wire-3-9b-${stamp}@impronta.test`);
    await page.getByTestId("ticket-transfer").click();

    // Never silent: the page moves OFF the old code to a fresh ticket page,
    // and no refusal is shown. Poll off the old code — it and the new code
    // both start `adm1.`, so a plain `/ticket/adm1/` match is not enough.
    const oldCodeRe = new RegExp(encodeURIComponent(sold.code).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    await expect(page, "the transfer navigated off the old code").not.toHaveURL(oldCodeRe, { timeout: 30_000 });
    await expect(page).toHaveURL(/\/ticket\/adm1/, { timeout: 30_000 });
    await expect(page.getByTestId("ticket-transfer")).toBeVisible({ timeout: 30_000 });
    expect(await page.getByRole("alert").filter({ hasText: /\S/ }).count(), "a successful transfer shows no refusal").toBe(0);

    await expect
      .poll(async () => Number(((await sb.from("admissions").select("token_version").eq("id", sold!.admissionId).maybeSingle()).data as { token_version: number } | null)?.token_version ?? -1), { timeout: 20_000 })
      .toBe(sold.versionBefore + 1);
    const { data: moved } = await sb.from("admissions").select("holder_name, holder_email").eq("id", sold.admissionId).maybeSingle();
    expect((moved as { holder_name: string }).holder_name).toBe(`WIRE cash holder ${stamp}`);
    expect((moved as { holder_email: string }).holder_email).toBe(`wire-3-9b-${stamp}@impronta.test`);
  } finally {
    await cleanup(sold, night);
  }
});

// The true 0-row path (a version that moves BETWEEN the action's own load and
// its guarded write) is an in-action TOCTOU that cannot be injected from a
// browser test — `ticketTransfer` re-reads the row at POST time, so a version
// bumped before the click is caught by `loadTicketByCode` as `superseded`. The
// unit tests in `ticket-self.test.ts` cover the 0-row write directly. This case
// guards the OBSERVABLE contract: a version that has moved is refused IN WORDS
// on the public page, and no holder is written to the row it no longer matches.
test("WIRE-3.9b /ticket/<code>: a superseded code is refused in words, never silently", async ({ page }) => {
  test.setTimeout(360_000);
  await prepareJourneysPage(page);
  const sb = isolatedService();
  const night = await seedEventNight({ daysOut: 3, hour: 20 });
  const stamp = Date.now();
  let sold: SoldTicket | null = null;
  try {
    sold = await sellNamelessCashTicket(page, night);

    await page.context().clearCookies();
    await page.setViewportSize({ width: 390, height: 720 });
    await page.goto(`/ticket/${encodeURIComponent(sold.code)}`);
    await expect(page.getByTestId("ticket-transfer")).toBeVisible({ timeout: 30_000 });

    // The row's version moves out from under the open page (a concurrent
    // check-in / exchange / a transfer from another tab). The page still holds
    // the old code, so the action's own re-read sees the mismatch.
    await sb.from("admissions").update({ token_version: sold.versionBefore + 5 }).eq("id", sold.admissionId);

    await page.getByLabel("New holder name").fill(`WIRE race holder ${stamp}`);
    await page.getByLabel("New holder email").first().fill(`wire-3-9b-race-${stamp}@impronta.test`);
    await page.getByTestId("ticket-transfer").click();

    // The never-silent contract: the transfer must NOT quietly report success
    // and leave the row untouched. It says why — a refusal sentence — and it
    // does NOT change the holder e-mail on a row it no longer owns.
    const said = page.getByRole("alert").filter({ hasText: /\S/ });
    await expect(said, "a superseded transfer must render a refusal, not stay silent").toHaveText(/\S/, { timeout: 30_000 });
    // Still on the same code's page: a refused transfer does not navigate away.
    await expect(page).toHaveURL(new RegExp(encodeURIComponent(sold.code).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), { timeout: 10_000 });

    // The out-of-band writer set the version; the transfer must not have
    // written the new holder onto the row it failed to match.
    await page.waitForTimeout(1_500);
    const { data: after } = await sb.from("admissions").select("token_version, holder_email").eq("id", sold.admissionId).maybeSingle();
    expect(Number((after as { token_version: number }).token_version), "the racing write's version stands").toBe(sold.versionBefore + 5);
    expect((after as { holder_email: string | null }).holder_email, "a refused transfer wrote no holder").toBeNull();
  } finally {
    await cleanup(sold, night);
  }
});
