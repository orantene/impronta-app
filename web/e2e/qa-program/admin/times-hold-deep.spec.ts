import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  expect,
  openAdminMessages,
  openFirstInboxRow,
  sendTimesCard,
  shot,
  test,
} from "../_harness";

test.describe("QA 6.1 times card + hold path", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(90_000);

  test("Send times: pick person + named service + 3 slots, assert times card", async ({
    page,
  }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    await openFirstInboxRow(page);
    await sendTimesCard(page, 3);
    await shot(page, "admin-times-deep-sent");
    await expect(
      page.locator('[data-card="times"], [data-card="options"]').first(),
      "times/options card missing after send",
    ).toBeVisible();
    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
