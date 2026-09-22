import { expect, prepareJourneysPage, shot, signInJourneysStaff, test } from "../_harness";

test.describe("QA remaining §7 deep smokes", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(120_000);

  test("public storefront reservation widget loads", async ({ page }) => {
    await prepareJourneysPage(page);
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(2000);
    await expect(page.getByText(/host not registered/i)).toHaveCount(0);
    const reserve = page.getByText(/reservar|reserve|book a table|party of/i).first();
    await expect(
      reserve,
      "storefront reservation/book affordance missing — §7 door not exercised",
    ).toBeVisible({ timeout: 20_000 });
    await reserve.click();
    await page.waitForTimeout(1000);
    await shot(page, "remain-s7-reserve-widget");
  });

  test("admin reservations door loads", async ({ page }) => {
    await prepareJourneysPage(page);
    await signInJourneysStaff(page, "/admin/reservations");
    await expect(page.getByText(/host not registered/i)).toHaveCount(0);
    await expect(
      page.getByText(/reservation|book|table|party/i).first(),
      "admin reservations surface empty / wrong page",
    ).toBeVisible({ timeout: 30_000 });
    await shot(page, "remain-s7-reservations-admin");
  });

  test("events admin door loads", async ({ page }) => {
    await prepareJourneysPage(page);
    await signInJourneysStaff(page, "/admin/events");
    await expect(page.getByText(/host not registered/i)).toHaveCount(0);
    await expect(
      page.getByText(/event|ticket|admission/i).first(),
      "admin events surface empty / wrong page",
    ).toBeVisible({ timeout: 30_000 });
    await shot(page, "remain-s7-events");
  });

  test("classes / sessions surface loads", async ({ page }) => {
    await prepareJourneysPage(page);
    await signInJourneysStaff(page, "/admin/appts?view=sessions");
    await expect(page.getByText(/host not registered/i)).toHaveCount(0);
    await expect(
      page.getByText(/session|class|appt|appointment/i).first(),
      "admin sessions surface empty / wrong page",
    ).toBeVisible({ timeout: 30_000 });
    await shot(page, "remain-s7-sessions");
  });
});
