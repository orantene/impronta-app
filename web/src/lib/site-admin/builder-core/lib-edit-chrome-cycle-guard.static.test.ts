/**
 * lib-edit-chrome-cycle-guard.static.test.ts — lib↔components cycle freeze (W4-F4).
 *
 * WHAT THIS TEST DOES
 * ───────────────────
 * Reads the SOURCE TEXT of every file under `src/lib/site-admin/**` and FAILS
 * if a file imports from `components/edit-chrome/**` UNLESS that exact
 * (file, module) edge is on the ALLOW_LIST below.
 *
 * WHY
 * ───
 * `components/edit-chrome/**` legitimately imports `lib/site-admin/**` (the
 * expected components→lib direction, ~139 files). But a handful of
 * `lib/site-admin/**` files import BACK into `components/edit-chrome/**`,
 * creating a lib↔components import cycle. This guard FREEZES that set: no NEW
 * lib→edit-chrome edge can be added, and the ALLOW_LIST is the exact backlog to
 * burn down. As shared primitives are relocated to a leaf package
 * (`components/builder-kit/**` — NOT edit-chrome), their entries drop off the
 * list and the cycle shrinks toward zero.
 *
 * The ALLOW_LIST is also self-policing: an entry that no longer matches any real
 * import is reported as STALE, so the list can only shrink honestly (you cannot
 * leave a dead allowance behind after removing an edge).
 *
 * WHY FILE-TEXT SCAN (not imports)?
 * ──────────────────────────────────
 * Importing lib/site-admin modules under node:test pulls the server-action /
 * React / Next graph that can't run outside Next.js. A plain UTF-8 text scan is
 * zero-overhead and catches exactly the edge we care about: a module specifier
 * string that reaches into components/edit-chrome.
 *
 * Test runner: node:test + node:assert/strict
 * Run:  node_modules/.bin/tsx --test \
 *   src/lib/site-admin/builder-core/lib-edit-chrome-cycle-guard.static.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

// This file lives at: web/src/lib/site-admin/builder-core/
// web/src is 3 levels up: ../../..
const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const WEB_SRC = resolve(THIS_DIR, "../../..");
const LIB_SITE_ADMIN = join(WEB_SRC, "lib/site-admin");

/**
 * A module specifier in an `import … from "…"`, `export … from "…"`, or dynamic
 * `import("…")`. Only real import/export edges count — a bare path string (e.g.
 * a `readFileSync` argument in a test) is NOT an import and must not trip the
 * guard. Comments are stripped before matching so prose that mentions a path is
 * ignored too.
 */
const FROM_SPECIFIER_RE = /\bfrom\s*["'`]([^"'`]+)["'`]/g;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g;

/** True when a module specifier reaches into components/edit-chrome (alias or relative). */
function isEditChromeSpecifier(spec: string): boolean {
  return spec.includes("components/edit-chrome/");
}

/**
 * The guard's own file necessarily contains example edit-chrome specifiers
 * inside self-check fixtures — exclude it from the scan.
 */
const SELF_BASENAME = "lib-edit-chrome-cycle-guard.static.test.ts";

/** Strip block and line comments so prose mentioning a path is ignored. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*/g, "");
}

/**
 * The frozen set of CURRENT lib/site-admin → components/edit-chrome edges.
 * Key = source file path RELATIVE to `src/lib/site-admin/` (forward slashes).
 * Value = the set of edit-chrome module specifiers that file is allowed to
 * import. Every entry is a KNOWN cycle edge that pre-existed this guard.
 *
 * BURN-DOWN RULE: when you relocate a shared primitive OUT of edit-chrome (into
 * the `components/builder-kit/**` leaf) and re-point its importers, DELETE the
 * now-dead entry here. The stale-entry check will fail if you forget.
 *
 * DO NOT ADD ENTRIES. A new lib→edit-chrome import is a new cycle edge and must
 * be resolved by depending on the leaf package instead.
 *
 * ── BURN-DOWN HISTORY ──────────────────────────────────────────────────────
 * W5-C2 removed 3 edges (23→20) via CORRECT-DIRECTION moves (not a leaf move):
 *   • `freeform-layer-name.ts` was a pure builder-node util misplaced in
 *     edit-chrome (its only dep is `lib/site-admin/builder-node`). Moved TO lib
 *     → dropped the `add-gallery/section-templates.test.ts` edge.
 *   • palette-drag payload core (MIME + encode/decode + in-flight singleton +
 *     pointer pub/sub) extracted to `builder-node/palette-drag.ts`; the lib
 *     `add-gallery/drag.ts` now imports lib → dropped its edge. The edit-chrome
 *     `element-library-insert-picker.tsx` re-exports it for back-compat.
 *   • `bridge-reference-identity.test.ts` moved TO edit-chrome (beside the
 *     `client-builder-canvas-bridge` module it pins) → dropped its edge.
 *
 * ── DEEP-KNOT BACKLOG (the remaining 20 edges need a bigger untangle) ───────
 * The rich-editor / inspectors-kit / MediaPicker edges are NOT simple leaf
 * moves — W4-F4 and W5-C2 both confirmed the primitives aren't clean leaves:
 *   • rich-editor (8 edges): cannot move to a leaf because it transitively
 *     depends on lib via `plugins/LinkPickerPopover` → `sections/shared/
 *     LinkPicker` (server-action-backed) AND on `kit/color-picker`, which is
 *     styled with the edit-chrome CHROME design tokens (`kit/tokens.ts`, an
 *     edit-chrome layout+palette foundation used by ~55 files). Lifting the
 *     color primitive to a "generic" leaf would drag the edit-chrome palette
 *     with it. Needs: (a) invert LinkPicker via a slot/registry so rich-editor
 *     stops importing lib, then (b) split CHROME's shared visual palette out of
 *     the edit-chrome layout tokens before the color cluster can be a true leaf.
 *   • inspectors/kit (7 edges): a large barrel with 6 hard lib deps
 *     (LinkKindPicker, link-ref, presentation, prop-lock, MediaPicker,
 *     talent-search) — not leaf-movable without per-symbol extraction.
 *   • sections/shared/MediaPicker.tsx (1 edge): a thin lib wrapper over the
 *     edit-chrome `media-picker-drawer`. Its consumers are 4 edit-chrome + 2 lib
 *     (LinkPicker, ZodSchemaForm). Relocating it just moves the edge (the 2 lib
 *     consumers would import edit-chrome instead). Real fix = dependency
 *     inversion: lib section editors receive the drawer via a slot/registry, or
 *     the drawer's reusable core moves to a leaf (blocked today because the
 *     drawer imports edit-chrome `kit` + `inspectors/kit/tokens` + scope).
 */
const ALLOW_LIST: Record<string, string[]> = {
  // ── builder-core / builder-node ──────────────────────────────────────────
  "builder-core/mount/BuilderEditorMount.tsx": ["@/components/edit-chrome/edit-shell"],

  // ── section Editors: inspector KIT (leaf-move backlog) ────────────────────
  "sections/contact_form/InquiryTargetTalentField.tsx": [
    "@/components/edit-chrome/inspectors/kit",
  ],
  "sections/destinations_mosaic/Editor.tsx": [
    "@/components/edit-chrome/rich-editor",
    "@/components/edit-chrome/inspectors/kit",
  ],
  "sections/directory/Editor.tsx": ["@/components/edit-chrome/inspectors/kit"],
  "sections/editorial_split_hero/Editor.tsx": ["@/components/edit-chrome/inspectors/kit"],
  "sections/hero_search/Editor.tsx": ["@/components/edit-chrome/inspectors/kit"],
  "sections/image_copy_alternating/Editor.tsx": ["@/components/edit-chrome/inspectors/kit"],
  "sections/location_discovery/Editor.tsx": ["@/components/edit-chrome/inspectors/kit"],
  "sections/split_screen/Editor.tsx": [
    "@/components/edit-chrome/rich-editor",
    "@/components/edit-chrome/inspectors/kit",
  ],

  // ── section Editors: RICH EDITOR (leaf-move backlog) ──────────────────────
  "sections/category_grid/Editor.tsx": ["@/components/edit-chrome/rich-editor"],
  "sections/cta_banner/Editor.tsx": ["@/components/edit-chrome/rich-editor"],
  "sections/featured_talent/Editor.tsx": ["@/components/edit-chrome/rich-editor"],
  "sections/hero/Editor.tsx": ["@/components/edit-chrome/rich-editor"],
  "sections/shared/LocalizedTextInput.tsx": ["@/components/edit-chrome/rich-editor"],

  // ── section shared primitives ─────────────────────────────────────────────
  "sections/shared/MediaPicker.tsx": ["@/components/edit-chrome/media-picker-drawer"],
  "sections/shared/ZodSchemaForm.tsx": [
    "@/components/edit-chrome/inspectors/AiRewriteButton",
    "@/components/edit-chrome/rich-editor",
    "@/components/edit-chrome/inspectors/kit",
  ],
};

// ── File discovery ────────────────────────────────────────────────────────────

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      collectSourceFiles(full, out);
    } else if (st.isFile()) {
      const ext = extname(name);
      if (ext === ".ts" || ext === ".tsx") out.push(full);
    }
  }
  return out;
}

/** Extract every distinct edit-chrome module specifier IMPORTED by `source`. */
function editChromeSpecifiersIn(source: string): string[] {
  const code = stripComments(source);
  const found = new Set<string>();
  for (const re of [FROM_SPECIFIER_RE, DYNAMIC_IMPORT_RE]) {
    for (const m of code.matchAll(re)) {
      if (isEditChromeSpecifier(m[1]!)) found.add(m[1]!);
    }
  }
  return [...found];
}

function relKey(fullPath: string): string {
  return fullPath.slice(LIB_SITE_ADMIN.length + 1).split("\\").join("/");
}

// ── Self-checks: the matcher must actually work ───────────────────────────────

test("self-check: matcher catches an @/ alias edit-chrome import", () => {
  const specs = editChromeSpecifiersIn(
    `import { RichEditor } from "@/components/edit-chrome/rich-editor";`,
  );
  assert.deepEqual(specs, ["@/components/edit-chrome/rich-editor"]);
});

test("self-check: matcher catches a relative edit-chrome import", () => {
  const specs = editChromeSpecifiersIn(
    `import { X } from "../../../components/edit-chrome/inspectors/kit";`,
  );
  assert.deepEqual(specs, ["../../../components/edit-chrome/inspectors/kit"]);
});

test("self-check: matcher ignores a non-edit-chrome import", () => {
  const specs = editChromeSpecifiersIn(
    `import { RichEditor } from "@/components/builder-kit/rich-editor";\n` +
      `import { Foo } from "@/lib/site-admin/sections/shared/LinkPicker";`,
  );
  assert.deepEqual(specs, []);
});

// ── The real scan ─────────────────────────────────────────────────────────────

test("lib/site-admin must not import components/edit-chrome outside the allow-list", () => {
  const violations: string[] = [];

  for (const file of collectSourceFiles(LIB_SITE_ADMIN)) {
    const rel = relKey(file);
    if (rel.endsWith(SELF_BASENAME)) continue;
    const specs = editChromeSpecifiersIn(readFileSync(file, "utf8"));
    if (specs.length === 0) continue;

    const allowed = new Set(ALLOW_LIST[rel] ?? []);
    for (const spec of specs) {
      if (!allowed.has(spec)) {
        violations.push(`${rel}  →  ${spec}`);
      }
    }
  }

  assert.equal(
    violations.length,
    0,
    "NEW lib→edit-chrome cycle edge(s) detected. lib/site-admin must not import " +
      "into components/edit-chrome — depend on the components/builder-kit leaf " +
      "package instead, or (if truly new & unavoidable) justify and add to " +
      "ALLOW_LIST. Offenders:\n  " +
      violations.join("\n  "),
  );
});

test("allow-list has no STALE entries (edges that no longer exist)", () => {
  const stale: string[] = [];

  for (const [rel, specs] of Object.entries(ALLOW_LIST)) {
    const file = join(LIB_SITE_ADMIN, rel);
    let source: string;
    try {
      source = readFileSync(file, "utf8");
    } catch {
      stale.push(`${rel}  (file not found)`);
      continue;
    }
    const present = new Set(editChromeSpecifiersIn(source));
    for (const spec of specs) {
      if (!present.has(spec)) stale.push(`${rel}  →  ${spec}`);
    }
  }

  assert.equal(
    stale.length,
    0,
    "STALE allow-list entries — these edges no longer exist in source. Remove " +
      "them from ALLOW_LIST so the burn-down stays honest:\n  " +
      stale.join("\n  "),
  );
});

test("informational: allow-list size (cycle-edge backlog)", () => {
  const edgeCount = Object.values(ALLOW_LIST).reduce((n, s) => n + s.length, 0);
  process.stdout.write(
    `  lib→edit-chrome cycle edges still allow-listed: ${edgeCount}\n`,
  );
  assert.ok(edgeCount >= 0);
});
