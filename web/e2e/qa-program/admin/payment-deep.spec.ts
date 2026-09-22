import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  expect,
  openAdminMessages,
  openPlusTray,
  requireClientLink,
  sendPricedOffer,
  shot,
  test,
} from "../_harness";

test.describe("QA 6.1 payment flows", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(240_000);

  test("Request payment: pay-link path mints a Payment card", async ({ page, context }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    // Fresh thread so Accept is against the offer we just sent (D-MSG-307).
    await sendPricedOffer(page, { fresh: true });
    await expect(
      page.locator('[data-card="offer"]').last(),
      "staff stream missing offer card before client Accept",
    ).toBeVisible({ timeout: 10_000 });
    await shot(page, "admin-payment-deep-offer-sent");

    const client = await requireClientLink(page, context);
    await expect(client, "client link page did not open").toBeTruthy();
    expect(client.url(), "client page URL is not /c/t/…").toMatch(/\/c\/t\//);

    const accept = client.locator('[data-client-action="accept_offer"]').first();
    await expect(
      accept,
      "client Accept missing after priced offer — offer card never reached the client thread",
    ).toBeVisible({ timeout: 25_000 });
    await shot(client, "client-payment-deep-accept");
    await accept.click();
    await expect(
      client.getByText(/accepted/i).first(),
      "client did not show Accepted after Accept",
    ).toBeVisible({ timeout: 25_000 });
    await client.close().catch(() => undefined);

    await page.bringToFront();
    await page.waitForTimeout(800);
    await openPlusTray(page);
    await page.locator('[data-tray-item="payment"]').click();
    const sheet = page.locator("[data-payment-request-sheet], [data-sheet]").first();
    await expect(sheet, "Payment request sheet did not open").toBeVisible({ timeout: 20_000 });
    await shot(page, "admin-payment-deep-open");

    const link = sheet.getByText(/pay link|send a pay link/i).first();
    await expect(link, "Pay link option missing").toBeVisible({ timeout: 10_000 });
    await link.click();
    await shot(page, "admin-payment-link-selected");

    const send = sheet.locator("[data-payment-send]").first();
    await expect(
      send,
      "Payment Send disabled — need an accepted/order target on this thread to mint a pay link",
    ).toBeEnabled({ timeout: 20_000 });
    const before = await page.locator('[data-card="payment"]').count();
    await send.click();
    await expect(
      page.locator('[data-card="payment"]').nth(before),
      "Payment card did not appear after minting pay link",
    ).toBeVisible({ timeout: 25_000 });
    await shot(page, "admin-payment-deep-sent");

    await page.keyboard.press("Escape");
    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
