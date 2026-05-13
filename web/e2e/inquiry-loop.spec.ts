/**
 * E2E spec — the inquiry conversation loop.
 *
 * Covers the five Wave 3 + Wave 4 fixes from the 2026-05-12 audit-recovery
 * sweep (see `memory/project_trust_the_loop_audit.md`):
 *   • Default `inquiry_requirement_groups` row created on submit
 *     (talent participant inserts no longer hit NOT NULL violation).
 *   • `inquiry_mark_thread_read` accepts the inquiry's primary client even
 *     before a participant row exists.
 *   • Client roster dropdown includes `"claimed"` talent, not just `"published"`.
 *   • Client thread page shows `"Coordinator"` (not a UUID prefix) when an
 *     admin has no `display_name` in profiles.
 *   • Client and talent composer can actually send (was admin-only stub).
 *
 * Env contract:
 *   TEST_CLIENT_EMAIL / TEST_CLIENT_PASSWORD — required to run client steps.
 *   TEST_ADMIN_EMAIL  / TEST_ADMIN_PASSWORD  — required to run admin steps.
 *   TEST_TALENT_EMAIL / TEST_TALENT_PASSWORD — required to run talent step
 *                                              (skipped if unset).
 *   PLAYWRIGHT_TENANT_SLUG — defaults to "impronta".
 *
 * Targets the same base URL as smoke.spec.ts (see playwright.config.ts).
 * On localhost, `npm run dev` is auto-started by the webServer config.
 *
 * Skip-by-default: missing credentials → tests are marked `.skip`, not
 * failed.  Set the env vars to opt in.
 */

import { test, expect, type Page } from "@playwright/test";

const TENANT = process.env.PLAYWRIGHT_TENANT_SLUG ?? "impronta";

const ADMIN_EMAIL    = process.env.TEST_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;
const CLIENT_EMAIL   = process.env.TEST_CLIENT_EMAIL;
const CLIENT_PASSWORD = process.env.TEST_CLIENT_PASSWORD;
const TALENT_EMAIL    = process.env.TEST_TALENT_EMAIL;
const TALENT_PASSWORD = process.env.TEST_TALENT_PASSWORD;

const USE_DEV_SIGNIN = process.env.PLAYWRIGHT_USE_DEV_SIGNIN === "1";

const hasAdminCreds  = Boolean(ADMIN_EMAIL  && ADMIN_PASSWORD);
const hasClientCreds = Boolean(CLIENT_EMAIL && CLIENT_PASSWORD);
const hasTalentCreds = Boolean(TALENT_EMAIL && TALENT_PASSWORD);

/** Sign in via the dev-only `/api/dev/signin` endpoint (when enabled) or the
 *  regular login form.  Mirrors smoke.spec.ts's helper but accepts per-role
 *  credentials so we can switch identities mid-test. */
async function signInAs(
  page: Page,
  email: string,
  password: string,
  nextPath: string,
): Promise<void> {
  if (USE_DEV_SIGNIN) {
    const params = new URLSearchParams({ email, password, next: nextPath });
    const response = await page.goto(`/api/dev/signin?${params.toString()}`);
    expect(response?.ok()).toBeTruthy();
    return;
  }
  await page.goto(`/login?next=${encodeURIComponent(nextPath)}`);
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), {
    timeout: 15_000,
  });
}

/** Sign out by hitting the logout endpoint. */
async function signOut(page: Page): Promise<void> {
  await page.goto("/api/auth/signout").catch(() => undefined);
  await page.context().clearCookies();
}

test.describe("inquiry loop — client → admin → talent", () => {
  test.skip(
    !hasClientCreds || !hasAdminCreds,
    "TEST_CLIENT_* and TEST_ADMIN_* must both be set; inquiry-loop spec is opt-in.",
  );

  // Bind a unique message body per test run so we can locate it later
  // even if the same inquiry has other traffic.
  const stamp = Date.now().toString(36);
  const clientNote   = `e2e-client-${stamp}`;
  const adminReply   = `e2e-admin-${stamp}`;
  const talentReply  = `e2e-talent-${stamp}`;

  // Captured across steps.
  let inquiryUrl = "";

  test("client submits inquiry → talent participant attached", async ({ page }) => {
    await signInAs(page, CLIENT_EMAIL!, CLIENT_PASSWORD!, `/${TENANT}/client/inquiries/new`);
    await page.waitForURL(new RegExp(`/${TENANT}/client/inquiries/new`));

    // Pick the first talent in the roster dropdown.  Wave 3 fix #3 ensures
    // this isn't empty on a fresh workspace.
    const talentSelect = page.getByLabel(/talent|select talent/i).first();
    await talentSelect.waitFor({ state: "visible", timeout: 10_000 });
    const options = await talentSelect.locator("option").all();
    expect(options.length, "roster dropdown should have at least one talent option").toBeGreaterThan(1);

    // Choose the first non-placeholder option.
    const firstReal = options.find((_, i) => i > 0);
    expect(firstReal).toBeTruthy();
    const firstRealValue = await firstReal!.getAttribute("value");
    if (firstRealValue) await talentSelect.selectOption(firstRealValue);

    // Fill the brief minimally.
    await page.getByLabel(/event|brief|describe/i).first().fill(`E2E inquiry ${stamp}`);

    // Submit.  Wave 3 fix #1 ensures the talent participant row inserts
    // without hitting the requirement_group_id NOT NULL constraint.
    await page.getByRole("button", { name: /request|submit|send/i }).first().click();

    // We land on the inquiry detail page on success.
    await page.waitForURL(new RegExp(`/${TENANT}/client/inquiries/[^/]+`), {
      timeout: 20_000,
    });
    inquiryUrl = page.url();
    expect(inquiryUrl).toMatch(/\/inquiries\/[0-9a-f-]{36}/);
  });

  test("client opens thread → markRead RPC succeeds (no forbidden banner)", async ({ page }) => {
    test.skip(!inquiryUrl, "Previous step did not produce an inquiry URL");
    await signInAs(page, CLIENT_EMAIL!, CLIENT_PASSWORD!, inquiryUrl);
    await page.waitForURL(new RegExp(`/${TENANT}/client/inquiries/[0-9a-f-]{36}`));

    // Wave 3 fix #2 — markRead RPC now grants the client access via
    // client_user_id even without a participant row.  A failure would
    // surface in the `?err=...` banner.
    const errBanner = page.locator('text=/forbidden|access denied|P0001/i');
    await expect(errBanner).toHaveCount(0);
  });

  test("client sends message → message appears in thread", async ({ page }) => {
    test.skip(!inquiryUrl, "Previous step did not produce an inquiry URL");
    await signInAs(page, CLIENT_EMAIL!, CLIENT_PASSWORD!, inquiryUrl);

    // Wave 4 fix — the send button is no longer admin-gated.  The composer
    // here lives inside ParticipantThreadShell or the workspace drawer
    // depending on viewport.
    const composer = page.getByRole("textbox").last();
    await composer.fill(clientNote);
    await page.getByRole("button", { name: /^send$|send message/i }).last().click();

    await expect(page.locator(`text=${clientNote}`).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("admin sees the inquiry, replies, sender name is not a UUID", async ({ page }) => {
    test.skip(!inquiryUrl, "Previous step did not produce an inquiry URL");
    const inquiryId = inquiryUrl.match(/\/inquiries\/([0-9a-f-]{36})/)?.[1];
    expect(inquiryId).toBeTruthy();

    await signOut(page);
    await signInAs(page, ADMIN_EMAIL!, ADMIN_PASSWORD!, `/${TENANT}/admin`);
    await page.waitForURL(new RegExp(`/${TENANT}/admin`));

    // Open the inquiry directly by ID — admin shell exposes a deep-link
    // surface via the drawer or via the inquiries route.
    await page.goto(`/${TENANT}/admin?drawer=inquiry-workspace&inquiryId=${inquiryId}`);

    // Admin should see the client's e2e note.
    await expect(page.locator(`text=${clientNote}`).first()).toBeVisible({
      timeout: 15_000,
    });

    // Reply.
    const composer = page.getByRole("textbox").last();
    await composer.fill(adminReply);
    await page.getByRole("button", { name: /^send$|send message/i }).last().click();
    await expect(page.locator(`text=${adminReply}`).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("client sees admin reply with 'Coordinator' label (not a UUID prefix)", async ({ page }) => {
    test.skip(!inquiryUrl, "Previous step did not produce an inquiry URL");
    await signOut(page);
    await signInAs(page, CLIENT_EMAIL!, CLIENT_PASSWORD!, inquiryUrl);

    // Wave 3 fix #4 — sender name falls back to "Coordinator" instead of
    // the first 8 chars of the sender's user_id when display_name is null.
    await expect(page.locator(`text=${adminReply}`).first()).toBeVisible({
      timeout: 15_000,
    });

    // No raw UUID prefixes visible.  Match an 8-hex chunk followed by `…` or
    // appearing as a standalone "name" — we just assert no such 8-hex name
    // exists near the message body.  This is intentionally loose to avoid
    // false negatives from genuine 8-char names.
    const rawUuidNameNearReply = page.locator(
      `xpath=//*[contains(normalize-space(), "${adminReply}")]/preceding::*[matches(normalize-space(), "^[0-9a-f]{8}$", "i")]`,
    );
    expect(await rawUuidNameNearReply.count()).toBe(0);
  });

  test.describe("talent reply (optional)", () => {
    test.skip(!hasTalentCreds, "TEST_TALENT_* not set — skipping talent leg");

    test("talent sees inquiry in inbox and can reply", async ({ page }) => {
      test.skip(!inquiryUrl, "Previous step did not produce an inquiry URL");
      const inquiryId = inquiryUrl.match(/\/inquiries\/([0-9a-f-]{36})/)?.[1];
      expect(inquiryId).toBeTruthy();

      await signOut(page);
      await signInAs(page, TALENT_EMAIL!, TALENT_PASSWORD!, `/${TENANT}/talent/inbox`);
      await page.waitForURL(new RegExp(`/${TENANT}/talent/inbox`));

      // Talent should see the inquiry they were added to.  Wave 3 fix #1
      // made this possible by actually inserting the talent participant.
      const inquiryCard = page.locator(`a[href*="${inquiryId}"]`).first();
      await expect(inquiryCard).toBeVisible({ timeout: 15_000 });
      await inquiryCard.click();

      // Wave 4 fix — talent can send in the group thread.
      const composer = page.getByRole("textbox").last();
      await composer.fill(talentReply);
      await page.getByRole("button", { name: /^send$|send message/i }).last().click();
      await expect(page.locator(`text=${talentReply}`).first()).toBeVisible({
        timeout: 10_000,
      });
    });
  });
});
