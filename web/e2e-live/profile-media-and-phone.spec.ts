/**
 * TUL-224 (time the profile media action) and TUL-106 (phone sticky booking bar). ON DEMAND ONLY.
 *
 * (1) TUL-224: signs in as the TEST talent TAL-93900 with the same service-role minted session as the timing
 *     harness (no password), reads one image's current caption fields from `media_assets.metadata` (keyed by profile
 *     id), saves the test caption "qa-harness-caption" through the REAL caption UI (the per-language field in the
 *     media detail rail, `[data-media-detail-caption]`, saved on blur through `saveTalentPhotoCaptionAction`), and
 *     measures click-to-saved and the server action response time. The ORIGINAL caption is restored in `finally` and
 *     again in `afterAll` (keyed update on asset id AND owner profile id), and the restore is verified by reading back.
 * (2) TUL-106: a phone Chromium context (390x844, isMobile, hasTouch, NO session) on the QA site. It scrolls with
 *     `window.scrollTo` steps (never mouse.wheel), TAPS the sticky booking bar, attaches screenshots, asserts the
 *     booking sheet opens, then STOPS. It never fills or submits the booking form: every tap goes through
 *     `assertSafeBookingAction`.
 *
 * Env: LIVE_TIMING=1 or LIVE_MEDIA=1 (else it skips). The caption check also needs NEXT_PUBLIC_SUPABASE_URL,
 * NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (production project pluhdapdnuiulvxmyspd).
 *
 *   cd web && set -a && . ./.env.local && set +a
 *   LIVE_MEDIA=1 npx playwright test -c playwright.live.config.ts profile-media-and-phone \
 *     --project=desktop --workers=1 --retries=0
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

import {
  CAPTION_SAVE_BUDGET_MS,
  CAPTION_TEST_TEXT,
  PHONE_SITE,
  PHONE_VIEWPORT,
  assertSafeBookingAction,
  captionMatchesOriginal,
  formatCaptionTiming,
  formatMediaPhoneTable,
  phoneTapVerdict,
  pickCaptionAsset,
  planCaptionRestore,
  readCaptionOriginal,
  scrollSteps,
  storedCaptionFor,
  summarizeDurations,
  writeCaptionBackup,
  type CaptionOriginal,
  type MediaMetadata,
  type MediaPhoneResult,
} from "../scripts/live-timing/profile-media-phone";
import {
  APP_HOST,
  PROD_SUPABASE_REF,
  TEST_TALENT_CODE,
  assertTestTalent,
  deleteTempState,
  mintTestTalentState,
  writeTempState,
  type MintPorts,
} from "../scripts/live-timing/timing-harness";

test.describe.configure({ mode: "serial", retries: 0 });

const ENABLED = process.env.LIVE_TIMING === "1" || process.env.LIVE_MEDIA === "1";
const SAVES = 3; // caption saves timed (each one is restored to the original value afterwards)

interface AssetRow { id: string; storage_path: string | null; owner_talent_profile_id: string | null; metadata: MediaMetadata | null }
const clock = (): number => Date.now();

// ================================================================== (1) TUL-224 caption timing

test.describe("TUL-224 profile media action timing", () => {
  let admin: SupabaseClient | null = null;
  let statePath: string | null = null;
  let backupPath: string | null = null;
  let profileId = "";
  let asset: AssetRow | null = null;
  let original: CaptionOriginal | null = null;
  let restored = false;

  async function readAsset(): Promise<AssetRow | null> {
    if (!admin || !profileId || !asset) return null;
    const { data } = await admin
      .from("media_assets")
      .select("id, storage_path, owner_talent_profile_id, metadata")
      .eq("id", asset.id)
      .eq("owner_talent_profile_id", profileId)
      .maybeSingle<AssetRow>();
    return data ?? null;
  }

  /** Keyed restore of the two caption fields, verified by reading back. Idempotent; never throws (logs instead). */
  async function restoreCaption(): Promise<string> {
    if (restored || !admin || !asset || !original) return "caption restore: nothing to do";
    try {
      const row = await readAsset();
      if (!row) return `caption restore: asset ${asset.id} not readable, NOT restored (original backup at ${backupPath ?? "n/a"})`;
      const plan = planCaptionRestore({ code: TEST_TALENT_CODE, profileId, assetId: asset.id, assetOwnerProfileId: row.owner_talent_profile_id, original, current: row.metadata });
      const { error } = await admin.from(plan.table).update({ metadata: plan.metadata }).eq("id", plan.match.id).eq("owner_talent_profile_id", plan.match.owner_talent_profile_id);
      if (error) return `caption restore ERR ${error.message} (original backup at ${backupPath ?? "n/a"})`;
      const back = await readAsset();
      const ok = captionMatchesOriginal(back?.metadata, original);
      restored = ok;
      return ok ? `caption restore: asset ${asset.id} restored and verified` : `caption restore: wrote but read-back DIFFERS (original backup at ${backupPath ?? "n/a"})`;
    } catch (e) {
      return `caption restore threw: ${e instanceof Error ? e.message : String(e)} (original backup at ${backupPath ?? "n/a"})`;
    }
  }

  test.beforeAll(async () => {
    test.skip(!ENABLED, "set LIVE_MEDIA=1 (or LIVE_TIMING=1) to run the profile media timing check");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    if (!url.includes(PROD_SUPABASE_REF) || !anon || !service) {
      throw new Error(`needs NEXT_PUBLIC_SUPABASE_URL (${PROD_SUPABASE_REF}), NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY`);
    }
    assertTestTalent(TEST_TALENT_CODE);
    admin = createClient(url, service, { auth: { persistSession: false } });
    const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const sb = admin;

    const { data: prof } = await sb.from("talent_profiles").select("id").eq("profile_code", TEST_TALENT_CODE).maybeSingle<{ id: string }>();
    if (!prof?.id) throw new Error(`no talent profile found for ${TEST_TALENT_CODE}`);
    profileId = prof.id;
    const { data: rows } = await sb
      .from("media_assets")
      .select("id, storage_path, owner_talent_profile_id, metadata")
      .eq("owner_talent_profile_id", profileId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(50)
      .returns<AssetRow[]>();
    asset = pickCaptionAsset(rows ?? []);
    if (!asset) throw new Error(`${TEST_TALENT_CODE} owns no image to caption`);
    original = readCaptionOriginal(asset.metadata);
    backupPath = writeCaptionBackup({ code: TEST_TALENT_CODE, profileId, assetId: asset.id, original });
    process.stdout.write(`\nTUL-224 target: profile ${TEST_TALENT_CODE} (${profileId}), asset ${asset.id}, original caption ${JSON.stringify(original.caption)}, caption_i18n ${JSON.stringify(original.captionI18n)}\n`);

    const ports: MintPorts = {
      async emailForProfileCode(code) {
        const { data, error } = await sb.from("talent_profiles").select("user_id").eq("profile_code", code).maybeSingle<{ user_id: string | null }>();
        if (error || !data?.user_id) return null;
        const { data: u } = await sb.auth.admin.getUserById(data.user_id);
        return u?.user?.email ?? null;
      },
      async hashedTokenFor(email) {
        const { data, error } = await sb.auth.admin.generateLink({ type: "magiclink", email });
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
    statePath = writeTempState(await mintTestTalentState(ports, { code: TEST_TALENT_CODE }));
  });

  test.afterAll(async () => {
    const line = await restoreCaption();
    process.stdout.write(`\n${line}\n`);
    deleteTempState(statePath);
    statePath = null;
    if (restored) {
      // The backup only matters while the original is NOT back in place.
      deleteTempState(backupPath);
      backupPath = null;
    }
  });

  /** Opens the caption field for the asset: direct, then the tile details, then the photos entry. Throws if unreachable. */
  async function revealCaptionInput(page: Page, assetId: string): Promise<Locator> {
    const input = page.locator("[data-media-detail-caption]").first();
    const expand = async (): Promise<boolean> => {
      if (await input.isVisible().catch(() => false)) return true;
      const details = page.locator("details[data-media-detail-captions]").first();
      if (await details.count()) {
        await details.evaluate((el) => { (el as HTMLDetailsElement).open = true; });
        await input.waitFor({ state: "visible", timeout: 5000 }).catch(() => undefined);
      }
      return input.isVisible().catch(() => false);
    };
    const openTile = async (): Promise<void> => {
      const info = page.locator(`[data-media-tile-details="${assetId}"]`).first();
      const tile = page.locator(`[data-media-tile-button="${assetId}"]`).first();
      if (await info.count()) await info.click({ force: true, timeout: 5000 }).catch(() => undefined);
      else if (await tile.count()) await tile.click({ force: true, timeout: 5000 }).catch(() => undefined);
    };
    if (await expand()) return input;
    await openTile();
    if (await expand()) return input;
    const entry = page.getByRole("button", { name: /photos|fotos|gallery|galer[ií]a|media/i }).first();
    if (await entry.count()) {
      assertSafeBookingAction("open photos entry");
      await entry.click({ timeout: 5000 }).catch(() => undefined);
      await page.waitForTimeout(1500);
      await openTile();
      if (await expand()) return input;
    }
    throw new Error("the caption field ([data-media-detail-caption]) is not reachable on /talent/profile (the caption editor is mounted by media-picker-drawer)");
  }

  test(`time the profile media caption save as ${TEST_TALENT_CODE} (${SAVES} saves, original restored)`, async ({ browser }, info: TestInfo) => {
    test.skip(info.project.name !== "desktop", "timings run on the desktop project only");
    test.setTimeout(5 * 60_000);
    if (!asset || !original || !admin) throw new Error("setup did not run");
    const sb = admin;
    const results: MediaPhoneResult[] = [];
    const context = await browser.newContext({ storageState: statePath ?? undefined, viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const actionResponseMs: number[] = [];
    const clickToSavedMs: number[] = [];
    const t0Test = clock();
    try {
      await page.goto(`${APP_HOST}/talent/profile`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForTimeout(3000);
      const input = await revealCaptionInput(page, asset.id);
      const locale = (await input.getAttribute("data-media-detail-caption")) ?? "";
      for (let i = 1; i <= SAVES; i += 1) {
        // Alternate the text so every save is a real change (an unchanged blur costs no request by design).
        const text = i % 2 === 1 ? CAPTION_TEST_TEXT : `${CAPTION_TEST_TEXT}-${i}`;
        await input.fill(text);
        const matcher = page.waitForResponse(
          (res) => res.request().method() === "POST" && "next-action" in res.request().headers() && (res.request().postData() ?? "").includes(text),
          { timeout: 30_000 },
        );
        assertSafeBookingAction("save caption");
        const t0 = clock(); // the click: Enter blurs the field, which is what saves
        await input.press("Enter");
        const res = await matcher;
        await res.finished();
        const respMs = clock() - t0;
        await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
        let saved = false;
        while (!saved && clock() - t0 < 15_000) {
          const row = await sb.from("media_assets").select("metadata").eq("id", asset.id).eq("owner_talent_profile_id", profileId).maybeSingle<{ metadata: MediaMetadata | null }>();
          saved = storedCaptionFor(row.data?.metadata, locale, locale) === text;
          if (!saved) await page.waitForTimeout(100);
        }
        const uiStable = (await input.inputValue()) === text;
        const savedMs = saved && uiStable ? clock() - t0 : null;
        actionResponseMs.push(respMs);
        if (savedMs !== null) clickToSavedMs.push(savedMs);
        const line = formatCaptionTiming({ actionResponseMs: respMs, clickToSavedMs: savedMs, actionLabel: `POST ${res.status()}` });
        process.stdout.write(`  save ${i}/${SAVES}: ${line}\n`);
        await info.attach(`caption-save-${i}`, { body: line, contentType: "text/plain" });
        expect(res.status(), `server action status on save ${i}`).toBe(200);
        expect(savedMs, `save ${i} confirmed in page and database`).not.toBeNull();
      }
      const resp = summarizeDurations(actionResponseMs);
      const saved = summarizeDurations(clickToSavedMs);
      const summary = `click-to-saved median ${saved.medianMs} ms (min ${saved.minMs}, max ${saved.maxMs}, n=${saved.n}); server action response median ${resp.medianMs} ms (min ${resp.minMs}, max ${resp.maxMs}, n=${resp.n}); budget ${CAPTION_SAVE_BUDGET_MS} ms`;
      process.stdout.write(`\nTUL-224 caption timing as ${TEST_TALENT_CODE}: ${summary}\n`);
      await info.attach("caption-timing-summary", { body: summary, contentType: "text/plain" });
      await info.attach("caption-timing-json", { body: JSON.stringify({ actionResponseMs, clickToSavedMs, resp, saved }, null, 2), contentType: "application/json" });
      results.push({ ticket: "TUL-224", name: "caption save click-to-saved", pass: true, ms: clock() - t0Test, note: summary });
    } catch (e) {
      const note = (e instanceof Error ? e.message : String(e)).split("\n")[0] ?? "failed";
      results.push({ ticket: "TUL-224", name: "caption save click-to-saved", pass: false, ms: clock() - t0Test, note });
      await info.attach("FAIL TUL-224", { body: note, contentType: "text/plain" });
      await info.attach("FAIL TUL-224 page", { body: await page.screenshot({ fullPage: true }).catch(() => Buffer.from("")), contentType: "image/png" }).catch(() => undefined);
    } finally {
      const line = await restoreCaption();
      process.stdout.write(`\n${line}\n`);
      await info.attach("caption-restore", { body: line, contentType: "text/plain" });
      await context.close();
    }
    const table = formatMediaPhoneTable(results);
    process.stdout.write(`\n${table}\n`);
    await info.attach("media-result-table", { body: table, contentType: "text/plain" });
    expect(results.filter((r) => !r.pass).map((r) => `${r.name}: ${r.note ?? ""}`), "failed checks").toEqual([]);
    expect(restored, "the original caption is back in place").toBe(true);
  });
});

// ================================================================== (2) TUL-106 phone sticky bar

test.describe("TUL-106 phone sticky booking bar", () => {
  test("tap the sticky booking bar on a 390x844 phone and the booking sheet opens (look only, never submit)", async ({ browser }, info: TestInfo) => {
    test.skip(!ENABLED, "set LIVE_MEDIA=1 (or LIVE_TIMING=1) to run the phone sticky bar check");
    test.skip(info.project.name !== "desktop", "runs once, in its own Chromium phone context");
    test.setTimeout(3 * 60_000);
    const results: MediaPhoneResult[] = [];
    const t0 = clock();
    // A Chromium phone context, no session: the public QA site is look-only.
    const context = await browser.newContext({ viewport: { ...PHONE_VIEWPORT }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    const page = await context.newPage();
    const shoot = async (label: string): Promise<void> => {
      await info.attach(`phone-${label}`, { body: await page.screenshot(), contentType: "image/png" });
    };
    try {
      await page.goto(PHONE_SITE, { waitUntil: "domcontentloaded", timeout: 60_000 });
      const bar = page.locator('.cb-bar[data-show="true"]').first();
      await bar.waitFor({ state: "visible", timeout: 45_000 });

      // Scroll the page in steps with window.scrollTo (mouse.wheel is unsupported on mobile), then land mid-page.
      const max = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
      for (const y of scrollSteps(max)) {
        await page.evaluate((top) => window.scrollTo(0, top), y);
        await page.waitForTimeout(150);
      }
      await page.evaluate(() => window.scrollTo(0, Math.floor((document.documentElement.scrollHeight - window.innerHeight) / 2)));
      await page.waitForTimeout(400);
      await shoot("before-tap");

      const rect = await bar.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height, position: getComputedStyle(el).position };
      });
      const barFitsViewport = rect.position === "fixed" && rect.width > 0 && rect.left >= -1 && rect.right <= PHONE_VIEWPORT.width + 1 && rect.bottom <= PHONE_VIEWPORT.height + 1;

      // TAP the bar's button (the pill style has one); other styles are text only, so tap the bar itself.
      const go = bar.locator(".cb-bar-go");
      const target = (await go.count()) > 0 ? go.first() : bar;
      assertSafeBookingAction("tap sticky bar");
      await target.tap({ timeout: 10_000 });
      await page.waitForTimeout(1200);

      const observe = async () => ({
        sheetOpen: await page.locator('[role="dialog"][data-catalog-booking]').first().isVisible().catch(() => false),
        menuInView: await page.evaluate(() => {
          const el = document.querySelector(".site-builder-node--services-catalog-body");
          if (!el) return false;
          const r = el.getBoundingClientRect();
          return r.bottom > 0 && r.top < window.innerHeight;
        }),
        barFitsViewport,
      });
      const afterBar = await observe();
      const first = phoneTapVerdict(afterBar);
      await shoot("after-tap");
      await info.attach("phone-after-tap-observation", { body: JSON.stringify({ ...afterBar, verdict: first }), contentType: "application/json" });

      // The idle bar only brings the menu into view; the sheet opens once a service is chosen and the dock continues.
      // Choosing a service is a selection, not the booking form: nothing is typed and nothing is submitted.
      let sheetOpen = afterBar.sheetOpen;
      if (!sheetOpen) {
        const pick = page.getByRole("button", { name: /^(Seleccionar|Select)$/ }).first();
        if (await pick.count()) {
          assertSafeBookingAction("select service");
          await pick.scrollIntoViewIfNeeded();
          await pick.tap({ timeout: 10_000 });
          await page.waitForTimeout(800);
          sheetOpen = await page.locator('[role="dialog"][data-catalog-booking]').first().isVisible().catch(() => false);
          const cont = page.locator('.cb-dock[data-show="true"] .cb-dock-go').first();
          if (!sheetOpen && (await cont.count())) {
            assertSafeBookingAction("continue to the booking sheet");
            await cont.tap({ timeout: 10_000 });
            await page.locator('[role="dialog"][data-catalog-booking]').first().waitFor({ state: "visible", timeout: 10_000 }).catch(() => undefined);
            sheetOpen = await page.locator('[role="dialog"][data-catalog-booking]').first().isVisible().catch(() => false);
          }
        }
      }
      await shoot("sheet-open"); // STOP here: nothing inside the sheet is touched.
      const pass = barFitsViewport && sheetOpen;
      const reason = pass ? `sheet opened (first tap: ${first.reason})` : sheetOpen ? "sticky bar does not fit the 390 px viewport" : `no booking sheet after the tap chain (first tap: ${first.reason})`;
      results.push({ ticket: "TUL-106", name: "phone sticky bar tap opens the sheet", pass, ms: clock() - t0, note: reason });
    } catch (e) {
      const note = (e instanceof Error ? e.message : String(e)).split("\n")[0] ?? "failed";
      results.push({ ticket: "TUL-106", name: "phone sticky bar tap opens the sheet", pass: false, ms: clock() - t0, note });
      await info.attach("FAIL TUL-106", { body: note, contentType: "text/plain" });
      await shoot("failure").catch(() => undefined);
    } finally {
      await context.close();
    }
    const table = formatMediaPhoneTable(results);
    process.stdout.write(`\n${table}\n`);
    await info.attach("phone-result-table", { body: table, contentType: "text/plain" });
    expect(results.filter((r) => !r.pass).map((r) => `${r.name}: ${r.note ?? ""}`), "failed checks").toEqual([]);
  });
});
