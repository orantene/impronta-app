/**
 * Paid QA, end to end, on the ISOLATED stack (Notion TUL-464).
 *
 * Drives a payment link through Stripe's hosted TEST checkout with Stripe's PUBLISHED
 * test cards only, then asserts the return page and (read-only) the database:
 *
 *   success   4242 4242 4242 4242   -> "Payment received", transaction paid, snapshot gross == charged
 *   decline   4000 0000 0000 0002   -> declined, no paid transaction
 *   3DS       4000 0000 0000 3220   -> challenge completed, paid
 *
 * RUN BY A PERSON (or CI), never by an agent session: this spec types card numbers on
 * a stripe.com page. It refuses to start unless the target is the isolated project,
 * every Stripe key is a TEST key and every URL is local (see global-setup.ts), and it
 * asserts the checkout page says "Test mode" BEFORE it types anything.
 *
 * Inputs (env): PAID_QA_BASE_URL (local app origin), PAID_QA_PAY_URLS (JSON: {"success": "...", "decline": "...",
 * "threeDS": "..."} one fresh pay link per case; a link is single use), JOURNEYS_ISOLATED=1,
 * NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (isolated project, read-only GETs here).
 * Missing case URLs SKIP that case; a skipped case is NOT a pass and shows as skipped in the table.
 *
 * Status: written 2026-10-09, not yet run. Stripe's hosted-checkout DOM is matched by label/role first;
 * adjust the selectors in `fillCard` on the first run if Stripe changed them.
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const day = new Date().toISOString().slice(0, 10);
const evidence = join(process.cwd(), "docs/plans/qa-evidence", `paid-qa-${day}`);
mkdirSync(evidence, { recursive: true });

const PAY_URLS: Record<string, string> = process.env.PAID_QA_PAY_URLS ? JSON.parse(process.env.PAID_QA_PAY_URLS) : {};

type Row = { case: string; result: "pass" | "fail" | "skipped"; detail: string };
const rows: Row[] = [];

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

async function openStripeCheckout(page: Page, payUrl: string, tag: string) {
  await page.goto(payUrl);
  await shot(page, `${tag}-1-pay-page`);
  // The primary action on the pay page is a link to the hosted checkout.
  await page.getByRole("link", { name: /^(pay|pagar)/i }).first().click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
  // GUARD: never type a card unless Stripe says this is test mode.
  await expect(page.getByText(/test mode/i).first()).toBeVisible({ timeout: 30_000 });
  await shot(page, `${tag}-2-checkout-test-mode`);
}

async function fillCard(page: Page, number: string) {
  const card = page.getByLabel(/card number|número de tarjeta/i).first();
  await card.fill(number);
  await page.getByLabel(/expiration|expiry|vencimiento|mm ?\/ ?yy/i).first().fill("12 / 34");
  await page.getByLabel(/^cvc|security code|código de seguridad/i).first().fill("123");
  const name = page.getByLabel(/name on card|cardholder|nombre/i).first();
  if (await name.isVisible().catch(() => false)) await name.fill("QA Paid Tester");
  const postal = page.getByLabel(/zip|postal|código postal/i).first();
  if (await postal.isVisible().catch(() => false)) await postal.fill("77500");
  const email = page.getByLabel(/^email|correo/i).first();
  if (await email.isVisible().catch(() => false) && !(await email.inputValue().catch(() => ""))) await email.fill("qa-paid@impronta.test");
}

async function submit(page: Page) {
  await page.getByTestId("hosted-payment-submit-button").or(page.getByRole("button", { name: /^(pay|pagar)/i })).first().click();
}

async function completeThreeDS(page: Page) {
  // Stripe's test 3-D Secure page nests the challenge in iframes: find the button in any frame.
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      const btn = frame.getByRole("button", { name: /complete/i }).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click();
        return;
      }
    }
    await page.waitForTimeout(1000);
  }
  throw new Error("3DS challenge button not found");
}

function linkCode(url: string): string {
  return new URL(url).pathname.split("/").filter(Boolean).pop()!;
}

async function paymentFor(url: string) {
  const link = (await rest<{ order_id: string; status: string; amount_cents: number }>("payment_links", `select=order_id,status,amount_cents&code=eq.${linkCode(url)}`))[0];
  if (!link) throw new Error("payment link not found");
  return link;
}

test.describe.configure({ mode: "serial" });

test.afterAll(() => {
  const md = ["| case | result | detail |", "|---|---|---|", ...rows.map((r) => `| ${r.case} | ${r.result} | ${r.detail} |`)].join("\n");
  writeFileSync(join(evidence, "summary.md"), `# Paid QA ${day}\n\n${md}\n`);
  console.log(`\n${md}\n`);
});

test("success 4242: pays, returns to 'Payment received', transaction paid, snapshot gross equals the charge", async ({ page }) => {
  const url = PAY_URLS.success;
  if (!url) { rows.push({ case: "success", result: "skipped", detail: "no PAID_QA_PAY_URLS.success" }); test.skip(true, "no success pay URL"); return; }
  try {
    await openStripeCheckout(page, url, "success");
    await fillCard(page, "4242 4242 4242 4242");
    await shot(page, "success-3-card-filled");
    await submit(page);
    await page.waitForURL((u) => u.hostname !== "checkout.stripe.com", { timeout: 120_000 });
    await expect(page.getByText(/payment received|pago recibido/i).first()).toBeVisible({ timeout: 90_000 });
    await shot(page, "success-4-return-paid");

    const link = await paymentFor(url);
    const txns = await rest<{ id: string; status: string; gross_amount_cents: number; booking_id: string | null }>(
      "booking_transactions",
      `select=id,status,gross_amount_cents,booking_id&order_id=eq.${link.order_id}&status=eq.paid`,
    ).catch(() => []);
    expect(txns.length, "exactly one paid transaction").toBe(1);
    expect(txns[0].gross_amount_cents).toBe(link.amount_cents);
    if (txns[0].booking_id) {
      const snaps = await rest<{ gross_charged_cents: number }>("booking_commission_snapshot", `select=gross_charged_cents&booking_id=eq.${txns[0].booking_id}`);
      const sum = snaps.reduce((n, s) => n + Number(s.gross_charged_cents), 0);
      expect(sum, "snapshot gross == amount charged").toBe(txns[0].gross_amount_cents);
    }
    rows.push({ case: "success", result: "pass", detail: `paid ${txns[0].gross_amount_cents}` });
  } catch (e) {
    rows.push({ case: "success", result: "fail", detail: String((e as Error).message).slice(0, 160) });
    throw e;
  }
});

test("decline 4000 0000 0000 0002: declined, nothing paid", async ({ page }) => {
  const url = PAY_URLS.decline;
  if (!url) { rows.push({ case: "decline", result: "skipped", detail: "no PAID_QA_PAY_URLS.decline" }); test.skip(true, "no decline pay URL"); return; }
  try {
    await openStripeCheckout(page, url, "decline");
    await fillCard(page, "4000 0000 0000 0002");
    await submit(page);
    await expect(page.getByText(/declined|rechaz/i).first()).toBeVisible({ timeout: 60_000 });
    await shot(page, "decline-3-declined");
    const link = await paymentFor(url);
    const paid = await rest("booking_transactions", `select=id&order_id=eq.${link.order_id}&status=eq.paid`).catch(() => []);
    expect(paid.length, "no paid transaction after a decline").toBe(0);
    rows.push({ case: "decline", result: "pass", detail: "declined, nothing paid" });
  } catch (e) {
    rows.push({ case: "decline", result: "fail", detail: String((e as Error).message).slice(0, 160) });
    throw e;
  }
});

test("3-D Secure 4000 0000 0000 3220: challenge completed, paid", async ({ page }) => {
  const url = PAY_URLS.threeDS;
  if (!url) { rows.push({ case: "3ds", result: "skipped", detail: "no PAID_QA_PAY_URLS.threeDS" }); test.skip(true, "no 3DS pay URL"); return; }
  try {
    await openStripeCheckout(page, url, "3ds");
    await fillCard(page, "4000 0000 0000 3220");
    await submit(page);
    await completeThreeDS(page);
    await page.waitForURL((u) => u.hostname !== "checkout.stripe.com", { timeout: 120_000 });
    await expect(page.getByText(/payment received|pago recibido/i).first()).toBeVisible({ timeout: 90_000 });
    await shot(page, "3ds-4-return-paid");
    const link = await paymentFor(url);
    const txns = await rest("booking_transactions", `select=id&order_id=eq.${link.order_id}&status=eq.paid`).catch(() => []);
    expect(txns.length).toBe(1);
    rows.push({ case: "3ds", result: "pass", detail: "authenticated and paid" });
  } catch (e) {
    rows.push({ case: "3ds", result: "fail", detail: String((e as Error).message).slice(0, 160) });
    throw e;
  }
});
