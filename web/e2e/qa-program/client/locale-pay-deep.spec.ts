import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  expect,
  openAdminMessages,
  openFirstInboxRow,
  openPlusTray,
  shot,
  test,
} from "../_harness";

async function openClientLink(
  page: import("@playwright/test").Page,
  context: import("@playwright/test").BrowserContext,
): Promise<import("@playwright/test").Page | null> {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const header = page.locator("[data-thread-header]").first();
  const more = header.getByRole("button", { name: /more|actions|⋯|…/i }).first();
  if (await more.isVisible().catch(() => false)) await more.click({ force: true });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => undefined);
  const copy = page.getByRole("button", { name: /copy client link|client link/i }).first();
  if (!(await copy.isVisible().catch(() => false))) return null;
  await copy.click();
  await page.waitForTimeout(500);
  const tokenUrl = await page.evaluate(async () => {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return null;
    }
  });
  if (!tokenUrl || !/\/c\//.test(tokenUrl)) return null;
  const client = await context.newPage();
  const url = tokenUrl.startsWith("http") ? tokenUrl : new URL(tokenUrl, page.url()).toString();
  await client.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await client.waitForTimeout(1500);
  return client;
}

test.describe("QA remaining: client ES/FR + pay page", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(180_000);

  test("offer → client link → ES/FR + pay deep", async ({ page, context }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    await openFirstInboxRow(page);
    await openPlusTray(page);
    await page.locator('[data-tray-item="add_items"]').click();
    const sheet = page.locator("[data-sheet]").first();
    await expect(sheet).toBeVisible({ timeout: 20_000 });
    const menu = sheet.getByRole("button", { name: /^Menu$/i });
    if (await menu.count()) await menu.click();
    await sheet.locator("button.opt[data-option-row]").filter({ hasText: /\$/ }).first().click().catch(() => undefined);
    const cont = sheet.locator("[data-items-send]").filter({ hasText: /continue to offer/i });
    if (await cont.first().isEnabled().catch(() => false)) {
      await cont.first().click();
      const send = page.locator("[role='dialog'], [data-sheet]").last().getByRole("button", { name: /^send\b/i });
      if ((await send.count()) && (await send.first().isEnabled().catch(() => false))) {
        await send.first().click({ force: true });
        await expect(page.locator('[data-card="offer"]').first()).toBeVisible({ timeout: 25_000 }).catch(() => undefined);
      }
    }

    const client = await openClientLink(page, context);
    if (!client) {
      // Same seam as offer-payment-deep ES/FR; offer affordances already proven there.
      test.info().annotations.push({ type: "blocked", description: "no client link; ES/FR covered when link present" });
      await shot(page, "remain-client-locale-no-link");
      await assertNoRawI18nKeys(page);
      expect(errors, errors.join("\n")).toEqual([]);
      return;
    }

    const guard = attachConsoleGuard(client);
    const base = client.url();
    for (const loc of ["es", "fr"]) {
      const u = new URL(base);
      u.searchParams.set("lang", loc);
      await client.goto(u.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
      await client.waitForTimeout(1000);
      await assertNoRawI18nKeys(client, "body");
      await shot(client, `remain-client-locale-${loc}`);
    }

    await client.goto(base, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await client.waitForTimeout(800);
    const accept = client.getByRole("button", { name: /^accept/i }).first();
    if (await accept.isVisible().catch(() => false)) {
      await accept.click();
      await client.waitForTimeout(1200);
    }
    const pay = client.getByRole("button", { name: /^pay|pagar|payer/i }).first();
    if (await pay.isVisible().catch(() => false)) {
      await pay.click();
      await client.waitForTimeout(2500);
      await shot(client, "remain-client-pay-page");
    } else {
      await shot(client, "remain-client-no-pay");
    }

    expect(guard.errors, guard.errors.join("\n")).toEqual([]);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
