import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  expect,
  prepareJourneysPage,
  shot,
  test,
} from "../_harness";

test.describe("QA 6.5 guest dock", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("public site shows the guest chat bubble", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await prepareJourneysPage(page);
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(2000);
    await expect(page.getByText(/host not registered/i)).toHaveCount(0);

    let opened =
      (await page.locator("[data-guest-chat], [data-inquiry-dock], [data-dock]").count()) > 0;
    if (!opened) {
      const bubbles = page.locator("button").locator("visible=true");
      const count = await bubbles.count();
      for (let i = count - 1; i >= Math.max(0, count - 8); i--) {
        await bubbles.nth(i).click().catch(() => undefined);
        await page.waitForTimeout(500);
        if (
          (await page.locator("[data-guest-chat], [data-inquiry-dock], [data-dock]").count()) > 0
        ) {
          opened = true;
          break;
        }
      }
    }
    expect(opened, "guest chat dock did not open on storefront").toBeTruthy();
    await shot(page, "guest-dock-home");
    await assertNoRawI18nKeys(page, "[data-guest-chat], [data-inquiry-dock], [data-dock]");
    expect(
      errors.filter((e) => !/hydration|ResizeObserver/i.test(e)),
      errors.join("\n"),
    ).toEqual([]);
  });
});
