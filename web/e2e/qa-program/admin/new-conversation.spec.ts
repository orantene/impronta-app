import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  expect,
  openAdminMessages,
  shot,
  test,
} from "../_harness";

/**
 * New conversation (Round 2) — required Start → thread, not soft-bail when
 * Start stays disabled.
 */
test.describe("QA 6.1 admin desktop — new conversation", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(120_000);

  test("New opens a sheet; name + email starts a thread", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);

    const newBtn = page
      .getByRole("button", { name: /^new$/i })
      .or(page.getByRole("button", { name: /new conversation/i }));
    await expect(newBtn.first(), "New conversation button missing").toBeVisible({
      timeout: 15_000,
    });
    await newBtn.first().click();

    const sheet = page.locator("[data-sheet], [role='dialog']").first();
    await expect(sheet, "New conversation sheet did not open").toBeVisible({
      timeout: 15_000,
    });
    await shot(page, "admin-new-conversation-sheet");

    const stamp = Date.now();
    const name = `QA Cursor ${stamp}`;
    const email = `qa-cursor-${stamp}@impronta.test`;

    const nameField = sheet.getByLabel(/name/i).or(sheet.locator("input").first());
    await nameField.first().fill(name);
    const emailField = sheet.getByLabel(/email/i).or(sheet.locator('input[type="email"]'));
    if (await emailField.count()) {
      await emailField.first().fill(email);
    } else {
      const inputs = sheet.locator("input:not([type='hidden'])");
      expect(await inputs.count(), "expected ≥2 inputs for name+email").toBeGreaterThan(1);
      await inputs.nth(1).fill(email);
    }

    // Channel may be required — pick Web chat / first radio if present.
    const channel = sheet.getByRole("radio").or(sheet.locator('[data-channel], [name="channel"]'));
    if (await channel.first().isVisible().catch(() => false)) {
      await channel.first().click();
    }

    const start = sheet.getByRole("button", { name: /start|create|begin/i }).first();
    await expect(start, "Start/Create button missing").toBeVisible({ timeout: 10_000 });
    await expect(
      start,
      "Start stayed disabled after name+email — fill channel or required fields",
    ).toBeEnabled({ timeout: 15_000 });
    await start.click();

    await expect(
      page.locator("[data-composer], [data-composer-wire]").first(),
      "thread composer missing after Start",
    ).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText(name).first(), "new thread subject missing").toBeVisible({
      timeout: 15_000,
    });
    await shot(page, "admin-new-conversation-started");

    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
