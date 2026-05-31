/**
 * Workspace payouts — branded EMBEDDED Stripe Connect onboarding — e2e.
 *
 * Proves the workspace payout surface (admin SPA shell section, #109):
 *   1. renders in-shell, and
 *   2. clicking "Connect Stripe" mounts the embedded <ConnectAccountOnboarding>
 *      inline (Tulala-branded, no stripe.com redirect), lazily creating +
 *      persisting the workspace Express account.
 *
 * Run (self-contained dev server on :3100):
 *   PLAYWRIGHT_USE_DEV_SIGNIN=1 PLAYWRIGHT_BASE_URL=http://localhost:3100 \
 *   PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_CHANNEL=chrome \
 *   TEST_ADMIN_EMAIL=orantene@gmail.com TEST_ADMIN_PASSWORD='<pw>' \
 *   npx playwright test e2e/workspace-payouts-embedded.spec.ts
 */

import { test, expect, type Page } from "@playwright/test";

const USE_DEV_SIGNIN = process.env.PLAYWRIGHT_USE_DEV_SIGNIN === "1";
const ADMIN_EMAIL =
  process.env.TEST_ADMIN_EMAIL ?? (USE_DEV_SIGNIN ? "orantene@gmail.com" : undefined);
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;

const PAYOUTS = "/impronta/admin/payouts";

async function signIn(page: Page, nextPath: string): Promise<void> {
  const params = new URLSearchParams({
    email: ADMIN_EMAIL!,
    password: ADMIN_PASSWORD!,
    next: nextPath,
  });
  const res = await page.goto(`/api/dev/signin?${params.toString()}`, {
    waitUntil: "domcontentloaded",
  });
  expect(res?.ok()).toBeTruthy();
}

test.describe("Workspace payouts — branded embedded Connect", () => {
  test.skip(!USE_DEV_SIGNIN || !ADMIN_PASSWORD, "requires PLAYWRIGHT_USE_DEV_SIGNIN=1 + TEST_ADMIN_PASSWORD");

  test("Connect mounts the embedded onboarding inline (no stripe.com redirect) + persists", async ({ page }) => {
    await signIn(page, PAYOUTS);
    await page.goto(PAYOUTS, { waitUntil: "domcontentloaded" });

    // In-shell + status section present.
    await expect(page.getByRole("heading", { name: "Payouts" })).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText("Stripe account status").first()).toBeVisible();

    const connect = page.getByRole("button", { name: /Connect Stripe|Continue onboarding/i }).first();
    await expect(connect).toBeVisible({ timeout: 45_000 });
    await connect.click();

    // Embedded wrapper mounts inline (no navigation to stripe.com).
    await expect(
      page
        .getByTestId("connect-embedded-onboarding")
        .or(page.getByTestId("connect-embedded-onboarding-loading")),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("connect-embedded-onboarding-error")).toHaveCount(0);
    expect(page.url()).toContain("/impronta/admin/payouts"); // never left the app

    // The Stripe Connect embedded element actually mounts.
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

    // Persistence — the Account Session lazily created + saved the workspace
    // Express account id. Reload → the status section shows acct_… from the DB.
    // Retry the reload: the embedded iframe can mount slightly before the
    // Account Session call finishes creating the account server-side.
    await expect(async () => {
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByText(/acct_/).first()).toBeVisible({ timeout: 15_000 });
    }).toPass({ timeout: 75_000 });
  });
});
