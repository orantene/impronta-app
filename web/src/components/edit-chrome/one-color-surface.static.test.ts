/**
 * one-color-surface.static.test.ts — builder-2027 P1 (1I).
 *
 * THE RULE: the page builder has ONE colour surface, the in-app HSV popover
 * (`kit/color-picker.tsx`, reached through `inspectors/color-swatch-button.tsx`).
 * An OS `<input type="color">` hands the gesture to the platform's own picker,
 * which opens as a separate window on top of the canvas the operator is trying
 * to compare against, renders in the OS theme rather than the editor's, and on
 * some platforms cannot be dismissed without committing a value.
 *
 * WHY A GUARD AND NOT JUST A FIX: `type="color"` is one attribute. It is the
 * path of least resistance for any new colour field, and the editor had already
 * drifted back to it in three places after the in-app surface shipped. A rule
 * nothing enforces is a rule that decays.
 *
 * THE ALLOW-LIST is a RATCHET: entries may be removed, never added. Each one
 * names why that surface is still on OS chrome. Adding a file here is a
 * decision that has to be argued in review, which is the point.
 *
 * Run: node_modules/.bin/tsx --test \
 *   src/components/edit-chrome/one-color-surface.static.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const EDIT_CHROME_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * Files still permitted to render an OS colour input, and why. RATCHET: remove
 * entries as they are converted; never add one.
 */
const ALLOW_LIST: Record<string, string> = {
  "MeshGradientGenerator.tsx":
    "A standalone generator utility, not an inspector field on the canvas " +
    "editing path. Converting it is a separate change with its own visual QA.",
  "brand-quick-panel.tsx":
    "Brand palette setup, a one-time onboarding-style flow rather than a " +
    "compare-as-you-go canvas gesture.",
  "inspectors/site-header/tabs/StyleTab.tsx":
    "Site-header style tab; owned by the header inspector rework.",
  "rich-editor/plugins/ToolbarPlugin.tsx":
    "Lexical toolbar. The popover needs an anchor that survives the editor " +
    "selection restore, which is its own piece of work.",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (/\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Strip comments before scanning. Every module that OWNS the in-app surface
 * explains itself by naming the thing it replaced, and a guard that counts
 * prose is the guard that reddened main on a clean refactor
 * (incident_static_guard_pinned_source_text). Only real code counts.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

function osColorInputs(): string[] {
  const found: string[] = [];
  for (const file of walk(EDIT_CHROME_DIR)) {
    const code = stripComments(readFileSync(file, "utf8"));
    if (!code.includes('type="color"')) continue;
    found.push(relative(EDIT_CHROME_DIR, file));
  }
  return found.sort();
}

test("the matcher detects real code and ignores prose", () => {
  // Self-check: a matcher that finds nothing would make the real assertion
  // below pass forever regardless of what shipped, and one that counts
  // docstrings would flag every module that explains what it replaced.
  const planted = '<input\n  type="color"\n  value={v}\n/>';
  assert.ok(
    stripComments(planted).includes('type="color"'),
    "the token this guard scans for must be the one the JSX emits",
  );
  const prose = '/** Replaces the OS `<input type="color">`. */\nconst x = 1;';
  assert.ok(
    !stripComments(prose).includes('type="color"'),
    "a docstring naming the thing it replaced must not read as a violation",
  );
  const lineProse = '// was an <input type="color">\nconst y = 2;';
  assert.ok(
    !stripComments(lineProse).includes('type="color"'),
    "a line comment naming the thing it replaced must not read as a violation",
  );
});

test("no NEW editor surface falls back to the OS colour picker", () => {
  const offenders = osColorInputs().filter((f) => !(f in ALLOW_LIST));
  assert.deepEqual(
    offenders,
    [],
    "these edit-chrome files use an OS `<input type=\"color\">`. Use " +
      "`inspectors/color-swatch-button.tsx` (the in-app HSV popover) instead, " +
      "or add the file to ALLOW_LIST with the reason it must stay on OS " +
      `chrome:\n  ${offenders.join("\n  ")}`,
  );
});

test("the allow-list only shrinks", () => {
  // An entry for a file that no longer has an OS colour input is stale: it must
  // be deleted, or it silently re-permits the fallback if the file regresses.
  const present = new Set(osColorInputs());
  const stale = Object.keys(ALLOW_LIST).filter((f) => !present.has(f));
  assert.deepEqual(
    stale,
    [],
    `these ALLOW_LIST entries no longer have an OS colour input; delete them so ` +
      `the ratchet keeps its grip:\n  ${stale.join("\n  ")}`,
  );
});

test("the converted surfaces route through the shared swatch", () => {
  for (const file of [
    "multi-selection-toolbar.tsx",
    "inspectors/multi-selection-style-panel.tsx",
    "inspectors/style-panel/border-side-style-color-fields.tsx",
  ]) {
    const src = readFileSync(join(EDIT_CHROME_DIR, file), "utf8");
    assert.match(
      src,
      /<ColorSwatchButton\b/,
      `${file} must render <ColorSwatchButton/>, not its own colour control`,
    );
    assert.match(
      src,
      /import \{ ColorSwatchButton \} from/,
      `${file} must import the SHARED swatch, not re-declare one`,
    );
  }
});
