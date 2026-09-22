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
    const alreadyAccepted = client.getByText(/^accepted/i).first();
    if (await accept.isVisible().catch(() => false)) {
      await shot(client, "client-payment-deep-accept");
      await accept.click();
      await expect(
        client.getByText(/accepted/i).first(),
        "client did not show Accepted after Accept",
      ).toBeVisible({ timeout: 25_000 });
    } else {
      await expect(
        alreadyAccepted,
        "client Accept missing and no Accepted state — offer card never reached the client thread",
      ).toBeVisible({ timeout: 25_000 });
      await shot(client, "client-payment-deep-already-accepted");
    }
    await client.close().catch(() => undefined);

    await page.bringToFront();
    await page.waitForTimeout(800);
    await openPlusTray(page);
    await page.locator('[data-tray-item="payment"]').click();
    const sheet = page.locator("[data-payment-request-sheet], [data-sheet]").first();
    await expect(sheet, "Payment request sheet did not open").toBeVisible({ timeout: 20_000 });
    await shot(page, "admin-payment-deep-open");

    // openRequestFor reads conversation_records.payment_state requested|opened.
    // There is no Cancel on PaymentCard — clear via Cancel/refund sheet if blocked.
    const openHint = sheet.getByText(/one open request|open request at a time/i).first();
    if (await openHint.isVisible().catch(() => false)) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
      await openPlusTray(page);
      const cancelItem = page.locator('[data-tray-item="cancel"], [data-tray-item="cancel_refund"]').first();
      if (await cancelItem.isVisible().catch(() => false)) {
        await cancelItem.click();
      } else {
        // Fallback: open Cancel from More / next-step.
        const moreCancel = page.getByRole("button", { name: /^cancel/i }).first();
        await expect(
          moreCancel,
          "open request blocks pay-link and Cancel control is missing — clear conversation_records.payment_state requested|opened on the QA order",
        ).toBeVisible({ timeout: 10_000 });
        await moreCancel.click();
      }
      const cancelSheet = page.locator("[data-cancel-sheet], [data-sheet]").first();
      await expect(cancelSheet, "Cancel sheet did not open to clear open request").toBeVisible({
        timeout: 15_000,
      });
      // Prefer keeping money / voiding the open request without a refund if offered.
      const keep = cancelSheet.getByText(/keep|no refund|cancel without/i).first();
      if (await keep.isVisible().catch(() => false)) await keep.click();
      const primary = cancelSheet.locator("[data-cancel-primary], [data-sheet-primary]").first();
      if (await primary.isVisible().catch(() => false)) {
        await primary.click();
        await page.waitForTimeout(2000);
      } else {
        throw new Error(
          "Cancel sheet has no primary — clear open request via SQL on conversation_records.payment_state before this spec",
        );
      }
      await openPlusTray(page);
      await page.locator('[data-tray-item="payment"]').click();
      await expect(sheet, "Payment sheet did not reopen after clearing open request").toBeVisible({
        timeout: 20_000,
      });
    }

    const link = sheet.getByText(/pay link|send a pay link/i).first();
    await expect(link, "Pay link option missing").toBeVisible({ timeout: 10_000 });
    await link.click();
    const full = sheet.getByRole("radio", { name: /full amount/i }).first();
    await expect(full, "Full amount option missing on payment sheet").toBeVisible({ timeout: 10_000 });
    await full.click();
    await shot(page, "admin-payment-link-selected");

    const stillBlocked = sheet.getByText(/one open request|open request at a time/i).first();
    if (await stillBlocked.isVisible().catch(() => false)) {
      throw new Error(
        `pay-link still blocked after cancel: ${(await stillBlocked.innerText()).trim()}`,
      );
    }
    const send = sheet.locator("[data-payment-send]").first();
    await expect(
      send,
      "Payment Send disabled — need order target + Full/Other amount to mint a pay link",
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
