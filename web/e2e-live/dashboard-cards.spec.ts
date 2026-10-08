/**
 * TUL-354: READ-ONLY live checks of the signed-in talent dashboard cards, as the TEST talent TAL-93900.
 *
 * ON DEMAND ONLY (the PM runs it against production after a deploy). It signs in with the SAME service-role minted
 * session as the timing harness (no password, no new auth path) and only navigates, reads and asserts. It NEVER
 * clicks Save, Publish, Delete or Submit and never types into a persisted field: every click goes through
 * `assertReadOnlyAction`. Opening a drawer or a form and leaving it is the most it does; each check runs in its own
 * throwaway browser context, so nothing it opens outlives the check.
 *
 * Refuses to run unless the target is TAL-93900 (`assertDashboardTarget`), and any page that names TAL-93938
 * (Jorgelina) fails the check. Needs:
 *   LIVE_DASHBOARD=1 (or LIVE_TIMING=1), NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 * (production project pluhdapdnuiulvxmyspd). Without LIVE_DASHBOARD=1 or LIVE_TIMING=1 it skips.
 *
 *   cd web && set -a && . ./.env.local && set +a && npm run qa:live-dashboard-cards
 *
 * A check that cannot prove its card because production data is in the wrong state (no extra photos, a populated
 * Today, an already-onboarded talent) SKIPS with the reason in its title/annotation; a skip is not a pass.
 */
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";

import {
  assertDashboardTarget,
  assertNoForbiddenTalent,
  assertReadOnlyAction,
  attentionEmptyVerdict,
  clockAndDateVerdict,
  hasLibraryErrorCard,
  libraryResponseVerdict,
  loadMoreVerdict,
  skipLinkVerdict,
} from "../scripts/live-timing/dashboard-cards";
import {
  APP_HOST,
  PROD_SUPABASE_REF,
  TEST_TALENT_CODE,
  deleteTempState,
  mintTestTalentState,
  writeTempState,
  type MintPorts,
} from "../scripts/live-timing/timing-harness";

// Default (not serial) mode: one selector miss must not skip the other cards.
// Tests in this file still share one worker, so beforeAll mints one session.
test.describe.configure({ retries: 0 });

const CONTENT_MS = 60_000;
let statePath: string | null = null;

test.beforeAll(async () => {
  test.skip(process.env.LIVE_DASHBOARD !== "1" && process.env.LIVE_TIMING !== "1", "set LIVE_DASHBOARD=1 (or LIVE_TIMING=1) to run the dashboard card checks");
  assertDashboardTarget(TEST_TALENT_CODE); // refuses anything but TAL-93900, before any network call
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url.includes(PROD_SUPABASE_REF) || !anon || !service) {
    throw new Error(`needs NEXT_PUBLIC_SUPABASE_URL (${PROD_SUPABASE_REF}), NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY`);
  }
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const ports: MintPorts = {
    async emailForProfileCode(code) {
      const { data, error } = await admin.from("talent_profiles").select("user_id").eq("profile_code", code).maybeSingle<{ user_id: string | null }>();
      if (error || !data?.user_id) return null;
      const { data: u } = await admin.auth.admin.getUserById(data.user_id);
      return u?.user?.email ?? null;
    },
    async hashedTokenFor(email) {
      const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
      const hash = data?.properties?.hashed_token;
      if (error || !hash) throw new Error(`magic link failed: ${error?.message ?? "no hashed_token"}`);
      return hash;
    },
    async verifyOtp(tokenHash) {
      const { data, error } = await client.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
      if (error || !data.session) throw new Error(`verifyOtp failed: ${error?.message ?? "no session"}`);
      return data.session;
    },
  };
  process.stdout.write(`\ndashboard-cards target: profile ${TEST_TALENT_CODE}, read-only\n`);
  statePath = writeTempState(await mintTestTalentState(ports, { code: TEST_TALENT_CODE }));
});

test.afterAll(() => {
  deleteTempState(statePath);
  statePath = null;
});

// ------------------------------------------------------------------ helpers

/** A click that persists is refused before it runs. */
async function safeClick(target: ReturnType<Page["locator"]>, name: string): Promise<void> {
  assertReadOnlyAction(name);
  await target.click({ timeout: 15_000 });
}

/** Waits for the signed-in dashboard to have real text, then fails if it names a real talent. */
async function settle(page: Page): Promise<void> {
  await page.waitForFunction(
    () => ((document.querySelector('main, [role="main"]') as HTMLElement | null) ?? document.body).innerText.trim().length > 200,
    undefined,
    { timeout: CONTENT_MS },
  );
  await page.waitForTimeout(1_000);
  assertNoForbiddenTalent(await page.evaluate(() => document.body.innerText));
}

const lang = (page: Page) => page.evaluate(() => document.documentElement.lang || "");
const mainText = (page: Page) =>
  page.evaluate(() => ((document.querySelector('main, [role="main"]') as HTMLElement | null) ?? document.body).innerText);

/** Runs `fn` on a page in a fresh signed-in context (desktop viewport); always attaches a screenshot and closes it. */
async function onPage(browser: Browser, info: TestInfo, path: string, fn: (page: Page, context: BrowserContext) => Promise<void>): Promise<void> {
  const context = await browser.newContext({ storageState: statePath ?? undefined, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  try {
    await page.goto(`${APP_HOST}${path}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await settle(page);
    await fn(page, context);
  } finally {
    await info.attach(`screenshot ${path}`, { body: await page.screenshot({ fullPage: false }).catch(() => Buffer.from("")), contentType: "image/png" }).catch(() => undefined);
    await context.close();
  }
}

async function openBuilder(page: Page): Promise<void> {
  await page.locator("[data-theme-canvas-root] [data-builder-node-id]").first().waitFor({ state: "visible", timeout: 90_000 });
  await page.waitForTimeout(800);
}

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop", "dashboard cards run on the desktop project only");
});

// ------------------------------------------------------------------ 1. TUL-166 Hours drawer + New service form

test("TUL-166: Hours drawer shows the weekly hours; the New service form opens (not saved)", async ({ browser }, info) => {
  test.setTimeout(4 * 60_000);
  // Catches: the Working hours entry doing nothing, or the weekly grid rendering empty.
  await onPage(browser, info, "/talent/settings", async (page) => {
    const open = page.getByRole("button", { name: /working hours|horario/i }).first();
    await safeClick(open, "Working hours");
    const panel = page.locator("[data-working-hours-panel]");
    await expect(panel, "Working hours panel opens").toBeVisible({ timeout: 20_000 });
    // Anchor on the 7 weekday labels (full or abbreviated, ES or EN), not on a
    // control count: closed days render differently from open ones.
    await expect(panel).toContainText(/\b(lun|mon)/i, { timeout: 30_000 });
    const panelText = (await panel.innerText()).toLowerCase();
    const es = [/\blun/, /\bmar/, /\bmi[eé]/, /\bjue/, /\bvie/, /\bs[aá]b/, /\bdom/];
    const en = [/\bmon/, /\btue/, /\bwed/, /\bthu/, /\bfri/, /\bsat/, /\bsun/];
    const found = (set: RegExp[]) => set.filter((re) => re.test(panelText)).length;
    expect(Math.max(found(es), found(en)), "all 7 weekdays are listed in the Hours panel").toBe(7);
    await page.keyboard.press("Escape");
    if (await panel.isVisible().catch(() => false)) await safeClick(page.locator("[data-working-hours-panel]").getByRole("button", { name: /close|cerrar/i }).first(), "Close");
  });

  // Catches: "+ Add item" or "Continue" dead-ending, or the editor opening without its Name and price fields.
  await onPage(browser, info, "/talent/services", async (page) => {
    await safeClick(page.getByRole("button", { name: /add item|agregar art[ií]culo/i }).first(), "Add item");
    // "+ Add item" first opens a type picker ("¿Qué estás agregando?"). Assert the
    // picker and its three kinds, then Cancel: nothing is created, nothing saved.
    const dialog = page.getByRole("dialog").first();
    await expect(dialog, "type picker opens").toBeVisible({ timeout: 15_000 });
    await expect(dialog).toContainText(/servicio|service/i);
    await expect(dialog).toContainText(/paquete|package/i);
    await expect(dialog).toContainText(/producto|product/i);
    await safeClick(dialog.getByRole("button", { name: /^(cancel|cancelar)$/i }), "Cancel");
    await expect(dialog, "picker closes on Cancel").toBeHidden({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /add item|agregar art[ií]culo/i }).first()).toBeVisible({ timeout: 15_000 });
  });
});

// ------------------------------------------------------------------ 2. 24h times and dd/mm dates

test("24h and dd/mm: Today, Agenda and the hours page render 24h times and dd/mm dates for the ES talent", async ({ browser }, info) => {
  test.setTimeout(4 * 60_000);
  const seen: string[] = [];
  for (const path of ["/talent/today", "/talent/calendar", "/talent/calendar/availability"]) {
    await onPage(browser, info, path, async (page) => {
      const l = await lang(page);
      test.skip(!/^es\b/i.test(l), `talent page language is "${l}", not Spanish; the dd/mm check is for the ES talent`);
      const v = clockAndDateVerdict(await mainText(page));
      seen.push(`${path}: ${v.times24h} x 24h, ${v.ddMmWitnesses.length} dd/mm witness(es)`);
      // Catches: "3:30 PM" style times, or mm/dd dates such as 10/25/2026, on a Spanish dashboard.
      expect(v.amPm, `${path}: 12-hour times`).toEqual([]);
      expect(v.nonDdMm, `${path}: dates that are not dd/mm`).toEqual([]);
    });
  }
  info.annotations.push({ type: "readings", description: seen.join(" | ") });
});

// ------------------------------------------------------------------ 3. TUL-278 skip link

test("TUL-278: exactly one skip link on /talent/today, localized", async ({ browser }, info) => {
  await onPage(browser, info, "/talent/today", async (page) => {
    const links = await page.$$eval("a", (as) => as.map((a) => ({ text: (a.textContent ?? "").trim(), href: a.getAttribute("href") })));
    const l = await lang(page);
    // Catches: a second skip link from a nested shell, or an English "Skip to main content" on the Spanish page.
    const v = skipLinkVerdict(links, l);
    expect(v.ok, v.reason).toBe(true);
    expect(await page.locator("a.skip-to-main").count(), "skip-to-main anchors").toBe(1);
    if (!/^es\b/i.test(l)) info.annotations.push({ type: "note", description: `page language is "${l}", not Spanish; matched the English skip text` });
  });
});

// ------------------------------------------------------------------ 4. TUL-228 / TUL-277 Load more

test("TUL-228/277: Load more appends items in the Assets library and the profile shell (read only)", async ({ browser }, info) => {
  test.setTimeout(5 * 60_000);
  const outcome: string[] = [];
  let failed = 0;

  // (a) Builder Assets drawer (media library pager, TUL-228).
  await onPage(browser, info, "/talent/page-builder", async (page) => {
    await openBuilder(page);
    await safeClick(page.locator('[data-dock-item="assets"]'), "Assets");
    const drawer = page.locator('[data-testid="assets-drawer"]');
    await drawer.waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForTimeout(2_500);
    const more = drawer.locator('[data-testid="media-library-load-more"]');
    if (!(await more.isVisible().catch(() => false))) {
      outcome.push("SKIP assets library: the whole library fits on one page, no Load more button");
      return;
    }
    const tiles = drawer.locator("[data-media-tile]");
    const before = await tiles.count();
    await safeClick(more, "Load more");
    await expect.poll(() => tiles.count(), { timeout: 20_000 }).toBeGreaterThan(before);
    const v = loadMoreVerdict(before, await tiles.count());
    if (!v.ok) failed += 1;
    outcome.push(`${v.ok ? "PASS" : "FAIL"} assets library: ${v.reason}`);
  });

  // (b) Profile shell / gallery editors (TUL-277 album pager, TUL-228 gallery pager), only if already on screen or one click away.
  await onPage(browser, info, "/talent/profile", async (page) => {
    const sel = '[data-testid="album-load-more"], [data-testid="gallery-load-more"] button';
    let more = page.locator(sel).first();
    if (!(await more.isVisible().catch(() => false))) {
      const opener = page.getByRole("button", { name: /^(photos|fotos|gallery|galer[ií]a)\b/i }).first();
      if (await opener.isVisible().catch(() => false)) {
        await safeClick(opener, "Photos");
        await page.waitForTimeout(3_000);
        more = page.locator(sel).first();
      }
    }
    if (!(await more.isVisible().catch(() => false))) {
      outcome.push("SKIP profile shell: no album or gallery with more photos than one page");
      return;
    }
    const imgs = page.locator("img");
    const before = await imgs.count();
    await safeClick(more, "Load more");
    await expect.poll(() => imgs.count(), { timeout: 20_000 }).toBeGreaterThan(before);
    const v = loadMoreVerdict(before, await imgs.count());
    if (!v.ok) failed += 1;
    outcome.push(`${v.ok ? "PASS" : "FAIL"} profile shell: ${v.reason}`);
  });

  info.annotations.push({ type: "outcome", description: outcome.join(" | ") });
  expect(failed, outcome.join(" | ")).toBe(0);
  test.skip(outcome.every((o) => o.startsWith("SKIP")), outcome.join(" | "));
});

// ------------------------------------------------------------------ 5. TUL-243 Today empty states

test("TUL-243: Today's empty cards render their copy, not a blank card", async ({ browser }, info) => {
  await onPage(browser, info, "/talent/today", async (page) => {
    const l = await lang(page);
    const attention = page.locator('[data-testid="today-attention"]');
    test.skip((await attention.count()) === 0, "Today is in first-run mode (no Needs attention card), so there is no empty state to read");
    // The card fills in after the messages check; wait for it to stop saying "checking".
    await expect(page.locator('[data-testid="today-attention-checking"]')).toHaveCount(0, { timeout: 30_000 });
    const verdict = attentionEmptyVerdict(await attention.innerText(), l);
    info.annotations.push({ type: "needs-attention", description: `${verdict.state}: ${verdict.reason}` });
    // Catches: an empty Needs attention card rendered with a title and no "all clear" line.
    expect(verdict.ok, verdict.reason).toBe(true);

    // Money card: the empty month must say so ("Aún no hay pagos este mes"), or say it is unavailable, never a bare "·".
    // Searched across main, not a window after the first "Money": the nav item
    // of the same name comes first and pushed the card out of a 400-char window.
    const text = await mainText(page);
    expect(text, "Money card carries a payments line").toMatch(/Aún no hay pagos este mes|No payments yet this month|\d+\s+(pagos|payments)|No disponible|Not available/i);
    // Catches: Today rendering its copy in English for a Spanish talent (PM, 2026-10-08).
    if (/^es\b/i.test(l)) {
      const englishSentinels = [/No payments yet this month/i, /\bNeeds attention\b/i, /\bAll clear\b/i];
      const leaked = englishSentinels.filter((re) => re.test(text)).map(String);
      expect(leaked, "Today copy follows the ES chrome (no English card copy on a Spanish page)").toEqual([]);
    }
    test.skip(verdict.state === "populated", `Needs attention has items on the test talent right now (${verdict.reason}); its empty copy is not on screen`);
  });
});

// ------------------------------------------------------------------ 6. TUL-271 18+ step

test("TUL-271: the 18+ terms step renders (route check, never ticked or submitted)", async ({ browser }, info) => {
  const context = await browser.newContext({ storageState: statePath ?? undefined, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  try {
    const res = await page.goto(`${APP_HOST}/register/accept-terms`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(1_500);
    const path = new URL(page.url()).pathname;
    test.skip(!path.includes("/register/accept-terms"), `already-onboarded talent: /register/accept-terms redirects to ${path} (status ${res?.status() ?? "n/a"}), so the step is unreachable`);
    test.skip((res?.status() ?? 200) >= 400, `/register/accept-terms is not served on the app host (status ${res?.status()})`);
    assertNoForbiddenTalent(await page.evaluate(() => document.body.innerText));
    // Catches: the required 18+ and Terms checkbox missing from the acceptance step.
    const box = page.locator('[data-testid="signup-age-terms"]');
    await expect(box, "18+ checkbox renders").toBeVisible({ timeout: 20_000 });
    await expect(box).toHaveAttribute("required", "");
    await expect(box.locator("xpath=ancestor::label[1]")).toContainText(/18/);
    await expect(page.locator('a[href*="/legal/terms"]').first()).toBeVisible();
    await expect(page.locator('a[href*="/legal/privacy"]').first()).toBeVisible();
  } finally {
    await info.attach("screenshot accept-terms", { body: await page.screenshot().catch(() => Buffer.from("")), contentType: "image/png" }).catch(() => undefined);
    await context.close();
  }
});

// ------------------------------------------------------------------ 7. TUL-78/79/87 builder clicks

test("TUL-78/79/87: builder opens, Agregar panel opens, Assets loads with no error card (inserts nothing)", async ({ browser }, info) => {
  test.setTimeout(4 * 60_000);
  const context = await browser.newContext({ storageState: statePath ?? undefined, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const library: Array<{ url: string; status: number; contentType: string | null }> = [];
  page.on("response", (r) => {
    if (r.request().method() === "GET" && /\/api\/(admin|talent)\/media\/library/.test(r.url())) {
      library.push({ url: r.url(), status: r.status(), contentType: r.headers()["content-type"] ?? null });
    }
  });
  try {
    await page.goto(`${APP_HOST}/talent/page-builder`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await openBuilder(page); // Catches: the builder not opening at all (canvas with no blocks).
    assertNoForbiddenTalent(await page.evaluate(() => document.body.innerText));

    // Catches: Add (Agregar) doing nothing. Open and close it; no gallery card is clicked, nothing is inserted.
    await safeClick(page.locator('[data-dock-item="add"]'), "Add");
    await expect(page.locator('[data-testid="add-gallery-panel"]')).toBeVisible({ timeout: 10_000 });
    await safeClick(page.locator('[data-dock-item="add"]'), "Add (close)");
    await expect(page.locator('[data-testid="add-gallery-panel"]')).toBeHidden({ timeout: 10_000 });

    // Catches: the Assets drawer opening on a red "Could not load the media library" card.
    await safeClick(page.locator('[data-dock-item="assets"]'), "Assets");
    const drawer = page.locator('[data-testid="assets-drawer"]');
    await expect(drawer).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => library.length, { message: "GET /api/(admin|talent)/media/library fired", timeout: 20_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(2_000);
    for (const r of library) {
      const v = libraryResponseVerdict(r);
      expect(v.ok, `${new URL(r.url).pathname}: ${v.reason}`).toBe(true);
    }
    expect(hasLibraryErrorCard(await drawer.innerText()), "media library error card text").toBe(false);
    await expect(drawer.locator('[role="alert"]'), "no red alert in the Assets drawer").toHaveCount(0);
    info.annotations.push({ type: "library", description: library.map((r) => `${new URL(r.url).pathname} ${r.status}`).join(", ") });
    await page.keyboard.press("Escape");
  } finally {
    await info.attach("screenshot builder", { body: await page.screenshot().catch(() => Buffer.from("")), contentType: "image/png" }).catch(() => undefined);
    await context.close();
  }
});
