/**
 * revisions-drawer-page-scope.static.test.ts — the revisions drawer must never
 * show one page's history under another page's title (builder audit
 * leftovers, BUG 3).
 *
 * BACKGROUND: `loadHomepageRevisionsAction` takes NO pageId — by design. It
 * resolves the homepage row from `locale` via `loadDraftHomepage`. The
 * generalised read for every other cms page is `loadPageRevisionsAction`,
 * which takes `{ pageId, pageVersion }`. Both already exist, and the drawer
 * routes between them on `isNonHomepage = Boolean(pageSlug) && Boolean(pageId)`
 * — a slug check, NOT a surfaceKind check, which is why a slot cms page (whose
 * surfaceKind is "homepage") still reads its own history.
 *
 * THE LATENT DEFECT this guards: the routing ternary's `pageVersion !== null`
 * term meant that a cms page whose composition had not landed yet FELL THROUGH
 * to the homepage action. For that window the drawer listed the HOMEPAGE's
 * revisions under a cms page's title, and a fast click could fire a restore
 * against a revision id belonging to a different page. A known-non-homepage
 * page must wait for its own identity instead of borrowing the homepage's.
 *
 * WHY FILE-TEXT SCAN: importing the drawer pulls the React + server-action
 * graph; a text scan asserts the routing shape at zero cost.
 *
 * Test runner: node:test + node:assert/strict
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const DRAWER = readFileSync(resolve(HERE, "revisions-drawer.tsx"), "utf8");
const ACTIONS = readFileSync(
  resolve(HERE, "../../lib/site-admin/edit-mode/revisions-actions.ts"),
  "utf8",
);

test("a non-homepage page never falls through to the homepage revisions read", () => {
  assert.ok(
    DRAWER.includes(
      "if (!loadSurfaceRevisions && isNonHomepage && (!pageId || pageVersion === null))",
    ),
    "revisions drawer lost its non-homepage fall-through guard — a cms page whose pageVersion has not landed will list the HOMEPAGE's revisions under its own title",
  );
});

test("page identity comes from the slug, not from surfaceKind", () => {
  assert.ok(
    DRAWER.includes("const isNonHomepage = Boolean(pageSlug) && Boolean(pageId);"),
    "isNonHomepage must stay slug-derived: a slot cms page mounts with surfaceKind 'homepage', so a surfaceKind fork here would send it to the homepage's history",
  );
});

test("the two revision reads keep their distinct, correct signatures", () => {
  // The homepage read is locale-keyed on purpose (it resolves the homepage row
  // itself); the generalised read is the one that carries a pageId. Neither
  // signature is a bug — conflating them would be.
  assert.ok(
    /export async function loadHomepageRevisionsAction\(input: \{\s*locale: string;\s*\}\)/.test(
      ACTIONS,
    ),
    "loadHomepageRevisionsAction should stay locale-keyed — it is the homepage-only path",
  );
  assert.ok(
    /export async function loadPageRevisionsAction\(input: \{\s*pageId: string;\s*pageVersion: number;\s*\}\)/.test(
      ACTIONS,
    ),
    "loadPageRevisionsAction is the pageId-carrying read every non-homepage cms page must use",
  );
});

test("restorePageRevision still restores CONTENT, not just page fields", () => {
  // A prior audit note claimed the page-lane restore never rewrote
  // builderTree / cms_page_sections. It does (the content-resolve step). This
  // guard exists so that claim cannot become true by accident later.
  const PAGES = readFileSync(
    resolve(HERE, "../../lib/site-admin/server/pages.ts"),
    "utf8",
  );
  assert.ok(
    PAGES.includes("function readStoredBuilderTree(") &&
      PAGES.includes("function readStoredComposition("),
    "restorePageRevision's snapshot content readers are gone — the page lane would restore metadata only and strand the editor on an empty canvas",
  );
  assert.ok(
    PAGES.includes("const restoredBuilderTree: BuilderNodeTree = resolveSnapshotBuilderTree({"),
    "restorePageRevision must resolve a builder tree from the revision snapshot",
  );
});
