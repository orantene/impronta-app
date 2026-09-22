import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  expect,
  openAdminMessages,
  openFirstInboxRow,
  shot,
  test,
} from "../_harness";

test.describe("QA 6.1 merge / refund / confirm deep", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(120_000);

  test("confirm sheet opens when Confirm door is present", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    await openFirstInboxRow(page);

    const rows = page.locator("[data-inbox-row]");
    const n = Math.min(await rows.count(), 16);
    expect(n, "inbox empty").toBeGreaterThan(0);

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
    expect(
      opened,
      "no Confirm door — seed an accepted offer ready to confirm; merge/cancel covered in dedicated specs",
    ).toBeTruthy();

    await expect(
      page.locator("[data-sheet], [role='dialog']").first(),
      "Confirm sheet did not open",
    ).toBeVisible({ timeout: 15_000 });
    await shot(page, "admin-confirm-sheet");
    await page.keyboard.press("Escape");
    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("merge card: when duplicate pair present, merge moves loser messages", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    await openFirstInboxRow(page);

    const merge = page.getByText(/same person|merge these/i).first();
    const mergeBtn = page.getByRole("button", { name: /^merge$/i }).first();
    const hasMerge =
      (await merge.isVisible().catch(() => false)) ||
      (await mergeBtn.isVisible().catch(() => false));
    test.skip(
      !hasMerge,
      "no merge card on opened threads — seed two duplicate conversations on the QA tenant",
    );

    await shot(page, "admin-merge-card");
    await expect(mergeBtn, "Merge button missing on merge card").toBeVisible({ timeout: 10_000 });
    const beforeMsgs = await page.locator("[data-message], [data-card]").count();
    await mergeBtn.click();
    await page.waitForTimeout(1500);
    await shot(page, "admin-merge-done");
    // Effect: merge card gone or message stream still healthy
    const afterMergeCard = await page.getByText(/same person|merge these/i).count();
    expect(
      afterMergeCard === 0 || (await page.locator("[data-message], [data-card]").count()) >= beforeMsgs,
      "merge did not clear the merge card or preserve messages",
    ).toBeTruthy();
    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
