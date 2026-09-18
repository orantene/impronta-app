import { expect, openAdminMessages, prepareJourneysPage, shot, signInJourneysStaff, test, attachConsoleGuard, assertNoRawI18nKeys } from "../_harness";

test.describe("QA 6.4 POS dock", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("POS messages dock mounts beside the sale", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await prepareJourneysPage(page);
    await signInJourneysStaff(page, "/admin/pos?mode=counter&view=messages");
    const dock = page.locator("[data-pos-messages], [data-messages-v5]").first();
    await expect(dock).toBeVisible({ timeout: 30_000 });
    await shot(page, "pos-dock-messages");
    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
    void openAdminMessages;
  });
});
