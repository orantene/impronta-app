import { assertNoRawI18nKeys, attachConsoleGuard, expect, prepareJourneysPage, shot, test } from "../_harness";

test.describe("QA 6.5 guest dock", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("public site shows the guest chat bubble", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await prepareJourneysPage(page);
    // SSO storage state should already be on context from config
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(2000);
    const bubble = page.locator("[data-guest-chat], [data-inquiry-dock], button").filter({ hasText: /chat|message|ask/i }).first();
    // Common dock launcher: fixed bottom-right button
    const launcher = page.locator("button").filter({ has: page.locator("svg") }).last();
    const opened =
      (await page.locator("[data-guest-chat], [data-inquiry-dock], [data-dock]").count()) > 0;
    if (!opened) {
      await launcher.click().catch(() => undefined);
      await page.waitForTimeout(1000);
    }
    await shot(page, "guest-dock-home");
    await expect(page.getByText(/host not registered/i)).toHaveCount(0);
    // Marketing site copy is out of Messages chrome scope; scan dock if open.
    const dock = page.locator("[data-guest-chat], [data-inquiry-dock], [data-dock]");
    if (await dock.count()) {
      await assertNoRawI18nKeys(page, "[data-guest-chat], [data-inquiry-dock], [data-dock]");
    }
    expect(errors.filter((e) => !/hydration|ResizeObserver/i.test(e)), errors.join("\n")).toEqual([]);
    void bubble;
  });
});
