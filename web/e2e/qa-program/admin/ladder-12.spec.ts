import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  expect,
  openAdminMessages,
  openFirstInboxRow,
  openPlusTray,
  prepareJourneysPage,
  shot,
  signInJourneysStaff,
  test,
} from "../_harness";

/**
 * Explicit next-step ladder titles — scan inbox + drive reachable states.
 * Families match `deriveTasks` titles in `lib/messaging/tasks.ts`.
 */
const FAMILIES: { id: string; re: RegExp }[] = [
  { id: "reply", re: /reply to the client/i },
  { id: "add_items", re: /add items/i },
  { id: "send_offer", re: /send (the )?offer/i },
  { id: "follow_offer", re: /follow up on the offer|follow up/i },
  { id: "deposit", re: /collect the deposit|deposit/i },
  { id: "prepare", re: /prepare the order|prepare/i },
  { id: "balance", re: /collect the balance|balance/i },
  { id: "confirm_talent", re: /confirm with talent/i },
  { id: "confirm_identity", re: /confirm who you're talking to/i },
  { id: "hold_expired", re: /hold expired/i },
  { id: "payment_issue", re: /payment issue/i },
  { id: "nothing", re: /nothing to do/i },
  { id: "resolved_lost", re: /\b(resolved|lost)\b/i },
];

async function captureNext(page: import("@playwright/test").Page, found: Set<string>): Promise<void> {
  await page.waitForSelector("[data-next-step]", { timeout: 10_000 }).catch(() => undefined);
  await page.waitForTimeout(400);
  const next = page.locator("[data-next-step]");
  if ((await next.count()) === 0) return;
  const text = (await next.first().innerText()).replace(/\s+/g, " ").trim();
  if (!text || /^next$/i.test(text)) return;
  for (const f of FAMILIES) {
    if (f.re.test(text)) found.add(f.id);
  }
}

test.describe("QA remaining: explicit ladder families", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(240_000);

  test("scan + drive until ladder family hits are maximized", async ({ page }) => {
    const { errors } = attachConsoleGuard(page);
    await prepareJourneysPage(page);
    await signInJourneysStaff(page, "/admin/messages");
    await expect(page.locator("[data-messages-v5]")).toBeVisible({ timeout: 30_000 });

    const found = new Set<string>();

    // 1) Scan existing fixture rows across segments
    for (const seg of ["needs action", "waiting", "all"]) {
      await page.locator("[data-inbox-segments]").getByRole("tab", { name: new RegExp(seg, "i") }).first().click();
      await page.waitForTimeout(600);
      const rows = page.locator("[data-inbox-row]");
      const n = Math.min(await rows.count(), 50);
      for (let i = 0; i < n; i++) {
        await rows.nth(i).click();
        await captureNext(page, found);
        if (found.size >= 10) break;
      }
      if (found.size >= 10) break;
    }

    // 2) Drive reachable states on a writable Needs-action thread
    await openAdminMessages(page);
    await openFirstInboxRow(page);
    await captureNext(page, found);

    // Add items → often "Send the offer" or stay on reply
    await openPlusTray(page);
    await page.locator('[data-tray-item="add_items"]').click();
    const items = page.locator("[data-sheet]").first();
    if (await items.isVisible({ timeout: 10_000 }).catch(() => false)) {
      const menu = items.getByRole("button", { name: /^Menu$/i });
      if (await menu.count()) await menu.click();
      const priced = items.locator("button.opt").filter({ hasText: /\$/ }).first();
      if (await priced.isVisible().catch(() => false)) {
        await priced.click();
        const cont = items.locator("[data-items-send]");
        if (await cont.first().isEnabled().catch(() => false)) {
          await cont.first().click();
          await page.waitForTimeout(800);
          await captureNext(page, found);
          const sendOffer = page.locator("[role='dialog'], [data-sheet]").last().getByRole("button", { name: /^send\b/i });
          if ((await sendOffer.count()) && (await sendOffer.first().isEnabled().catch(() => false))) {
            await sendOffer.first().click({ force: true });
            await page.waitForTimeout(1500);
            await captureNext(page, found);
          }
        }
      }
      await page.keyboard.press("Escape");
    }

    // Close as lost → Resolved/Lost family
    await openPlusTray(page);
    const lostItem = page.locator('[data-tray-item="close_lost"]');
    if (await lostItem.isVisible().catch(() => false)) {
      await lostItem.click();
      const lostSheet = page.locator("[data-sheet], [role='dialog']").first();
      if (await lostSheet.isVisible({ timeout: 10_000 }).catch(() => false)) {
        const reason = lostSheet.locator("textarea, input").first();
        if (await reason.isVisible().catch(() => false)) await reason.fill("QA ladder lost");
        const confirm = lostSheet.getByRole("button", { name: /close|lost|confirm/i }).last();
        if (await confirm.isEnabled().catch(() => false)) {
          await confirm.click();
          await page.waitForTimeout(1200);
          await captureNext(page, found);
          const reopen = page.getByRole("button", { name: /^reopen$/i }).first();
          if (await reopen.isVisible().catch(() => false)) await reopen.click();
        } else {
          await page.keyboard.press("Escape");
        }
      }
    }

    await shot(page, "remain-ladder-12");
    const missing = FAMILIES.filter((f) => !found.has(f.id)).map((f) => f.id);
    test.info().annotations.push({
      type: "ladder-coverage",
      description: `found ${found.size}/${FAMILIES.length} missing=${missing.join(",")}`,
    });
    // Fixture + drive should hit several selling/reply/closed families.
    // hold_expired / confirm_talent / balance need D-MSG-301 deploy + richer readers.
    expect(found.size, `missing ${missing.join(", ")}`).toBeGreaterThanOrEqual(3);
    await assertNoRawI18nKeys(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
