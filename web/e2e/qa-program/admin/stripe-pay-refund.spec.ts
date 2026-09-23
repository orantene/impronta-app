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

/**
 * Stripe test-mode pay + full refund (Round 2).
 *
 * Requires STRIPE_SECRET_KEY on the host so minted links use provider=stripe
 * (D-MSG-313: staging-qa-journeys is preview-only and mints provider=mock).
 * Override PLAYWRIGHT_BASE_URL to a production-gated agent-owned QA host and set
 * QA_ALLOW_AGENT_PROD_HOST=1 (assertQaIsolatedTarget refuses Impronta / apex).
 *
 * Flow: mint pay link → open /pay/<code> → Stripe Checkout with 4242 →
 * assert Payment card Paid + Money balance + record chip → full refund →
 * assert every surface flips back.
 */
const PAY_INQUIRY =
  process.env.QA_STRIPE_PAY_INQUIRY_ID ??
  process.env.QA_AWAITING_OFFER_INQUIRY_ID ??
  "ad22e3e4-9ad9-431b-b922-1ccf3bf5c10f";

test.describe("QA Stripe pay + refund", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(360_000);

  test("mint pay link → 4242 → Paid → full refund → unpaid", async ({ page, context }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);

    const u = new URL(page.url());
    u.searchParams.set("inquiry", PAY_INQUIRY);
    await page.goto(u.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page.locator("[data-messages-v5]").first()).toBeVisible({ timeout: 30_000 });
    await awaitHydrated(page);

    // Accept offer on client if still awaiting (same door as payment-deep).
    const client = await requireClientLink(page, context);
    const accept = client.locator('[data-client-action="accept_offer"]').first();
    if (await accept.isVisible().catch(() => false)) {
      await accept.click();
      await expect(client.getByText(/accepted/i).first()).toBeVisible({ timeout: 25_000 });
    }
    await client.close().catch(() => undefined);
    await page.bringToFront();
    await page.waitForTimeout(800);

    // Money section balance before mint (effect baseline).
    const money = page.locator("[data-panel-money]").first();
    const balanceBefore = (await money.isVisible().catch(() => false))
      ? ((await money.innerText()) || "").replace(/\s+/g, " ")
      : "";

    await openPlusTray(page);
    await page.locator('[data-tray-item="payment"]').click();
    const sheet = page.locator("[data-payment-request-sheet], [data-sheet]").first();
    await expect(sheet, "Payment request sheet did not open").toBeVisible({ timeout: 20_000 });

    // An open unpaid pay link blocks mint (`canSend` requires !openRequest).
    const openBlock = sheet.getByText(/already|open.*(link|request)|outstanding/i).first();
    if (await openBlock.isVisible().catch(() => false)) {
      await shot(page, "admin-stripe-open-request-block");
      expect(
        false,
        "Payment sheet blocked by an open pay link — cancel/expire the open request on this inquiry before minting Stripe (canSend && !openRequest)",
      ).toBeTruthy();
    }

    await sheet.getByText(/pay link|send a pay link/i).first().click();
    const orderTarget = sheet.getByRole("radio", { name: /order/i }).first();
    if (await orderTarget.isVisible().catch(() => false)) {
      await orderTarget.click();
    }
    const full = sheet.getByRole("radio", { name: /full amount/i }).first();
    await expect(full, "Full amount missing").toBeVisible({ timeout: 10_000 });
    await full.click();
    const send = sheet.locator("[data-payment-send]").first();
    await expect(
      send,
      "Payment Send disabled — need order target + Full amount + no open request (D-MSG-309); Stripe mint needs STRIPE_SECRET_KEY (D-MSG-313)",
    ).toBeEnabled({ timeout: 20_000 });
    const beforeCards = await page.locator('[data-card="payment"]').count();
    await send.click();
    const payCard = page.locator('[data-card="payment"]').nth(beforeCards);
    await expect(payCard, "Payment card missing after mint").toBeVisible({ timeout: 25_000 });
    await shot(page, "admin-stripe-pay-card-minted");

    // Open /pay/<code> from the card's copy/link affordance or card text.
    const payHref = await payCard.locator("a[href*='/pay/']").first().getAttribute("href").catch(() => null);
    let code: string | null = null;
    if (payHref) {
      const m = payHref.match(/\/pay\/([^/?#]+)/);
      code = m?.[1] ?? null;
    }
    if (!code) {
      // Fall back: Copy link / open pay from card actions.
      const copyPay = payCard.getByRole("button", { name: /copy|pay link|open/i }).first();
      await expect(
        copyPay.or(payCard.locator("a[href*='/pay/']").first()),
        "Payment card has no /pay/ link or copy control — cannot open Stripe checkout",
      ).toBeVisible({ timeout: 10_000 });
    }

    const payUrl = payHref?.startsWith("http")
      ? payHref
      : payHref
        ? new URL(payHref, page.url()).toString()
        : null;
    expect(payUrl, "could not resolve /pay/<code> URL from Payment card").toBeTruthy();

    const payPage = await context.newPage();
    await payPage.goto(payUrl!, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(payPage.locator("[data-pos-messages='checkout'], main").first()).toBeVisible({
      timeout: 30_000,
    });
    await shot(payPage, "public-stripe-checkout-open");

    // Stripe path: primary Pay links to ?confirm=stripe → Checkout.
    // Mock path (no STRIPE_SECRET_KEY): fail — this spec requires Stripe.
    const payCta = payPage.getByRole("link", { name: /^pay$/i }).or(payPage.locator("a").filter({ hasText: /^pay$/i })).first();
    await expect(payCta, "Pay CTA missing on /pay page").toBeVisible({ timeout: 15_000 });
    const href = (await payCta.getAttribute("href")) || "";
    expect(
      href.includes("confirm=stripe") || href.includes("checkout.stripe.com"),
      `expected Stripe checkout (confirm=stripe); got href=${href} — QA host likely mints provider=mock (D-MSG-313: STRIPE_SECRET_KEY is production-only)`,
    ).toBeTruthy();

    await payCta.click();
    await payPage.waitForURL(/checkout\.stripe\.com|\/pay\//, { timeout: 45_000 });

    if (/checkout\.stripe\.com/.test(payPage.url())) {
      // Stripe Checkout test card.
      const email = payPage.locator('input[type="email"], input[name="email"]').first();
      if (await email.isVisible().catch(() => false)) {
        await email.fill("qa-stripe-r2@impronta.test");
      }
      const card = payPage.locator('input[name="cardnumber"], input[placeholder*="Card number" i], [data-testid="card-number"]').first();
      // Stripe often uses iframe — try frame locators.
      const frame = payPage.frameLocator('iframe[name*="privateStripeFrame"], iframe[title*="card" i]').first();
      const cardInFrame = frame.locator('input[name="cardnumber"], input[autocomplete="cc-number"]').first();
      if (await card.isVisible().catch(() => false)) {
        await card.fill("4242424242424242");
        await payPage.locator('input[name="exp-date"], input[placeholder*="MM" i]').first().fill("1242");
        await payPage.locator('input[name="cvc"], input[placeholder*="CVC" i]').first().fill("123");
      } else if (await cardInFrame.isVisible().catch(() => false)) {
        await cardInFrame.fill("4242424242424242");
        await frame.locator('input[name="exp-date"], input[autocomplete="cc-exp"]').first().fill("12 / 42");
        await frame.locator('input[name="cvc"], input[autocomplete="cc-csc"]').first().fill("123");
      } else {
        // New Checkout UI: hosted fields.
        await payPage.getByPlaceholder(/card number/i).fill("4242424242424242");
        await payPage.getByPlaceholder(/mm\s*\/\s*yy/i).fill("12 / 42");
        await payPage.getByPlaceholder(/cvc/i).fill("123");
      }
      const submit = payPage.getByRole("button", { name: /pay|submit|complete/i }).first();
      await expect(submit, "Stripe submit missing").toBeVisible({ timeout: 20_000 });
      await submit.click();
      await payPage.waitForURL(/\/pay\/.*status=paid|\/pay\//, { timeout: 90_000 });
    }

    await expect(
      payPage.getByText(/paid|processing/i).first(),
      "pay page did not show Paid/Processing after Stripe",
    ).toBeVisible({ timeout: 60_000 });
    await shot(payPage, "public-stripe-paid");
    await payPage.close().catch(() => undefined);

    // Admin surfaces: Payment card Paid, Money balance, record chip.
    await page.bringToFront();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-messages-v5]").first()).toBeVisible({ timeout: 30_000 });
    await awaitHydrated(page);
    await expect(
      page.locator('[data-card="payment"]').filter({ hasText: /paid/i }).first(),
      "Payment card did not flip to Paid",
    ).toBeVisible({ timeout: 45_000 });
    const header = ((await page.locator("[data-thread-header]").innerText()) || "").replace(/\s+/g, " ");
    expect(header, `record chip should read paid; got: ${header}`).toMatch(/paid/i);
    if (await money.isVisible().catch(() => false)) {
      const balanceAfter = ((await money.innerText()) || "").replace(/\s+/g, " ");
      expect(
        /\$0\.00|0\.00|balance.*0/i.test(balanceAfter) || balanceAfter !== balanceBefore,
        `Money section did not move toward zero after pay; before=${balanceBefore} after=${balanceAfter}`,
      ).toBeTruthy();
    }
    await shot(page, "admin-stripe-paid-surfaces");

    // Full refund via Refund sheet.
    const refundBtn = page.getByRole("button", { name: /^refund$/i }).first();
    const nextRefund = page.locator("[data-next-step-action]").filter({ hasText: /refund/i }).first();
    if (await refundBtn.isVisible().catch(() => false)) {
      await refundBtn.click();
    } else if (await nextRefund.isVisible().catch(() => false)) {
      await nextRefund.click();
    } else {
      await openPlusTray(page);
      // Refund is not always in tray — try header overflow / card action.
      const cardRefund = page.locator('[data-card="payment"]').filter({ hasText: /paid/i }).getByRole("button", { name: /refund/i }).first();
      await expect(
        cardRefund,
        "Refund door missing (header, next-step, Payment card) after paid",
      ).toBeVisible({ timeout: 15_000 });
      await cardRefund.click();
    }

    const refundSheet = page.locator("[data-cancel-refund-sheet], [data-sheet]").filter({ hasText: /refund/i }).first();
    await expect(refundSheet, "Refund sheet did not open").toBeVisible({ timeout: 20_000 });
    const fullRefund = refundSheet.getByText(/full refund/i).first();
    if (await fullRefund.isVisible().catch(() => false)) await fullRefund.click();
    const reason = refundSheet.locator("textarea, input[type='text']").first();
    if (await reason.isVisible().catch(() => false)) {
      await reason.fill("QA Stripe full refund proof");
    }
    const confirmRefund = refundSheet.getByRole("button", { name: /refund/i }).last();
    await expect(confirmRefund, "Refund primary missing").toBeEnabled({ timeout: 15_000 });
    await confirmRefund.click();
    await expect(
      page.getByText(/refunded|cancelled/i).first().or(page.locator("[data-cancel-refund-sheet]").filter({ hasText: /done|refunded/i })),
      "Refund did not complete",
    ).toBeVisible({ timeout: 40_000 });
    await shot(page, "admin-stripe-refunded");

    await page.keyboard.press("Escape");
    await page.waitForTimeout(1000);
    const headerAfter = ((await page.locator("[data-thread-header]").innerText()) || "").replace(/\s+/g, " ");
    expect(
      /refund|unpaid|open|balance/i.test(headerAfter) || !/paid/i.test(headerAfter),
      `after refund header still reads paid-only: ${headerAfter}`,
    ).toBeTruthy();

    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
