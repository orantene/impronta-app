/**
 * QA program harness for Messages v5 on the staging-qa-journeys host.
 * Reuses fixture sign-in from cases/_harness; targets workspace Messages (v5 shell),
 * not the POS messages dock unless a POS spec asks for it.
 */
import { expect, type Page } from "@playwright/test";
import {
  assertNotAuthWall,
  awaitHydrated,
  JOURNEYS_OWNER_EMAIL,
  prepareJourneysPage,
  signInJourneysStaff,
  test,
} from "../cases/_harness";

export {
  assertNotAuthWall,
  awaitHydrated,
  expect,
  JOURNEYS_OWNER_EMAIL,
  prepareJourneysPage,
  signInJourneysStaff,
  test,
};

export const QA_HOST = process.env.PLAYWRIGHT_BASE_URL ?? "https://staging-qa-journeys.tulala.digital";
export const EVIDENCE_DIR = "e2e/qa-program/evidence/2026-09-18";

/** Open workspace admin Messages v5 and wait for the shell. */
export async function openAdminMessages(page: Page, next = "/admin/messages"): Promise<void> {
  await prepareJourneysPage(page);
  await signInJourneysStaff(page, next, JOURNEYS_OWNER_EMAIL);
  await expect(page.locator("[data-messages-v5]").first()).toBeVisible({ timeout: 30_000 });
  await awaitHydrated(page);
}

/**
 * Copy rules apply to Messages chrome. Scope to `[data-messages-v5]` when present
 * so admin sidebar aria-labels / fixture contact names like "QA Journeys Customer"
 * do not false-fail the scan. Guest/public pages pass an explicit root locator.
 */
export async function assertNoRawI18nKeys(
  page: Page,
  rootSelector = "[data-messages-v5]",
): Promise<void> {
  const root = page.locator(rootSelector).first();
  const target = (await root.count()) > 0 ? root : page.locator("body");
  const body = await target.innerText();
  expect(body, "raw messagesV5 key visible").not.toMatch(/dashboard\.messagesV5\./);
  expect(body, "unfilled placeholder visible").not.toMatch(/\{(name|version|count)\}/);
  expect(body, "em dash in Messages UI").not.toMatch(/\u2014/);
  // Word "customer" banned in Messages product copy (not in fixture person names).
  // Match standalone product phrasing: avoid names that embed the word.
  const productHits = body.match(/\b(customer|customers)\b/gi) ?? [];
  const suspicious = productHits.filter((w) => {
    // Allow nothing in Messages chrome — fixture names live in inbox rows;
    // if a row subject embeds "Customer", skip only when part of a proper name
    // pattern "QA … Customer". Flag bare UI chrome separately via kit tests.
    return true;
  });
  // Inbox/fixture names may embed "Customer"; kit static tests own the absolute ban.
  // Here only fail if a short chrome label (segment/chip/button-like) uses the word.
  const chromeLines = body.split("\n").map((l) => l.trim()).filter((line) => {
    if (!line || line.length > 80) return false;
    if (/\bQA\b.*\bCustomer\b/i.test(line)) return false;
    if (/\d{1,2}:\d{2}|Needs reply|Gathering|Web chat|Email|Waiting/i.test(line)) return false;
    return true;
  });
  const chromeText = chromeLines.join("\n");
  expect(chromeText.toLowerCase(), '"customer" in Messages chrome labels').not.toMatch(
    /\bcustomers?\b/,
  );
  void suspicious;
}

export async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: `${EVIDENCE_DIR}/${name}.jpg`,
    type: "jpeg",
    quality: 70,
    fullPage: false,
  });
}

export async function openFirstInboxRow(page: Page): Promise<void> {
  // Prefer Needs action so the composer is unlocked for tray/reply work.
  const needs = page.locator("[data-inbox-segments]").getByRole("tab", { name: /needs action/i });
  if (await needs.count()) {
    await needs.click().catch(() => undefined);
    await page.waitForTimeout(400);
  }
  const row = page.locator("[data-inbox-row]").first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.click();
  await expect(page.locator("[data-composer], [data-composer-wire]").first()).toBeVisible({
    timeout: 20_000,
  });
  await awaitHydrated(page);
  // If this thread locked the composer, try the next few rows.
  for (let i = 0; i < 5; i++) {
    const locked = page.locator('[data-composer="resolved"], [data-composer-locked]');
    if ((await locked.count()) === 0) break;
    const next = page.locator("[data-inbox-row]").nth(i + 1);
    if ((await next.count()) === 0) break;
    await next.click();
    await page.waitForTimeout(500);
    await awaitHydrated(page);
  }
}

/** Open the + tray (composer "More" / `.plus` control — not Attach). */
export async function openPlusTray(page: Page): Promise<void> {
  await awaitHydrated(page);
  const plus = page.locator("[data-composer-wire] button.plus, [data-composer] button.plus, button.plus").first();
  await expect(plus).toBeVisible({ timeout: 15_000 });
  await expect(plus).toBeEnabled({ timeout: 10_000 });
  // Close any leftover scrim/tray first
  if (await page.locator("button.scrim").count()) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  }
  await expect(async () => {
    if ((await page.locator("[data-tray]").count()) > 0) return;
    await plus.click();
    await expect(page.locator("[data-tray]").first()).toBeVisible({ timeout: 4_000 });
  }).toPass({ timeout: 25_000, intervals: [500, 1_000, 1_500] });
}

/** Console errors that are not known QA-host noise. */
export function attachConsoleGuard(page: Page): { errors: string[] } {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (/\/api\/health|vercel|Content Security Policy|favicon/i.test(text)) return;
    errors.push(text);
  });
  page.on("pageerror", (err) => {
    errors.push(String(err));
  });
  return { errors };
}
