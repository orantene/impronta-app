/**
 * 3.9 Ticket page: transfer, resend, lookup (E08–E10) at `/ticket/<code>`.
 * The signed code comes from the receipt of a real $0 ticket bought on the
 * public picker (the only honest minter: `signAdmissionToken` runs in the
 * app with the secret). Ground truth: transfer bumps `admissions.token_version`
 * and the new code opens; the OLD code is refused at the door's gate
 * (`superseded`). Resend is answered in words (the code is the ticket; an
 * email is attempted for the holder). Lookup: a wrong pair → `not_found`,
 * then, hammered, `too_many_attempts` (8 per minute per email).
 */
import { test, expect, prepareJourneysPage, signInJourneysStaff, skipUnlessFixture } from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID, QA_NIGHT_SLUG } from "./_isolated-db";
import { WIRE_SENTENCE, clickUntil } from "./_wire";
import { seedEventNight } from "./_wire-seed";

skipUnlessFixture();

test("WIRE-3.9 /ticket/<code>: transfer supersedes the old code at the gate, resend answers, lookup refuses then rate-limits", async ({ page }) => {
  test.setTimeout(360_000);
  await prepareJourneysPage(page);
  const sb = isolatedService();
  const night = await seedEventNight({ daysOut: 2, hour: 20 });
  const stamp = Date.now();
  const email = `wire-3-9-${stamp}@impronta.test`;
  let admissionId: string | null = null;
  try {
    // A real ticket on the seeded night, from the public picker.
    await page.goto(`/events/${QA_NIGHT_SLUG}`);
    const picker = page.locator("[data-ticket-picker=root]");
    await expect(picker).toBeVisible({ timeout: 30_000 });
    const nightRadio = picker.locator(`input[name=night][value="${night.sessionId}"]`);
    await expect(nightRadio, "the seeded night is on sale").toBeAttached({ timeout: 30_000 });
    await nightRadio.check();
    await picker.locator("input[name=tier]").first().check();
    await picker.locator("input[type=email]").fill(email);
    await picker.locator("input[autocomplete=name]").fill(`WIRE holder ${stamp}`);
    await picker.getByRole("button", { name: /get your ticket/i }).click();
    await expect(page).toHaveURL(/\/r\/[A-Za-z0-9]+/, { timeout: 60_000 });
    const oldCode = ((await page.locator("code").filter({ hasText: /^adm1\./ }).first().textContent()) ?? "").trim();
    expect(oldCode).toMatch(/^adm1\./);
    const { data: adm } = await sb.from("admissions").select("id, token_version").eq("tenant_id", JOURNEYS_TENANT_ID).eq("holder_email", email).maybeSingle();
    admissionId = (adm as { id: string } | null)?.id ?? null;
    expect(admissionId, "admission for the bought ticket").toBeTruthy();
    const versionBefore = Number((adm as { token_version: number }).token_version ?? 0);

    // Transfer: a new code opens, the row's version moved.
    await page.goto(`/ticket/${encodeURIComponent(oldCode)}`);
    await expect(page.getByTestId("ticket-transfer")).toBeVisible({ timeout: 30_000 });
    await page.getByLabel("New holder name").fill(`WIRE new holder ${stamp}`);
    await page.getByLabel("New holder email").fill(`wire-3-9-new-${stamp}@impronta.test`);
    await page.getByTestId("ticket-transfer").click();
    await expect(page).not.toHaveURL(new RegExp(encodeURIComponent(oldCode).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), { timeout: 30_000 });
    await expect(page).toHaveURL(/\/ticket\/adm1/, { timeout: 30_000 });
    await expect(page.getByTestId("ticket-transfer")).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(async () => Number(((await sb.from("admissions").select("token_version").eq("id", admissionId!).maybeSingle()).data as { token_version: number } | null)?.token_version ?? -1), { timeout: 20_000 })
      .toBe(versionBefore + 1);
    const { data: moved } = await sb.from("admissions").select("holder_name").eq("id", admissionId!).maybeSingle();
    expect((moved as { holder_name: string }).holder_name).toBe(`WIRE new holder ${stamp}`);

    // Resend: answered in words on the new code's page.
    await page.getByTestId("ticket-resend").click();
    await expect(page.getByRole("status").or(page.getByRole("alert")).first()).toBeVisible({ timeout: 30_000 });
    const resendText = ((await page.getByRole("status").or(page.getByRole("alert")).first().textContent()) ?? "").trim();
    expect(resendText.length).toBeGreaterThan(0);

    // Lookup: a wrong pair is `not_found`; hammered, `too_many_attempts`.
    await page.getByLabel(/email/i).last().fill(`nobody-${stamp}@impronta.test`);
    await page.getByLabel("Last four of the receipt").fill("0000");
    await page.getByTestId("ticket-lookup").click();
    await expect(page.getByRole("alert")).toHaveText(WIRE_SENTENCE.notFound, { timeout: 30_000 });
    for (let i = 0; i < 9; i += 1) {
      await page.getByTestId("ticket-lookup").click();
      await page.waitForTimeout(300);
    }
    await expect(page.getByRole("alert")).toHaveText(WIRE_SENTENCE.tooManyAttempts, { timeout: 30_000 });

    // The old code at the door's gate: superseded.
    await signInJourneysStaff(page, "/admin/pos?mode=door");
    await clickUntil(page.locator(`[data-door-session="${night.sessionId}"]`), page.getByPlaceholder("Scan or type a ticket code"));
    await page.getByPlaceholder("Scan or type a ticket code").fill(oldCode);
    await page.getByRole("button", { name: "Admit", exact: true }).click();
    await expect(page.locator("[data-door-verdict='superseded']")).toBeVisible({ timeout: 30_000 });
    const { data: notIn } = await sb.from("admissions").select("admitted_count").eq("id", admissionId!).maybeSingle();
    expect(Number((notIn as { admitted_count: number }).admitted_count)).toBe(0);
  } finally {
    if (admissionId) {
      const { data: a } = await sb.from("admissions").select("order_line_id, allocation_id").eq("id", admissionId).maybeSingle();
      const lineId = (a as { order_line_id: string | null } | null)?.order_line_id;
      await sb.from("admissions").delete().eq("id", admissionId);
      const alloc = (a as { allocation_id: string | null } | null)?.allocation_id;
      if (alloc) await sb.from("capacity_allocations").delete().eq("id", alloc);
      if (lineId) {
        const { data: l } = await sb.from("order_lines").select("order_id").eq("id", lineId).maybeSingle();
        const orderId = (l as { order_id: string } | null)?.order_id;
        if (orderId) {
          await sb.from("ticket_refund_intents").delete().eq("order_id", orderId);
          await sb.from("order_lines").delete().eq("order_id", orderId);
          await sb.from("booking_transactions").delete().eq("order_id", orderId);
          await sb.from("agency_bookings").delete().eq("order_id", orderId);
          await sb.from("orders").delete().eq("id", orderId);
        }
      }
    }
    await night.cleanup();
  }
});
