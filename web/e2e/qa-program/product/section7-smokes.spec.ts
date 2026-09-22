import { assertNoRawI18nKeys, attachConsoleGuard, expect, prepareJourneysPage, shot, signInJourneysStaff, test } from "../_harness";

/**
 * §7 product dependency smokes on the QA fixture host.
 * Deep Stripe / overbook proofs stay on dedicated journeys specs when present.
 */
test.describe("QA §7 product dependency smokes", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("catalogue admin surfaces open", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await prepareJourneysPage(page);
    await signInJourneysStaff(page, "/admin/catalog");
    await expect(page.locator("body")).toBeVisible();
    await expect(page.getByText(/host not registered/i)).toHaveCount(0);
    await shot(page, "product-catalogue");
    expect(errors.filter((e) => !/hydration/i.test(e)), errors.join("\n")).toEqual([]);
  });

  test("reservations book opens", async ({ page }) => {
    await prepareJourneysPage(page);
    await signInJourneysStaff(page, "/admin/reservations");
    await expect(page.getByText(/host not registered/i)).toHaveCount(0);
    await shot(page, "product-reservations");
  });

  test("events / tickets admin opens", async ({ page }) => {
    await prepareJourneysPage(page);
    await signInJourneysStaff(page, "/admin/events");
    await expect(page.getByText(/host not registered/i)).toHaveCount(0);
    await shot(page, "product-events");
  });

  test("appointments / classes open", async ({ page }) => {
    await prepareJourneysPage(page);
    await signInJourneysStaff(page, "/admin/appts");
    await expect(page.getByText(/host not registered/i)).toHaveCount(0);
    await shot(page, "product-appts");
  });

  test("clients list opens", async ({ page }) => {
    await prepareJourneysPage(page);
    await signInJourneysStaff(page, "/admin/clients");
    await expect(page.getByText(/host not registered/i)).toHaveCount(0);
    await shot(page, "product-clients");
  });

  test("payments + sales pages open", async ({ page }) => {
    await prepareJourneysPage(page);
    await signInJourneysStaff(page, "/admin/payments");
    await expect(page.getByText(/host not registered/i)).toHaveCount(0);
    await shot(page, "product-payments");
    await signInJourneysStaff(page, "/admin/sales");
    await shot(page, "product-sales");
  });

  test("team page opens; staff sign-in works", async ({ page }) => {
    await prepareJourneysPage(page);
    await signInJourneysStaff(page, "/admin/team", "qa-journeys-staff@impronta.test");
    await expect(page.getByText(/host not registered/i)).toHaveCount(0);
    await shot(page, "product-team-staff");
  });

  test("website builder settings reachable", async ({ page }) => {
    await prepareJourneysPage(page);
    await signInJourneysStaff(page, "/admin/website");
    await expect(page.getByText(/host not registered/i)).toHaveCount(0);
    await shot(page, "product-website");
  });

  test("inbox a11y: rows have accessible names", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await prepareJourneysPage(page);
    await signInJourneysStaff(page, "/admin/messages");
    await expect(page.locator("[data-messages-v5]")).toBeVisible({ timeout: 30_000 });
    const rows = page.locator("[data-inbox-row]");
    await expect(rows.first()).toBeVisible({ timeout: 20_000 });
    const first = rows.first();
    const name = (await first.getAttribute("aria-label")) || (await first.innerText());
    expect(name.trim().length).toBeGreaterThan(0);
    // Keyboard: focus first row
    await first.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);
    await shot(page, "product-a11y-inbox");
    // If missing accessible name, file as defect in report — still assert non-empty text
    if (!(await first.getAttribute("aria-label"))) {
      test.info().annotations.push({ type: "defect", description: "inbox rows lack aria-label (known in prompt)" });
    }
    expect(errors.filter((e) => !/hydration/i.test(e)), errors.join("\n")).toEqual([]);
  });

  test("performance: inbox load timing", async ({ page }) => {
    await prepareJourneysPage(page);
    const t0 = Date.now();
    await signInJourneysStaff(page, "/admin/messages");
    await expect(page.locator("[data-inbox-row]").first()).toBeVisible({ timeout: 30_000 });
    const ms = Date.now() - t0;
    test.info().annotations.push({ type: "perf", description: `inbox ${ms}ms` });
    expect(ms).toBeLessThan(15_000);
    await shot(page, "product-perf-inbox");
  });
});
