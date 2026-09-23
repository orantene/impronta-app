import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  expect,
  openAdminMessages,
  openFirstInboxRow,
  requireClientLink,
  shot,
  test,
} from "../_harness";

/**
 * Notifications (Round 2).
 *
 * 1. Messages v5 IncomingToast (`data-incoming-toast`): client reply on a
 *    thread that is not the open pane surfaces a toast; Open jumps there.
 * 2. Workspace shell bell opens the notifications hub popover
 *    (`[data-tulala-notifications-popover]`).
 *
 * Client thread composer uses `[data-client-composer]` +
 * `[data-client-action=send_message]` (not staff `data-composer-send`).
 */
test.describe("QA notifications — IncomingToast + shell bell", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(180_000);

  test("client reply on another thread shows IncomingToast → Open", async ({
    page,
    context,
  }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);
    await openFirstInboxRow(page);

    const client = await requireClientLink(page, context);
    const marker = `QA-TOAST ${Date.now()}`;

    const other = page.locator('[data-inbox-row]:not([aria-current="true"])').first();
    await expect(
      other,
      "need ≥2 inbox rows so IncomingToast can fire off-thread",
    ).toBeVisible({ timeout: 15_000 });
    await other.click();
    await expect(page.locator('[data-inbox-row][aria-current="true"]')).toBeVisible({
      timeout: 10_000,
    });

    const composer = client.locator("[data-client-composer]");
    await expect(composer, "client composer missing on minted /c/ link").toBeVisible({
      timeout: 20_000,
    });
    await composer.locator("textarea").fill(marker);
    const send = composer.locator('[data-client-action="send_message"]');
    await expect(send, "client send_message stayed disabled after typing").toBeEnabled({
      timeout: 10_000,
    });
    await send.click();

    const toast = page.locator("[data-incoming-toast]");
    await expect(
      toast,
      "IncomingToast must appear when client replies on a thread that is not open",
    ).toBeVisible({ timeout: 20_000 });
    await expect(toast).toContainText(/QA-TOAST|new message|message/i, { timeout: 5_000 });
    await shot(page, "notif-incoming-toast");

    await toast.getByRole("button", { name: /open/i }).click();
    await expect(
      page.getByText(marker).first(),
      "Open on IncomingToast must land on the thread with the client reply",
    ).toBeVisible({ timeout: 20_000 });
    await shot(page, "notif-incoming-toast-opened");

    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("shell notification bell opens a popover", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await openAdminMessages(page);

    // notifications-hub.tsx (native Popover), not TopBarNotificationBell.
    const bell = page.locator('button[popovertarget][aria-label*="Notification"]').filter({
      visible: true,
    });
    await expect(bell.first(), "workspace notifications-hub bell missing").toBeVisible({
      timeout: 20_000,
    });
    await bell.first().click();
    await page.waitForSelector("[data-tulala-notifications-popover]:popover-open", {
      timeout: 10_000,
      state: "attached",
    });
    await shot(page, "notif-shell-bell");
    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
