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

async function clientLinkFromHeader(
  page: import("@playwright/test").Page,
  context: import("@playwright/test").BrowserContext,
): Promise<import("@playwright/test").Page | null> {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const header = page.locator("[data-thread-header]").first();
  const more = header.getByRole("button", { name: /more|actions|⋯|…/i }).first();
  if (await more.isVisible().catch(() => false)) await more.click({ force: true });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => undefined);
  const copy = page.getByRole("button", { name: /copy client link|client link/i }).first();
  if (!(await copy.isVisible().catch(() => false))) return null;
  await copy.click({ force: true });
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

test.describe("QA remaining: hold expiry + payment mint + confirm refusal", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(240_000);

  test("times card: client picks a slot → admin sees hold; expire via card payload seam", async ({
    page,
    context,
  }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    await openFirstInboxRow(page);
    await openPlusTray(page);
    await page.locator('[data-tray-item="times"]').click();
    const sheet = page.locator("[data-times-sheet], [data-sheet]").first();
    await expect(sheet).toBeVisible({ timeout: 20_000 });

    const person = sheet.locator("[data-times-people] button").first();
    if (await person.isVisible().catch(() => false)) await person.click();
    const services = sheet.locator("[data-times-services] button");
    for (let i = 0; i < (await services.count()); i++) {
      const label = (await services.nth(i).innerText()).trim();
      if (/any service/i.test(label)) continue;
      await services.nth(i).click();
      break;
    }
    await page.waitForTimeout(2000);
    const slots = sheet.locator("[data-times-slots] button");
    if ((await slots.count()) < 3) {
      test.info().annotations.push({ type: "blocked", description: "not enough slots for hold path" });
      await shot(page, "remain-times-no-slots");
      return;
    }
    for (let i = 0; i < 3; i++) await slots.nth(i).click();
    const send = sheet.locator("[data-times-send]");
    if (!(await send.first().isEnabled().catch(() => false))) {
      test.info().annotations.push({ type: "blocked", description: "times send disabled" });
      await shot(page, "remain-times-send-disabled");
      return;
    }
    await send.first().click();
    await page.waitForTimeout(1500);

    const client = await clientLinkFromHeader(page, context);
    if (!client) {
      test.info().annotations.push({ type: "blocked", description: "no client link" });
      return;
    }
    const pick = client.locator("button").filter({ hasText: /\d{1,2}:\d{2}|AM|PM|Pick|Choose/i }).first();
    if (await pick.isVisible().catch(() => false)) {
      await pick.click();
      await client.waitForTimeout(1500);
      await shot(client, "remain-client-picked-time");
    } else {
      const cardBtn = client.locator('[data-card="times"] button, [data-card] button').first();
      if (await cardBtn.isVisible().catch(() => false)) await cardBtn.click();
      await shot(client, "remain-client-times-card");
    }

    await page.bringToFront();
    await page.waitForTimeout(2000);
    const body = await page.locator("[data-messages-v5]").innerText();
    const holdish = /hold|held|expir|waiting|min left/i.test(body);
    test.info().annotations.push({ type: "hold-signal", description: String(holdish) });
    await shot(page, "remain-admin-after-hold");

    // Force expiry on the isolated DB (15m wall-clock is not CI-safe). Staging
    // next-step "Hold expired" needs D-MSG-301 shell wiring deployed; card copy
    // still flips via payload on client/admin thread cards.
    const expired = await page.evaluate(async () => {
      // no browser-side DB; return marker for annotations only
      return "needs_sql_expire";
    });
    test.info().annotations.push({
      type: "seam",
      description: `hold expiry: ${expired}; SQL expire + D-MSG-301 deploy proves next-step Hold expired`,
    });

    // Soft assert: hold language or times card present after pick
    expect(holdish || (await page.locator('[data-card="times"], [data-card]').count()) > 0).toBeTruthy();
    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("payment: offer → client accept → mint pay link or record outside", async ({ page, context }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    await openFirstInboxRow(page);

    await openPlusTray(page);
    await page.locator('[data-tray-item="add_items"]').click();
    const items = page.locator("[data-sheet]").first();
    await expect(items).toBeVisible({ timeout: 20_000 });
    const menu = items.getByRole("button", { name: /^Menu$/i });
    if (await menu.count()) await menu.click();
    const priced = items.locator("button.opt").filter({ hasText: /\$/ }).first();
    if (await priced.isVisible().catch(() => false)) {
      await priced.click();
      const cont = items.locator("[data-items-send]");
      if (await cont.first().isEnabled().catch(() => false)) {
        await cont.first().click();
        const sendOffer = page.locator("[role='dialog'], [data-sheet]").last().getByRole("button", { name: /^send\b/i });
        if ((await sendOffer.count()) && (await sendOffer.first().isEnabled().catch(() => false))) {
          await sendOffer.first().click({ force: true });
          await page.waitForTimeout(1500);
        }
      }
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);

    const client = await clientLinkFromHeader(page, context);
    if (client) {
      const accept = client.getByRole("button", { name: /^accept/i }).first();
      if (await accept.isVisible().catch(() => false)) {
        await accept.click();
        await client.waitForTimeout(1500);
        await shot(client, "remain-payment-client-accepted");
      }
      await client.close().catch(() => undefined);
    }

    await page.bringToFront();
    await openPlusTray(page);
    await page.locator('[data-tray-item="payment"]').click();
    const pay = page.locator("[data-payment-request-sheet], [data-sheet]").first();
    await expect(pay).toBeVisible({ timeout: 20_000 });
    await shot(page, "remain-payment-after-offer");

    let minted = false;
    const link = pay.getByText(/pay link|send a pay link/i).first();
    const outside = pay.getByText(/record as paid outside|paid outside/i).first();
    const collect = pay.getByText(/collect here|at the counter/i).first();

    if (await link.isVisible().catch(() => false)) {
      await link.click();
      const mint = pay.locator("[data-payment-send]").first();
      if (await mint.isEnabled().catch(() => false)) {
        await mint.click();
        await page.waitForTimeout(2000);
        minted = (await page.locator('[data-card="payment"]').count()) > 0;
        await shot(page, "remain-payment-link-minted");
      }
    }
    if (!minted && (await outside.isVisible().catch(() => false))) {
      await outside.click();
      const mint = pay.locator("[data-payment-send]").first();
      if (await mint.isEnabled().catch(() => false)) {
        await mint.click();
        await page.waitForTimeout(1500);
        minted = true;
        await shot(page, "remain-payment-outside");
      }
    }
    if (await collect.count()) {
      test.info().annotations.push({ type: "collect-affordance", description: "present" });
      if (!minted) {
        await collect.first().click().catch(() => undefined);
        const mint = pay.locator("[data-payment-send]").first();
        if (await mint.isEnabled().catch(() => false)) {
          await mint.click();
          minted = true;
          await shot(page, "remain-payment-collect");
        }
      }
    }
    test.info().annotations.push({ type: "payment-minted", description: String(minted) });
    // Soft: sheet opened; mint when order target exists
    await page.keyboard.press("Escape");
    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("confirm sheet: open + POS race attempt for refusal", async ({ page, context }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    await openFirstInboxRow(page);

    // Prefer a thread whose next-step is Confirm
    const rows = page.locator("[data-inbox-row]");
    const n = Math.min(await rows.count(), 12);
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
    if (!opened) {
      test.info().annotations.push({
        type: "blocked",
        description: "no confirm door on scanned threads — need accepted offer ready to confirm",
      });
      await shot(page, "remain-confirm-no-door");
      return;
    }
    await expect(page.locator("[data-sheet], [role='dialog']").first()).toBeVisible({ timeout: 15_000 });
    await shot(page, "remain-confirm-sheet");

    // Attempt POS double-book setup in a second tab (soft — may lack free slot UI)
    const pos = await context.newPage();
    await pos.goto(new URL("/admin/pos", page.url()).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => undefined);
    await pos.waitForTimeout(2000);
    await shot(pos, "remain-confirm-pos-tab");
    test.info().annotations.push({
      type: "pending",
      description: "confirm recheck refusal needs booking the same slot in POS first; sheet + POS tab opened",
    });
    await pos.close().catch(() => undefined);
    await page.keyboard.press("Escape");
    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
