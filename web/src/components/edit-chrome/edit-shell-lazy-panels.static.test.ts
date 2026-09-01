/**
 * edit-shell-lazy-panels.static.test.ts — builder-2027 P1 (1K).
 *
 * THE COST THIS PROTECTS
 * ──────────────────────
 * `EditShell` mounts every overlay in the editor. Most were already behind
 * `next/dynamic` plus an "ever opened" flag, so their chunk arrives when the
 * operator first opens them. Three were not: the add-gallery (a ~3.4k-line
 * subtree), the all-pages panel, and the design panel. Each was imported
 * eagerly AND mounted closed, so every editor session downloaded and parsed
 * them before the operator had done anything.
 *
 * A static import is one line and looks harmless in review. That is exactly why
 * this needs a gate rather than a convention: the eager three drifted back in
 * one at a time, each individually reasonable.
 *
 * WHAT IS ASSERTED
 * ────────────────
 *   1. Each heavy panel is declared with `dynamic(() => import(...))` in the
 *      declarations module, and imported nowhere else directly.
 *   2. Each is gated by its own `everOpened*` flag at the mount site — a
 *      dynamic component mounted unconditionally still downloads its chunk
 *      immediately, which is the mistake that makes the first half look done.
 *   3. Each `everOpened*` flag is actually SET by an effect, or the panel can
 *      never open at all. That is the wiring half, and the wiring half is what
 *      has shipped dead here before with a green suite.
 *
 * A source read is the honest tool: `EditShell` cannot mount in this lane, and
 * "is this a static or a dynamic import" is a source-text property. It does NOT
 * measure the shipped chunk graph, and does not claim to.
 *
 * Run: node_modules/.bin/tsx --test \
 *   src/components/edit-chrome/edit-shell-lazy-panels.static.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
/** Where the mounts and the `everOpened*` wiring live. */
const SHELL = readFileSync(join(HERE, "edit-shell.tsx"), "utf8");
/** Where the `dynamic()` declarations live (extracted for the size ratchet). */
const DECLARATIONS = readFileSync(
  join(HERE, "edit-shell-lazy-panels.tsx"),
  "utf8",
);

/** component name -> the state flag that must gate its mount. */
const LAZY_PANELS: Record<string, string> = {
  PublishDrawer: "everOpenedPublish",
  PageSettingsDrawer: "everOpenedPageSettings",
  RevisionsDrawer: "everOpenedRevisions",
  ThemeDrawer: "everOpenedTheme",
  AssetsDrawer: "everOpenedAssets",
  CollectionsDrawer: "everOpenedCollections",
  CommandPalette: "everOpenedPalette",
  ScheduleDrawer: "everOpenedSchedule",
  CommentsDrawer: "everOpenedComments",
  // builder-2027 1K — the three that were eager.
  AddGalleryPanel: "everOpenedAddGallery",
  AllPagesPanel: "everOpenedAllPages",
  DesignPanel: "everOpenedDesignPanel",
};

test("the locator finds the files it thinks it does", () => {
  assert.match(
    DECLARATIONS,
    /import dynamic from "next\/dynamic";/,
    "edit-shell-lazy-panels.tsx must still import next/dynamic — without it " +
      "nothing here can be lazy and this guard would be reading the wrong file",
  );
  assert.match(
    SHELL,
    /from "\.\/edit-shell-lazy-panels"/,
    "edit-shell.tsx must pull its deferred overlays from the declarations module",
  );
  assert.ok(
    !/\bdynamic\(/.test(SHELL),
    "the declarations belong in ONE module. A `dynamic()` back in edit-shell " +
      "means the list has started growing in two places again, which is how " +
      "the eager three got in.",
  );
});

test("every heavy panel is a dynamic import, not a static one", () => {
  const staticImports: string[] = [];
  const notDynamic: string[] = [];
  for (const name of Object.keys(LAZY_PANELS)) {
    // A direct static import from the panel's own module defeats the deferral.
    // Importing the name FROM the declarations module is the correct shape.
    const directImport = new RegExp(
      `^import \\{[^}]*\\b${name}\\b[^}]*\\} from "\\.\\/(?!edit-shell-lazy-panels)`,
      "m",
    );
    if (directImport.test(SHELL) || directImport.test(DECLARATIONS)) {
      staticImports.push(name);
    }
    if (!new RegExp(`export const ${name} = dynamic\\(`).test(DECLARATIONS)) {
      notDynamic.push(name);
    }
  }
  assert.deepEqual(
    staticImports,
    [],
    `these panels are imported statically, so their chunk ships with the editor ` +
      `shell whether or not the operator opens them:\n  ${staticImports.join("\n  ")}`,
  );
  assert.deepEqual(
    notDynamic,
    [],
    `these panels are not declared with next/dynamic in the declarations ` +
      `module:\n  ${notDynamic.join("\n  ")}`,
  );
});

test("every heavy panel's mount is gated on its ever-opened flag", () => {
  // A dynamic import mounted unconditionally still fetches its chunk on mount.
  // Half-doing this is worse than not doing it, because it looks done.
  const ungated: string[] = [];
  for (const [name, flag] of Object.entries(LAZY_PANELS)) {
    if (!new RegExp(`<${name}\\b`).test(SHELL)) {
      ungated.push(`${name} (not mounted at all)`);
      continue;
    }
    // Both shapes are in use — `flag && <X/>` and `cond && flag ? <X/> : null`
    // — and either may wrap the element in parens across lines, so match the
    // flag followed by `&&` or `?` and then the element within a short window.
    const guarded = new RegExp(
      `\\b${flag}\\b[^\\n]*(&&|\\?)[\\s\\S]{0,80}?<${name}\\b`,
    );
    if (!guarded.test(SHELL)) ungated.push(`${name} (missing ${flag} gate)`);
  }
  assert.deepEqual(
    ungated,
    [],
    `these panels mount without their ever-opened gate, so the chunk downloads ` +
      `on editor open anyway:\n  ${ungated.join("\n  ")}`,
  );
});

test("every ever-opened flag is actually set by an effect", () => {
  // The wiring half. A flag that is declared and read but never SET means the
  // panel can never open — a feature that ships completely dead with a green
  // suite, which is the exact failure mode this repo keeps hitting.
  const neverSet: string[] = [];
  for (const flag of Object.values(LAZY_PANELS)) {
    const setter = `set${flag.charAt(0).toUpperCase()}${flag.slice(1)}`;
    if (!new RegExp(`${setter}\\(true\\)`).test(SHELL)) neverSet.push(flag);
  }
  assert.deepEqual(
    neverSet,
    [],
    `these ever-opened flags are never set to true, so their panel can never ` +
      `open:\n  ${neverSet.join("\n  ")}`,
  );
});
