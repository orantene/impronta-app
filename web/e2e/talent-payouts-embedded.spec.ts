/**
 * Talent payouts — branded EMBEDDED Stripe Connect onboarding — e2e.
 *
 * Proves the talent payout-setup surface is now an IN-SHELL section
 * (`/talent/payouts`, TalentPage "payouts") that:
 *   1. renders INSIDE the talent dashboard shell (nav + chrome present), and
 *   2. mounts the embedded `<ConnectAccountOnboarding>` inline (Tulala-branded,
 *      never redirecting to stripe.com), lazily creating + persisting the
 *      Stripe Express account when the talent opts in.
 *
 * Run (self-contained — starts its own dev server on :3100):
 *   PLAYWRIGHT_USE_DEV_SIGNIN=1 PLAYWRIGHT_BASE_URL=http://localhost:3100 \
 *   PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_CHANNEL=chrome \
 *   TEST_TALENT_EMAIL=tulum-talent-sofia@impronta.test TEST_TALENT_PASSWORD='<pw>' \
 *   npx playwright test e2e/talent-payouts-embedded.spec.ts
 */

import { test, expect, type Page } from "@playwright/test";

const USE_DEV_SIGNIN = process.env.PLAYWRIGHT_USE_DEV_SIGNIN === "1";
const TALENT_EMAIL =
  process.env.TEST_TALENT_EMAIL ?? (USE_DEV_SIGNIN ? "tulum-talent-sofia@impronta.test" : undefined);
const TALENT_PASSWORD = process.env.TEST_TALENT_PASSWORD;

const PAYOUTS = "/talent/payouts";

async function signIn(page: Page, nextPath: string): Promise<void> {
  const params = new URLSearchParams({
    email: TALENT_EMAIL!,
    password: TALENT_PASSWORD!,
    next: nextPath,
  });
  // dev-signin 307-redirects to `next`; the final code can be a redirect, so
  // just confirm we navigated — the page assertions below validate auth+render.
  const res = await page.goto(`/api/dev/signin?${params.toString()}`, {
    waitUntil: "domcontentloaded",
  });
  expect(res, "signin navigation returned no response").not.toBeNull();
}

test.describe("Talent payouts — branded embedded Connect (in-shell)", () => {
  test.skip(!USE_DEV_SIGNIN || !TALENT_PASSWORD, "requires PLAYWRIGHT_USE_DEV_SIGNIN=1 + TEST_TALENT_PASSWORD");

  test("renders INSIDE the talent shell (nav present), no stub, no console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

    await signIn(page, PAYOUTS);
    // signIn already lands here via the redirect; this re-goto can race the
    // in-shell SPA route-syncer's client nav (ERR_ABORTED) — tolerate it, the
    // page is already on PAYOUTS and the assertions below wait for it.
    await page.goto(PAYOUTS, { waitUntil: "domcontentloaded" }).catch(() => {});

    // The talent dashboard nav — proves we're INSIDE the shell, not a
    // standalone canonical page (nav items appear in desktop + mobile nav,
    // so scope to the first match).
    await expect(page.getByText("Today", { exact: true }).first()).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText("Settings", { exact: true }).first()).toBeVisible();

    // The payouts content itself.
    await expect(page.getByRole("heading", { name: "Payouts" })).toBeVisible();
    await expect(page.getByText("Stripe account status")).toBeVisible();
    const cta = page.getByTestId("talent-connect-cta");
    await expect(cta).toBeVisible();
    await expect(cta).toBeEnabled();

    // Not broken; the old "coming soon" stub is gone.
    await expect(page.getByText(/Something broke/i)).toHaveCount(0);
    await expect(page.getByText(/coming soon/i)).toHaveCount(0);

    const real = errors.filter(
      (e) => !/favicon|sentry|net::ERR_|Download the React DevTools|Connect\.js/i.test(e),
    );
    expect(real, `unexpected console errors:\n${real.join("\n")}`).toHaveLength(0);
  });

  test("Connect mounts the embedded onboarding component + persists the Stripe account", async ({ page }) => {
    test.setTimeout(150_000); // Stripe network + embedded iframe + persistence reload
    await signIn(page, PAYOUTS);
    // signIn already lands here via the redirect; this re-goto can race the
    // in-shell SPA route-syncer's client nav (ERR_ABORTED) — tolerate it, the
    // page is already on PAYOUTS and the assertions below wait for it.
    await page.goto(PAYOUTS, { waitUntil: "domcontentloaded" }).catch(() => {});

    const cta = page.getByTestId("talent-connect-cta");
    await expect(cta).toBeVisible({ timeout: 45_000 });
    await cta.click();

    await expect(
      page
        .getByTestId("connect-embedded-onboarding")
        .or(page.getByTestId("connect-embedded-onboarding-loading")),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("connect-embedded-onboarding-error")).toHaveCount(0);

    const mounted = page.getByTestId("connect-embedded-onboarding");
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

    // PERSISTENCE — reload → status section shows the acct_ id from the DB.
    // Retry the reload: the iframe can mount slightly before the Account
    // Session call finishes creating the account server-side.
    await expect(async () => {
      await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
      await expect(page.getByText(/acct_/).first()).toBeVisible({ timeout: 15_000 });
    }).toPass({ timeout: 75_000 });
  });
});
