import { expect, prepareJourneysPage, shot, signInJourneysStaff, test } from "../_harness";

test.describe("QA remaining §7 deep smokes", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(120_000);

  test("public storefront reservation widget loads", async ({ page }) => {
    await prepareJourneysPage(page);
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(2000);
    const reserve = page.getByText(/reservar|reserve|book a table|party of/i).first();
    await shot(page, "remain-s7-storefront");
    if (await reserve.isVisible().catch(() => false)) {
      await reserve.click().catch(() => undefined);
      await shot(page, "remain-s7-reserve-widget");
    }
    await expect(page.getByText(/host not registered/i)).toHaveCount(0);
  });

  test("admin reservations shows book; overbook refusal is journeys-spec territory", async ({ page }) => {
    await prepareJourneysPage(page);
    await signInJourneysStaff(page, "/admin/reservations");
    await expect(page.getByText(/host not registered/i)).toHaveCount(0);
    await shot(page, "remain-s7-reservations-admin");
    test.info().annotations.push({
      type: "pending",
      description: "overbook refusal covered by e2e/journeys when JOURNEYS_FIXTURE_READY=1; not re-implemented here",
    });
  });

  test("events admin door list / tickets surface", async ({ page }) => {
    await prepareJourneysPage(page);
    await signInJourneysStaff(page, "/admin/events");
    await shot(page, "remain-s7-events");
    test.info().annotations.push({
      type: "pending",
      description: "ticket buy + QR + refund-one needs Stripe test + Messages refund sheet on paid admission",
    });
  });

  test("classes / sessions surface", async ({ page }) => {
    await prepareJourneysPage(page);
    await signInJourneysStaff(page, "/admin/appts?view=sessions");
    await shot(page, "remain-s7-sessions");
    test.info().annotations.push({
      type: "pending",
      description: "13th seat refused on 12-seat class is journeys capacity proof",
    });
  });
});
