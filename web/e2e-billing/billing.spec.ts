/**
 * Billing regression suite (TUL-838), staging + Stripe TEST mode only.
 *
 * Pricing toggle runs anonymously. The lifecycle block signs in as the QA
 * talent TAL-93900 (STAGING_QA_EMAIL / STAGING_QA_PASSWORD) and needs a
 * sk_test_ STRIPE_SECRET_KEY; each scenario skips with a reason otherwise.
 * It runs serially in one order: promo -> checkout -> unlock -> portal ->
 * plan change -> cancel/resume -> webhook idempotency -> dunning (API).
 */
import { expect, test } from "@playwright/test";
import {
  AUTH_FILE,
  CARD_OK,
  checkoutSessionId,
  expectPlan,
  gotoSettings,
  hasQaCreds,
  latestInvoice,
  payOnStripeCheckout,
  planCard,
  qaCustomerId,
  qaSubscriptions,
  stripe,
  stripeTestKey,
  type StripeInvoice,
  type StripeList,
  type StripeSub,
} from "./helpers";

test.describe("pricing toggle", () => {
  test("monthly/yearly flips prices", async ({ page }) => {
    await page.goto("/pricing");
    const root = page.getByTestId("billing-interval-root");
    await expect(root).toHaveAttribute("data-interval", "month");

    const cards = page.getByTestId("pricing-tier-card");
    await expect(cards.first()).toBeVisible();
    // Only cards that carry both variants are priced tiers.
    const priced = cards.filter({ has: page.getByTestId("price-yearly") });
    const n = await priced.count();
    expect(n).toBeGreaterThan(0);

    for (let i = 0; i < n; i++) {
      await expect(priced.nth(i).getByTestId("price-monthly")).toBeVisible();
      await expect(priced.nth(i).getByTestId("price-yearly")).toBeHidden();
    }

    await page.getByTestId("billing-interval-year").click();
    await expect(root).toHaveAttribute("data-interval", "year");
    await expect(page.getByTestId("billing-interval-year")).toHaveAttribute("aria-checked", "true");
    for (let i = 0; i < n; i++) {
      await expect(priced.nth(i).getByTestId("price-yearly")).toBeVisible();
      await expect(priced.nth(i).getByTestId("price-monthly")).toBeHidden();
    }

    await page.getByTestId("billing-interval-month").click();
    await expect(root).toHaveAttribute("data-interval", "month");
    await expect(priced.first().getByTestId("price-monthly")).toBeVisible();
  });

  test("/es/pricing toggle has no English labels", async ({ page }) => {
    await page.goto("/es/pricing");
    const toggle = page.getByTestId("billing-interval-toggle");
    await expect(toggle).toBeVisible();
    const text = (await toggle.innerText()).toLowerCase();
    expect(text).not.toMatch(/monthly|yearly|annual|save up to/);
    await page.getByTestId("billing-interval-year").click();
    await expect(page.getByTestId("billing-interval-root")).toHaveAttribute("data-interval", "year");
    const yearly = page.getByTestId("price-yearly").first();
    if (await yearly.count()) {
      expect((await yearly.innerText()).toLowerCase()).not.toMatch(/billed yearly|\/month/);
    }
  });

  test("CTA hrefs carry plan and interval", async ({ page }) => {
    await page.goto("/pricing");
    await page.getByTestId("billing-interval-year").click();
    const href = await page
      .getByTestId("pricing-tier-card")
      .first()
      .getByRole("link")
      .last()
      .getAttribute("href");
    expect(href).toMatch(/plan=/);
    expect(href).toMatch(/interval=year/);
    // The interval survives a reload through the URL.
    await expect(page).toHaveURL(/interval=year/);
    await page.reload();
    await expect(page.getByTestId("billing-interval-root")).toHaveAttribute(
      "data-interval",
      "year",
    );
  });
});

test.describe.serial("checkout and subscription lifecycle (Stripe TEST mode)", () => {
  test.use({ storageState: AUTH_FILE });
  test.setTimeout(180_000);

  let unlockMs: number | null = null;

  test.beforeEach(() => {
    test.skip(!hasQaCreds(), "STAGING_QA_EMAIL / STAGING_QA_PASSWORD not set");
    test.skip(!stripeTestKey(), "STRIPE_SECRET_KEY missing or not sk_test_");
    // QA identity is TAL-93900 ONLY (never TAL-93938). The run must name it.
    test.skip(process.env.BILLING_QA_TALENT_CODE !== "TAL-93900", "BILLING_QA_TALENT_CODE must be TAL-93900");
  });

  test.beforeAll(async () => {
    // Start from the free plan: cancel any leftover test-mode subscription.
    if (!hasQaCreds() || !stripeTestKey()) return;
    if (process.env.BILLING_QA_TALENT_CODE !== "TAL-93900") return;
    // Only subscriptions this QA talent created (metadata), never anything else
    // that happens to share the customer.
    const qaProfile = process.env.BILLING_QA_TALENT_PROFILE_ID;
    if (!qaProfile) return;
    const customer = await qaCustomerId();
    if (!customer) return;
    for (const sub of await qaSubscriptions(customer)) {
      if (sub.metadata?.talent_profile_id !== qaProfile) continue;
      await stripe("DELETE", `/subscriptions/${sub.id}`);
    }
  });

  async function startCheckout(page: import("@playwright/test").Page, query: string): Promise<string> {
    await page.goto(`/talent/plan?${query}`, { waitUntil: "domcontentloaded" });
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
    return checkoutSessionId(page.url());
  }

  test("promo TESTPRO20 discounts 20% at checkout", async ({ page }) => {
    const id = await startCheckout(page, "plan=talent_pro&interval=month&promo=TESTPRO20");
    const cs = await stripe<{ amount_subtotal: number; total_details: { amount_discount: number } }>(
      "GET",
      `/checkout/sessions/${id}`,
    );
    expect(cs.amount_subtotal).toBeGreaterThan(0);
    expect(cs.total_details.amount_discount).toBe(Math.round(cs.amount_subtotal * 0.2));
    await expect(page.getByText(/20%/).first()).toBeVisible();
  });

  test("promo NOPE is not applied", async ({ page }) => {
    // The app either blocks the checkout with an error or opens it undiscounted.
    await page.goto("/talent/plan?plan=talent_pro&interval=month&promo=NOPE", { waitUntil: "domcontentloaded" });
    const reached = await page
      .waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    if (reached) {
      const cs = await stripe<{ total_details: { amount_discount: number } }>(
        "GET",
        `/checkout/sessions/${checkoutSessionId(page.url())}`,
      );
      expect(cs.total_details.amount_discount).toBe(0);
    } else {
      await expect(page.getByRole("alert").or(page.getByText(/invalid|not valid|expired|code/i)).first()).toBeVisible();
    }
  });

  test("upgrade -> Stripe Checkout with 4242 -> plan active", async ({ page }) => {
    await startCheckout(page, "plan=talent_pro&interval=month");
    await payOnStripeCheckout(page, CARD_OK);
    await page.waitForURL(/talent\/settings.*billing=success/, { timeout: 90_000 });
    const t0 = Date.now();
    // No reload: the success page must flip the card by itself.
    const flipped = await page
      .locator('[data-testid="talent-plan-card"][data-plan="talent_pro"]')
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (flipped) unlockMs = Date.now() - t0;
    await expectPlan(page, "talent_pro");
    const customer = await qaCustomerId();
    expect(customer).not.toBeNull();
    const subs = await qaSubscriptions(customer!);
    expect(subs.some((s) => s.status === "active")).toBe(true);
  });

  test("features unlock within 5s of paying, without a reload", async () => {
    expect(unlockMs, "plan card did not flip to talent_pro within 5s of return").not.toBeNull();
    expect(unlockMs!).toBeLessThanOrEqual(5_000);
  });

  test("billing portal opens on billing.stripe.com", async ({ page }) => {
    await gotoSettings(page);
    const nav = page.waitForResponse((r) => /billing\.stripe\.com/.test(r.url()) && r.request().isNavigationRequest(), {
      timeout: 60_000,
    });
    await page.getByRole("button", { name: /manage billing/i }).click();
    expect((await nav).status()).toBe(200);
    await expect(page).toHaveURL(/billing\.stripe\.com/);
  });

  test("plan change: previewed amount equals the Stripe invoice", async ({ page }) => {
    await page.goto("/talent/plan?plan=talent_portfolio&interval=month", { waitUntil: "domcontentloaded" });
    const box = page.getByTestId("plan-change-confirm");
    await expect(box).toBeVisible({ timeout: 45_000 });
    const sentence = box.locator("p").first();
    await expect(sentence).toContainText(/\d/, { timeout: 30_000 });
    const text = await sentence.innerText();
    const m = /([\d,]+\.\d{2})/.exec(text);
    expect(m, `no amount in preview sentence: ${text}`).not.toBeNull();
    const previewCents = Math.round(parseFloat(m![1].replace(/,/g, "")) * 100);
    const customer = (await qaCustomerId())!;
    const before = await latestInvoice(customer);
    await box.getByRole("button").last().click();
    let after: StripeInvoice | null = null;
    await expect(async () => {
      after = await latestInvoice(customer);
      expect(after?.id).not.toBe(before?.id);
    }).toPass({ timeout: 60_000, intervals: [3_000] });
    expect(after!.amount_due).toBe(previewCents);
    await expectPlan(page, "talent_portfolio");
  });

  test("cancel -> end-date banner -> resume -> banner gone, no new invoice", async ({ page }) => {
    const customer = (await qaCustomerId())!;
    const invoiceBefore = await latestInvoice(customer);
    await gotoSettings(page);
    await page.getByRole("button", { name: /^cancel plan$/i }).click();
    await page.getByRole("radio").first().check();
    await page.getByRole("button", { name: /^continue$/i }).click();
    // "too expensive" inserts a save-offer step; the first reason may not be it.
    await page.getByRole("button", { name: /cancel my plan/i }).click();
    const banner = page.getByTestId("talent-plan-ends-banner");
    await expect(banner).toBeVisible({ timeout: 30_000 });
    await expect(banner).toContainText(/\d{4}/);
    await page.getByRole("button", { name: /resume plan/i }).click();
    await expect(banner).toBeHidden({ timeout: 30_000 });
    const subs = await qaSubscriptions(customer);
    expect(subs.every((s) => !s.cancel_at_period_end)).toBe(true);
    expect((await latestInvoice(customer))?.id).toBe(invoiceBefore?.id);
  });

  test("webhook idempotency: a Stripe-side no-op leaves the plan card unchanged", async ({ page }) => {
    // Honest limit: without the webhook signing secret we cannot replay a
    // signed event. A metadata touch makes Stripe emit customer.subscription
    // .updated to the app's real endpoint; the card must not change.
    const customer = (await qaCustomerId())!;
    const sub = (await qaSubscriptions(customer))[0];
    expect(sub).toBeTruthy();
    await gotoSettings(page);
    const read = async () => ({
      plan: await planCard(page).getAttribute("data-plan"),
      body: (await page.getByText(/^Next charge$/).locator("xpath=following-sibling::dd[1]").textContent()) ?? "",
    });
    const before = await read();
    await stripe("POST", `/subscriptions/${sub.id}`, { metadata: { e2e_noop: String(Date.now()) } });
    await page.waitForTimeout(8_000);
    await gotoSettings(page);
    expect(await read()).toEqual(before);
    const after = await qaSubscriptions(customer);
    expect(after.length).toBe(1);
  });

  test("failed payment on a test clock goes past_due, new card recovers (API level)", async () => {
    // API-level only, on a throwaway customer. TODO(TUL-838): the UI half
    // (past-due banner for the QA talent, update card in the portal) needs
    // the app's customer bound to a test clock, which cannot be done from
    // outside; it also needs the portal's hosted card form.
    const price = process.env.BILLING_TEST_PRICE_ID;
    test.skip(!price, "BILLING_TEST_PRICE_ID (a test-mode recurring price) not set");
    const clock = await stripe<{ id: string; frozen_time: number }>("POST", "/test_helpers/test_clocks", {
      frozen_time: Math.floor(Date.now() / 1000),
      name: "billing-e2e",
    });
    try {
      const cust = await stripe<{ id: string }>("POST", "/customers", {
        test_clock: clock.id,
        email: "billing-e2e-clock@example.com",
        metadata: { e2e: "TUL-838" },
      });
      const pm = await stripe<{ id: string }>("POST", "/payment_methods", { type: "card", card: { token: "tok_chargeCustomerFail" } });
      await stripe("POST", `/payment_methods/${pm.id}/attach`, { customer: cust.id });
      await stripe("POST", `/customers/${cust.id}`, { invoice_settings: { default_payment_method: pm.id } });
      // 0341 attaches, then declines on charge: trial-less subscribe fails or goes incomplete.
      const sub = await stripe<StripeSub>("POST", "/subscriptions", {
        customer: cust.id,
        items: [{ price }],
        payment_behavior: "allow_incomplete",
        trial_period_days: 1,
      });
      await stripe("POST", `/test_helpers/test_clocks/${clock.id}/advance`, {
        frozen_time: clock.frozen_time + 3 * 86400,
      });
      await expect(async () => {
        const s = await stripe<StripeSub>("GET", `/subscriptions/${sub.id}`);
        expect(s.status).toBe("past_due");
      }).toPass({ timeout: 90_000, intervals: [3_000] });
      const good = await stripe<{ id: string }>("POST", "/payment_methods", { type: "card", card: { token: "tok_visa" } });
      await stripe("POST", `/payment_methods/${good.id}/attach`, { customer: cust.id });
      await stripe("POST", `/customers/${cust.id}`, { invoice_settings: { default_payment_method: good.id } });
      const open = await stripe<StripeList<StripeInvoice>>("GET", "/invoices", { customer: cust.id, status: "open" });
      for (const inv of open.data) await stripe("POST", `/invoices/${inv.id}/pay`, { payment_method: good.id });
      await expect(async () => {
        const s = await stripe<StripeSub>("GET", `/subscriptions/${sub.id}`);
        expect(s.status).toBe("active");
      }).toPass({ timeout: 60_000, intervals: [3_000] });
    } finally {
      await stripe("DELETE", `/test_helpers/test_clocks/${clock.id}`);
    }
  });
});
