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
 *   - Inline text commits on blur and survives a full reload (Escape discards,
 *     which is the W1-L3 defect, not exercised here).
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
  // Cold webpack dev compiles are slow; the editor boot can take 60-120s.
  await expect(page.locator("[data-edit-topbar]")).toBeVisible({ timeout: 180_000 });
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
  // Commit by clicking away from the overlay (blur). Escape would DISCARD
  // (W1-L3), so the test deliberately never presses it.
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

/** Undo a leftover marker on the seeded heading (self-heal a prior aborted run). */
async function revertHeadingMarker(page: Page) {
  const cur = await headingText(page).catch(() => "");
  if (!cur.includes(MARKER)) return;
  await setHeadingText(page, cur.replace(new RegExp(`\\s*${MARKER}`, "g"), "").trim());
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-edit-topbar]")).toBeVisible({ timeout: 150_000 });
}

// --- shared, long-lived editor session (boot once; steps run serially) --------
let page: Page;
let initialTopCount = 0;

test.describe("builder editor smoke: open -> insert -> edit -> delete -> publish", () => {
  // Cold webpack dev compiles are slow, so every step (and the boot hook) needs
  // a generous budget well above Playwright's 30s default.
  test.describe.configure({ mode: "serial", timeout: 240_000 });
  test.skip(
    !IS_LOCAL_DEV,
    "Requires a local dev server (dev-signin + QA tenant). Set PLAYWRIGHT_BASE_URL=http://localhost:<port>.",
  );

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000);
    page = await browser.newPage();
    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(180_000);
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
    test.setTimeout(240_000);
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

  test("3. inline text edit commits on blur and survives a full reload", async () => {
    const original = await headingText(page);
    expect(original).not.toContain(MARKER);

    await setHeadingText(page, `${original} ${MARKER}`);

    // Blur-commit must persist a full reload (the core regression guarantee).
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-edit-topbar]")).toBeVisible({ timeout: 150_000 });
    expect(await headingText(page)).toContain(MARKER);

    // Revert the same way and confirm the revert also persists.
    await setHeadingText(page, original);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-edit-topbar]")).toBeVisible({ timeout: 150_000 });
    const reverted = await headingText(page);
    expect(reverted).not.toContain(MARKER);
    expect(reverted).toBe(original);
  });

  // W1-L1: deleting a section via the layers X unwrapped it, promoting its
  // children (Stack/Row/Carousel) to page-level orphans. Quarantined until the
  // lane lands, then flip `test.fixme` -> `test`. (In THIS environment the
  // delete already removed the subtree cleanly; see the PR notes.)
  test.fixme("4. deleting Hero Centered via the layers X leaves no orphan layers (W1-L1)", async () => {
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

  // W1-L2: the publish drawer checks could hang in a skeleton and a false
  // "changed in another tab" conflict could block publish. Quarantined until the
  // lane lands, then flip `test.fixme` -> `test`. (In THIS environment the checks
  // resolved and Publish now enabled; see the PR notes.)
  test.fixme("7. the publish drawer checks resolve without hanging (W1-L2)", async () => {
    const drawer = page.locator('[data-edit-drawer="publish"]');
    if (!(await drawer.isVisible().catch(() => false))) {
      await page.getByRole("button", { name: /^publish$/i }).click();
    }
    await expect(drawer).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole("status", { name: /Running publish checks/i }),
    ).toBeHidden({ timeout: 60_000 });
    await expect(drawer.getByRole("button", { name: /publish now/i })).toBeEnabled({
      timeout: 30_000,
    });
    // Do NOT publish.
  });
});
