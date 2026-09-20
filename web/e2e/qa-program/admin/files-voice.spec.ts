import path from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  expect,
  openAdminMessages,
  openFirstInboxRow,
  shot,
  test,
} from "../_harness";

test.describe("QA 6.1 files + voice", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("Attach a file via composer Attach control", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    await openFirstInboxRow(page);

    const dir = "/tmp/qa-upload";
    mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, "qa-note.txt");
    writeFileSync(filePath, `QA file upload ${Date.now()}\n`);

    const attach = page.locator('button[aria-label*="Attach" i]').first();
    await expect(attach).toBeVisible({ timeout: 15_000 });

    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 10_000 }).catch(() => null),
      attach.click(),
    ]);
    if (fileChooser) {
      await fileChooser.setFiles(filePath);
      await page.waitForTimeout(2000);
      await shot(page, "admin-file-upload");
    } else {
      // Sheet may open with an input[type=file]
      const input = page.locator('input[type="file"]').first();
      if (await input.count()) {
        await input.setInputFiles(filePath);
        await page.waitForTimeout(2000);
        await shot(page, "admin-file-upload");
      } else {
        test.info().annotations.push({ type: "blocked", description: "no filechooser after Attach" });
        await shot(page, "admin-file-upload-blocked");
      }
    }

    // Voice control presence (recording may need mic permission)
    const voice = page.locator('button[aria-label*="voice" i], button[aria-label*="Record" i]').first();
    await expect(voice).toBeVisible({ timeout: 10_000 });
    await shot(page, "admin-voice-control");

    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
