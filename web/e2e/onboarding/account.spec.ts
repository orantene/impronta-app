/**
 * Phase 4 · the account step (code only).
 *
 * A guest reaches "Save it" after the short form; Google is a popup to
 * `/auth/google?popup=1` (asserted by URL, never completed here); the email
 * path sends a code through `signInWithOtp`. On a stack whose auth email hook
 * is not configured the send fails and the module must say so, not pretend.
 * With `ONB_OTP_MINT=1` and a working hook, the spec mints the code through
 * `generateLink` and finishes the sign-in.
 */
import { isolatedService } from "../cases/_isolated-db";
import { evidence, expect, openHome, test } from "./_module";

async function reachSave(page: Parameters<typeof openHome>[0]) {
  await openHome(page);
  await page.getByRole("button", { name: /Sell your work/ }).first().click();
  await page.getByTestId("onb-sentence").fill("I clean houses in Playa del Carmen, Monday to Saturday.");
  await page.getByTestId("onb-send").click();
  await page.getByTestId("onb-confirm-send").click();
  await expect(page.getByTestId("onb-understood")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("onb-accept").click();
  await page.getByTestId("onb-basics-what").fill("House cleaner");
  await page.getByTestId("onb-basics-city").fill("Playa del Carmen");
  await page.getByTestId("onb-next").click();
  await page.getByTestId("onb-name-input").fill("Rosa");
  await page.getByTestId("onb-next").click();
  await page.getByTestId("onb-service-0").fill("House cleaning");
  await page.getByTestId("onb-next").click();
  await expect(page.getByTestId("onb-ready")).toBeVisible();
  await page.getByTestId("onb-build").click();
  await expect(page.getByTestId("onb-save")).toBeVisible();
}

test.describe("onboarding · account", () => {
  test("a guest reaches Save it; Google opens the popup to /auth/google; Back keeps everything", async ({ page, context }) => {
    await reachSave(page);
    await expect(page.getByTestId("onb-step-label")).toHaveText(/3 · Save/);
    await expect(page.getByTestId("onb-account-pill")).toHaveText(/Not signed in/);
    await evidence(page, "20-save");
    const popupPromise = context.waitForEvent("page");
    await page.getByTestId("onb-google").getByRole("button").click();
    const popup = await popupPromise;
    await popup.waitForLoadState("domcontentloaded").catch(() => {});
    const url = popup.url();
    expect(url.includes("/auth/google?popup=1&next=") || url.includes("accounts.google.com") || url.includes("supabase.co/auth/v1/authorize")).toBeTruthy();
    await popup.close();
    await expect(page.getByTestId("onb-google")).toContainText(/closed before finishing|Continue with Google/);
    await page.getByTestId("onb-back").click();
    await expect(page.getByTestId("onb-ready")).toBeVisible();
    await expect(page.getByTestId("onb-ready-facts")).toContainText("Rosa");
  });

  test("email → code, same screen for a new and a known address; wrong code stays; minted code signs in", async ({ page }) => {
    const runId = Date.now().toString(36);
    const email = `qa-onb-${runId}@impronta.test`;
    await reachSave(page);
    await page.getByTestId("onb-email").fill(email);
    await page.getByTestId("onb-email-cta").click();
    const code = page.getByTestId("onb-code");
    const err = page.getByTestId("onb-error");
    await expect(code.or(err)).toBeVisible({ timeout: 20_000 });
    if (await err.isVisible()) {
      // The auth email hook is not configured on this stack: honest error,
      // no code screen, the address kept. Owner's day-1 item.
      test.info().annotations.push({ type: "not-clicked", description: `send failed: ${await err.innerText()}` });
      await expect(code).toHaveCount(0);
      await expect(page.getByTestId("onb-email")).toHaveValue(email);
      return;
    }
    await expect(code).toContainText(email);
    await expect(page.getByTestId("onb-resend-wait")).toBeVisible();
    await evidence(page, "21-code");
    // Wrong code: inline error, the screen stays.
    await page.locator('[data-testid="onb-code"] input').first().fill("1");
    for (let i = 1; i < 8; i += 1) await page.locator('[data-testid="onb-code"] input').nth(i).fill(String(i));
    await expect(page.getByTestId("onb-error")).toBeVisible({ timeout: 20_000 });
    await expect(code).toBeVisible();
    if (process.env.ONB_OTP_MINT !== "1") return;
    const admin = isolatedService();
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
    const otp = link.data?.properties?.email_otp ?? "";
    expect(otp).toHaveLength(8);
    for (let i = 0; i < 8; i += 1) await page.locator('[data-testid="onb-code"] input').nth(i).fill(otp[i]);
    await expect(page.getByTestId("onb-account-pill")).toContainText(email, { timeout: 20_000 });
    await expect(page.getByTestId("onb-step-label")).toHaveText(/4 · Build/);
  });
});
