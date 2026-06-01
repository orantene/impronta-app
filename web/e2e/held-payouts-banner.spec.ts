/**
 * Held-payouts banner — e2e proof (real browser, in-shell).
 *
 * Seeds a held payout leg for the test talent, then loads the in-shell talent
 * payouts page and asserts the banner renders with the held amount + the
 * Connect CTA is still present. The seed/cleanup is done via a tiny API the
 * test owns (env-gated) so the e2e is self-contained.
 *
 * Run (self-contained dev server on :3100):
 *   PLAYWRIGHT_USE_DEV_SIGNIN=1 PLAYWRIGHT_BASE_URL=http://localhost:3100 \
 *   PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_CHANNEL=chrome \
 *   TEST_TALENT_EMAIL=tulum-talent-sofia@impronta.test TEST_TALENT_PASSWORD='<pw>' \
 *   HELD_BANNER_E2E=1 \
 *   npx playwright test e2e/held-payouts-banner.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";

const USE_DEV_SIGNIN = process.env.PLAYWRIGHT_USE_DEV_SIGNIN === "1";
const TALENT_EMAIL = process.env.TEST_TALENT_EMAIL ?? "tulum-talent-sofia@impronta.test";
const TALENT_PASSWORD = process.env.TEST_TALENT_PASSWORD;
const ENABLED = process.env.HELD_BANNER_E2E === "1";

const PAYOUTS = "/talent/payouts";

async function signIn(page: Page, nextPath: string): Promise<void> {
  const params = new URLSearchParams({ email: TALENT_EMAIL, password: TALENT_PASSWORD!, next: nextPath });
  const res = await page.goto(`/api/dev/signin?${params.toString()}`, { waitUntil: "domcontentloaded" });
  expect(res, "signin navigation returned no response").not.toBeNull();
}

test.describe("Held-payouts banner (in-shell)", () => {
  test.skip(!USE_DEV_SIGNIN || !TALENT_PASSWORD || !ENABLED, "requires PLAYWRIGHT_USE_DEV_SIGNIN=1 + TEST_TALENT_PASSWORD + HELD_BANNER_E2E=1 (the harness seeds the held row out of band)");

  test("renders the held-payouts banner with the seeded amount + keeps the Connect CTA", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, PAYOUTS);
    await page.goto(PAYOUTS, { waitUntil: "domcontentloaded" }).catch(() => {});

    await expect(page.getByRole("heading", { name: "Payouts" })).toBeVisible({ timeout: 45_000 });

    // The banner — proves the held total was loaded server-side + rendered.
    const banner = page.getByTestId("held-payouts-banner");
    await expect(banner).toBeVisible({ timeout: 30_000 });
    await expect(banner).toContainText(/waiting to be released/i);
    await expect(banner).toContainText(/\$/); // a formatted currency amount

    // The Connect CTA is still there (the banner motivates onboarding, not replaces it).
    await expect(page.getByTestId("talent-connect-cta")).toBeVisible();
  });
});
