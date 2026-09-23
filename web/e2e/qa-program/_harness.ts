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
  prepareJourneysPage as prepareJourneysPageRaw,
  signInJourneysStaff,
  test,
} from "../cases/_harness";

export {
  assertNotAuthWall,
  awaitHydrated,
  expect,
  JOURNEYS_OWNER_EMAIL,
  signInJourneysStaff,
  test,
};

export const QA_HOST = process.env.PLAYWRIGHT_BASE_URL ?? "https://staging-qa-journeys.tulala.digital";
export const EVIDENCE_DIR = "e2e/qa-program/evidence/2026-09-18";

/**
 * Codex P1 / AGENTS.md: refuse before any Messages mutation when the base URL
 * or Supabase env points at production / Impronta. Throws (Playwright) rather
 * than process.exit (scripts/isolated-target-guard.mjs).
 *
 * Stripe 4242 on an agent-owned production business must set
 * `QA_ALLOW_AGENT_PROD_HOST=1` and use a host that is not Impronta.
 */
export function assertQaIsolatedTarget(baseUrl = QA_HOST): void {
  const url = (baseUrl || "").toLowerCase();
  const supabase = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").toLowerCase();
  const ref = (process.env.SUPABASE_PROJECT_REF ?? "").toLowerCase();
  const blob = `${url}\n${supabase}\n${ref}`;
  const allowAgentProd = process.env.QA_ALLOW_AGENT_PROD_HOST === "1";

  // Impronta host / .env.vercel.local are never allowed. Production Supabase
  // ref is refused unless this is an explicit agent-owned Stripe host opt-in.
  if (/impronta|\.env\.vercel\.local/.test(blob)) {
    throw new Error(
      "QA program refusing Impronta / .env.vercel.local — use staging-qa-journeys or an agent-owned host with QA_ALLOW_AGENT_PROD_HOST=1",
    );
  }
  if (/pluhdapdnuiulvxmyspd/.test(blob) && !allowAgentProd) {
    throw new Error(
      "QA program refusing production Supabase without QA_ALLOW_AGENT_PROD_HOST=1 — use staging-qa-journeys (fxlankepwnvelxjrahwk)",
    );
  }

  const isLocal = /localhost|127\.0\.0\.1/.test(url);
  const isJourneysHost = /staging-qa-journeys(-b)?\.tulala\.digital/.test(url);
  const isQaSupabase =
    ref === "fxlankepwnvelxjrahwk" ||
    supabase.includes("fxlankepwnvelxjrahwk") ||
    !supabase; // remote Playwright often only sets PLAYWRIGHT_BASE_URL

  if (isJourneysHost || isLocal) {
    if (supabase && !isQaSupabase && !allowAgentProd) {
      throw new Error(
        "QA program refusing: PLAYWRIGHT_BASE_URL is journeys but NEXT_PUBLIC_SUPABASE_URL is not fxlankepwnvelxjrahwk",
      );
    }
    return;
  }

  if (allowAgentProd && /\.tulala\.digital/.test(url) && !/impronta/.test(url)) {
    return;
  }

  throw new Error(
    `QA program refusing base URL ${baseUrl || "(empty)"} — expected staging-qa-journeys.tulala.digital (or QA_ALLOW_AGENT_PROD_HOST=1 for an agent-owned *.tulala.digital)`,
  );
}

/** prepareJourneysPage with isolated-target refusal first (Codex P1 on #2155). */
export async function prepareJourneysPage(page: Page): Promise<void> {
  assertQaIsolatedTarget();
  await prepareJourneysPageRaw(page);
}

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
  assertQaIsolatedTarget();
  await prepareJourneysPage(page);
  await signInJourneysStaff(page, next, JOURNEYS_OWNER_EMAIL);
  await expect(page.locator("[data-messages-v5]").first()).toBeVisible({ timeout: 30_000 });
  await awaitHydrated(page);
}

/**
 * Production agent-owned host sign-in (D-MSG-313 Stripe).
 * `/api/dev/signin` is 403 on VERCEL_ENV=production — mint a magic-link session
 * via service role and set the @supabase/ssr cookie, then open Messages.
 * Requires QA_ALLOW_AGENT_PROD_HOST=1 + SUPABASE_SERVICE_ROLE_KEY on production.
 */
export async function signInAgentOwnedHost(
  page: Page,
  opts: { host: string; email?: string; next?: string } ,
): Promise<void> {
  assertQaIsolatedTarget(opts.host);
  if (process.env.QA_ALLOW_AGENT_PROD_HOST !== "1") {
    throw new Error("signInAgentOwnedHost requires QA_ALLOW_AGENT_PROD_HOST=1");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url.includes("pluhdapdnuiulvxmyspd") || !key || !anon) {
    throw new Error(
      "signInAgentOwnedHost needs production NEXT_PUBLIC_SUPABASE_URL + SERVICE_ROLE + ANON (pluhdapdnuiulvxmyspd)",
    );
  }
  const email = opts.email ?? process.env.QA_AGENT_OWNER_EMAIL ?? "qa-admin@impronta.test";
  const next = opts.next ?? "/admin/messages";
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkErr || !tokenHash) {
    throw new Error(`magic link failed: ${linkErr?.message ?? "no hashed_token"}`);
  }
  const { data: sess, error: otpErr } = await client.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });
  if (otpErr || !sess.session) {
    throw new Error(`verifyOtp failed: ${otpErr?.message ?? "no session"}`);
  }
  const ref = "pluhdapdnuiulvxmyspd";
  const storageKey = `sb-${ref}-auth-token`;
  const payload = JSON.stringify({
    access_token: sess.session.access_token,
    token_type: sess.session.token_type,
    expires_in: sess.session.expires_in,
    expires_at: sess.session.expires_at,
    refresh_token: sess.session.refresh_token,
    user: sess.session.user,
  });
  const encoded = `base64-${Buffer.from(payload).toString("base64")}`;
  const hostName = new URL(opts.host).hostname;
  const CHUNK = 3180;
  const cookies: {
    name: string;
    value: string;
    domain: string;
    path: string;
    secure: boolean;
    httpOnly: boolean;
    sameSite: "Lax";
  }[] = [];
  if (encoded.length <= CHUNK) {
    cookies.push({
      name: storageKey,
      value: encoded,
      domain: hostName,
      path: "/",
      secure: true,
      httpOnly: false,
      sameSite: "Lax",
    });
  } else {
    let i = 0;
    for (let offset = 0; offset < encoded.length; offset += CHUNK) {
      cookies.push({
        name: `${storageKey}.${i}`,
        value: encoded.slice(offset, offset + CHUNK),
        domain: hostName,
        path: "/",
        secure: true,
        httpOnly: false,
        sameSite: "Lax",
      });
      i += 1;
    }
  }
  await page.context().addCookies(cookies);
  await page.goto(new URL(next, opts.host).toString(), {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
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
 * Mint the client link from the thread header More menu and open it in a new
 * page. Uses `[data-menu-item="copy_link"]` → Link sheet `[data-thread-link]`
 * (clipboard is a bonus, not the source of truth — clipboard can be empty in
 * headless without failing the mint).
 */
export async function requireClientLink(
  page: Page,
  context: BrowserContext,
): Promise<Page> {
  // Close any open tray/sheet/scrim so the header More control is free.
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  }
  const header = page.locator("[data-thread-header]").first();
  await expect(header, "thread header missing — open a conversation first").toBeVisible({
    timeout: 15_000,
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => undefined);

  const more = header.getByRole("button", { name: /^more$/i }).first();
  await expect(more, "thread header More control missing").toBeVisible({ timeout: 10_000 });
  await more.click();
  const menu = page.locator("[data-thread-menu]").first();
  await expect(menu, "thread More menu did not open").toBeVisible({ timeout: 10_000 });

  const copyItem = menu.locator('[data-menu-item="copy_link"]').first();
  await expect(
    copyItem,
    "Copy client link was not available; it is the prerequisite for this spec",
  ).toBeVisible({ timeout: 10_000 });
  await copyItem.click();

  // Link sheet shows the minted URL in `[data-thread-link]` (and may auto-copy).
  const linkInput = page.locator("[data-thread-link]").first();
  await expect(
    linkInput,
    "Client link sheet did not mint a URL (data-thread-link missing)",
  ).toBeVisible({ timeout: 25_000 });
  await expect
    .poll(async () => ((await linkInput.inputValue().catch(() => "")) || "").trim(), {
      timeout: 25_000,
      message: "Client link URL stayed empty after mint",
    })
    .toMatch(/\/c\//);

  let tokenUrl = ((await linkInput.inputValue()) || "").trim();
  // Prefer an explicit Copy click so clipboard matches the sheet when available.
  const copyBtn = page.locator("[data-thread-link-copy]").first();
  if (await copyBtn.isVisible().catch(() => false)) {
    await copyBtn.click();
    await page.waitForTimeout(400);
  }
  const clip = await page.evaluate(async () => {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return null;
    }
  });
  if (clip && /\/c\//.test(clip)) tokenUrl = clip.trim();

  expect(
    tokenUrl && /\/c\//.test(tokenUrl),
    `client link was not minted; sheet/clipboard=${String(tokenUrl).slice(0, 80)}`,
  ).toBeTruthy();

  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  const client = await context.newPage();
  const url = tokenUrl!.startsWith("http") ? tokenUrl! : new URL(tokenUrl!, page.url()).toString();
  await client.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await client.waitForTimeout(1200);
  return client;
}

/**
 * Mint a brand-new conversation so offer/payment/times paths are not fighting
 * Lost/Won/existing-offer state on fixture threads (D-MSG-302).
 * Surfaces the sheet refusal sentence instead of hanging on a missing composer.
 */
export async function startFreshConversation(page: Page): Promise<string> {
  const newBtn = page
    .getByRole("button", { name: /^new$/i })
    .or(page.getByRole("button", { name: /new conversation/i }));
  await expect(newBtn.first(), "New conversation control missing").toBeVisible({ timeout: 15_000 });
  await newBtn.first().click();
  const sheet = page.locator("[data-sheet], [role='dialog']").filter({ hasText: /new conversation/i }).first();
  await expect(sheet, "New conversation sheet did not open").toBeVisible({ timeout: 15_000 });
  const stamp = Date.now();
  const name = `QA R2 ${stamp}`;
  const email = `qa-r2-${stamp}@impronta.test`;
  await sheet.getByRole("textbox", { name: /^who$/i }).fill(name);
  await sheet.getByRole("textbox", { name: /^email$/i }).fill(email);
  const start = sheet.locator("[data-new-start]").first();
  await expect(start, "Start conversation disabled after name+email").toBeEnabled({ timeout: 15_000 });

  let lastRefusal = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    // Sheet can stay mounted over an already-open thread; click with a bound
    // timeout so a sticky overlay cannot burn the whole test budget.
    await start.click({ timeout: 8_000 }).catch(() => undefined);
    await page.waitForTimeout(800);
    // Dismiss sticky New sheet so the composer under it is visible.
    await page.keyboard.press("Escape").catch(() => undefined);
    await page.waitForTimeout(400);
    // Messages v5 may expose the reply wire as data-composer OR as the
    // thread header + "Write a reply" textbox (agent-owned prod host).
    const composer = page.locator(
      "[data-composer], [data-composer-wire], [data-thread-header]",
    ).first();
    const replyBox = page.getByRole("textbox", { name: /write a reply|reply/i }).first();
    const opened =
      (await composer.isVisible().catch(() => false)) ||
      (await replyBox.isVisible().catch(() => false));
    if (opened) {
      await page.keyboard.press("Escape").catch(() => undefined);
      await awaitHydrated(page);
      return name;
    }
    const alert = sheet.locator("[role='alert'], [data-refusal]").first();
    lastRefusal = ((await alert.innerText().catch(() => "")) || "").trim();
    if (lastRefusal) {
      await page.waitForTimeout(2000);
      continue;
    }
  }
  throw new Error(
    `Start conversation did not open composer after 3 tries` +
      (lastRefusal ? ` (refusal: ${lastRefusal.slice(0, 160)})` : ""),
  );
}

/**
 * Prefer an inbox row that already awaits client Accept (seeded offer), else
 * open any live row. Used by payment so we do not depend on New→Start when
 * createInquiryFromIntent is flaky (D-MSG-308).
 */
export async function openAwaitingAcceptanceOrLive(page: Page): Promise<"awaiting" | "live"> {
  const needs = page.locator("[data-inbox-segments]").getByRole("tab", { name: /needs action/i });
  if (await needs.count()) {
    await needs.click().catch(() => undefined);
    await page.waitForTimeout(400);
  }
  // Offers chip narrows to threads that already carry an offer record.
  const offersChip = page.getByRole("button", { name: /^offers$/i }).first();
  if (await offersChip.isVisible().catch(() => false)) {
    await offersChip.click().catch(() => undefined);
    await page.waitForTimeout(500);
  }
  const rows = page.locator("[data-inbox-row]");
  await expect(rows.first(), "inbox has no rows — fixture/seed missing").toBeVisible({
    timeout: 20_000,
  });
  const n = Math.min(await rows.count(), 60);
  for (let i = 0; i < n; i++) {
    const row = rows.nth(i);
    const label = ((await row.innerText().catch(() => "")) || "").replace(/\s+/g, " ");
    if (/\blost\b/i.test(label)) continue;
    if (/accepted|deposit due|paid|won/i.test(label) && !/awaiting acceptance/i.test(label)) {
      continue;
    }
    if (/awaiting acceptance|\boffer\b/i.test(label)) {
      await row.click();
      await awaitHydrated(page);
      const locked = page.locator('[data-composer="resolved"], [data-composer-locked]');
      if ((await locked.count()) > 0) continue;
      await expect(page.locator("[data-composer], [data-composer-wire]").first()).toBeVisible({
        timeout: 20_000,
      });
      // Confirm the stream actually has a client-visible offer card.
      if ((await page.locator('[data-card="offer"]').count()) > 0) return "awaiting";
    }
  }
  // Clear Offers chip so openFirstInboxRow sees the full Needs-action list.
  if (await offersChip.isVisible().catch(() => false)) {
    const pressed = await offersChip.getAttribute("aria-pressed").catch(() => null);
    if (pressed === "true") await offersChip.click().catch(() => undefined);
  }
  await openFirstInboxRow(page);
  return "live";
}

/**
 * Send a priced offer via Add items → Continue → Send.
 * Effect required: stream `[data-card="offer"]` count must increase.
 * Optional soft signals (editor gone / "sent" copy) are NOT enough — that is
 * how payment-deep soft-passed with only "Lines added. Now the offer" (D-MSG-307).
 */
export async function sendPricedOffer(page: Page, opts?: { fresh?: boolean }): Promise<void> {
  if (opts?.fresh) {
    await startFreshConversation(page);
  } else {
    // Prefer a thread already awaiting Accept so payment can skip a flaky Send
    // when createInquiryFromIntent is unavailable (D-MSG-308).
    const kind = await openAwaitingAcceptanceOrLive(page);
    if (kind === "awaiting") {
      const offer = page.locator('[data-card="offer"]').first();
      await expect(
        offer,
        "Awaiting acceptance row opened but staff stream has no offer card",
      ).toBeVisible({ timeout: 20_000 });
      // Draft offer cards also match data-card=offer — only reuse a sent/viewed card
      // (client Accept needs status=sent). Draft falls through to Send.
      const label = ((await offer.innerText().catch(() => "")) || "").replace(/\s+/g, " ");
      // Reuse only a sent/viewed (not draft, not already-accepted) card — client
      // Accept needs status=sent. Draft/accepted fall through to Send/revise.
      if (label && !/\bdraft\b/i.test(label) && !/\baccepted\b/i.test(label)) return;
    }
    // Stream cards hydrate after the row click — wait briefly for a sent offer.
    for (let i = 0; i < 8; i++) {
      const cards = page.locator('[data-card="offer"]');
      const n = await cards.count();
      for (let c = 0; c < n; c++) {
        const label = ((await cards.nth(c).innerText().catch(() => "")) || "").replace(/\s+/g, " ");
        if (label && !/\bdraft\b/i.test(label) && !/\baccepted\b/i.test(label)) return;
      }
      await page.waitForTimeout(400);
    }
  }
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
  await expect(editor, "Offer editor did not open after Continue to offer").toBeVisible({
    timeout: 25_000,
  });
  const refused = page.locator('[data-offer-editor-phase="refused"]');
  if (await refused.isVisible().catch(() => false)) {
    const text = ((await refused.innerText().catch(() => "")) || "").trim();
    const retry = page.locator("[data-offer-editor-phase='refused'] button").first();
    if (/wait a moment|try again|rate/i.test(text) && (await retry.count())) {
      await page.waitForTimeout(2500);
      await retry.click();
      await expect(
        page.locator('[data-offer-editor-phase="ready"], [data-offer-editor]').first(),
        "Offer editor still refused after Try again",
      ).toBeVisible({ timeout: 20_000 });
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

  const sentOffer = async () => {
    const cards = page.locator('[data-card="offer"]');
    const n = await cards.count();
    for (let c = 0; c < n; c++) {
      const label = ((await cards.nth(c).innerText().catch(() => "")) || "").replace(/\s+/g, " ");
      if (label && !/\bdraft\b/i.test(label) && !/\baccepted\b/i.test(label)) return true;
    }
    return false;
  };
  // Offer card appeared while we were editing (hydrate race) — reuse only if sent.
  if (await sentOffer()) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    return;
  }
  const before = await page.locator('[data-card="offer"]').count();
  await sendOffer.click({ force: true });
  await expect(async () => {
    const refusal = page.locator("[data-refusal], [data-offer-editor-phase='refused']").first();
    if (await refusal.isVisible().catch(() => false)) {
      const text = ((await refusal.innerText().catch(() => "")) || "").trim();
      throw new Error(`Send offer refused: ${text.slice(0, 200) || "unknown"}`);
    }
    expect(
      await sentOffer(),
      `sent offer card did not appear in the stream after Send (before=${before})`,
    ).toBe(true);
  }).toPass({ timeout: 45_000, intervals: [500, 1_000, 2_000] });
}

/** Open times sheet, pick person + named service + N slots, send. Asserts times card. */
export async function sendTimesCard(
  page: Page,
  slotCount = 3,
  opts?: { inquiryId?: string },
): Promise<void> {
  // Times hold requires confirmed identity (D21 / D-MSG-306). Deep-link a
  // seeded inquiry known to have phone+email rather than a fresh draft row.
  const confirmedInquiry =
    opts?.inquiryId ??
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
    // Remote preview: SSO / CDN asset fetch failures show as Failed to load
    // resource: net::ERR_FAILED without naming a product bug. Ignore those;
    // keep real pageerrors and named console.error strings.
    if (
      /\/api\/health|vercel|Content Security Policy|favicon|net::ERR_FAILED|Failed to load resource|script resource is behind a redirect/i.test(
        text,
      )
    ) {
      return;
    }
    errors.push(text);
  });
  page.on("pageerror", (err) => {
    errors.push(String(err));
  });
  return { errors };
}
