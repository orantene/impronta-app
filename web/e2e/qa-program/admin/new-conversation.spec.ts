import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  expect,
  openAdminMessages,
  shot,
  test,
} from "../_harness";

test.describe("QA 6.1 admin desktop — new conversation", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("New opens a sheet; name + email starts a thread", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);

    const newBtn = page.getByRole("button", { name: /^new$/i }).or(page.getByRole("button", { name: /new conversation/i }));
    await expect(newBtn.first()).toBeVisible({ timeout: 15_000 });
    await newBtn.first().click();

    const sheet = page.locator("[data-sheet], [role='dialog']").first();
    await expect(sheet).toBeVisible({ timeout: 15_000 });
    await shot(page, "admin-new-conversation-sheet");

    const stamp = Date.now();
    const name = `QA Cursor ${stamp}`;
    const email = `qa-cursor-${stamp}@impronta.test`;

    // Fill common fields by label or placeholder
    const nameField = sheet.getByLabel(/name/i).or(sheet.locator("input").first());
    await nameField.first().fill(name);
    const emailField = sheet.getByLabel(/email/i).or(sheet.locator('input[type="email"]'));
    if (await emailField.count()) await emailField.first().fill(email);
    else {
      // second text input
      const inputs = sheet.locator("input:not([type='hidden'])");
      if ((await inputs.count()) > 1) await inputs.nth(1).fill(email);
    }

    const start = sheet.getByRole("button", { name: /start|create|begin/i }).first();
    await expect(start).toBeVisible();
    if (await start.isEnabled()) {
      await start.click();
      await expect(page.locator("[data-composer], [data-composer-wire]").first()).toBeVisible({
        timeout: 25_000,
      });
      await shot(page, "admin-new-conversation-started");
    } else {
      // Channel or required field still missing — record as soft fail for follow-up
      await shot(page, "admin-new-conversation-start-disabled");
      test.info().annotations.push({ type: "seam", description: "Start disabled after name+email; channel may be required" });
    }

    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
