/**
 * Builder BEHAVIOUR checks on production: TUL-78 (core editing), TUL-79 (layout and responsive), TUL-87 (media).
 *
 * ON DEMAND ONLY and DRAFT-ONLY. It signs in as the TEST talent TAL-93900 with the same service-role minted session
 * as the timing harness (no password) and edits ONLY that talent's sandbox site `jorg-beauty-qa`. It NEVER clicks
 * Publish (every UI step goes through `assertSafeAction`). Needs:
 *   LIVE_TIMING=1 or LIVE_BUILDER=1, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 * (production project pluhdapdnuiulvxmyspd). Without LIVE_TIMING=1 or LIVE_BUILDER=1 it skips.
 *
 * Before any step it snapshots the draft (talent_sites shell_tree/draft_rev/style columns and every talent_pages
 * blocks/theme/status for the profile) to a 0600 temp file, prints the profile code and slug, and restores the
 * snapshot at the end AND on failure, with KEYED updates only. Media it creates is deleted by key (storage object and
 * row), also on failure.
 *
 *   cd web && LIVE_BUILDER=1 npx playwright test -c playwright.live.config.ts builder-behaviour \
 *     --project=desktop --workers=1 --retries=0
 *   (env from web/.env.local exported first, e.g. set -a; . ./.env.local; set +a)
 *
 * One project at a time and alone. The 390 and 768 checks use page.setViewportSize inside the desktop project.
 * The checks run in order inside ONE test so a failed check does not skip the rest; the test fails at the end if any
 * check failed, after printing the result table.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

import {
  DEVICE_SWITCH_BUDGET_MS,
  QA_FILE_PREFIX,
  SANDBOX_SLUG,
  VIEWPORTS,
  assertSafeAction,
  buildSnapshot,
  countOccurrences,
  deviceSwitchWithinBudget,
  formatResultTable,
  horizontalShift,
  isQaHarnessFile,
  landsAfterSelected,
  mobileHealthConsistent,
  noGhostText,
  planRestore,
  qaHarnessFileName,
  rectsIntersect,
  tinyPng,
  withinViewport,
  writeSnapshotFile,
  assertSandbox,
  type CheckResult,
  type DraftSnapshot,
  type JsonRow,
  type Rect,
} from "../scripts/live-timing/builder-behaviour";
import {
  APP_HOST,
  PROD_SUPABASE_REF,
  TEST_TALENT_CODE,
  deleteTempState,
  mintTestTalentState,
  writeTempState,
  type MintPorts,
} from "../scripts/live-timing/timing-harness";

test.describe.configure({ mode: "serial", retries: 0 });

const BUILDER = `${APP_HOST}/talent/page-builder`;
const CANVAS = "[data-theme-canvas-root]";
const INSPECTOR = '[data-testid="inspector-dock"]';
const TOOLBARS = "[data-selection-chip], [data-canvas-text-toolbar], [data-multi-selection-toolbar]";

let admin: SupabaseClient | null = null;
let statePath: string | null = null;
let snapshotPath: string | null = null;
let snapshot: DraftSnapshot | null = null;
const createdAssets: Array<{ id: string; storagePath: string }> = [];
const runStartedAt = new Date().toISOString();
const results: CheckResult[] = [];
let cleaned = false;

test.beforeAll(async () => {
  test.skip(process.env.LIVE_TIMING !== "1" && process.env.LIVE_BUILDER !== "1", "set LIVE_BUILDER=1 (or LIVE_TIMING=1) to run the builder behaviour checks");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url.includes(PROD_SUPABASE_REF) || !anon || !service) {
    throw new Error(`needs NEXT_PUBLIC_SUPABASE_URL (${PROD_SUPABASE_REF}), NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY`);
  }
  admin = createClient(url, service, { auth: { persistSession: false } });
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const sb = admin;

  // Resolve the profile and the sandbox site BEFORE any other step; refuse anything that is not TAL-93900 + jorg-beauty-qa.
  const { data: prof } = await sb.from("talent_profiles").select("id").eq("profile_code", TEST_TALENT_CODE).maybeSingle<{ id: string }>();
  if (!prof?.id) throw new Error(`no talent profile found for ${TEST_TALENT_CODE}`);
  const { data: site } = await sb.from("talent_sites").select("*").eq("talent_profile_id", prof.id).maybeSingle<JsonRow>();
  if (!site) throw new Error(`no talent_sites row for ${TEST_TALENT_CODE}`);
  const slug = typeof site.site_slug === "string" ? site.site_slug : null;
  process.stdout.write(`\nbuilder-behaviour target: profile ${TEST_TALENT_CODE} (${prof.id}), site slug "${slug ?? ""}"\n`);
  assertSandbox({ code: TEST_TALENT_CODE, slug });
  const { data: pages } = await sb.from("talent_pages").select("*").eq("talent_profile_id", prof.id);
  snapshot = buildSnapshot({ code: TEST_TALENT_CODE, slug: SANDBOX_SLUG, profileId: prof.id, site, pages: (pages ?? []) as JsonRow[] });
  snapshotPath = writeSnapshotFile(snapshot);
  process.stdout.write(`draft snapshot taken: ${snapshot.pages.length} page(s), site draft_rev ${String(site.draft_rev ?? "n/a")}\n`);

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

/** Deletes every qa-harness asset this run created (storage object and row, keyed by id and owner). Idempotent. */
async function deleteCreatedMedia(): Promise<string[]> {
  const log: string[] = [];
  if (!admin || !snapshot) return log;
  const owner = snapshot.profileId;
  // Safety sweep: rows we may have created but lost the id of (upload response missed on a failure).
  const { data: swept } = await admin
    .from("media_assets")
    .select("id, storage_path, metadata")
    .eq("owner_talent_profile_id", owner)
    .gte("created_at", runStartedAt)
    .returns<Array<{ id: string; storage_path: string; metadata: { original_file_name?: string | null } | null }>>();
  for (const r of swept ?? []) {
    if (isQaHarnessFile(r.metadata?.original_file_name) && !createdAssets.some((a) => a.id === r.id)) createdAssets.push({ id: r.id, storagePath: r.storage_path });
  }
  for (const a of createdAssets.splice(0)) {
    const rm = await admin.storage.from("media-public").remove([a.storagePath]);
    const del = await admin.from("media_assets").delete().eq("id", a.id).eq("owner_talent_profile_id", owner);
    log.push(`media ${a.id}: storage ${rm.error ? `ERR ${rm.error.message}` : "removed"}, row ${del.error ? `ERR ${del.error.message}` : "deleted"}`);
  }
  return log;
}

/** Restores the draft snapshot with keyed updates only. Idempotent. */
async function restoreDraft(): Promise<string[]> {
  const log: string[] = [];
  if (!admin || !snapshot) return log;
  for (const op of planRestore(snapshot)) {
    let q = admin.from(op.table).update(op.values);
    for (const [k, v] of Object.entries(op.match)) q = q.eq(k, v);
    const { error } = await q;
    log.push(`restore ${op.table} ${op.match.id}: ${error ? `ERR ${error.message}` : "ok"}`);
  }
  return log;
}

async function cleanup(): Promise<void> {
  if (cleaned) return;
  cleaned = true;
  const lines = [...(await deleteCreatedMedia()), ...(await restoreDraft())];
  process.stdout.write(`\ncleanup:\n${lines.map((l) => `  ${l}`).join("\n") || "  (nothing to do)"}\n`);
  deleteTempState(statePath);
  deleteTempState(snapshotPath);
  statePath = null;
  snapshotPath = null;
}

test.afterAll(async () => {
  await cleanup();
});

// ------------------------------------------------------------------ helpers

type Ticket = CheckResult["ticket"];
async function check(ticket: Ticket, name: string, info: TestInfo, fn: () => Promise<string | void>): Promise<void> {
  const t0 = Date.now();
  try {
    const note = await fn();
    results.push({ ticket, name, pass: true, ms: Date.now() - t0, ...(note ? { note } : {}) });
  } catch (e) {
    const note = (e instanceof Error ? e.message : String(e)).split("\n")[0] ?? "failed";
    results.push({ ticket, name, pass: false, ms: Date.now() - t0, note });
    await info.attach(`FAIL ${ticket} ${name}`, { body: note, contentType: "text/plain" });
  }
}

/** Every UI click in this spec goes through here: a publish-like name is refused before the click. */
async function safeClick(locator: Locator, actionName: string, opts?: { force?: boolean; position?: { x: number; y: number } }): Promise<void> {
  assertSafeAction(actionName);
  await locator.click({ timeout: 10_000, ...opts });
}

const rectOf = async (l: Locator): Promise<Rect> =>
  l.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  });

const topLevelIds = (page: Page): Promise<string[]> =>
  page.evaluate((canvasSel) => {
    const root = document.querySelector(canvasSel);
    if (!root) return [];
    const out: string[] = [];
    root.querySelectorAll("[data-builder-node-id]").forEach((el) => {
      const id = el.getAttribute("data-builder-node-id");
      if (!id || out.includes(id)) return;
      if (el.closest("[data-talent-builder-shell]")) return; // header, footer, socket are the site shell, not page blocks
      const parent = el.parentElement?.closest("[data-builder-node-id]");
      if (parent && root.contains(parent)) return; // nested
      out.push(id);
    });
    return out;
  }, CANVAS);

const block = (page: Page, id: string): Locator => page.locator(`${CANVAS} [data-builder-node-id="${id}"]`).first();

async function openBuilder(page: Page): Promise<void> {
  await page.goto(BUILDER, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator(`${CANVAS} [data-builder-node-id]`).first().waitFor({ state: "visible", timeout: 90_000 });
  await page.waitForTimeout(800);
}

async function selectBlock(page: Page, id: string): Promise<void> {
  await page.keyboard.press("Escape");
  await safeClick(block(page, id), "select block", { position: { x: 8, y: 8 } });
  await page.locator(INSPECTOR).waitFor({ state: "visible", timeout: 10_000 });
}

/** First heading with a plain short text (not in the site shell): { id, text }. */
async function findHeading(page: Page): Promise<{ id: string; text: string }> {
  const found = await page.evaluate((canvasSel) => {
    const root = document.querySelector(canvasSel);
    for (const el of Array.from(root?.querySelectorAll('[data-builder-node-kind="heading"]') ?? [])) {
      if (el.closest("[data-talent-builder-shell]")) continue;
      const text = (el as HTMLElement).innerText.trim();
      if (text.length >= 6 && text.length <= 80 && !text.includes("\n")) return { id: el.getAttribute("data-builder-node-id") ?? "", text };
    }
    return null;
  }, CANVAS);
  if (!found?.id) throw new Error("no editable heading found on the canvas");
  return found;
}

const canvasText = (page: Page): Promise<string> => page.locator(CANVAS).first().innerText();
const shot = async (page: Page, info: TestInfo, label: string): Promise<void> => {
  const body = await page.screenshot({ fullPage: true });
  await info.attach(`${info.project.name}-${label}`, { body, contentType: "image/png" });
};

// ------------------------------------------------------------------ the checks

test("builder behaviour (TUL-78, TUL-79, TUL-87) as TAL-93900, draft only", async ({ browser }, info) => {
  test.skip(info.project.name !== "desktop", "behaviour runs on the desktop project only (390 and 768 use setViewportSize)");
  test.setTimeout(15 * 60_000);
  const context = await browser.newContext({ storageState: statePath ?? undefined, viewport: { width: VIEWPORTS.desktop, height: 900 } });
  const page = await context.newPage();
  try {
    await openBuilder(page);

    // ---------------------------------------------------------------- TUL-78
    const ids0 = await topLevelIds(page);
    if (ids0.length < 3) throw new Error(`the sandbox page needs at least 3 top-level blocks, found ${ids0.length}`);

    await check("TUL-78", "(a) + Add opens the add panel with the inspector still open", info, async () => {
      // Catches: Add doing nothing (or closing the inspector) while a block is selected.
      await selectBlock(page, ids0[1]!);
      await safeClick(page.locator('[data-dock-item="add"]'), "Add");
      await expect(page.locator('[data-testid="add-gallery-panel"]')).toBeVisible({ timeout: 5_000 });
      await expect(page.locator(INSPECTOR)).toBeVisible();
      await safeClick(page.locator('[data-dock-item="add"]'), "Add (close)");
    });

    await check("TUL-78", "(b) a new block lands directly after the selected block", info, async () => {
      // Catches: new block inserted at index 1 or appended at the end instead of selected position + 1.
      const before = await topLevelIds(page);
      const selected = before[1]!;
      await selectBlock(page, selected);
      await safeClick(page.locator('[data-dock-item="add"]'), "Add");
      const card = page.locator('[data-testid="add-gallery-panel"] [data-add-gallery-item]:not([data-add-gallery-locked="true"])').first();
      await card.waitFor({ state: "visible", timeout: 10_000 });
      await safeClick(card, "insert gallery item");
      await expect.poll(async () => (await topLevelIds(page)).length, { timeout: 15_000 }).toBe(before.length + 1);
      const after = await topLevelIds(page);
      const verdict = landsAfterSelected(before, after, selected);
      expect(verdict.ok, `expected index ${verdict.expectedIndex}, got ${verdict.actualIndex}`).toBe(true);
      await page.keyboard.press("Escape");
    });

    await check("TUL-78", "(c) Duplicate shows no change-blocked toast", info, async () => {
      // Catches: Duplicate on a section-backed block dead-ending in the red "change blocked" toast.
      const before = await topLevelIds(page);
      await selectBlock(page, before[0]!);
      const dup = page.locator('[data-selection-chip] button[title="Duplicate"]').first();
      await dup.waitFor({ state: "visible", timeout: 10_000 });
      await safeClick(dup, "Duplicate");
      await page.waitForTimeout(2_000);
      await expect(page.locator('[data-edit-overlay="mutation-toast"]')).toHaveCount(0);
      await expect.poll(async () => (await topLevelIds(page)).length, { timeout: 10_000 }).toBe(before.length + 1);
    });

    await check("TUL-78", "(d) inline text edit leaves no ghost text", info, async () => {
      // Catches: the old text still rendered next to the new one after an inline edit (ghost text).
      const h = await findHeading(page);
      const edited = `QA harness ${Date.now() % 100000}`;
      const before = countOccurrences(await canvasText(page), h.text);
      await page.keyboard.press("Escape");
      await block(page, h.id).dblclick({ timeout: 10_000 });
      const editor = page.locator('[data-edit-overlay="canvas-edit"], [contenteditable="true"]').first();
      await editor.waitFor({ state: "visible", timeout: 10_000 });
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.type(edited);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.waitForTimeout(1_500);
      const text = await canvasText(page);
      expect(text, "the new text shows").toContain(edited);
      expect(noGhostText(before, countOccurrences(text, h.text)), `"${h.text}" still rendered`).toBe(true);
    });

    await check("TUL-78", "(e) inspector edits apply live to the canvas without save or reload", info, async () => {
      // Catches: inspector text fields that only reach the canvas after Save or a reload.
      const h = await findHeading(page);
      await selectBlock(page, h.id);
      const fields = page.locator(`${INSPECTOR} input, ${INSPECTOR} textarea`);
      const idx = await fields.evaluateAll((els, text) => els.findIndex((e) => (e as HTMLInputElement).value === text), h.text);
      if (idx < 0) throw new Error(`no inspector field holds "${h.text}"`);
      const live = `Live ${Date.now() % 100000}`;
      await fields.nth(idx).fill(live);
      await expect.poll(() => canvasText(page), { timeout: 4_000, message: "canvas shows the inspector edit without save or reload" }).toContain(live);
    });

    await check("TUL-78", "(f) exactly one toolbar is present", info, async () => {
      // Catches: a stale second toolbar (chip plus text toolbar, or a leftover after reselecting).
      for (const id of [ids0[0]!, ids0[1]!]) {
        await selectBlock(page, id);
        await page.waitForTimeout(500);
        const visible = await page.locator(TOOLBARS).evaluateAll((els) => els.filter((e) => (e as HTMLElement).getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== "hidden").length);
        expect(visible, `toolbars visible after selecting ${id}`).toBe(1);
      }
    });

    // ---------------------------------------------------------------- TUL-79
    const ids = await topLevelIds(page);

    await check("TUL-79", "(a) hero fully visible at 1280", info, async () => {
      // Catches: hero clipped or wider than the viewport.
      await page.keyboard.press("Escape");
      const r = await rectOf(block(page, ids[0]!));
      expect(withinViewport(r, VIEWPORTS.desktop), `hero rect ${Math.round(r.left)}..${Math.round(r.right)} of ${VIEWPORTS.desktop}`).toBe(true);
    });

    await check("TUL-79", "(b) no horizontal shift when clicking a canvas +", info, async () => {
      // Catches: opening the insert menu from a canvas + nudging the canvas sideways.
      const sample = async () => ({
        scrollX: await page.evaluate(() => window.scrollX),
        canvasLeft: (await rectOf(page.locator(CANVAS).first())).left,
        blockLeft: (await rectOf(block(page, ids[0]!))).left,
      });
      const before = await sample();
      const r = await rectOf(block(page, ids[0]!));
      await page.mouse.move(r.left + r.width / 2, Math.min(r.bottom - 2, 880));
      const plus = page.locator("[data-canvas-between-blocks-trigger]").first();
      await plus.waitFor({ state: "attached", timeout: 5_000 });
      await safeClick(plus, "Add block here", { force: true });
      await page.waitForTimeout(800);
      const shift = horizontalShift(before, await sample());
      await page.keyboard.press("Escape");
      expect(shift, `canvas moved ${shift}px`).toBeLessThanOrEqual(1);
    });

    await check("TUL-79", "(d) device switch is fast and the side panel does not cover the canvas", info, async () => {
      // Catches: slow re-layout on a device switch, or the inspector panel sitting on top of the hero.
      await selectBlock(page, ids[0]!);
      const group = page.getByRole("group", { name: /canvas preview width/i });
      const slow: string[] = [];
      const timings: string[] = [];
      for (const device of ["Tablet", "Mobile", "Desktop"] as const) {
        const btn = group.getByRole("button", { name: new RegExp(`^${device}`, "i") }).first();
        const widthBefore = (await rectOf(page.locator(CANVAS).first())).width;
        const t0 = Date.now();
        await safeClick(btn, `device ${device}`);
        await expect(btn).toHaveAttribute("aria-pressed", "true", { timeout: 5_000 });
        if (device !== "Desktop") await page.waitForFunction(([sel, w]) => Math.abs((document.querySelector(sel as string) as HTMLElement).getBoundingClientRect().width - (w as number)) > 4, [CANVAS, widthBefore], { timeout: 5_000 });
        await page.evaluate(() => new Promise<void>((res) => requestAnimationFrame(() => requestAnimationFrame(() => res()))));
        const ms = Date.now() - t0;
        timings.push(`${device} ${ms}ms`);
        if (!deviceSwitchWithinBudget(ms)) slow.push(`${device} ${ms}ms`);
        const panel = page.locator(INSPECTOR);
        if (await panel.isVisible()) {
          const hero = await rectOf(block(page, ids[0]!));
          const covers = rectsIntersect(await rectOf(panel), hero);
          expect(covers, `${device}: inspector panel covers the hero`).toBe(false);
        }
      }
      expect(slow, `over the ${DEVICE_SWITCH_BUDGET_MS}ms budget`).toEqual([]);
      return timings.join(", ");
    });

    await check("TUL-79", "screenshots at 1280, 768 and 390", info, async () => {
      await shot(page, info, "builder-1280");
      await page.setViewportSize({ width: VIEWPORTS.tablet, height: 1024 });
      await page.waitForTimeout(1_000);
      await shot(page, info, "builder-768");
    });

    await check("TUL-79", "(c) at 390 the header CTA fits and Mobile health flags overflow", info, async () => {
      // Catches: header CTA pushed past the phone edge, or a Mobile health panel that says all clear while the page overflows.
      await page.setViewportSize({ width: VIEWPORTS.phone, height: 844 });
      await openBuilder(page);
      await page.waitForTimeout(800);
      await shot(page, info, "builder-390");
      const header = page.locator('[data-talent-builder-shell="header"]').first();
      await header.waitFor({ state: "visible", timeout: 10_000 });
      const fit = await header.evaluate((el, vw) => {
        const bad: string[] = [];
        el.querySelectorAll("a, button").forEach((c) => {
          const r = c.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return;
          if (r.left < -1 || r.right > (vw as number) + 1) bad.push(`${(c.textContent ?? "").trim().slice(0, 24)} ${Math.round(r.left)}..${Math.round(r.right)}`);
        });
        return { bad, overflowPx: Math.max(0, document.documentElement.scrollWidth - (vw as number)), headerOverflow: el.scrollWidth - el.clientWidth };
      }, VIEWPORTS.phone);
      expect(fit.bad, `header controls outside 0..${VIEWPORTS.phone}`).toEqual([]);
      expect(fit.headerOverflow, "header scrolls sideways").toBeLessThanOrEqual(1);
      const mobileBtn = page.getByRole("button", { name: /^(Mobile editing mode|Mobile)$/i }).first();
      if (await mobileBtn.isVisible()) await safeClick(mobileBtn, "Mobile editing mode");
      const panel = page.getByText("Mobile health").first();
      await panel.waitFor({ state: "visible", timeout: 10_000 });
      const panelText = await panel.evaluate((el) => (el.closest("section, div")?.parentElement ?? el).textContent ?? "");
      const verdict = mobileHealthConsistent({ docOverflowPx: fit.overflowPx, panelText });
      expect(verdict.ok, verdict.reason).toBe(true);
    });

    // ---------------------------------------------------------------- TUL-87
    await page.setViewportSize({ width: VIEWPORTS.desktop, height: 900 });
    await openBuilder(page);
    const fileName = qaHarnessFileName(Date.now());
    const alt = `${QA_FILE_PREFIX}alt-${Date.now() % 100000}`;
    const drawer = page.locator('[data-testid="assets-drawer"]');
    let uploadedId = "";

    await check("TUL-87", "media library lists images", info, async () => {
      // Catches: an empty or broken library (tiles without a loaded image).
      await safeClick(page.locator('[data-dock-item="assets"]'), "Assets");
      await drawer.waitFor({ state: "visible", timeout: 15_000 });
      await page.waitForTimeout(2_000);
      const tiles = drawer.locator("[data-media-tile] img");
      const n = await tiles.count();
      expect(n, "image tiles listed").toBeGreaterThan(0);
      const broken = await tiles.evaluateAll((imgs) => imgs.filter((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth === 0).length);
      expect(broken, "tiles with a broken image").toBe(0);
      return `${n} tiles`;
    });

    await check("TUL-87", `upload ${QA_FILE_PREFIX}*.png shows progress and lands in the library`, info, async () => {
      // Catches: an upload with no progress indication, or one that never reaches the library.
      // The talent library has no tag editor, so "tagged qa-harness" is the file name prefix.
      await page.route("**/api/talent/media/upload", async (route) => {
        await new Promise((r) => setTimeout(r, 1_500)); // slow it so the progress state is observable
        await route.continue();
      });
      const uploadResp = page.waitForResponse((r) => r.url().includes("/api/talent/media/upload") && r.request().method() === "POST", { timeout: 30_000 });
      await drawer.locator('input[type="file"]').first().setInputFiles({ name: fileName, mimeType: "image/png", buffer: tinyPng(16) });
      const progress = drawer.getByRole("progressbar").or(drawer.getByText(/uploading|subiendo/i)).first();
      await expect(progress, "a progress indication appears").toBeVisible({ timeout: 4_000 });
      const body = (await (await uploadResp).json()) as { ok?: boolean; item?: { id: string; storagePath: string } };
      if (body.item) {
        createdAssets.push({ id: body.item.id, storagePath: body.item.storagePath });
        uploadedId = body.item.id;
      }
      expect(body.ok, "upload accepted").toBe(true);
      await page.unroute("**/api/talent/media/upload");
      await expect(drawer.locator(`[data-media-tile="${uploadedId}"]`)).toBeVisible({ timeout: 15_000 });
    });

    await check("TUL-87", "the edit to the uploaded asset persists after a reload", info, async () => {
      // Catches: library edits that only live in client state and vanish on reload.
      // The talent library offers no Replace or Delete control, so the persisted edit is the asset's alt text.
      if (!uploadedId) throw new Error("no uploaded asset to edit");
      await safeClick(drawer.locator(`[data-media-tile-details="${uploadedId}"]`), "asset details");
      const field = page.locator("[data-media-detail-alt]").first();
      await field.waitFor({ state: "visible", timeout: 10_000 });
      const patched = page.waitForResponse((r) => r.url().includes("/api/talent/media/library") && r.request().method() === "PATCH", { timeout: 15_000 });
      await field.fill(alt);
      await field.press("Enter");
      expect((await patched).ok(), "alt saved").toBe(true);
      await openBuilder(page);
      await safeClick(page.locator('[data-dock-item="assets"]'), "Assets");
      await drawer.waitFor({ state: "visible", timeout: 15_000 });
      await safeClick(drawer.locator(`[data-media-tile-details="${uploadedId}"]`), "asset details");
      await expect(page.locator("[data-media-detail-alt]").first()).toHaveValue(alt, { timeout: 10_000 });
    });
  } finally {
    await context.close().catch(() => undefined); // stop any pending autosave BEFORE the restore
    await new Promise((r) => setTimeout(r, 2_000));
    await cleanup();
    const table = formatResultTable(results);
    process.stdout.write(`\nbuilder behaviour results:\n${table}\n\n`);
    await info.attach("builder-behaviour-table", { body: table, contentType: "text/plain" });
  }
  expect(results.filter((r) => !r.pass).map((r) => `${r.ticket} ${r.name}: ${r.note ?? ""}`), "failed checks").toEqual([]);
});
