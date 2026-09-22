/**
 * QA program harness for Messages v5 on the staging-qa-journeys host.
 * Reuses fixture sign-in from cases/_harness; targets workspace Messages (v5 shell),
 * not the POS messages dock unless a POS spec asks for it.
 *
 * Round-2 contract: required is the default. Soft `if (visible) { assert }` /
 * silent `return` is banned — use require* helpers or an explicit test.skip at
 * the top of the test. A suite that cannot fail is not evidence.
 */
import { expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
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

/** Fail the test naming what was missing — never soft-bail. */
export async function requireVisible(
  locator: Locator,
  reason: string,
  timeout = 20_000,
): Promise<Locator> {
  await expect(locator, reason).toBeVisible({ timeout });
  return locator;
}

export async function requireEnabled(
  locator: Locator,
  reason: string,
  timeout = 15_000,
): Promise<Locator> {
  await expect(locator, reason).toBeEnabled({ timeout });
  return locator;
}

export async function requireCountAtLeast(
  locator: Locator,
  min: number,
  reason: string,
): Promise<number> {
  const n = await locator.count();
  expect(n, reason).toBeGreaterThanOrEqual(min);
  return n;
}

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
  await expect(row, "inbox has no rows — fixture/seed missing").toBeVisible({ timeout: 20_000 });
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
  await expect(plus, "composer Plus tray control missing").toBeVisible({ timeout: 15_000 });
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

/**
 * Mint the client link from the thread header and open it in a new page.
 * Fails loudly if Copy client link is missing or the clipboard is empty.
 */
export async function requireClientLink(
  page: Page,
  context: BrowserContext,
): Promise<Page> {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  const header = page.locator("[data-thread-header]").first();
  await expect(header, "thread header missing — open a conversation first").toBeVisible({
    timeout: 15_000,
  });
  const more = header.getByRole("button", { name: /more|actions|⋯|…/i }).first();
  if (await more.count()) {
    await more.click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(300);
  }
  await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => undefined);
  const copy = page.getByRole("button", { name: /copy client link|client link/i }).first();
  await expect(
    copy,
    "Copy client link was not available; it is the prerequisite for this spec",
  ).toBeVisible({ timeout: 15_000 });
  await copy.click({ force: true });
  await page.waitForTimeout(600);
  const tokenUrl = await page.evaluate(async () => {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return null;
    }
  });
  expect(
    tokenUrl && /\/c\//.test(tokenUrl),
    `client link was not minted after Copy client link; clipboard=${String(tokenUrl).slice(0, 80)}`,
  ).toBeTruthy();
  const client = await context.newPage();
  const url = tokenUrl!.startsWith("http") ? tokenUrl! : new URL(tokenUrl!, page.url()).toString();
  await client.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await client.waitForTimeout(1200);
  return client;
}

/** Send a priced offer via Add items → Continue → Send. Asserts one offer card. */
export async function sendPricedOffer(page: Page): Promise<void> {
  await openPlusTray(page);
  await page.locator('[data-tray-item="add_items"]').click();
  const items = page.locator("[data-sheet]").first();
  await expect(items, "Add items sheet did not open").toBeVisible({ timeout: 20_000 });
  const menu = items.getByRole("button", { name: /^Menu$/i });
  if (await menu.count()) await menu.click();
  const priced = items.locator("button.opt").filter({ hasText: /\$/ }).first();
  await expect(
    priced,
    "no priced catalogue row in Add items — seed Items on the QA tenant",
  ).toBeVisible({ timeout: 15_000 });
  await priced.click();
  const cont = items.locator("[data-items-send]");
  await expect(cont.first(), "Continue to offer disabled after picking a priced item").toBeEnabled({
    timeout: 10_000,
  });
  await cont.first().click();
  const sendOffer = page
    .locator("[role='dialog'], [data-sheet]")
    .last()
    .getByRole("button", { name: /^send\b/i });
  await expect(sendOffer.first(), "Send offer button missing after Continue").toBeEnabled({
    timeout: 15_000,
  });
  const before = await page.locator('[data-card="offer"]').count();
  await sendOffer.first().click({ force: true });
  await expect(
    page.locator('[data-card="offer"]').nth(before),
    "offer card did not appear in the stream after Send",
  ).toBeVisible({ timeout: 25_000 });
}

/** Open times sheet, pick person + named service + N slots, send. Asserts times card. */
export async function sendTimesCard(page: Page, slotCount = 3): Promise<void> {
  await openPlusTray(page);
  await page.locator('[data-tray-item="times"]').click();
  const sheet = page.locator("[data-times-sheet], [data-sheet]").first();
  await expect(sheet, "Times sheet did not open").toBeVisible({ timeout: 20_000 });

  const person = sheet.locator("[data-times-people] button").first();
  if (await person.count()) {
    await person.click();
  } else {
    await sheet.locator("[data-option-row], button").filter({ hasText: /.+/ }).first().click();
  }

  const services = sheet.locator("[data-times-services] button");
  const nServices = await services.count();
  let pickedService = false;
  for (let i = 0; i < nServices; i++) {
    const label = (await services.nth(i).innerText()).trim();
    if (/any service/i.test(label)) continue;
    await services.nth(i).click();
    pickedService = true;
    break;
  }
  expect(pickedService || nServices === 0, "could not pick a named service in Times sheet").toBeTruthy();

  await page.waitForTimeout(2000);
  const refusal = sheet.locator("[data-refusal], [role='alert']");
  if (await refusal.isVisible().catch(() => false)) {
    const text = await refusal.innerText();
    throw new Error(`Times sheet refused before slots: ${text.slice(0, 200)}`);
  }

  const slots = sheet.locator("[data-times-slots] button");
  const available = await slots.count();
  expect(
    available,
    `need ≥${slotCount} free slots to exercise this path; fixture has ${available}`,
  ).toBeGreaterThanOrEqual(slotCount);
  for (let i = 0; i < slotCount; i++) await slots.nth(i).click();

  const send = sheet.locator("[data-times-send]");
  await expect(send.first(), "Times Send disabled after picking slots").toBeEnabled({
    timeout: 15_000,
  });
  await send.first().click();
  await expect(
    page.locator('[data-card="times"], [data-card="options"]').first(),
    "times card did not appear in the stream after Send",
  ).toBeVisible({ timeout: 30_000 });
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
