import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  awaitHydrated,
  expect,
  openAdminMessages,
  openPlusTray,
  requireClientLink,
  shot,
  test,
} from "../_harness";

/** Accepted/awaiting offer inquiry used by payment-deep. */
const PAY_INQUIRY =
  process.env.QA_OUTSIDE_PAY_INQUIRY_ID ??
  process.env.QA_AWAITING_OFFER_INQUIRY_ID ??
  "45a9b17e-63ec-4254-929a-4c67cb0b4e47";

test.describe("QA payment — record paid outside", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(240_000);

  test("outside cash → Payment card + record chip paid", async ({ page, context }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);

    const u = new URL(page.url());
    u.searchParams.set("inquiry", PAY_INQUIRY);
    await page.goto(u.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page.locator("[data-messages-v5]").first()).toBeVisible({ timeout: 30_000 });
    await awaitHydrated(page);

    // Ensure offer is accepted so payment targets exist.
    const client = await requireClientLink(page, context);
    const accept = client.locator('[data-client-action="accept_offer"]').first();
    const already = client.getByText(/^accepted/i).first();
    if (await accept.isVisible().catch(() => false)) {
      await accept.click();
      await expect(client.getByText(/accepted/i).first()).toBeVisible({ timeout: 25_000 });
    } else {
      await expect(already, "client Accept missing and no Accepted state").toBeVisible({
        timeout: 25_000,
      });
    }
    await client.close().catch(() => undefined);
    await page.bringToFront();

    await openPlusTray(page);
    await page.locator('[data-tray-item="payment"]').click();
    const sheet = page.locator("[data-payment-request-sheet], [data-sheet]").first();
    await expect(sheet, "Payment request sheet did not open").toBeVisible({ timeout: 20_000 });

    const outside = sheet.getByText(/record as paid outside|paid outside/i).first();
    await expect(outside, "Record as paid outside option missing").toBeVisible({ timeout: 10_000 });
    await outside.click();
    await expect(sheet.locator("[data-payment-outside]").first(), "outside methods missing").toBeVisible({
      timeout: 10_000,
    });
    const cash = sheet.getByText(/^cash$/i).first();
    await expect(cash, "Cash outside method missing").toBeVisible({ timeout: 10_000 });
    await cash.click();
    const full = sheet.getByRole("radio", { name: /full amount/i }).first();
    if (await full.isVisible().catch(() => false)) await full.click();
    const send = sheet.locator("[data-payment-send]").first();
    await expect(send, "Payment Send disabled for outside cash path").toBeEnabled({
      timeout: 20_000,
    });
    const before = await page.locator('[data-card="payment"]').count();
    await send.click();
    await expect(
      page.locator('[data-card="payment"]').nth(before).or(page.getByText(/recorded|paid/i).first()),
      "outside payment did not land a Payment card / recorded confirmation",
    ).toBeVisible({ timeout: 25_000 });
    await shot(page, "admin-payment-outside-cash");

    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);
    const header = ((await page.locator("[data-thread-header]").innerText()) || "").replace(
      /\s+/g,
      " ",
    );
    expect(header, `record chip should reflect paid after outside cash; got: ${header}`).toMatch(
      /paid/i,
    );

    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
