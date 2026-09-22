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
  const rows = page.locator("[data-inbox-row]");
  await expect(rows.first(), "inbox has no rows — fixture/seed missing").toBeVisible({
    timeout: 20_000,
  });
  // Skip Lost / resolved rows — Continue-to-offer refuses on them ("This could
  // not be completed"), which previously masqueraded as a soft pass.
  const n = Math.min(await rows.count(), 24);
  let opened = false;
  for (let i = 0; i < n; i++) {
    const row = rows.nth(i);
    const label = ((await row.innerText().catch(() => "")) || "").replace(/\s+/g, " ");
    if (/\blost\b/i.test(label)) continue;
    await row.click();
    await page.waitForTimeout(400);
    await awaitHydrated(page);
    const locked = page.locator('[data-composer="resolved"], [data-composer-locked]');
    if ((await locked.count()) > 0) continue;
    opened = true;
    break;
  }
  expect(
    opened,
    "no open (non-Lost, unlocked) inbox row — seed an active conversation on the QA tenant",
  ).toBeTruthy();
  await expect(page.locator("[data-composer], [data-composer-wire]").first()).toBeVisible({
    timeout: 20_000,
  });
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

/**
 * Mint a brand-new conversation so offer/payment/times paths are not fighting
 * Lost/Won/existing-offer state on fixture threads (D-MSG-302).
 */
export async function startFreshConversation(page: Page): Promise<string> {
  const newBtn = page
    .getByRole("button", { name: /^new$/i })
    .or(page.getByRole("button", { name: /new conversation/i }));
  await expect(newBtn.first(), "New conversation control missing").toBeVisible({ timeout: 15_000 });
  await newBtn.first().click();
  const sheet = page.locator("[data-sheet], [role='dialog']").first();
  await expect(sheet, "New conversation sheet did not open").toBeVisible({ timeout: 15_000 });
  const stamp = Date.now();
  const name = `QA R2 ${stamp}`;
  const email = `qa-r2-${stamp}@impronta.test`;
  const nameField = sheet.getByLabel(/name/i).or(sheet.locator("input").first());
  await nameField.first().fill(name);
  const emailField = sheet.getByLabel(/email/i).or(sheet.locator('input[type="email"]'));
  if (await emailField.count()) await emailField.first().fill(email);
  else {
    const inputs = sheet.locator("input:not([type='hidden'])");
    if ((await inputs.count()) > 1) await inputs.nth(1).fill(email);
  }
  const start = sheet.locator("[data-new-start]").or(sheet.getByRole("button", { name: /start|create|begin/i })).first();
  await expect(start, "Start conversation disabled after name+email").toBeEnabled({ timeout: 15_000 });
  await start.click();
  await expect(page.locator("[data-composer], [data-composer-wire]").first()).toBeVisible({
    timeout: 25_000,
  });
  await awaitHydrated(page);
  return name;
}

/** Send a priced offer via Add items → Continue → Send. Asserts one offer card. */
export async function sendPricedOffer(page: Page): Promise<void> {
  await startFreshConversation(page);
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

  const editor = page.locator("[data-offer-editor], [data-offer-editor-phase]").first();
  // Rate-limit / transient refusals: retry Continue once.
  for (let attempt = 0; attempt < 2; attempt++) {
    const visible = await editor.isVisible().catch(() => false);
    if (visible) break;
    await page.waitForTimeout(1500);
    if (await cont.first().isEnabled().catch(() => false)) await cont.first().click();
  }
  await expect(editor, "Offer editor did not open after Continue to offer").toBeVisible({
    timeout: 25_000,
  });
  const refused = page.locator('[data-offer-editor-phase="refused"]');
  if (await refused.isVisible().catch(() => false)) {
    const text = ((await refused.innerText().catch(() => "")) || "").trim();
    if (/wait a moment|try again|rate/i.test(text) && (await page.locator("[data-offer-editor-phase='refused'] button").count())) {
      await page.locator("[data-offer-editor-phase='refused'] button").first().click();
      await page.waitForTimeout(2000);
    } else {
      throw new Error(
        `Continue to offer refused (often a Lost/resolved thread): ${text.slice(0, 200) || "unknown"}`,
      );
    }
  }
  await expect(
    page.locator('[data-offer-editor-phase="ready"], [data-offer-editor]').first(),
    "Offer editor never reached ready phase",
  ).toBeVisible({ timeout: 25_000 });

  // Continue-to-offer sometimes opens an empty editor (D-MSG-305). Seed a custom line.
  if (await page.getByText(/no lines yet/i).isVisible().catch(() => false)) {
    const addLine = page.locator("[data-offer-add-custom-line]").first();
    await expect(addLine, "Add line missing on empty offer editor").toBeVisible({ timeout: 10_000 });
    await addLine.click();
    await page.locator("[data-offer-custom-label]").fill("QA priced line");
    await page.locator("[data-offer-custom-units]").fill("1");
    await page.locator("[data-offer-custom-price]").fill("18");
    await page.locator("[data-offer-custom-confirm]").click();
    await expect(page.getByText(/QA priced line/i).first()).toBeVisible({ timeout: 10_000 });
  }

  // Send is gated on a clean saved state (canSendOffer). Persist first when needed.
  const sendOffer = page.locator("[data-offer-send]").first();
  const saveDraft = page.locator("[data-offer-save-draft]").first();
  await expect(async () => {
    if (await sendOffer.isEnabled().catch(() => false)) return;
    const title = (await sendOffer.getAttribute("title").catch(() => "")) || "";
    if (await saveDraft.isVisible().catch(() => false)) {
      await saveDraft.click({ force: true });
      await page.waitForTimeout(1000);
    }
    if (title.includes("sendBlockedError") || title.includes("sendBlockedEmpty")) {
      throw new Error(`Send offer blocked: ${title}`);
    }
    await expect(sendOffer, `Send offer still disabled (${title || "no title"})`).toBeEnabled({
      timeout: 5_000,
    });
  }).toPass({ timeout: 45_000, intervals: [500, 1_000, 1_500] });

  const before = await page.locator('[data-card="offer"]').count();
  await sendOffer.click({ force: true });
  await expect(async () => {
    const after = await page.locator('[data-card="offer"]').count();
    const editorGone = (await page.locator("[data-offer-send]").count()) === 0;
    if (after > before || editorGone) return;
    const refusal = page.locator("[data-refusal], [data-offer-editor-phase='refused']").first();
    if (await refusal.isVisible().catch(() => false)) {
      const text = ((await refusal.innerText().catch(() => "")) || "").trim();
      throw new Error(`Send offer refused: ${text.slice(0, 200) || "unknown"}`);
    }
    expect(after, "offer card did not appear in the stream after Send").toBeGreaterThan(before);
  }).toPass({ timeout: 30_000, intervals: [500, 1_000, 2_000] });
}

/** Open times sheet, pick person + named service + N slots, send. Asserts times card. */
export async function sendTimesCard(page: Page, slotCount = 3): Promise<void> {
  // Times hold requires confirmed identity (D21 / D-MSG-306). Deep-link a
  // seeded inquiry known to have phone+email rather than a fresh draft row.
  const confirmedInquiry =
    process.env.QA_CONFIRMED_IDENTITY_INQUIRY_ID ??
    process.env.QA_HOLD_EXPIRED_INQUIRY_ID ??
    "195d4d01-1d63-456b-a6fa-9df523ab0bc9";
  const u = new URL(page.url());
  u.searchParams.set("inquiry", confirmedInquiry);
  await page.goto(u.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.locator("[data-messages-v5]").first()).toBeVisible({ timeout: 30_000 });
  await awaitHydrated(page);
  // Lost short-circuits; reopen if needed.
  const reopen = page.getByRole("button", { name: /^reopen$/i }).first();
  if (await reopen.isVisible().catch(() => false)) {
    await reopen.click();
    await page.waitForTimeout(1000);
  }
  await openPlusTray(page);
  await page.locator('[data-tray-item="times"]').click();
  const body = page.locator("[data-times-sheet]").first();
  await expect(body, "Times sheet body did not open").toBeVisible({ timeout: 20_000 });
  // Catalog loads async after open.
  await expect(async () => {
    const phase = (await body.getAttribute("data-phase")) || "";
    if (phase === "refused" || phase === "failed") {
      const text = ((await body.innerText().catch(() => "")) || "").trim();
      throw new Error(`Times sheet ${phase}: ${text.slice(0, 200)}`);
    }
    const n = await page.locator("[data-times-people] [data-option-row], [data-times-people] button").count();
    expect(n, "Times sheet has no bookable people after load").toBeGreaterThan(0);
  }).toPass({ timeout: 30_000, intervals: [500, 1_000, 2_000] });

  const people = page.locator("[data-times-people] [data-option-row], [data-times-people] button");
  const peopleCount = await people.count();
  expect(peopleCount, "Times sheet has no bookable people").toBeGreaterThan(0);

  let slotsReady = false;
  const tryOrder: number[] = [];
  for (let i = 0; i < peopleCount; i++) {
    const label = ((await people.nth(i).innerText().catch(() => "")) || "").trim();
    if (/therapist b/i.test(label)) tryOrder.unshift(i);
    else tryOrder.push(i);
  }

  for (const pi of tryOrder) {
    await people.nth(pi).click({ force: true });
    const services = page.locator("[data-times-services] button, [data-times-services] [role='button']");
    const nServices = await services.count();
    for (let i = 0; i < nServices; i++) {
      const label = (await services.nth(i).innerText()).trim();
      if (/any service/i.test(label)) continue;
      await services.nth(i).click();
      break;
    }
    try {
      await expect(async () => {
        const n = await page.locator("[data-times-slots] button").count();
        expect(n).toBeGreaterThanOrEqual(slotCount);
      }).toPass({ timeout: 12_000, intervals: [400, 800, 1_200] });
      slotsReady = true;
      break;
    } catch {
      /* try next person */
    }
  }
  expect(
    slotsReady,
    `need ≥${slotCount} free slots across bookable people; fixture returned 0 (seed talent_booking_hours)`,
  ).toBeTruthy();

  const slots = page.locator("[data-times-slots] button");
  for (let i = 0; i < slotCount; i++) await slots.nth(i).click();

  const send = page.locator("[data-times-send]").or(page.getByRole("button", { name: /send times/i }));
  await expect(send.first(), "Times Send disabled after picking slots").toBeEnabled({
    timeout: 15_000,
  });
  await send.first().click();
  // If identity gate fires, fail naming it (do not soft-pass).
  const identityRefusal = page.locator("[data-refusal='identity_unconfirmed'], [role='alert']").filter({
    hasText: /identity is not confirmed/i,
  });
  if (await identityRefusal.isVisible().catch(() => false)) {
    throw new Error(
      "Times send refused: Client identity is not confirmed (D-MSG-306) — seed QA_CONFIRMED_IDENTITY_INQUIRY_ID",
    );
  }
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
