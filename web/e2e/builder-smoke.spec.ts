/**
 * Builder editor smoke: the FIRST end-to-end regression net for the page
 * builder authoring loop: open -> insert -> inline edit -> delete -> publish.
 *
 * Why it exists: nothing automatically exercised the editor before this, which
 * is how the Page Builder P0s shipped (audit 2026-07-09,
 * web/docs/page-builder-minimal-build-plan-2026-07-09.md). Every later Wave 1
 * lane runs against this spec; the `test.fixme` steps flip to real assertions as
 * the matching lane lands.
 *
 * Runs against a LOCAL dev server only (dev-signin is dev/preview-gated and the
 * QA tenant lives on the shared prod Supabase). It is intentionally skipped
 * unless PLAYWRIGHT_BASE_URL points at localhost, so it never joins CI (no
 * Supabase there) or the default app.local suite.
 *
 *   cd web
 *   # in one shell: PORT=3000 npm run dev   (or dev:webpack in a worktree)
 *   PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://localhost:3000 \
 *     npx playwright test e2e/builder-smoke.spec.ts
 *
 * Editor facts encoded here (verified live on qa-agency-244988, 2026-07-09):
 *   - The QA homepage draft is a freeform builder-node tree, so Page Structure
 *     renders the freeform layers tree (role="tree" aria-label="Page layers"),
 *     NOT the CMS section navigator. Page-level layers = treeitem[aria-level=1].
 *   - Seeded baseline = exactly ONE top-level layer (a container carrying the
 *     "A photograph should remember..." heading + paragraph).
 *   - Inline text commits on blur, repaints the canvas IMMEDIATELY (no reload —
 *     the W1-L3 optimistic-repaint guarantee), and survives a full reload.
 *     Escape now ALSO commits (keeps the typed text; the old silent-discard was
 *     the W1-L3 defect), verified in its own step below.
 *   - Delete via the layer row X removed the whole subtree cleanly in this
 *     environment; the audit saw it unwrap children into page-level orphans, so
 *     that assertion is quarantined as W1-L1 fixme until the lane lands.
 *   - The publish drawer opened and its checks resolved here; the audit saw the
 *     checks hang in a skeleton, so that assertion is quarantined as W1-L2.
 */

import { test, expect, type Page } from "@playwright/test";

const TENANT = "qa-agency-244988"; // SAFE QA fixture on prod Supabase. NEVER "impronta".
const ADMIN = "qa-admin@impronta.test"; // passwordless dev-signin fixture.
const MARKER = "PBM_W0A_EDIT";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "";
const IS_LOCAL_DEV = BASE.includes("localhost") || BASE.includes("127.0.0.1");

const TREE = '[role="tree"][aria-label="Page layers"]';
const TOP_LAYER = `${TREE} [role="treeitem"][aria-level="1"]`;
// Kinds a hero subtree would leave behind if a delete unwrapped instead of
// removing (the W1-L1 orphan signature).
const ORPHAN_LABEL = /Stack|Row|Carousel|Column|Grid|Hero/i;

async function devSignIn(page: Page) {
  const res = await page.goto(
    `/api/dev/signin?email=${encodeURIComponent(ADMIN)}&next=/${TENANT}`,
    { waitUntil: "domcontentloaded" },
  );
  expect(res?.ok(), "dev-signin should succeed").toBeTruthy();
}

async function openEditor(page: Page) {
  await page.goto(`/${TENANT}?edit=1`, { waitUntil: "domcontentloaded" });
  // Cold webpack dev compiles are slow, and a shared QA machine often runs
  // several lanes' tsc/dev servers at once — a route or client-chunk compile can
  // stall for minutes under that load. The bigger budgets absorb the stall;
  // no assertion is weakened.
  await expect(page.locator("[data-edit-topbar]")).toBeVisible({ timeout: 300_000 });
  await expect(page.getByRole("button", { name: /^publish$/i })).toBeVisible({
    timeout: 60_000,
  });
}

async function openStructurePanel(page: Page) {
  const btn = page.locator('[data-dock-item="structure"]');
  await expect(btn).toBeVisible({ timeout: 30_000 });
  if ((await btn.getAttribute("data-dock-active")) !== "true") {
    await btn.click();
  }
  await expect(page.locator(TREE)).toBeVisible({ timeout: 30_000 });
}

function topLayers(page: Page) {
  return page.locator(TOP_LAYER);
}

/** Wait until the topbar reports the draft is safely saved (best-effort; a
 *  missing indicator falls through to a short settle so reloads still see the
 *  committed draft). */
async function waitDraftSaved(page: Page) {
  await page
    .locator("[data-edit-topbar]")
    .getByText(/Draft up to date|Draft saved/i)
    .first()
    .waitFor({ state: "visible", timeout: 90_000 })
    .catch(() => {});
  await page.waitForTimeout(500);
}

function overlayEditable(page: Page) {
  return page.locator('[data-edit-overlay="canvas-edit"] [contenteditable]').first();
}

/** Open the inline text overlay on the seeded heading. Preferred path is a plain
 *  double-click (the user gesture W1-L3 is about); once other blocks are
 *  selected a bare dblclick can be swallowed by hover/selection chrome, so this
 *  retries and finally falls back to the block chip's Edit action. The COMMIT is
 *  always via blur below, whichever way the overlay opened. */
async function openHeadingOverlay(page: Page) {
  const heading = page.locator('h2[data-builder-node-kind="heading"]').first();
  await heading.scrollIntoViewIfNeeded();
  const isOpen = () =>
    overlayEditable(page)
      .waitFor({ state: "visible", timeout: 4_000 })
      .then(() => true)
      .catch(() => false);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await heading.dblclick();
    if (await isOpen()) return;
    await page.waitForTimeout(500);
  }
  // Fallback: select the block, then its inline Edit action.
  await heading.click({ position: { x: 6, y: 6 } });
  const editAction = page
    .locator('[data-selection-chip][data-selection-chip-scope="block"] [data-selection-block-action="edit"]')
    .first();
  if (await editAction.count()) await editAction.click();
  await expect(overlayEditable(page)).toBeVisible({ timeout: 20_000 });
}

/** Replace the seeded heading's text and commit via blur (click-away). */
async function setHeadingText(page: Page, value: string) {
  await openHeadingOverlay(page);
  const editable = overlayEditable(page);
  await editable.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(value);
  // Commit by clicking away from the overlay (blur). (Escape now also commits —
  // see the dedicated Escape step; this shared helper stays on the blur gesture.)
  await page.locator("[data-edit-topbar]").click({ position: { x: 6, y: 6 } });
  await expect(page.locator('[data-edit-overlay="canvas-edit"]'))
    .toHaveCount(0, { timeout: 15_000 })
    .catch(() => {});
  await waitDraftSaved(page);
}

async function headingText(page: Page): Promise<string> {
  return (
    (await page.locator('h2[data-builder-node-kind="heading"]').first().textContent()) ??
    ""
  ).trim();
}

/** Delete a single layer row via its inline X. The row must be selected first so
 *  its action bar (hidden by default) mounts and the Remove control is visible. */
async function deleteLayerRow(page: Page, row = topLayers(page).filter({ hasText: /Hero/i }).first()) {
  await row.scrollIntoViewIfNeeded();
  await row.click();
  const remove = row.getByRole("button", { name: /^Remove / }).first();
  await expect(remove).toBeVisible({ timeout: 15_000 });
  await remove.click({ force: true });
  await page.waitForTimeout(2_000);
}

/** Idempotently strip every inserted/orphaned top-level layer (hero + any
 *  unwrapped Stack/Row/Carousel/... children) so the QA tenant draft ends the
 *  run in its original single seeded-section state. Safe on a clean seed: the
 *  seeded container is labelled by its heading text and never matches. */
async function stripStrayLayers(page: Page) {
  await openStructurePanel(page);
  for (let i = 0; i < 12; i += 1) {
    const stray = topLayers(page).filter({ hasText: ORPHAN_LABEL }).first();
    if ((await stray.count()) === 0) break;
    await deleteLayerRow(page, stray);
  }
  await waitDraftSaved(page);
}

/** Undo a leftover marker on the seeded heading (self-heal a prior aborted run).
 *  Covers the W0-A marker AND the W1-L2 scenario markers (PBM_W1L2_*). */
async function revertHeadingMarker(page: Page) {
  const cur = await headingText(page).catch(() => "");
  if (!/PBM_\w+/.test(cur)) return;
  await setHeadingText(page, cur.replace(/\s*PBM_\w+/g, "").trim());
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-edit-topbar]")).toBeVisible({ timeout: 300_000 });
}

// --- shared, long-lived editor session (boot once; steps run serially) --------
let page: Page;
let initialTopCount = 0;

test.describe("builder editor smoke: open -> insert -> edit -> delete -> publish", () => {
  // Cold webpack dev compiles are slow, so every step (and the boot hook) needs
  // a generous budget well above Playwright's 30s default.
  test.describe.configure({ mode: "serial", timeout: 420_000 });
  test.skip(
    !IS_LOCAL_DEV,
    "Requires a local dev server (dev-signin + QA tenant). Set PLAYWRIGHT_BASE_URL=http://localhost:<port>.",
  );

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(600_000);
    page = await browser.newPage();
    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(300_000);
    await devSignIn(page);
    await openEditor(page);
    // Self-heal any residue from an earlier aborted run BEFORE measuring the
    // baseline, so a shared QA tenant always starts from its single seeded layer.
    await openStructurePanel(page);
    await revertHeadingMarker(page);
    await stripStrayLayers(page);
    await openStructurePanel(page);
    initialTopCount = await topLayers(page).count();
  });

  test.afterAll(async () => {
    test.setTimeout(600_000);
    // Best-effort restore even if a step failed mid-flow, then release the page.
    try {
      if (page && !page.isClosed()) {
        await revertHeadingMarker(page).catch(() => {});
        await stripStrayLayers(page).catch(() => {});
      }
    } finally {
      await page?.close().catch(() => {});
    }
  });

  test("1. editor boots with its chrome (Publish + Add) and a seeded page layer", async () => {
    await expect(page.getByRole("button", { name: /^publish$/i })).toBeVisible();
    await expect(page.locator('[data-dock-item="add"]')).toBeVisible();
    await expect(page.locator('[data-dock-item="add"]')).toHaveAttribute("aria-label", "Add");
    // The QA homepage seed is exactly one top-level layer.
    expect(initialTopCount).toBeGreaterThanOrEqual(1);
    console.log(`[builder-smoke] initial top-level layers = ${initialTopCount}`);
  });

  test("2. inserting Hero Centered adds exactly one page-level layer", async () => {
    await openStructurePanel(page);
    const before = await topLayers(page).count();

    await page.locator('[data-dock-item="add"]').click();
    const gallery = page.locator('[data-edit-drawer="add-gallery"]');
    await expect(gallery).toBeVisible({ timeout: 20_000 });
    const sectionsTab = gallery.getByRole("tab", { name: "Sections" });
    if (await sectionsTab.count()) await sectionsTab.click();
    const heroCard = page.locator('[data-add-gallery-item="rec:sec-hero-centered"]');
    await expect(heroCard).toBeVisible({ timeout: 15_000 });
    await heroCard.click();
    await expect(gallery).toBeHidden({ timeout: 30_000 }).catch(() => {});

    await openStructurePanel(page);
    // The new hero lands as a page-level layer.
    const heroRow = topLayers(page).filter({ hasText: /Hero Centered/i }).first();
    await expect(heroRow).toBeVisible({ timeout: 30_000 });
    await expect(topLayers(page)).toHaveCount(before + 1, { timeout: 30_000 });
    await waitDraftSaved(page);
  });

  test("3. inline text edit commits on blur, repaints immediately (no reload), and survives a reload", async () => {
    const original = await headingText(page);
    expect(original).not.toContain(MARKER);
    const next = `${original} ${MARKER}`;

    // Type + blur-commit, WITHOUT waiting for the save or reloading.
    await openHeadingOverlay(page);
    const editable = overlayEditable(page);
    await editable.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type(next);
    await page.locator("[data-edit-topbar]").click({ position: { x: 6, y: 6 } });
    await expect(page.locator('[data-edit-overlay="canvas-edit"]')).toHaveCount(0, {
      timeout: 15_000,
    });

    // W1-L3 OPTIMISTIC REPAINT: the canvas shows the committed text at once —
    // no save-settle, no reload. Before the fix it stayed stale until a full
    // reload (the "my edit vanished" report).
    expect(await headingText(page)).toContain(MARKER);

    await waitDraftSaved(page);

    // Durability: it also persists a full reload (the core regression guarantee).
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-edit-topbar]")).toBeVisible({ timeout: 300_000 });
    expect(await headingText(page)).toContain(MARKER);

    // Revert the same way and confirm the revert repaints immediately + persists.
    await setHeadingText(page, original);
    expect(await headingText(page)).not.toContain(MARKER);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-edit-topbar]")).toBeVisible({ timeout: 300_000 });
    const reverted = await headingText(page);
    expect(reverted).not.toContain(MARKER);
    expect(reverted).toBe(original);
  });

  test("3b. Escape commits the typed text (keeps it, does NOT silently discard)", async () => {
    const original = await headingText(page);
    expect(original).not.toContain(MARKER);

    await openHeadingOverlay(page);
    const editable = overlayEditable(page);
    await editable.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type(`${original} ${MARKER}`);
    // The W1-L3 fix: Escape COMMITS (keeps the text), it no longer discards.
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-edit-overlay="canvas-edit"]')).toHaveCount(0, {
      timeout: 15_000,
    });

    // Kept + optimistically repainted right away.
    expect(await headingText(page)).toContain(MARKER);

    await waitDraftSaved(page);

    // The Escape-commit really saved: it survives a full reload.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-edit-topbar]")).toBeVisible({ timeout: 150_000 });
    expect(await headingText(page)).toContain(MARKER);

    // Restore the seeded heading for the following steps / cleanup.
    await setHeadingText(page, original);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-edit-topbar]")).toBeVisible({ timeout: 150_000 });
    expect(await headingText(page)).toBe(original);
  });

  // W1-L1 (FIXED): deleting a section via the layers X removes the whole subtree
  // and never leaves page-level orphans. The audit's "unwrap" was a Page
  // Structure rendering artifact: `flattenTree` hoisted a lone container root's
  // children to depth 0, so a delete that collapsed the tree to one container
  // root read as an unwrap. Depth is now stable (freeform-layers-tree.tsx), and
  // removeBuilderNode refuses a duplicated id instead of guessing. The
  // discriminating regression (a container-root sibling can't be built through
  // the gallery UI) lives in the unit suites:
  //   src/lib/site-admin/builder-node/operations.test.ts
  //   src/components/edit-chrome/freeform-layers-tree.test.ts
  test("4. deleting Hero Centered via the layers X leaves no orphan layers (W1-L1)", async () => {
    await openStructurePanel(page);
    await deleteLayerRow(page);
    await expect(topLayers(page)).toHaveCount(initialTopCount, { timeout: 30_000 });
    await expect(topLayers(page).filter({ hasText: ORPHAN_LABEL })).toHaveCount(0);
    await waitDraftSaved(page);
  });

  test("5. cleanup: the layers X restores the QA draft to its single seeded layer", async () => {
    // Runs whether or not step 4 was skipped: strips the inserted hero (and any
    // orphans a broken delete would leave) so the tenant ends where it started.
    await stripStrayLayers(page);
    await expect(topLayers(page)).toHaveCount(initialTopCount, { timeout: 30_000 });
    await waitDraftSaved(page);
  });

  test("6. the publish drawer opens and renders", async () => {
    const drawer = page.locator('[data-edit-drawer="publish"]');
    if (!(await drawer.isVisible().catch(() => false))) {
      await page.getByRole("button", { name: /^publish$/i }).click();
    }
    await expect(drawer).toBeVisible({ timeout: 20_000 });
    await expect(drawer.getByRole("button", { name: /publish now/i })).toBeVisible({
      timeout: 20_000,
    });
    // Do NOT publish.
  });

  // W1-L2 (SHIPPED): the publish drawer checks now carry hard timeouts +
  // failed/retry states, so they can never hang as a skeleton; the counters
  // compute from the real draft tree (freeform pages used to claim "0 sections
  // ready" / "0 changes"). Flipped from `test.fixme` with the lane.
  test("7. the publish drawer checks resolve without hanging and the counters are honest (W1-L2)", async () => {
    // Count the page's top-level layers first — the drawer's "sections ready"
    // must match them for a freeform page.
    await openStructurePanel(page);
    const layerCount = await topLayers(page).count();

    const drawer = page.locator('[data-edit-drawer="publish"]');
    if (!(await drawer.isVisible().catch(() => false))) {
      await page.getByRole("button", { name: /^publish$/i }).click();
    }
    await expect(drawer).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole("status", { name: /Running publish checks/i }),
    ).toBeHidden({ timeout: 60_000 });

    // Counters: "N sections ready" reflects the real tree (not the empty slot
    // count), and "changes since last publish" resolves to a real number (the
    // dash placeholder must not stick around once the loaders settle).
    const sectionsReady = drawer.getByTestId("publish-stat-sections-ready");
    // (count and label are separate spans — match them tolerantly)
    await expect(sectionsReady).toContainText(
      new RegExp(`${layerCount}\\s*sections? ready`),
      { timeout: 30_000 },
    );
    const changes = drawer.getByTestId("publish-stat-changes");
    await expect(changes).toBeVisible({ timeout: 30_000 });
    await expect(changes).not.toContainText("—", { timeout: 30_000 });

    await expect(drawer.getByRole("button", { name: /publish now/i })).toBeEnabled({
      timeout: 30_000,
    });
    // Do NOT publish here (scenario 8 exercises a real publish).
    await drawer.getByRole("button", { name: /^cancel$/i }).click();
    await expect(drawer).toBeHidden({ timeout: 10_000 }).catch(() => {});
  });

  // W1-L2 scenario A — the false-conflict repro. Editing and reloading used to
  // make the editor treat ITS OWN pagehide-beacon write as a foreign change:
  // yellow "changed in another tab or session" banner, undo wiped, publish
  // blocked. With session adoption the editor's own reload must be seamless.
  test("8. edit -> hard reload -> edit -> publish succeeds with no conflict banner and undo intact (W1-L2 scenario A)", async () => {
    const conflictToast = page.locator('[data-edit-overlay="mutation-toast"]');
    const undoButton = page.locator('button[title="Undo (⌘Z)"]');
    const marker = "PBM_W1L2_A";
    const original = await headingText(page);
    expect(original).not.toContain(marker);

    // Edit and reload IMMEDIATELY (inside the ~750ms save debounce) so the
    // pagehide beacon carries the pending tree and bumps the version — the
    // exact self-reload sequence that used to produce the false conflict.
    await openHeadingOverlay(page);
    const editable = overlayEditable(page);
    await editable.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type(`${original} ${marker}`);
    await page.locator("[data-edit-topbar]").click({ position: { x: 6, y: 6 } }); // blur-commit
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-edit-topbar]")).toBeVisible({ timeout: 150_000 });

    // The beacon write must have landed; if the reload's server render raced
    // ahead of it, one more reload shows it.
    if (!(await headingText(page)).includes(marker)) {
      await page.waitForTimeout(2_000);
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.locator("[data-edit-topbar]")).toBeVisible({ timeout: 150_000 });
    }
    expect(await headingText(page)).toContain(marker);

    // No false conflict banner after the editor's own reload.
    await expect(conflictToast).toBeHidden();
    // Undo survived the self-reload (persisted stack accepted — the version
    // advance was our own beacon, not a foreign write).
    await expect(undoButton).toBeEnabled({ timeout: 30_000 });

    // Second edit (the revert) — its save carries a stale expectedVersion when
    // the beacon bumped the version; the server must ADOPT it, not 409.
    await setHeadingText(page, original);
    await expect(conflictToast).toBeHidden();
    expect(await headingText(page)).toBe(original);
    await expect(undoButton).toBeEnabled();

    // Publish must go through (drawer checks resolve; no conflict block).
    const drawer = page.locator('[data-edit-drawer="publish"]');
    await page.getByRole("button", { name: /^publish$/i }).click();
    await expect(drawer).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole("status", { name: /Running publish checks/i }),
    ).toBeHidden({ timeout: 60_000 });
    const publishNow = drawer.getByRole("button", { name: /publish now/i });
    await expect(publishNow).toBeEnabled({ timeout: 60_000 });
    await publishNow.click();
    await expect(drawer.getByText(/^Published /)).toBeVisible({ timeout: 90_000 });
    // The banner must never have claimed a phantom second tab.
    await expect(conflictToast.getByText(/another tab or session/i)).toBeHidden();
    await drawer.getByRole("button", { name: /^close$/i }).click();
    await expect(drawer).toBeHidden({ timeout: 10_000 }).catch(() => {});
  });

  // W1-L2 scenario B — a GENUINE conflict (two real browser contexts, so two
  // different per-tab edit sessions) must still be caught, and must surface the
  // honest two-action banner instead of silently reloading + wiping undo.
  test("9. a genuine second-session conflict shows the honest banner with both actions and does not wipe undo (W1-L2 scenario B)", async ({ browser }) => {
    const conflictToast = page.locator('[data-edit-overlay="mutation-toast"]');
    const undoButton = page.locator('button[title="Undo (⌘Z)"]');
    const original = await headingText(page);
    const theirs = `${original} PBM_W1L2_B2`;
    const mine = `${original} PBM_W1L2_B1`;

    // Second, independent session edits (and saves) first.
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    page2.setDefaultTimeout(30_000);
    page2.setDefaultNavigationTimeout(180_000);
    try {
      await devSignIn(page2);
      await openEditor(page2);
      await setHeadingText(page2, theirs);
    } finally {
      await page2.close().catch(() => {});
      await context2.close().catch(() => {});
    }

    // First session (now holding a stale version) edits — its save must lose
    // the CAS to the genuinely-foreign write and raise the honest banner.
    // (Inline edit WITHOUT waitDraftSaved: this save is expected to conflict,
    // so the "Draft saved" chip never appears.)
    await openHeadingOverlay(page);
    const editable = overlayEditable(page);
    await editable.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type(mine);
    await page.locator("[data-edit-topbar]").click({ position: { x: 6, y: 6 } }); // blur-commit
    await expect(conflictToast).toBeVisible({ timeout: 60_000 });
    await expect(conflictToast.getByRole("button", { name: /reload latest/i })).toBeVisible();
    await expect(
      conflictToast.getByRole("button", { name: /keep editing this copy/i }),
    ).toBeVisible();
    // NOT silently reloaded: the local copy is still on the canvas and undo
    // history is still there.
    expect(await headingText(page)).toBe(mine);
    await expect(undoButton).toBeEnabled();

    // Resolve by taking the other session's change; only now does the editor
    // reload (and reset undo, with its own explanation toast).
    await conflictToast.getByRole("button", { name: /reload latest/i }).click();
    await expect
      .poll(async () => headingText(page), { timeout: 60_000 })
      .toBe(theirs);

    // Cleanup: restore the seeded heading (fresh version, normal save).
    await setHeadingText(page, original);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-edit-topbar]")).toBeVisible({ timeout: 150_000 });
    expect(await headingText(page)).toBe(original);
  });
});
