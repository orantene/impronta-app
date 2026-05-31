/**
 * Payouts in-shell section — e2e (real browser, real React events).
 *
 * Proves the Payouts surface now renders INSIDE the admin dashboard shell
 * (nav + chrome) AND that its interactive write path works — something the
 * MCP/programmatic clicks couldn't reliably exercise on React-controlled forms.
 *
 * Run (against the already-running local dev server on :3100):
 *   PLAYWRIGHT_USE_DEV_SIGNIN=1 \
 *   PLAYWRIGHT_BASE_URL=http://localhost:3100 \
 *   TEST_ADMIN_EMAIL=orantene@gmail.com \
 *   TEST_ADMIN_PASSWORD='<dev-admin-password>' \
 *   PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_CHANNEL=chrome \
 *   npx playwright test e2e/payouts-section.spec.ts
 */

import { test, expect, type Page } from "@playwright/test";

const USE_DEV_SIGNIN = process.env.PLAYWRIGHT_USE_DEV_SIGNIN === "1";
const ADMIN_EMAIL =
  process.env.TEST_ADMIN_EMAIL ?? (USE_DEV_SIGNIN ? "orantene@gmail.com" : undefined);
const ADMIN_PASSWORD =
  process.env.TEST_ADMIN_PASSWORD ?? (USE_DEV_SIGNIN ? "12341234" : undefined);

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

/** First number input on the page = the "Flat fee ($ USD)" field. */
function flatFeeInput(page: Page) {
  return page.locator('input[type="number"]').first();
}

test.describe("Payouts renders inside the admin shell", () => {
  test.skip(!USE_DEV_SIGNIN, "requires PLAYWRIGHT_USE_DEV_SIGNIN=1 + dev credentials");

  test("shows the dashboard nav + payout content (not a standalone page)", async ({ page }) => {
    await signIn(page, PAYOUTS);
    await page.goto(PAYOUTS, { waitUntil: "domcontentloaded" });

    // The dashboard shell nav — proves we're INSIDE the shell, not the old
    // standalone/canonical page (which had no nav).
    // Nav items appear in both the desktop nav and the mobile bottom-nav, so
    // scope to the first match (presence is what proves we're inside the shell).
    await expect(page.getByText("Overview", { exact: true }).first()).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText("Settings", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Roster", { exact: true }).first()).toBeVisible();

    // The payouts content itself.
    await expect(page.getByRole("heading", { name: "Payouts" })).toBeVisible();
    await expect(page.getByText("Stripe account status")).toBeVisible();
    await expect(page.getByRole("button", { name: /Connect Stripe/i })).toBeVisible();
    await expect(page.getByText("Booking reservation fee")).toBeVisible();

    // No error-boundary / stuck-loading state.
    await expect(page.getByText(/Something broke/i)).toHaveCount(0);
    await expect(page.getByText(/Loading payout settings/i)).toHaveCount(0);
  });

  test("Connect Stripe button is present + enabled (not clicked — onboarding is the user's)", async ({ page }) => {
    await signIn(page, PAYOUTS);
    await page.goto(PAYOUTS, { waitUntil: "domcontentloaded" });
    const connect = page.getByRole("button", { name: /Connect Stripe/i });
    await expect(connect).toBeVisible({ timeout: 45_000 });
    await expect(connect).toBeEnabled();
  });

  test("Save fee writes + persists the base reservation fee (interactive round-trip)", async ({ page }) => {
    await signIn(page, PAYOUTS);
    await page.goto(PAYOUTS, { waitUntil: "domcontentloaded" });

    const flat = flatFeeInput(page);
    await expect(flat).toBeVisible({ timeout: 45_000 });

    // Save a flat fee. Wait for the actual server-action POST to complete
    // (deterministic) rather than racing the transient success toast.
    const savePost = () =>
      page.waitForResponse(
        (r) => r.request().method() === "POST" && r.url().includes("/impronta/admin/payouts"),
        { timeout: 30_000 },
      );
    await flat.fill("25");
    let post = savePost();
    await page.getByRole("button", { name: /^Save fee$/i }).click();
    await post;

    // Deterministic proof it persisted: reload → the value comes back via the
    // server-side bridge load (proves the write actually hit the DB).
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(flatFeeInput(page)).toHaveValue("25", { timeout: 45_000 });

    // Cleanup — revert to no base fee so the test is idempotent.
    const flat2 = flatFeeInput(page);
    await flat2.fill("");
    post = savePost();
    await page.getByRole("button", { name: /^Save fee$/i }).click();
    await post;
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(flatFeeInput(page)).toHaveValue("", { timeout: 45_000 });
  });
});
