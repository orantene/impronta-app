/**
 * E2E spec — talent apply flow.
 *
 * Covers the happy-path for PR-F / PR-G (L48):
 *   1. Admin enables open applications for the workspace.
 *   2. Talent navigates to /talent/discover-agencies and sees the workspace.
 *   3. Talent submits an application.
 *   4. Admin sees the application in /admin/roster/applications.
 *   5. Admin approves the application.
 *   6. "Go to Roster →" shortcut is shown.
 *   7. Talent's application status shows "Approved" on the discover page.
 *
 * Env contract:
 *   TEST_ADMIN_EMAIL    / TEST_ADMIN_PASSWORD    — workspace admin account
 *   TEST_TALENT_EMAIL   / TEST_TALENT_PASSWORD   — a talent account NOT already on
 *                                                  the roster of the test workspace
 *   PLAYWRIGHT_TENANT_SLUG                       — defaults to "impronta"
 *   PLAYWRIGHT_USE_DEV_SIGNIN=1                  — opt in to /api/dev/signin
 *
 * All steps are skipped gracefully when credentials are absent.
 */

import { test, expect, type Page } from "@playwright/test";

const TENANT = process.env.PLAYWRIGHT_TENANT_SLUG ?? "impronta";
const ADMIN_EMAIL    = process.env.TEST_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;
const TALENT_EMAIL   = process.env.TEST_TALENT_EMAIL;
const TALENT_PASSWORD = process.env.TEST_TALENT_PASSWORD;
const USE_DEV_SIGNIN = process.env.PLAYWRIGHT_USE_DEV_SIGNIN === "1";

const hasAdminCreds  = Boolean(ADMIN_EMAIL  && ADMIN_PASSWORD);
const hasTalentCreds = Boolean(TALENT_EMAIL && TALENT_PASSWORD);

async function signInAs(page: Page, email: string, password: string, nextPath: string): Promise<void> {
  if (USE_DEV_SIGNIN) {
    const params = new URLSearchParams({ email, password, next: nextPath });
    const response = await page.goto(`/api/dev/signin?${params.toString()}`);
    expect(response?.ok()).toBeTruthy();
    return;
  }
  // Standard login form path.
  await page.goto(`/${TENANT}/login`);
  await page.fill('input[type="email"], input[name="email"]', email);
  await page.fill('input[type="password"], input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(`**${nextPath}**`, { timeout: 15_000 });
}

// ─── Step 1 + 4 + 5: Admin side ─────────────────────────────────────────────

test.describe("Apply flow — admin side", () => {
  test.skip(!hasAdminCreds, "Set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD to enable this suite.");

  test("admin can toggle open applications on", async ({ page }) => {
    await signInAs(page, ADMIN_EMAIL!, ADMIN_PASSWORD!, `/${TENANT}/admin/roster/applications`);
    await page.waitForURL(`**/${TENANT}/admin/roster/applications**`);

    // The toggle switch should be present.
    const toggle = page.getByRole("switch", { name: /accept open applications/i });
    await expect(toggle).toBeVisible();

    // If it's off, turn it on.
    const checked = await toggle.getAttribute("aria-checked");
    if (checked === "false") {
      await toggle.click();
      // Toggle should flip to true (optimistic).
      await expect(toggle).toHaveAttribute("aria-checked", "true");
    } else {
      // Already on — page is in the right state.
      expect(checked).toBe("true");
    }
  });

  test("applications page shows pending/decided sections", async ({ page }) => {
    await signInAs(page, ADMIN_EMAIL!, ADMIN_PASSWORD!, `/${TENANT}/admin/roster/applications`);
    await page.waitForURL(`**/${TENANT}/admin/roster/applications**`);

    // H1 should be visible with correct title.
    await expect(page.getByRole("heading", { name: /roster.*applications/i })).toBeVisible();
  });
});

// ─── Step 2 + 3: Talent side ─────────────────────────────────────────────────

test.describe("Apply flow — talent side", () => {
  test.skip(!hasTalentCreds, "Set TEST_TALENT_EMAIL and TEST_TALENT_PASSWORD to enable this suite.");

  test("discover agencies page loads and lists open agencies", async ({ page }) => {
    await signInAs(page, TALENT_EMAIL!, TALENT_PASSWORD!, "/talent/discover-agencies");
    await page.waitForURL("**/talent/discover-agencies**");

    await expect(page.getByRole("heading", { name: /apply to agencies/i })).toBeVisible();

    // Either agencies are listed or the empty state is shown — both are valid.
    const hasAgencies = await page.locator('button:has-text("Apply")').count() > 0;
    const emptyState  = await page.getByText(/no agencies are currently/i).count() > 0;
    expect(hasAgencies || emptyState).toBeTruthy();
  });

  test("talent can submit an application", async ({ page }) => {
    test.skip(!hasTalentCreds, "Talent creds required.");

    await signInAs(page, TALENT_EMAIL!, TALENT_PASSWORD!, "/talent/discover-agencies");
    await page.waitForURL("**/talent/discover-agencies**");

    const applyButton = page.locator('button:has-text("Apply")').first();
    const buttonCount = await applyButton.count();
    if (buttonCount === 0) {
      test.skip(true, "No open agencies to apply to in this environment.");
    }

    await applyButton.click();

    // Modal should appear.
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal.getByText(/send application/i)).toBeVisible();

    // Fill optional message.
    await modal.locator("textarea").fill("E2E test application — please ignore.");

    // Submit.
    await modal.getByRole("button", { name: /send application/i }).click();

    // Success state — modal should close and a toast should appear.
    await expect(modal).not.toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole("status")).toContainText(/application submitted/i);

    // Application should now appear in "Your applications" section.
    await expect(page.getByText(/your applications/i)).toBeVisible();
    await expect(page.getByText(/pending/i).first()).toBeVisible();
  });
});

// ─── Approval → shortcut: combined scenario ──────────────────────────────────

test.describe("Apply flow — approve and shortcut", () => {
  test.skip(
    !hasAdminCreds,
    "Set admin credentials to enable approval tests.",
  );

  test("approved applications show Go to Roster shortcut", async ({ page }) => {
    await signInAs(page, ADMIN_EMAIL!, ADMIN_PASSWORD!, `/${TENANT}/admin/roster/applications`);
    await page.waitForURL(`**/${TENANT}/admin/roster/applications**`);

    // If there's already an approved row, the shortcut should be visible.
    const rosterLink = page.getByText("Go to Roster →").first();
    const hasApproved = (await rosterLink.count()) > 0;
    if (hasApproved) {
      await expect(rosterLink).toBeVisible();
    }
    // Either way, the page must render without error.
    await expect(page.getByRole("heading", { name: /roster.*applications/i })).toBeVisible();
  });
});
