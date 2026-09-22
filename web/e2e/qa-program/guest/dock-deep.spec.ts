import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  expect,
  prepareJourneysPage,
  shot,
  test,
} from "../_harness";

test.describe("QA 6.5 guest dock deep", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(90_000);

  test("open dock, Items tab, send creates conversation", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await prepareJourneysPage(page);
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(2000);

    const bubbles = page.locator("button").locator("visible=true");
    const count = await bubbles.count();
    let opened =
      (await page.locator("[data-guest-chat], [data-inquiry-dock], [data-dock]").count()) > 0;
    if (!opened) {
      for (let i = count - 1; i >= Math.max(0, count - 8); i--) {
        await bubbles.nth(i).click().catch(() => undefined);
        await page.waitForTimeout(500);
        if (
          (await page
            .locator("[data-guest-chat], [data-inquiry-dock], [data-dock], [role='dialog']")
            .count()) > 0
        ) {
          opened = true;
          break;
        }
      }
    }
    await shot(page, "guest-dock-deep-open");
    expect(opened, "guest chat dock did not open from storefront launcher").toBeTruthy();
    await expect(page.getByText(/host not registered/i)).toHaveCount(0);

    const itemsTab = page
      .getByRole("button", { name: /your order|items|menu|services|talent/i })
      .first();
    await expect(itemsTab, "guest dock Items tab missing").toBeVisible({ timeout: 15_000 });
    await itemsTab.click();
    await shot(page, "guest-dock-items-tab");

    const input = page
      .locator("[data-guest-chat] textarea, [data-inquiry-dock] textarea, textarea")
      .last();
    await expect(input, "guest dock composer missing").toBeVisible({ timeout: 15_000 });
    const msg = `QA guest ${Date.now()}`;
    await input.fill(msg);
    const send = page.getByRole("button", { name: /^send$/i }).last();
    await expect(send, "guest dock Send disabled").toBeEnabled({ timeout: 10_000 });
    await send.click();
    await page.waitForTimeout(2000);
    await expect(
      page.getByText(msg).first(),
      "guest message did not appear after Send",
    ).toBeVisible({ timeout: 15_000 });
    await shot(page, "guest-dock-sent");

    expect(
      errors.filter((e) => !/hydration|ResizeObserver|favicon/i.test(e)),
      errors.join("\n"),
    ).toEqual([]);
  });

  test("tulala.digital marketing page loads", async ({ page }) => {
    await page.goto("https://tulala.digital/", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(2000);
    await expect(page.locator("body")).toBeVisible();
    await expect(page.getByText(/host not registered/i)).toHaveCount(0);
    await shot(page, "tulala-digital-dock");
  });
});
