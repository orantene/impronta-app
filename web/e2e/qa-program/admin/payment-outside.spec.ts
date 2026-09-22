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

/** Prefer an inquiry with an order chip (canMintLink) so outside records against an order. */
const PAY_INQUIRY =
  process.env.QA_OUTSIDE_PAY_INQUIRY_ID ??
  process.env.QA_AWAITING_OFFER_INQUIRY_ID ??
  "ad22e3e4-9ad9-431b-b922-1ccf3bf5c10f";

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
    // Outside canSend needs amountCents > 0 AND reference ≥3. Prefer Full so
    // amount matches the order (Other $50 on an $18 order → invalid / "That
    // cannot be saved." via recordVerifiedCollection amount gate).
    const full = sheet.getByRole("radio", { name: /full amount/i }).first();
    const other = sheet.getByRole("radio", { name: /other/i }).first();
    if (await full.isVisible().catch(() => false)) {
      await full.click();
      // Full can leave amountCents null in options — fall through to Other if Send stays disabled.
    }
    const send = sheet.locator("[data-payment-send]").first();
    const ref = sheet.locator("#msgv5-payment-reference").first();
    await expect(ref, "outside payment reference field missing").toBeVisible({ timeout: 10_000 });
    await ref.fill("QA cash counter");
    if (!(await send.isEnabled().catch(() => false))) {
      await expect(other, "Other amount option missing when Full does not enable Send").toBeVisible({
        timeout: 10_000,
      });
      await other.click();
      const otherInput = sheet.locator("#msgv5-payment-other").first();
      await expect(otherInput, "Other amount input missing").toBeVisible({ timeout: 10_000 });
      // Match the accepted offer total on this fixture ($18.00).
      await otherInput.fill("18.00");
    }
    await expect(
      send,
      "Payment Send disabled for outside cash — need amount > 0 and reference ≥3 chars",
    ).toBeEnabled({
      timeout: 20_000,
    });
    const beforeCards = await page.locator('[data-card="payment"]').count();
    await send.click();
    // Surface sheet refusal instead of waiting on a missing stream line.
    const refused = sheet.locator("[data-phase='refused'], [data-payment-refusal]").first();
    const tryAgain = sheet.getByText(/could not be completed|try again/i).first();
    if (
      (await refused.isVisible().catch(() => false)) ||
      (await tryAgain.isVisible().catch(() => false))
    ) {
      const why = ((await sheet.innerText()) || "").replace(/\s+/g, " ").trim().slice(0, 240);
      throw new Error(`outside cash refused: ${why}`);
    }
    // Outside path writes a change_result message (not a Payment card).
    await expect(
      page.getByText(/Recorded .+ paid \(cash\)/i).first(),
      "outside cash did not post Recorded…paid (cash) change_result in the stream",
    ).toBeVisible({ timeout: 25_000 });
    await shot(page, "admin-payment-outside-cash");

    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-messages-v5]").first()).toBeVisible({ timeout: 30_000 });
    await awaitHydrated(page);
    await expect(
      page.getByText(/Recorded .+ paid \(cash\)/i).first(),
      "Recorded outside cash line missing after reload",
    ).toBeVisible({ timeout: 20_000 });
    // Payment card count must not grow from an open pay-link mint on this path.
    const afterCards = await page.locator('[data-card="payment"]').count();
    expect(afterCards, "outside path must not mint a Payment card").toBe(beforeCards);

    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
