import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  expect,
  openAdminMessages,
  openFirstInboxRow,
  openPlusTray,
  requireClientLink,
  sendPricedOffer,
  shot,
  test,
} from "../_harness";

test.describe("QA remaining: client ES/FR + pay page", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(180_000);

  test("offer → mint client link → ES/FR strings + no raw keys", async ({ page, context }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    await openFirstInboxRow(page);
    await sendPricedOffer(page);

    const client = await requireClientLink(page, context);
    const guard = attachConsoleGuard(client);
    const base = client.url();

    for (const loc of ["es", "fr"] as const) {
      const u = new URL(base);
      u.searchParams.set("lang", loc);
      await client.goto(u.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
      await client.waitForTimeout(1000);
      await assertNoRawI18nKeys(client, "body");
      const body = await client.locator("body").innerText();
      expect(body, `raw dashboard.messagesV5 key on lang=${loc}`).not.toMatch(
        /dashboard\.messagesV5\./,
      );
      expect(body, `unfilled {placeholder} on lang=${loc}`).not.toMatch(/\{[a-zA-Z_]+\}/);
      // Locale-specific affordance: Accept/Pay translations or EN fallback still labeled
      const hasAction =
        /accept|aceptar|accepter|pay|pagar|payer|decline|rechazar|refuser/i.test(body);
      expect(hasAction, `no offer/pay action strings on client link lang=${loc}`).toBeTruthy();
      await shot(client, `remain-client-locale-${loc}`);
    }

    await client.goto(base, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await client.waitForTimeout(800);
    const accept = client.getByRole("button", { name: /^accept|aceptar|accepter/i }).first();
    await expect(accept, "client Accept missing on minted offer link").toBeVisible({
      timeout: 15_000,
    });
    await accept.click();
    await client.waitForTimeout(1200);
    const pay = client.getByRole("button", { name: /^pay|pagar|payer/i }).first();
    await expect(pay, "Pay button missing after client Accept").toBeVisible({ timeout: 20_000 });
    await pay.click();
    await client.waitForTimeout(2500);
    await shot(client, "remain-client-pay-page");
    expect(client.url(), "expected /pay/ or payment surface after Pay click").toMatch(
      /\/pay\/|pay|checkout|stripe/i,
    );

    expect(guard.errors, guard.errors.join("\n")).toEqual([]);
    expect(errors, errors.join("\n")).toEqual([]);
    void openPlusTray;
  });
});
