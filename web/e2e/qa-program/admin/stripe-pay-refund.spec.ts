import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  awaitHydrated,
  expect,
  openPlusTray,
  requireClientLink,
  sendPricedOffer,
  shot,
  signInAgentOwnedHost,
  startFreshConversation,
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
 * Agent host: https://qa-stripe-r2.tulala.digital (agent_owned_qa tenant).
 * Sign-in uses magic-link cookies (dev signin is 403 on production).
 *
 * Flow: fresh conversation → offer → accept → mint pay link → /pay/<code> →
 * Stripe Checkout 4242 → Payment card Paid + Money + record chip → the link, the
 * order and ONE Stripe money row with its PaymentIntent (audit 2026-09-25 #1) →
 * partial refund → full refund of the rest → surfaces flip back.
 */
const AGENT_HOST =
  process.env.QA_STRIPE_HOST ?? process.env.PLAYWRIGHT_BASE_URL ?? "https://qa-stripe-r2.tulala.digital";
const USE_AGENT_PROD = process.env.QA_ALLOW_AGENT_PROD_HOST === "1";

test.describe("QA Stripe pay + refund", () => {
  test.use({
    viewport: { width: 1440, height: 900 },
    baseURL: AGENT_HOST,
  });
  // Sign-in (magic link) + Checkout 4242 + refund easily exceeds 6m on prod.
  test.setTimeout(600_000);

  test("mint pay link → 4242 → link + order + one money row paid → partial refund → full refund", async ({ page, context }) => {
    test.skip(
      !USE_AGENT_PROD,
      "Stripe 4242+refund requires QA_ALLOW_AGENT_PROD_HOST=1 on agent-owned production host (D-MSG-313; journeys mints mock)",
    );

    // Preview alias of qa-stripe-r2 is SSO-gated; automation bypass unlocks Checkout.
    const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    if (bypass) {
      await context.setExtraHTTPHeaders({
        "x-vercel-protection-bypass": bypass,
        "x-vercel-set-bypass-cookie": "true",
      });
    }

    const { errors } = attachConsoleGuard(page);

    await signInAgentOwnedHost(page, { host: AGENT_HOST });
    const existing = process.env.QA_STRIPE_EXISTING_INQUIRY;
    if (existing) {
      const u = new URL("/admin/messages", AGENT_HOST);
      u.searchParams.set("inquiry", existing);
      await page.goto(u.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
      await expect(page.locator("[data-messages-v5]").first()).toBeVisible({ timeout: 30_000 });
      await awaitHydrated(page);
    } else {
      await startFreshConversation(page);
      await sendPricedOffer(page, { fresh: true });
    }

    // Accept offer on client only when we just sent a fresh offer.
    if (!existing) {
      const client = await requireClientLink(page, context);
      const accept = client.locator('[data-client-action="accept_offer"]').first();
      if (await accept.isVisible().catch(() => false)) {
        await accept.click();
        await expect(client.getByText(/accepted/i).first()).toBeVisible({ timeout: 25_000 });
      }
      await client.close().catch(() => undefined);
      await page.bringToFront();
      await page.waitForTimeout(800);
    }

    // Money section balance before mint (effect baseline).
    const money = page.locator("[data-panel-money]").first();
    const balanceBefore = (await money.isVisible().catch(() => false))
      ? ((await money.innerText()) || "").replace(/\s+/g, " ")
      : "";

    await openPlusTray(page);
    await page.locator('[data-tray-item="payment"]').click();
    const sheet = page.locator("[data-payment-request-sheet], [data-sheet]").first();
    await expect(sheet, "Payment request sheet did not open").toBeVisible({ timeout: 20_000 });

    // Clear leftover open request only when the sheet says so (avoid reload races).
    const openBlock = sheet
      .getByText(/one open request|open (pay )?link|request already open/i)
      .first();
    if (
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      USE_AGENT_PROD &&
      (await openBlock.isVisible().catch(() => false))
    ) {
      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } },
      );
      const TENANT = "a1111111-1111-4111-8111-111111111102";
      await sb.from("payment_links").update({ status: "cancelled" }).eq("tenant_id", TENANT).eq("status", "open");
      await sb.from("conversation_records").update({ payment_state: null }).eq("tenant_id", TENANT);
      await page.keyboard.press("Escape").catch(() => undefined);
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.locator("[data-messages-v5]").first()).toBeVisible({ timeout: 30_000 });
      await awaitHydrated(page);
      await openPlusTray(page);
      await page.locator('[data-tray-item="payment"]').click();
      await expect(sheet, "Payment sheet did not reopen after clearing open request").toBeVisible({
        timeout: 20_000,
      });
    }

    // D-MSG-328: createPaymentLink refuses remint when a cancelled/expired row
    // still owns msgv5-pay-<inquiry>-<order>-full. A released collection
    // reservation with the same key can also return already=true with a past
    // expires_at, so the new link is born expired ("expires in 0h").
    if (process.env.SUPABASE_SERVICE_ROLE_KEY && USE_AGENT_PROD) {
      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } },
      );
      const TENANT = "a1111111-1111-4111-8111-111111111102";
      const { data: deadLinks } = await sb
        .from("payment_links")
        .select("id, operation_key, status")
        .eq("tenant_id", TENANT)
        .in("status", ["cancelled", "expired"]);
      for (const row of deadLinks ?? []) {
        const key = String((row as { operation_key?: string }).operation_key ?? "");
        if (!key || key.includes("-retired-")) continue;
        await sb
          .from("payment_links")
          .update({ operation_key: `${key}-retired-${(row as { id: string }).id}` })
          .eq("id", (row as { id: string }).id);
      }
      const { data: deadRes } = await sb
        .from("order_collection_reservations")
        .select("id, operation_key, state")
        .eq("tenant_id", TENANT)
        .in("state", ["released", "settled"]);
      for (const row of deadRes ?? []) {
        const key = String((row as { operation_key?: string }).operation_key ?? "");
        if (!key || key.includes("-retired-")) continue;
        await sb
          .from("order_collection_reservations")
          .update({ operation_key: `${key}-retired-${(row as { id: string }).id}` })
          .eq("id", (row as { id: string }).id);
      }
    }

    await sheet.getByText(/pay link|send a pay link/i).first().click();
    const orderTarget = sheet.getByRole("radio", { name: /order/i }).first();
    if (await orderTarget.isVisible().catch(() => false)) {
      await orderTarget.click();
    }
    const full = sheet.getByRole("radio", { name: /full amount/i }).first();
    await expect(full, "Full amount missing").toBeVisible({ timeout: 10_000 });
    await full.click();
    await expect(
      sheet.getByText(/expired|cannot be saved|conversation just changed/i),
      "Payment sheet refused before Send — extend hold / reload inquiry",
    ).toHaveCount(0);
    const send = sheet.locator("[data-payment-send]").first();
    await expect(
      send,
      "Payment Send disabled — need order target + Full amount + no open request (D-MSG-309); Stripe mint needs STRIPE_SECRET_KEY (D-MSG-313)",
    ).toBeEnabled({ timeout: 20_000 });
    await send.click();
    // Wait for sheet to leave Sending / close — do not match a ghost Paid card
    // whose trail still contains "Request sent" (D-MSG-328 remint false positive).
    await expect(
      sheet.getByRole("button", { name: /sending/i }),
      "Payment Send stuck on Sending — createPaymentLink likely refused (expired/conflict)",
    ).toHaveCount(0, { timeout: 30_000 });
    await expect(
      sheet.getByText(/expired|link or offer expired|cannot be saved/i),
      "Payment sheet refused after Send (D-MSG-328 operation_key / hold)",
    ).toHaveCount(0);

    const TENANT = "a1111111-1111-4111-8111-111111111102";
    let mintedCode: string | null = null;
    let mintedProvider: string | null = null;
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } },
      );
      // Poll briefly — syncConversationRecord + insert are not always instant in UI.
      for (let i = 0; i < 20; i++) {
        const { data: link } = await sb
          .from("payment_links")
          .select("code, provider, status, expires_at")
          .eq("tenant_id", TENANT)
          .eq("status", "open")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const exp = link?.expires_at ? Date.parse(String(link.expires_at)) : 0;
        if (link?.code && exp > Date.now() + 60_000) {
          mintedCode = link.code;
          mintedProvider = link.provider;
          break;
        }
        await page.waitForTimeout(800);
      }
      expect(
        mintedCode,
        "no open unexpired payment_links row after mint (D-MSG-328: retire released reservation op keys or link is born expired)",
      ).toBeTruthy();
      expect(mintedProvider, `expected provider=stripe; got ${mintedProvider}`).toBe("stripe");
    }

    // Race Checkout before UI polish — sign-in already burned most of the budget.
    expect(mintedCode, "mintedCode required for Checkout (SUPABASE_SERVICE_ROLE_KEY on agent host)").toBeTruthy();
    await shot(page, "admin-stripe-pay-card-minted");
    const payUrl = new URL(`/pay/${mintedCode}`, AGENT_HOST).toString();
    const payPage = await context.newPage();
    await payPage.goto(payUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(payPage.locator("[data-pos-messages='checkout'], main").first()).toBeVisible({
      timeout: 30_000,
    });
    await shot(payPage, "public-stripe-checkout-open");

    // i18n `public.thread.pay` → "Pay securely" (not bare "Pay").
    const payCta = payPage
      .getByRole("link", { name: /pay/i })
      .or(payPage.locator(`a[href*='confirm=stripe'], a[href*='checkout.stripe.com']`))
      .first();
    await expect(payCta, "Pay CTA missing on /pay page").toBeVisible({ timeout: 15_000 });
    const href = (await payCta.getAttribute("href")) || "";
    expect(
      href.includes("confirm=stripe") || href.includes("checkout.stripe.com"),
      `expected Stripe checkout (confirm=stripe); got href=${href} — QA host likely mints provider=mock (D-MSG-313: STRIPE_SECRET_KEY is production-only)`,
    ).toBeTruthy();

    // Do NOT match `/pay/` here — `?confirm=stripe` still matches and resolves
    // before the Checkout redirect, then 4242 fill races on the wrong page.
    await Promise.all([
      payPage.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 }),
      payCta.click(),
    ]);
    const checkoutUrl = payPage.url();
    expect(
      /cs_test_/.test(checkoutUrl),
      `D-MSG-330: 4242 requires test-mode Checkout (cs_test_); got ${checkoutUrl} — STRIPE_SECRET_KEY is livemode`,
    ).toBeTruthy();

    const email = payPage.locator('input[type="email"], input[name="email"]').first();
    if (await email.isVisible().catch(() => false)) {
      await email.fill("qa-stripe-r2@impronta.test");
    }
    const card = payPage
      .locator('input[name="cardnumber"], input[placeholder*="Card number" i], [data-testid="card-number"]')
      .first();
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
      await payPage.getByPlaceholder(/card number/i).fill("4242424242424242");
      await payPage.getByPlaceholder(/mm\s*\/\s*yy/i).fill("12 / 42");
      await payPage.getByPlaceholder(/cvc/i).fill("123");
    }
    const submit = payPage.getByRole("button", { name: /pay|submit|complete/i }).first();
    await expect(submit, "Stripe submit missing").toBeVisible({ timeout: 20_000 });
    await submit.click();
    await payPage.waitForURL(/\/pay\/.*status=paid|\/pay\//, { timeout: 90_000 });

    await expect(
      payPage.getByText(/paid|processing/i).first(),
      "pay page did not show Paid/Processing after Stripe",
    ).toBeVisible({ timeout: 60_000 });
    await shot(payPage, "public-stripe-paid");
    await payPage.close().catch(() => undefined);

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

    // THE MONEY ROW (audit 2026-09-25, defect #1). A paid link used to leave the
    // link and the order open with no transaction at all. Now: the link, the
    // order and exactly ONE Stripe money row, carrying the PaymentIntent the
    // refund route needs.
    const sbProof = await serviceClient();
    let paidTxnId: string | null = null;
    let paidGross = 0;
    if (sbProof) {
      const { data: linkRow } = await sbProof
        .from("payment_links")
        .select("status, order_id")
        .eq("code", mintedCode!)
        .maybeSingle();
      expect(linkRow?.status, "payment link did not settle to paid").toBe("paid");
      const orderId = String(linkRow?.order_id ?? "");
      const { data: orderRow } = await sbProof.from("orders").select("status").eq("id", orderId).maybeSingle();
      expect(orderRow?.status, "order did not settle to paid").toBe("paid");
      const { data: txns } = await sbProof
        .from("booking_transactions")
        .select("id, status, provider, gross_amount_cents, provider_metadata, metadata")
        .eq("order_id", orderId)
        .is("refund_of_transaction_id", null)
        .eq("provider", "stripe")
        .in("status", ["paid", "payout_pending", "payout_sent"]);
      expect(txns?.length ?? 0, `expected ONE paid Stripe money row for order ${orderId}`).toBe(1);
      const txn = (txns ?? [])[0] as { id: string; gross_amount_cents: number; provider_metadata: Record<string, unknown> | null };
      const pi = String(txn?.provider_metadata?.payment_intent_id ?? "");
      expect(pi, "money row carries no PaymentIntent id; refunds could not find the charge").toMatch(/^pi_/);
      paidTxnId = txn.id;
      paidGross = Number(txn.gross_amount_cents);
    }

    // PARTIAL first (a quarter, at least $1), then FULL for the rest.
    const partialCents = Math.max(100, Math.floor(paidGross / 4 / 100) * 100);
    await refundFromThread(page, { mode: "partial", amountCents: partialCents, note: "QA Stripe partial refund proof" });
    await shot(page, "admin-stripe-refunded-partial");
    if (sbProof && paidTxnId) {
      await expectRefundedCents(sbProof, paidTxnId, partialCents);
    }

    await refundFromThread(page, { mode: "full", note: "QA Stripe full refund proof" });
    await shot(page, "admin-stripe-refunded");
    if (sbProof && paidTxnId) {
      await expectRefundedCents(sbProof, paidTxnId, paidGross);
    }

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

async function serviceClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

/** Refund rows are children of the payment; the webhook books them. Poll until they add up. */
async function expectRefundedCents(
  sb: NonNullable<Awaited<ReturnType<typeof serviceClient>>>,
  paymentId: string,
  expectedCents: number,
): Promise<void> {
  let total = 0;
  for (let i = 0; i < 30; i++) {
    const { data } = await sb
      .from("booking_transactions")
      .select("gross_amount_cents, status")
      .eq("refund_of_transaction_id", paymentId)
      .eq("status", "refunded");
    total = (data ?? []).reduce((sum, r) => sum + Number((r as { gross_amount_cents: number }).gross_amount_cents ?? 0), 0);
    if (total >= expectedCents) break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  expect(total, `refunded ${total} of payment ${paymentId}; expected ${expectedCents}`).toBe(expectedCents);
}

async function refundFromThread(
  page: import("@playwright/test").Page,
  input: { mode: "partial" | "full"; amountCents?: number; note: string },
): Promise<void> {
  await page.keyboard.press("Escape").catch(() => undefined);
  const refundBtn = page.getByRole("button", { name: /^refund$/i }).first();
  const nextRefund = page.locator("[data-next-step-action]").filter({ hasText: /refund/i }).first();
  if (await refundBtn.isVisible().catch(() => false)) {
    await refundBtn.click();
  } else if (await nextRefund.isVisible().catch(() => false)) {
    await nextRefund.click();
  } else {
    await openPlusTray(page);
    const cardRefund = page.locator('[data-card="payment"]').filter({ hasText: /paid|refund/i }).getByRole("button", { name: /refund/i }).first();
    await expect(cardRefund, "Refund door missing (header, next-step, Payment card) after paid").toBeVisible({ timeout: 15_000 });
    await cardRefund.click();
  }

  const refundSheet = page.locator("[data-cancel-refund-sheet], [data-sheet]").filter({ hasText: /refund/i }).first();
  await expect(refundSheet, "Refund sheet did not open").toBeVisible({ timeout: 20_000 });
  if (input.mode === "partial") {
    await refundSheet.getByText(/partial refund/i).first().click();
    const amount = refundSheet.locator("[data-cancel-partial] input").first();
    await expect(amount, "Partial refund amount field missing").toBeVisible({ timeout: 10_000 });
    await amount.fill(((input.amountCents ?? 0) / 100).toFixed(2));
  } else {
    const fullRefund = refundSheet.getByText(/full refund/i).first();
    if (await fullRefund.isVisible().catch(() => false)) await fullRefund.click();
  }
  const reason = refundSheet.locator("[data-cancel-reason] input, textarea").first();
  if (await reason.isVisible().catch(() => false)) await reason.fill(input.note);
  const confirmRefund = refundSheet.getByRole("button", { name: /refund/i }).last();
  await expect(confirmRefund, "Refund primary missing").toBeEnabled({ timeout: 15_000 });
  await confirmRefund.click();
  await expect(
    page.getByText(/refunded|cancelled/i).first().or(page.locator("[data-cancel-refund-sheet]").filter({ hasText: /done|refunded/i })),
    `${input.mode} refund did not complete`,
  ).toBeVisible({ timeout: 40_000 });
}
