import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  expect,
  openAdminMessages,
  openFirstInboxRow,
  shot,
  test,
} from "../_harness";

/**
 * Client ES/FR locale + pay page deep (remaining from plan §6.3).
 */
test.describe("QA remaining: client ES/FR + pay page", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(180_000);

  test("client link ?lang=es and ?lang=fr: no raw keys; pay affordance when present", async ({
    page,
    context,
  }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    await openFirstInboxRow(page);

    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const header = page.locator("[data-thread-header]").first();
    const more = header.getByRole("button", { name: /more|actions|⋯|…/i }).first();
    if (await more.isVisible().catch(() => false)) await more.click({ force: true });
    await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => undefined);
    const copy = page.getByRole("button", { name: /copy client link|client link/i }).first();
    if (!(await copy.isVisible().catch(() => false))) {
      test.skip(true, "no client link");
      return;
    }
    await copy.click({ force: true });
    await page.waitForTimeout(500);
    const tokenUrl = await page.evaluate(async () => {
      try {
        return await navigator.clipboard.readText();
      } catch {
        return null;
      }
    });
    if (!tokenUrl || !/\/c\//.test(tokenUrl)) {
      test.skip(true, "clipboard empty");
      return;
    }
    const base = tokenUrl.startsWith("http") ? tokenUrl : new URL(tokenUrl, page.url()).toString();
    const client = await context.newPage();
    const guard = attachConsoleGuard(client);

    for (const loc of ["es", "fr"]) {
      const u = new URL(base);
      u.searchParams.set("lang", loc);
      await client.goto(u.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
      await client.waitForTimeout(1200);
      await assertNoRawI18nKeys(client, "body");
      await shot(client, `remain-client-locale-${loc}`);
    }

    // Pay page deep: click Pay if present
    await client.goto(base, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await client.waitForTimeout(1000);
    const pay = client.getByRole("button", { name: /^pay|pagar|payer/i }).first();
    if (await pay.isVisible().catch(() => false)) {
      await pay.click();
      await client.waitForTimeout(2500);
      await shot(client, "remain-client-pay-page");
      await expect(client.getByText(/host not registered/i)).toHaveCount(0);
    } else {
      test.info().annotations.push({ type: "blocked", description: "no pay button on this client link" });
    }

    expect(guard.errors, guard.errors.join("\n")).toEqual([]);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
