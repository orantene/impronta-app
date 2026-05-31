/**
 * Talent payouts — branded EMBEDDED Stripe Connect onboarding — e2e.
 *
 * Proves the talent payout-setup surface:
 *   1. renders in the talent shell as a canonical page (no SPA overlay, no
 *      "coming soon" stub, no runtime console errors), and
 *   2. mounts the embedded `<ConnectAccountOnboarding>` component inline
 *      (Tulala-branded, never redirecting to stripe.com), lazily creating +
 *      persisting the Stripe Express account when the talent opts in.
 *
 * Run (self-contained — starts its own dev server on :3100):
 *   PLAYWRIGHT_USE_DEV_SIGNIN=1 \
 *   PLAYWRIGHT_BASE_URL=http://localhost:3100 \
 *   PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_CHANNEL=chrome \
 *   TEST_TALENT_EMAIL=orantene@gmail.com TEST_TALENT_PASSWORD='<pw>' \
 *   npx playwright test e2e/talent-payouts-embedded.spec.ts
 */

import { test, expect, type Page } from "@playwright/test";

const USE_DEV_SIGNIN = process.env.PLAYWRIGHT_USE_DEV_SIGNIN === "1";
const TALENT_EMAIL =
  process.env.TEST_TALENT_EMAIL ?? (USE_DEV_SIGNIN ? "orantene@gmail.com" : undefined);
const TALENT_PASSWORD =
  process.env.TEST_TALENT_PASSWORD ?? (USE_DEV_SIGNIN ? "1234!@#$Oran" : undefined);

const PAYOUTS = "/talent/settings/payouts";

async function signIn(page: Page, nextPath: string): Promise<void> {
  const params = new URLSearchParams({
    email: TALENT_EMAIL!,
    password: TALENT_PASSWORD!,
    next: nextPath,
  });
  const res = await page.goto(`/api/dev/signin?${params.toString()}`, {
    waitUntil: "domcontentloaded",
  });
  expect(res?.ok()).toBeTruthy();
}

test.describe("Talent payouts — branded embedded Connect", () => {
  test.skip(!USE_DEV_SIGNIN, "requires PLAYWRIGHT_USE_DEV_SIGNIN=1 + dev credentials");

  test("renders in the talent shell — canonical page, no SPA overlay, no stub, no console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

    await signIn(page, PAYOUTS);
    await page.goto(PAYOUTS, { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: "Payouts" })).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText("Stripe account status")).toBeVisible();
    const cta = page.getByTestId("talent-connect-cta");
    await expect(cta).toBeVisible();
    await expect(cta).toBeEnabled();

    // Not broken, and the old "coming soon" stub is gone.
    await expect(page.getByText(/Something broke/i)).toHaveCount(0);
    await expect(page.getByText(/coming soon/i)).toHaveCount(0);

    // markup ≠ works: fail on real runtime console errors.
    const real = errors.filter(
      (e) => !/favicon|sentry|net::ERR_|Download the React DevTools|Connect\.js/i.test(e),
    );
    expect(real, `unexpected console errors:\n${real.join("\n")}`).toHaveLength(0);
  });

  test("Connect mounts the embedded onboarding component + persists the Stripe account", async ({ page }) => {
    await signIn(page, PAYOUTS);
    await page.goto(PAYOUTS, { waitUntil: "domcontentloaded" });

    const cta = page.getByTestId("talent-connect-cta");
    await expect(cta).toBeVisible({ timeout: 45_000 });
    await cta.click();

    // Our embedded wrapper renders once the Connect SDK initialises client-side
    // (loading state allowed) — and must NOT fall into the error state.
    await expect(
      page
        .getByTestId("talent-embedded-onboarding")
        .or(page.getByTestId("talent-embedded-onboarding-loading")),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("talent-embedded-onboarding-error")).toHaveCount(0);

    // The Stripe Connect component actually mounts — it loads Connect.js,
    // fetches the Account Session (→ our server action) and renders its
    // embedded element + iframe. Poll for a real Stripe Connect element (its
    // exact custom-element tag / shadow-DOM boundary varies by SDK version),
    // proving the component engaged — not just our wrapper div.
    const mounted = page.getByTestId("talent-embedded-onboarding");
    await expect(mounted).toBeVisible({ timeout: 45_000 });
    await expect
      .poll(
        async () =>
          mounted.evaluate(
            (el) =>
              !!el.querySelector("iframe") ||
              Array.from(el.querySelectorAll("*")).some((n) =>
                n.tagName.toLowerCase().startsWith("stripe-connect"),
              ),
          ),
        { timeout: 45_000, message: "Stripe Connect embedded element never mounted (Connect.js / CSP?)" },
      )
      .toBe(true);

    // PERSISTENCE — the Account Session lazily created + saved the Express
    // account id. Reload → the status card shows acct_… loaded from the DB,
    // proving the server-side write stuck (not a transient client state).
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText(/acct_/)).toBeVisible({ timeout: 45_000 });
  });
});
