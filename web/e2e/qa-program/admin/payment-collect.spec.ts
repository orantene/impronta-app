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

const PAY_INQUIRY =
  process.env.QA_COLLECT_PAY_INQUIRY_ID ??
  process.env.QA_AWAITING_OFFER_INQUIRY_ID ??
  "ad22e3e4-9ad9-431b-b922-1ccf3bf5c10f";

test.describe("QA payment — collect at the counter", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(180_000);

  test("collect path deep-links to POS with order context", async ({ page, context }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);

    const u = new URL(page.url());
    u.searchParams.set("inquiry", PAY_INQUIRY);
    await page.goto(u.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page.locator("[data-messages-v5]").first()).toBeVisible({ timeout: 30_000 });
    await awaitHydrated(page);

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

    const collect = sheet.getByText(/collect.*(counter|here)|at the counter/i).first();
    await expect(collect, "Collect at the counter option missing").toBeVisible({ timeout: 10_000 });
    await collect.click();
    await shot(page, "admin-payment-collect-selected");

    // Collect CTA is always mounted; href only when canMintLink + target.
    const cta = sheet.locator("[data-payment-collect]").first();
    await expect(cta, "Collect primary missing after selecting collect how").toBeVisible({
      timeout: 15_000,
    });
    const hrefEl = sheet.locator("[data-payment-collect-href]").first();
    await expect(
      hrefEl,
      "Collect POS href missing — need a mintable order target (canMintLink). Accept offer first.",
    ).toBeVisible({ timeout: 15_000 });
    const href = ((await hrefEl.innerText()) || "").trim();
    expect(href, "collect href empty").toMatch(/\/pos|order=|inquiry=/i);

    await cta.click();
    await page.waitForTimeout(2000);
    expect(
      page.url(),
      `Collect did not reach POS; url=${page.url()}`,
    ).toMatch(/\/pos|view=|order=/i);
    await shot(page, "admin-payment-collect-pos");

    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
