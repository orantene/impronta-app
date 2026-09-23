import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  awaitHydrated,
  expect,
  openAdminMessages,
  requireClientLink,
  shot,
  test,
} from "../_harness";

/**
 * Client link ES + FR hard (Round 2).
 * Deep-link an unpaid awaiting_acceptance offer (avoid flaky New→Start).
 */
const AWAITING_UNPAID =
  process.env.QA_AWAITING_OFFER_UNPAID_ID ?? "0c489aa2-fe00-4f85-929b-a4ae7edf4b2c";

test.describe("QA remaining: client ES/FR + pay page", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(180_000);

  test("offer → mint client link → ES/FR strings + no raw keys", async ({ page, context }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    const u0 = new URL(page.url());
    u0.searchParams.set("inquiry", AWAITING_UNPAID);
    await page.goto(u0.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page.locator("[data-messages-v5]").first()).toBeVisible({ timeout: 30_000 });
    await awaitHydrated(page);
    await expect(
      page.locator('[data-card="offer"]').first(),
      `staff stream missing offer on ${AWAITING_UNPAID}`,
    ).toBeVisible({ timeout: 20_000 });

    const client = await requireClientLink(page, context);
    expect(client.url(), "client link must be /c/…").toMatch(/\/c\//);
    const guard = attachConsoleGuard(client);
    const base = client.url();
    const acceptDoor = client.locator('[data-client-action="accept_offer"]').first();

    {
      const u = new URL(base);
      u.searchParams.set("lang", "es");
      await client.goto(u.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
      await client.waitForTimeout(1000);
      await assertNoRawI18nKeys(client, "body");
      const body = await client.locator("body").innerText();
      expect(body, "raw dashboard.messagesV5 key on lang=es").not.toMatch(/dashboard\.messagesV5\./);
      expect(body, "unfilled {placeholder} on lang=es").not.toMatch(/\{[a-zA-Z_]+\}/);
      await expect(acceptDoor, "accept_offer missing on ES client link").toBeVisible({
        timeout: 20_000,
      });
      await expect(
        acceptDoor,
        "ES Accept copy missing (Aceptar esta oferta / Aceptar y pagar…)",
      ).toHaveText(/aceptar esta oferta|aceptar y pagar/i);
      await shot(client, "remain-client-locale-es");
    }

    {
      const u = new URL(base);
      u.searchParams.set("lang", "fr");
      await client.goto(u.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
      await client.waitForTimeout(1000);
      await assertNoRawI18nKeys(client, "body");
      const body = await client.locator("body").innerText();
      expect(body, "raw dashboard.messagesV5 key on lang=fr").not.toMatch(/dashboard\.messagesV5\./);
      expect(body, "unfilled {placeholder} on lang=fr").not.toMatch(/\{[a-zA-Z_]+\}/);
      await expect(acceptDoor, "accept_offer missing on FR client link").toBeVisible({
        timeout: 20_000,
      });
      await expect(
        acceptDoor,
        "FR Accept copy missing (Accepter cette offre / Accepter et payer…)",
      ).toHaveText(/accepter cette offre|accepter et payer/i);
      await shot(client, "remain-client-locale-fr");
    }

    await client.goto(base, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await client.waitForTimeout(800);
    await expect(acceptDoor, "client Accept missing on minted offer link").toBeVisible({
      timeout: 15_000,
    });
    await acceptDoor.click();
    await client.waitForTimeout(1200);
    const pay = client
      .getByRole("button", { name: /^pay|pagar|payer/i })
      .or(client.locator('[data-client-action="pay"]'))
      .first();
    await expect(pay, "Pay button missing after client Accept").toBeVisible({ timeout: 20_000 });
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
