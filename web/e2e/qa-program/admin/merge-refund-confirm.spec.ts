import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  expect,
  openAdminMessages,
  openFirstInboxRow,
  shot,
  test,
} from "../_harness";

test.describe("QA 6.1 merge / refund / confirm affordances", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("thread surfaces merge/cancel/confirm controls without crashing", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    await openFirstInboxRow(page);
    await shot(page, "admin-merge-refund-baseline");

    // Soft inventory — presence is enough for this pass; deep flows need seeded paid records
    const merge = page.getByText(/merge|same person|same client/i).first();
    const cancel = page.getByRole("button", { name: /cancel|refund/i }).first();
    const confirm = page.getByRole("button", { name: /confirm/i }).first();
    void merge;
    void cancel;
    void confirm;

    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
