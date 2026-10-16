/**
 * Shared helpers for the billing E2E suite (TUL-838). Staging + Stripe TEST
 * mode only. QA identity is the test talent TAL-93900 and nothing else; its
 * credentials come from STAGING_QA_EMAIL / STAGING_QA_PASSWORD. No secret is
 * ever written to disk except the Playwright storage state (gitignored).
 */
import fs from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";

export const AUTH_FILE = path.resolve(process.cwd(), "e2e-billing/.auth/billing-qa.json");

export const QA_EMAIL = process.env.STAGING_QA_EMAIL ?? "";
export const QA_PASSWORD = process.env.STAGING_QA_PASSWORD ?? "";
export const hasQaCreds = (): boolean => QA_EMAIL.length > 0 && QA_PASSWORD.length > 0;

/** Test-mode key or null. A live (or any non-test) key disables Stripe scenarios. */
export function stripeTestKey(): string | null {
  const k = process.env.STRIPE_SECRET_KEY ?? "";
  return k.startsWith("sk_test_") ? k : null;
}

export const CARD_OK = "4242424242424242";
export const CARD_FAILS_ON_CHARGE = "4000000000000341";

// ── Stripe test client (fetch, no SDK) ───────────────────────────────────────

type Param = string | number | boolean | null | undefined | Param[] | { [k: string]: Param };

function flatten(prefix: string, v: Param, out: [string, string][]): void {
  if (v === null || v === undefined) return;
  if (Array.isArray(v)) {
    v.forEach((item, i) => flatten(`${prefix}[${i}]`, item, out));
  } else if (typeof v === "object") {
    for (const [k, inner] of Object.entries(v)) flatten(prefix ? `${prefix}[${k}]` : k, inner, out);
  } else {
    out.push([prefix, String(v)]);
  }
}

export async function stripe<T = Record<string, unknown>>(
  method: "GET" | "POST" | "DELETE",
  endpoint: string,
  params: { [k: string]: Param } = {},
): Promise<T> {
  const key = stripeTestKey();
  if (!key) throw new Error("Stripe test key missing; refusing to call Stripe.");
  const pairs: [string, string][] = [];
  flatten("", params, pairs);
  const qs = new URLSearchParams(pairs).toString();
  const url = `https://api.stripe.com/v1${endpoint}${method === "GET" && qs ? `?${qs}` : ""}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: method === "POST" ? qs : undefined,
  });
  const json = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`Stripe ${method} ${endpoint}: ${json.error?.message ?? res.status}`);
  return json;
}

export interface StripeList<T> {
  data: T[];
}
export interface StripeSub {
  id: string;
  status: string;
  cancel_at_period_end: boolean;
  customer: string;
  metadata: Record<string, string>;
}
export interface StripeInvoice {
  id: string;
  amount_due: number;
  status: string | null;
  created: number;
}

export async function qaCustomerId(): Promise<string | null> {
  const list = await stripe<StripeList<{ id: string }>>("GET", "/customers", { email: QA_EMAIL, limit: 5 });
  return list.data[0]?.id ?? null;
}

export async function qaSubscriptions(customer: string): Promise<StripeSub[]> {
  const list = await stripe<StripeList<StripeSub>>("GET", "/subscriptions", { customer, status: "all", limit: 10 });
  return list.data.filter((s) => s.status !== "canceled" && s.status !== "incomplete_expired");
}

export async function latestInvoice(customer: string): Promise<StripeInvoice | null> {
  const list = await stripe<StripeList<StripeInvoice>>("GET", "/invoices", { customer, limit: 1 });
  return list.data[0] ?? null;
}

// ── App helpers ──────────────────────────────────────────────────────────────

export async function signIn(page: Page): Promise<void> {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"]').waitFor({ state: "visible", timeout: 60_000 });
  await page.fill('input[type="email"]', QA_EMAIL);
  await page.fill('input[type="password"]', QA_PASSWORD);
  await Promise.all([
    page.waitForURL(/\/(talent|admin|workspace)/, { timeout: 90_000 }),
    page.click('button[type="submit"]'),
  ]);
}

export function writeEmptyAuthState(): void {
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  fs.writeFileSync(AUTH_FILE, JSON.stringify({ cookies: [], origins: [] }));
}

export function planCard(page: Page) {
  return page.getByTestId("talent-plan-card");
}

export async function gotoSettings(page: Page): Promise<void> {
  await page.goto("/talent/settings", { waitUntil: "domcontentloaded" });
  await expect(planCard(page)).toBeVisible({ timeout: 45_000 });
}

/** Poll the plan card (reloading) until `data-plan` equals `plan`. */
export async function expectPlan(page: Page, plan: string, timeoutMs = 90_000): Promise<void> {
  await expect(async () => {
    await gotoSettings(page);
    await expect(page.locator(`[data-testid="talent-plan-card"][data-plan="${plan}"]`)).toBeVisible({ timeout: 4_000 });
  }).toPass({ timeout: timeoutMs, intervals: [3_000, 5_000, 5_000] });
}

/** Fill the Stripe-hosted Checkout page (not an iframe) and submit. */
export async function payOnStripeCheckout(page: Page, card: string): Promise<void> {
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
  const number = page.locator("#cardNumber");
  await number.waitFor({ state: "visible", timeout: 60_000 });
  await number.fill(card);
  await page.locator("#cardExpiry").fill("12 / 34");
  await page.locator("#cardCvc").fill("123");
  const name = page.locator("#billingName");
  if (await name.isVisible().catch(() => false)) await name.fill("Billing QA");
  const postal = page.locator("#billingPostalCode");
  if (await postal.isVisible().catch(() => false)) await postal.fill("10001");
  await page.locator("button.SubmitButton, button[type='submit']").first().click();
}

/** Stripe session id (cs_...) from the hosted Checkout URL. */
export function checkoutSessionId(url: string): string {
  const m = /\/(cs_(?:test|live)_[A-Za-z0-9]+)/.exec(url);
  if (!m) throw new Error(`No checkout session id in ${url.split("#")[0]}`);
  if (m[1].startsWith("cs_live_")) throw new Error("Live Stripe session reached; aborting.");
  return m[1];
}
