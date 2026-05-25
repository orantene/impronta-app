/**
 * Phase 2.1 — Talent platform IA smoke (app + public hosts).
 *
 *   PLAYWRIGHT_BASE_URL=https://app.tulala.digital npx playwright test e2e/talent-platform-ia.spec.ts
 *
 * Credentials (Impronta QA fixtures):
 *   QA audit talent: qa-talent-dashboard-audit@impronta.test / Impronta-QA-Talent-2026!
 *   Tulum talent:    tulum-talent-sofia@impronta.test / Impronta-Tulum-Talent-2026!
 */

import { test, expect, type Page } from "@playwright/test";

const QA_AUDIT_EMAIL = "qa-talent-dashboard-audit@impronta.test";
const QA_AUDIT_PASSWORD = "Impronta-QA-Talent-2026!";
const SOFIA_EMAIL = "tulum-talent-sofia@impronta.test";
const SOFIA_PASSWORD = "Impronta-Tulum-Talent-2026!";
const AUDIT_PROFILE_CODE = "TAL-AUDIT-0512";

async function dismissAnalyticsIfPresent(page: Page) {
  const btn = page.getByRole("button", { name: /decline/i });
  if (await btn.isVisible().catch(() => false)) await btn.click();
}

async function loginTalent(page: Page, email: string, password: string, next = "/talent/today") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await dismissAnalyticsIfPresent(page);
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: /log in with email/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
}

test.describe("Talent platform IA — redirects (unauthenticated)", () => {
  test("legacy slug talent URL returns 308 to platform path", async ({ request }) => {
    const head = await request.fetch("/impronta/talent/today", { maxRedirects: 0 });
    expect(head.status()).toBe(308);
    expect(head.headers().location ?? "").toMatch(/\/talent\/today/);
  });

  test("legacy slug talent URL in browser drops tenant slug", async ({ page }) => {
    await page.goto("/impronta/talent/today", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/(login\?next=.*talent%2Ftoday|talent\/today)/, {
      timeout: 60_000,
    });
    expect(page.url()).not.toMatch(/\/impronta\/talent/);
  });

  test("legacy /t/code/site redirects to /t/code", async ({ page }) => {
    await page.goto(`/t/${AUDIT_PROFILE_CODE}/site`);
    await expect(page).toHaveURL(new RegExp(`/t/${AUDIT_PROFILE_CODE}$`));
  });
});

test.describe("Talent platform IA — QA audit talent", () => {
  test.beforeEach(async ({ page }) => {
    await loginTalent(page, QA_AUDIT_EMAIL, QA_AUDIT_PASSWORD, "/talent/site");
  });

  test("/talent/site loads without tenant slug in URL", async ({ page }) => {
    await expect(page).toHaveURL(/\/talent\/site/);
    expect(page.url()).not.toMatch(/\/impronta\/talent/);
    await expect(page.getByRole("heading", { name: "My pages" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/Where you appear/i)).toBeVisible();
    await expect(page.getByText(/Impronta Models/i).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "View roster profile" }).first()).toBeVisible();
  });

  test("/talent/site lists Impronta and Morena Studio for QA audit talent", async ({ page }) => {
    await expect(page.getByText(/Where you appear · 2/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Morena Studio/i).first()).toBeVisible();
  });

  test("/talent/today loads platform shell", async ({ page }) => {
    await page.goto("/talent/today");
    await expect(page).toHaveURL(/\/talent\/today/);
    await expect(page.getByText(/Today/i).first()).toBeVisible({ timeout: 30_000 });
  });

  test("legacy inbox URL lands on platform inbox", async ({ page }) => {
    await page.goto("/impronta/talent/inbox", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/talent\/inbox/, { timeout: 60_000 });
    expect(page.url()).not.toMatch(/\/impronta\/talent/);
  });

  test("pure talent does not see Agency context switcher on /talent/site", async ({ page }) => {
    await expect(page.getByRole("combobox", { name: /agency context/i })).toHaveCount(0);
    await expect(page.getByText(/Agency context/i)).toHaveCount(0);
  });

  test("/talent/money renders Money page with agency cards", async ({ page }) => {
    await page.goto("/talent/money");
    await expect(page).toHaveURL(/\/talent\/money/);
    await expect(page.getByRole("heading", { name: "Money" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Impronta/i).first()).toBeVisible();
  });

  test("/talent/agencies redirects to /talent/money", async ({ request }) => {
    const head = await request.fetch("/talent/agencies", { maxRedirects: 0 });
    expect(head.status()).toBe(308);
    expect(head.headers().location ?? "").toMatch(/\/talent\/money/);
  });

  test("unified inbox shows agency filter chips on /talent/inbox", async ({ page }) => {
    await page.goto("/talent/inbox");
    await expect(page.locator("[data-tulala-talent-agency-filter]")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("button", { name: "All" })).toBeVisible();
  });
});

test.describe("Talent platform IA — Tulum talent (second account)", () => {
  test.beforeEach(async ({ page }) => {
    await loginTalent(page, SOFIA_EMAIL, SOFIA_PASSWORD, "/talent/today");
  });

  test("/talent/today and /talent/profile work without slug prefix", async ({ page }) => {
    await expect(page).toHaveURL(/\/talent\/today/);
    await page.goto("/talent/profile");
    await expect(page).toHaveURL(/\/talent\/profile/);
    expect(page.url()).not.toMatch(/\/impronta\/talent/);
  });
});

test.describe("Talent platform IA — public hosts", () => {
  test("tulala.digital /t/code loads default profile (platform host)", async ({
    page,
    baseURL,
  }) => {
    test.skip(!baseURL?.includes("app.tulala"), "Run with PLAYWRIGHT_BASE_URL=https://app.tulala.digital");
    const marketing = baseURL!.replace("app.tulala", "tulala");
    await page.goto(`${marketing}/t/TAL-00013`);
    await expect(page.getByRole("heading", { name: /Liora Vance/i })).toBeVisible({
      timeout: 30_000,
    });
    expect(page.url()).toContain("/t/TAL-00013");
    expect(page.url()).not.toContain("/site");
  });
});
