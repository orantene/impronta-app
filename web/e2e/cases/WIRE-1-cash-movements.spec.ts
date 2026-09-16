/**
 * 1.11 Cash movements + close note / hand-over.
 * Refusal: movement on a closed shift.
 */
import {
  test,
  expect,
  prepareJourneysPage,
  openCounter,
  skipUnlessFixture,
} from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import { pressKeypad, clickUntil } from "./_wire";

skipUnlessFixture();

async function recordMovement(page: import("@playwright/test").Page, kind: string, digits: string) {
  await page.locator(`[data-pos-movement='${kind}']`).click();
  await pressKeypad(page, digits);
  await page.getByLabel(/^Reason/).fill(`WIRE-1.11 ${kind}`);
  await page.locator("[data-pos-movement-confirm]").click();
  await expect(page.locator(`[data-pos-movement-row='${kind}']`).first()).toBeVisible({
    timeout: 20_000,
  });
}

test("WIRE-1.11 Cash paid in/out/drop and close note", async ({ page }) => {
  test.setTimeout(240_000);
  await prepareJourneysPage(page);
  await openCounter(page);
  // The rail row "Cash" is the door (the badge hook only renders with a count).
  await clickUntil(page.getByRole("button", { name: "Cash", exact: true }), page.locator("[data-pos-movement='float_add']"));
  // No drawer open (a previous run closed it): open one with a counted float,
  // through the screen's own form. Movements wait for an open drawer.
  if (await page.locator("[data-pos-open-shift]").count()) {
    await page.locator("#pos-shift-opening").fill("100");
    await page.locator("[data-pos-open-shift]").click();
    await expect(page.locator("[data-pos-open-shift]")).toHaveCount(0, { timeout: 30_000 });
  }
  await expect(page.locator("[data-pos-movement='float_add']")).toBeEnabled({ timeout: 30_000 });
  await recordMovement(page, "float_add", "1000");
  await recordMovement(page, "paid_out", "200");
  await recordMovement(page, "drop", "300");

  const sb = isolatedService();
  const { data: shift } = await sb
    .from("pos_shifts")
    .select("id, close_note, handed_over_to, status")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  expect(shift).toBeTruthy();
  const shiftId = (shift as { id: string }).id;
  const { count } = await sb
    .from("pos_shift_movements")
    .select("id", { count: "exact", head: true })
    .eq("shift_id", shiftId);
  expect(count ?? 0).toBeGreaterThanOrEqual(3);

  await page.locator("[data-pos-close-and-count]").click();
  await expect(page.locator("#pos-shift-note")).toBeVisible({ timeout: 20_000 });
  await page.locator("#pos-shift-note").fill("WIRE-1.11 hand-over");
  await page.locator("#pos-shift-counted").fill("0");
  await page.locator("[data-pos-confirm-count]").check();
  await expect(page.locator("[data-pos-close-shift]")).toBeEnabled();
  await page.locator("[data-pos-close-shift]").click();
  await expect(page.getByText(/closed|handed/i).first()).toBeVisible({ timeout: 20_000 });

  const { data: closed } = await sb
    .from("pos_shifts")
    .select("status, close_note, handed_over_to")
    .eq("id", shiftId)
    .maybeSingle();
  expect((closed as { status: string } | null)?.status).toBe("closed");
  expect((closed as { close_note: string | null } | null)?.close_note).toContain("WIRE-1.11");

  // Expected cash = float + cash sales + paid-in − paid-out − drops (contract §8).
  const { data: shiftRow } = await sb.from("pos_shifts").select("opening_cash_cents, expected_cash_cents").eq("id", shiftId).maybeSingle();
  const { data: moves } = await sb.from("pos_shift_movements").select("kind, amount_cents").eq("shift_id", shiftId);
  const { data: cashSales } = await sb
    .from("booking_transactions")
    .select("gross_amount_cents")
    .eq("status", "paid")
    .eq("metadata->>shift_id", shiftId)
    .eq("metadata->>paid_via", "cash");
  const sum = (rows: unknown[] | null, pick: (r: { kind?: string; amount_cents?: number | string; gross_amount_cents?: number | string }) => number) =>
    ((rows ?? []) as { kind?: string; amount_cents?: number | string; gross_amount_cents?: number | string }[]).reduce((n, r) => n + pick(r), 0);
  const opening = Number((shiftRow as { opening_cash_cents: number } | null)?.opening_cash_cents ?? 0);
  const paidIn = sum(moves, (r) => (r.kind === "float_add" || r.kind === "paid_in" ? Number(r.amount_cents) : 0));
  const paidOut = sum(moves, (r) => (r.kind === "paid_out" ? Number(r.amount_cents) : 0));
  const drops = sum(moves, (r) => (r.kind === "drop" ? Number(r.amount_cents) : 0));
  const sales = sum(cashSales, (r) => Number(r.gross_amount_cents));
  expect(Number((shiftRow as { expected_cash_cents: number } | null)?.expected_cash_cents)).toBe(opening + sales + paidIn - paidOut - drops);

  // Movement on a closed shift: disabled-by-design. With the drawer closed the
  // screen offers the open-drawer form and every movement tile is disabled,
  // so the engine's `already_closed` is unreachable from the door.
  for (const kind of ["float_add", "paid_out", "drop"]) {
    await expect(page.locator(`[data-pos-movement='${kind}']`)).toBeDisabled({ timeout: 20_000 });
  }
  await expect(page.getByLabel("Starting cash · counted")).toBeVisible();
  const { count: afterClose } = await sb.from("pos_shift_movements").select("id", { count: "exact", head: true }).eq("shift_id", shiftId);
  expect(afterClose, "no movement lands on a closed shift").toBe(count);
});
