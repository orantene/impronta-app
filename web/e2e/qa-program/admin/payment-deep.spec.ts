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

/** Sent + awaiting_acceptance on the QA tenant (seeded Round-2 offer). */
const AWAITING_OFFER_INQUIRY =
  process.env.QA_AWAITING_OFFER_INQUIRY_ID ?? "ad22e3e4-9ad9-431b-b922-1ccf3bf5c10f";

test.describe("QA 6.1 payment flows", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(240_000);

  test("Request payment: pay-link path mints a Payment card", async ({ page, context }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);

    // Deep-link a thread that already has a sent offer awaiting Accept
    // (D-MSG-307/308: Add-items→Send on Cora only adds draft lines; New→Start
    // is flaky unavailable). Effect still required below.
    const u = new URL(page.url());
    u.searchParams.set("inquiry", AWAITING_OFFER_INQUIRY);
    await page.goto(u.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page.locator("[data-messages-v5]").first()).toBeVisible({ timeout: 30_000 });
    await awaitHydrated(page);

    const offer = page.locator('[data-card="offer"]').last();
    await expect(
      offer,
      `staff stream missing offer card on inquiry ${AWAITING_OFFER_INQUIRY} — seed a sent offer`,
    ).toBeVisible({ timeout: 25_000 });
    await shot(page, "admin-payment-deep-offer-sent");

    const client = await requireClientLink(page, context);
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
