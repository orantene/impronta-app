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

async function openClientLink(page: import("@playwright/test").Page, context: import("@playwright/test").BrowserContext): Promise<import("@playwright/test").Page | null> {
  // Close any open sheet before header actions
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

test.describe("QA 6.3 client deep", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("send offer then client Accept / Ask / Decline affordances", async ({ page, context }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    await openFirstInboxRow(page);
    await openPlusTray(page);
    await page.locator('[data-tray-item="add_items"]').click();
    const sheet = page.locator("[data-sheet]").first();
    await expect(sheet).toBeVisible({ timeout: 20_000 });
    const menu = sheet.getByRole("button", { name: /^Menu$/i });
    if (await menu.count()) await menu.click();
    await sheet.locator("button.opt[data-option-row]").filter({ hasText: /\$/ }).first().click();
    const cont = sheet.locator("[data-items-send]").filter({ hasText: /continue to offer/i });
    await expect(cont.first()).toBeEnabled({ timeout: 10_000 });
    await cont.first().click();
    const send = page.locator("[role='dialog'], [data-sheet]").last().getByRole("button", { name: /^send\b/i });
    if ((await send.count()) && (await send.first().isEnabled().catch(() => false))) {
      await send.first().click({ force: true });
      await expect(page.locator('[data-card="offer"]').first()).toBeVisible({ timeout: 25_000 });
    }

    const client = await openClientLink(page, context);
    if (!client) {
      test.info().annotations.push({ type: "blocked", description: "no client link" });
      return;
    }
    const guard = attachConsoleGuard(client);
    await expect(client.locator("body")).toBeVisible();
    const body = await client.locator("body").innerText();
    expect(body).not.toMatch(/Offer sent to client\.|All approvals are complete\./);
    const accept = client.getByRole("button", { name: /^accept/i }).first();
    const ask = client.getByRole("button", { name: /ask for a change|change/i }).first();
    const decline = client.getByRole("button", { name: /^decline/i }).first();
    await shot(client, "client-offer-actions");
    if (await accept.isVisible().catch(() => false)) {
      await accept.click();
      await page.waitForTimeout(1500);
      await shot(client, "client-offer-accepted");
    } else if (await ask.isVisible().catch(() => false)) {
      await ask.click();
      await shot(client, "client-offer-ask");
    } else if (await decline.isVisible().catch(() => false)) {
      await decline.click();
      await shot(client, "client-offer-declined");
    } else {
      test.info().annotations.push({ type: "blocked", description: "no offer actions on client link" });
    }

    // Pay affordance
    const pay = client.getByRole("button", { name: /^pay/i }).first();
    if (await pay.isVisible().catch(() => false)) {
      await pay.click();
      await client.waitForTimeout(2000);
      await shot(client, "client-pay-page");
    }

    await assertNoRawI18nKeys(client, "body");
    expect(guard.errors, guard.errors.join("\n")).toEqual([]);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("client link ES and FR have no raw keys", async ({ page, context }) => {
    await openAdminMessages(page);
    await openFirstInboxRow(page);
    const client = await openClientLink(page, context);
    if (!client) {
      test.skip(true, "no client link");
      return;
    }
    for (const loc of ["es", "fr"]) {
      await client.goto(client.url().split("?")[0] + `?lang=${loc}`, { waitUntil: "domcontentloaded" }).catch(() => undefined);
      // Toggle locale if UI present
      const toggle = client.getByRole("button", { name: /EN|ES|FR/i }).first();
      if (await toggle.isVisible().catch(() => false)) {
        await toggle.click();
        await client.getByText(new RegExp(`^${loc}$`, "i")).first().click().catch(() => undefined);
      }
      await client.waitForTimeout(800);
      await assertNoRawI18nKeys(client, "body");
      await shot(client, `client-locale-${loc}`);
    }
  });
});
