import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  expect,
  openAdminMessages,
  openPlusTray,
  requireClientLink,
  sendPricedOffer,
  sendTimesCard,
  shot,
  test,
} from "../_harness";

test.describe("QA remaining: hold expiry + payment mint + confirm refusal", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(240_000);

  test("times card: client picks a slot → admin sees hold", async ({ page, context }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    await sendTimesCard(page, 3);

    const client = await requireClientLink(page, context);
    const pick = client
      .locator("button")
      .filter({ hasText: /\d{1,2}:\d{2}|AM|PM|Pick|Choose/i })
      .first();
    const cardBtn = client.locator('[data-card="times"] button, [data-card] button').first();
    if (await pick.isVisible().catch(() => false)) {
      await pick.click();
    } else {
      await expect(
        cardBtn,
        "client times card has no pickable slot button after times send",
      ).toBeVisible({ timeout: 15_000 });
      await cardBtn.click();
    }
    await client.waitForTimeout(1500);
    await shot(client, "remain-client-picked-time");

    await page.bringToFront();
    await page.waitForTimeout(2000);
    const body = await page.locator("[data-messages-v5]").innerText();
    const holdish = /hold|held|expir|waiting|min left/i.test(body);
    expect(
      holdish,
      "admin thread does not show hold language after client picked a slot",
    ).toBeTruthy();
    await shot(page, "remain-admin-after-hold");

    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("payment: offer → client accept → mint pay link → Payment card", async ({
    page,
    context,
  }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    await sendPricedOffer(page);

    const client = await requireClientLink(page, context);
    const accept = client.getByRole("button", { name: /^accept/i }).first();
    await expect(accept, "client Accept missing after priced offer").toBeVisible({
      timeout: 20_000,
    });
    await accept.click();
    await client.waitForTimeout(1500);
    await shot(client, "remain-payment-client-accepted");
    await client.close().catch(() => undefined);

    await page.bringToFront();
    await openPlusTray(page);
    await page.locator('[data-tray-item="payment"]').click();
    const pay = page.locator("[data-payment-request-sheet], [data-sheet]").first();
    await expect(pay, "Payment request sheet did not open").toBeVisible({ timeout: 20_000 });
    await shot(page, "remain-payment-after-offer");

    const link = pay.getByText(/pay link|send a pay link/i).first();
    await expect(link, "Pay link option missing on payment sheet").toBeVisible({
      timeout: 10_000,
    });
    await link.click();
    const mint = pay.locator("[data-payment-send]").first();
    await expect(mint, "Payment Send disabled for pay-link path").toBeEnabled({
      timeout: 15_000,
    });
    const before = await page.locator('[data-card="payment"]').count();
    await mint.click();
    await expect(
      page.locator('[data-card="payment"]').nth(before),
      "Payment card did not appear after minting pay link",
    ).toBeVisible({ timeout: 25_000 });
    await shot(page, "remain-payment-link-minted");

    await page.keyboard.press("Escape");
    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("payment: record paid outside → Payment card / paid chip", async ({ page, context }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    await sendPricedOffer(page);

    const client = await requireClientLink(page, context);
    const accept = client.getByRole("button", { name: /^accept/i }).first();
    await expect(accept, "client Accept missing before record-outside").toBeVisible({
      timeout: 20_000,
    });
    await accept.click();
    await client.waitForTimeout(1500);
    await client.close().catch(() => undefined);

    await page.bringToFront();
    await openPlusTray(page);
    await page.locator('[data-tray-item="payment"]').click();
    const pay = page.locator("[data-payment-request-sheet], [data-sheet]").first();
    await expect(pay).toBeVisible({ timeout: 20_000 });

    const outside = pay.getByText(/record as paid outside|paid outside/i).first();
    await expect(outside, "Record as paid outside option missing").toBeVisible({
      timeout: 10_000,
    });
    await outside.click();
    const mint = pay.locator("[data-payment-send]").first();
    await expect(mint, "Payment Send disabled for paid-outside path").toBeEnabled({
      timeout: 15_000,
    });
    await mint.click();
    await page.waitForTimeout(1500);
    const body = await page.locator("[data-messages-v5]").innerText();
    expect(
      /paid|outside|cash|transfer|terminal/i.test(body) ||
        (await page.locator('[data-card="payment"]').count()) > 0,
      "after record paid outside, expected Payment card or paid chip in thread",
    ).toBeTruthy();
    await shot(page, "remain-payment-outside");

    await page.keyboard.press("Escape");
    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("confirm sheet: open and attempt confirm when door present", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);

    const rows = page.locator("[data-inbox-row]");
    const n = Math.min(await rows.count(), 16);
    expect(n, "inbox empty — cannot hunt for Confirm door").toBeGreaterThan(0);

    let opened = false;
    for (let i = 0; i < n; i++) {
      await rows.nth(i).click();
      await page.waitForTimeout(400);
      const confirm = page.getByRole("button", { name: /^confirm/i }).first();
      const next = page.locator("[data-next-step-action]");
      if (await confirm.isVisible().catch(() => false)) {
        await confirm.click();
        opened = true;
        break;
      }
      if ((await next.count()) && /confirm/i.test(await next.first().innerText())) {
        await next.first().click();
        opened = true;
        break;
      }
    }
    test.skip(
      !opened,
      "no Confirm door on scanned threads — seed an accepted offer ready to confirm on the QA tenant",
    );

    await expect(
      page.locator("[data-sheet], [role='dialog']").first(),
      "Confirm sheet did not open",
    ).toBeVisible({ timeout: 15_000 });
    await shot(page, "remain-confirm-sheet");
    await page.keyboard.press("Escape");
    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
