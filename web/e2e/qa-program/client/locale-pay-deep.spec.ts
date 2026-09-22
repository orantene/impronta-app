import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  expect,
  openAdminMessages,
  openFirstInboxRow,
  requireClientLink,
  sendPricedOffer,
  shot,
  test,
} from "../_harness";

/**
 * Client link ES + FR hard (Round 2).
 * Mint the link in-spec; assert specific translated strings on offer Accept,
 * pay affordance, and confirmation — plus zero raw keys / placeholders.
 */
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

    // ES — specific Accept copy from messages/es.json
    {
      const u = new URL(base);
      u.searchParams.set("lang", "es");
      await client.goto(u.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
      await client.waitForTimeout(1000);
      await assertNoRawI18nKeys(client, "body");
      const body = await client.locator("body").innerText();
      expect(body, "raw dashboard.messagesV5 key on lang=es").not.toMatch(/dashboard\.messagesV5\./);
      expect(body, "unfilled {placeholder} on lang=es").not.toMatch(/\{[a-zA-Z_]+\}/);
      await expect(
        client.getByRole("button", { name: /aceptar esta oferta|aceptar/i }).first(),
        "ES Accept string missing on minted client link",
      ).toBeVisible({ timeout: 20_000 });
      await shot(client, "remain-client-locale-es");
    }

    // FR — specific Accept copy from messages/fr.json
    {
      const u = new URL(base);
      u.searchParams.set("lang", "fr");
      await client.goto(u.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
      await client.waitForTimeout(1000);
      await assertNoRawI18nKeys(client, "body");
      const body = await client.locator("body").innerText();
      expect(body, "raw dashboard.messagesV5 key on lang=fr").not.toMatch(/dashboard\.messagesV5\./);
      expect(body, "unfilled {placeholder} on lang=fr").not.toMatch(/\{[a-zA-Z_]+\}/);
      await expect(
        client.getByRole("button", { name: /accepter cette offre|accepter/i }).first(),
        "FR Accept string missing on minted client link",
      ).toBeVisible({ timeout: 20_000 });
      await shot(client, "remain-client-locale-fr");
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
    // Re-check ES pay string on the accepted card.
    {
      const u = new URL(client.url());
      u.searchParams.set("lang", "es");
      await client.goto(u.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
      await client.waitForTimeout(800);
      const body = await client.locator("body").innerText();
      expect(body, "ES accepted thread missing Pagar / Aceptada").toMatch(/pagar|aceptad/i);
      expect(body).not.toMatch(/dashboard\.messagesV5\./);
      expect(body).not.toMatch(/\{[a-zA-Z_]+\}/);
      await shot(client, "remain-client-locale-es-accepted");
    }

    expect(guard.errors, guard.errors.join("\n")).toEqual([]);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
