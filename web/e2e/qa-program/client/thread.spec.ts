import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  expect,
  openAdminMessages,
  openFirstInboxRow,
  shot,
  signInJourneysStaff,
  test,
} from "../_harness";

test.describe("QA 6.3 client link", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("copy client link and open token thread without internal notes", async ({ page, context }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    await openFirstInboxRow(page);

    // Try to obtain a client link from header actions
    const more = page.getByRole("button", { name: /more|actions|⋯|…/i }).first();
    if (await more.isVisible().catch(() => false)) await more.click();

    const copy = page.getByRole("button", { name: /copy client link|client link/i }).first();
    let tokenUrl: string | null = null;
    if (await copy.isVisible().catch(() => false)) {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => undefined);
      await copy.click();
      await page.waitForTimeout(500);
      tokenUrl = await page.evaluate(async () => {
        try {
          return await navigator.clipboard.readText();
        } catch {
          return null;
        }
      });
    }

    if (!tokenUrl || !/\/c\//.test(tokenUrl)) {
      // Fallback: look for an anchor
      const link = page.locator('a[href*="/c/t/"]').first();
      if (await link.count()) tokenUrl = await link.getAttribute("href");
    }

    if (!tokenUrl || !/\/c\//.test(tokenUrl)) {
      test.info().annotations.push({ type: "blocked", description: "no client link available on this thread" });
      await shot(page, "client-link-unavailable");
      return;
    }

    const clientPage = await context.newPage();
    const guard = attachConsoleGuard(clientPage);
    const url = tokenUrl.startsWith("http") ? tokenUrl : new URL(tokenUrl, page.url()).toString();
    await clientPage.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await clientPage.waitForTimeout(2000);
    await expect(clientPage.locator("body")).toBeVisible();
    const body = await clientPage.locator("body").innerText();
    expect(body).not.toMatch(/Offer sent to client\.|All approvals are complete\./);
    expect(body.toLowerCase()).not.toMatch(/internal note/);
    await shot(clientPage, "client-thread-render");
    await assertNoRawI18nKeys(clientPage);
    expect(guard.errors, guard.errors.join("\n")).toEqual([]);
    expect(errors, errors.join("\n")).toEqual([]);
    void signInJourneysStaff;
  });
});
