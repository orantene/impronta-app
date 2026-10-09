/**
 * TUL-464 follow-up: what must be true AFTER a paid sale on the isolated stack (paid run #2, 2026-10-09).
 *
 *   1. money-net     the talent's Money page shows HER net (the price), not the client's card charge
 *                    that includes the 1.5% service fee, and the paid row says "Paid in full / Pagado".
 *   2. refund-lines  a partial refund made THROUGH THE APP (Orders > Reembolsar) leaves a refund row,
 *                    `order_lines.refunded_cents` counted once, and, when the talent leg already paid out
 *                    and the refund exceeds the buffer, the `talent_residual` flag on the refund row.
 *
 * It never types a card and never pays: it starts from an ALREADY PAID order (pay it with
 * paid-qa.spec.ts first). Like that spec it refuses non-isolated targets (global-setup.ts), reads the
 * database with GETs only, and signs in through the normal login form with fixture credentials read from
 * env (never printed).
 *
 * Each case SKIPS, with its reason, until the feature it checks is live: list the ready features in
 * PAID_QA_LIVE (e.g. PAID_QA_LIVE=money-net,refund-lines once #3102/#3104 and #3098/#3100 are on the
 * build under test). A skipped case is a skip, never a pass.
 *
 * Inputs (env):
 *   PAID_QA_BASE_URL          local app origin for the talent app: use http://localhost:3001 (NOT 127.0.0.1 or
 *                             a workspace host: sign-in there redirects /talent to localhost, where the cookie is missing)
 *   PAID_QA_ADMIN_BASE_URL    local origin of the workspace that owns the order (e.g. http://hub.localhost:3001)
 *   PAID_QA_PAID_ORDER        the paid order id
 *   PAID_QA_TALENT_EMAIL / PAID_QA_TALENT_PASSWORD   the seller, for the Money page. A fixture seller must have an
 *                             onboarding-complete profile (profiles.onboarding_completed_at set, app_role talent,
 *                             account_status active); otherwise /talent bounces to onboarding or "Setting up your page"
 *   PAID_QA_STAFF_EMAIL  / PAID_QA_STAFF_PASSWORD    staff who may refund that order (refund-lines only)
 *   PAID_QA_REFUND_CENTS      the partial amount (default 30000)
 *   PAID_QA_EXPECT_RESIDUAL   1 = the talent_residual flag is mandatory when the talent leg already paid out
 *   PAID_QA_LIVE              comma list of features under test: money-net, refund-lines
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const day = new Date().toISOString().slice(0, 10);
const evidence = join(process.cwd(), "docs/plans/qa-evidence", `paid-qa-${day}`);
mkdirSync(evidence, { recursive: true });

const LIVE = new Set((process.env.PAID_QA_LIVE ?? "").split(",").map((s) => s.trim()).filter(Boolean));
const ORDER = process.env.PAID_QA_PAID_ORDER ?? "";

async function shot(page: Page, name: string) {
  await page.screenshot({ path: join(evidence, `${name}.png`), fullPage: true });
}

/** Read-only PostgREST GET against the isolated project. */
async function rest<T = Record<string, unknown>>(table: string, query: string): Promise<T[]> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(`${base}/rest/v1/${table}?${query}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`rest ${table}: ${res.status}`);
  return (await res.json()) as T[];
}

async function signIn(page: Page, base: string, email: string, password: string, next: string) {
  await page.goto(`${base}/login?next=${encodeURIComponent(next)}`);
  await page.getByRole("button", { name: /^decline$/i }).click({ timeout: 3000 }).catch(() => {});
  await page.getByLabel(/correo|email/i).first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole("button", { name: /log in with email|iniciar sesi/i }).first().click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
}

const money = (cents: number) => (cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0 });

test.describe("after a paid sale (isolated)", () => {
  test("money-net: the talent's Money page shows her net, not the client's charge", async ({ page }) => {
    test.skip(!LIVE.has("money-net"), "money-net is not live on this build yet (needs #3102 + #3104); set PAID_QA_LIVE=money-net");
    test.skip(!ORDER || !process.env.PAID_QA_TALENT_EMAIL || !process.env.PAID_QA_TALENT_PASSWORD, "needs PAID_QA_PAID_ORDER and the talent's PAID_QA_TALENT_* credentials");

    const [txn] = await rest<{ gross_amount_cents: number; net_amount_cents: number; platform_fee_cents: number }>(
      "booking_transactions",
      `select=gross_amount_cents,net_amount_cents,platform_fee_cents&order_id=eq.${ORDER}&status=eq.paid&refund_of_transaction_id=is.null`,
    );
    expect(txn, "the order has a paid transaction").toBeTruthy();
    test.skip(txn.gross_amount_cents === txn.net_amount_cents, "this order carries no client service fee, so net == gross proves nothing");

    const base = process.env.PAID_QA_BASE_URL!;
    await signIn(page, base, process.env.PAID_QA_TALENT_EMAIL!, process.env.PAID_QA_TALENT_PASSWORD!, "/talent/money");
    await page.goto(`${base}/talent/money`);
    await page.waitForTimeout(4000);
    await shot(page, "after-pay-1-talent-money");
    const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(body, "her net is on the page").toContain(money(txn.net_amount_cents));
    expect(body, "the client's charge (net + fee) is not shown as hers").not.toContain(money(txn.gross_amount_cents));
    expect(body, "the paid row says so").toMatch(/paid in full|pagado/i);
  });

  test("refund-lines: a partial refund through the app is booked on the lines once and flags the talent residual", async ({ page }) => {
    test.skip(!LIVE.has("refund-lines"), "refund-lines is not live on this build yet (needs #3098 + #3100); set PAID_QA_LIVE=refund-lines");
    test.skip(
      !ORDER || !process.env.PAID_QA_ADMIN_BASE_URL || !process.env.PAID_QA_STAFF_EMAIL || !process.env.PAID_QA_STAFF_PASSWORD,
      "needs PAID_QA_PAID_ORDER, PAID_QA_ADMIN_BASE_URL and the staff PAID_QA_STAFF_* credentials",
    );
    const refundCents = Number(process.env.PAID_QA_REFUND_CENTS ?? 30_000);

    const lines0 = await rest<{ id: string; refunded_cents: number }>("order_lines", `select=id,refunded_cents&order_id=eq.${ORDER}`);
    const before = lines0.reduce((n, l) => n + Number(l.refunded_cents ?? 0), 0);

    // Through the app: Orders > the order > Reembolsar > amount > confirm.
    const admin = process.env.PAID_QA_ADMIN_BASE_URL!;
    await signIn(page, admin, process.env.PAID_QA_STAFF_EMAIL!, process.env.PAID_QA_STAFF_PASSWORD!, `/admin/orders?q=${ORDER}`);
    await page.goto(`${admin}/admin/orders?q=${ORDER}`);
    await page.getByText(/reembolsar|refund/i).first().click({ timeout: 30_000 });
    await shot(page, "after-pay-2-refund-form");
    await page.getByLabel(/amount|monto|importe/i).first().fill(String(refundCents / 100));
    await page.getByRole("button", { name: /reembolsar|refund|confirm/i }).last().click();
    await page.waitForTimeout(8000);
    await shot(page, "after-pay-3-refund-done");

    // The refund row (the webhook books it), the order lines, and the flag.
    await expect
      .poll(async () => (await rest("booking_transactions", `select=id&order_id=eq.${ORDER}&status=eq.refunded&gross_amount_cents=eq.${refundCents}`)).length, { timeout: 60_000 })
      .toBeGreaterThanOrEqual(1);
    const lines1 = await rest<{ id: string; refunded_cents: number }>("order_lines", `select=id,refunded_cents&order_id=eq.${ORDER}`);
    const after = lines1.reduce((n, l) => n + Number(l.refunded_cents ?? 0), 0);
    expect(after - before, "order_lines.refunded_cents moved by exactly the refund (counted once)").toBe(refundCents);

    const [refundRow] = await rest<{ metadata: Record<string, unknown> | null }>(
      "booking_transactions",
      `select=metadata&order_id=eq.${ORDER}&status=eq.refunded&gross_amount_cents=eq.${refundCents}&order=created_at.desc&limit=1`,
    );
    const paidOutLegs = await rest("booking_payouts", `select=id&status=eq.transferred&party=eq.talent&booking_id=in.(${(await rest<{ booking_id: string }>("booking_transactions", `select=booking_id&order_id=eq.${ORDER}&booking_id=not.is.null&limit=1`)).map((r) => r.booking_id).join(",") || "00000000-0000-0000-0000-000000000000"})`);
    if (paidOutLegs.length > 0) {
      // The talent leg already left: a refund beyond the platform + workspace buffer cannot be clawed.
      // With a pass_through (non-refundable) fee the buffer is 0, so a paid-out talent leg must flag the
      // whole refund. Set PAID_QA_EXPECT_RESIDUAL=1 to make the flag mandatory; otherwise, when present, it must be right.
      const meta = refundRow?.metadata ?? {};
      if (process.env.PAID_QA_EXPECT_RESIDUAL === "1") expect(meta.needs_attention, "the residual is flagged").toBe("talent_residual");
      if (meta.needs_attention) {
        expect(meta.needs_attention).toBe("talent_residual");
        expect(Number(meta.talent_residual_cents)).toBeGreaterThan(0);
      }
    }
  });
});
