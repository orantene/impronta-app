/**
 * layout-flatten-notice-wiring.static.test.ts — the depth-cap notice must
 * actually REACH the operator.
 *
 * WHY THIS FILE EXISTS
 * ────────────────────
 * The draft-save normalizer flattens wrapper chains deeper than the shared
 * nesting cap. `normalize-tree-layout.test.ts` proves the normalizer PRODUCES a
 * report naming the affected blocks — but a report nobody renders is exactly the
 * bug it was meant to fix: the operator's structure changes and they are never
 * told. A pure-model test cannot see that gap (a sibling lane shipped a control
 * that was completely dead while its unit tests stayed green, because the tests
 * only exercised the pure model), so this file walks the whole delivery chain:
 *
 *   normalize-tree-layout.collectBuilderTreeFlattenNotices
 *     → use-layout-flatten-warning: the shared depth pass + a STICKY toast
 *     → edit-context: called on the exact tree BOTH save lanes are about to send
 *     → edit-context value: layoutFlattenToast + clearLayoutFlattenToast
 *     → edit-shell: LayoutFlattenToast MOUNTED in the chrome tree
 *
 * Break any link and this fails. File-text scan (not import) for the same reason
 * as the sibling *.static.test.ts files: importing edit-shell.tsx pulls the
 * React + "use server" + Next graph that cannot run outside Next.js.
 *
 * Run: node_modules/.bin/tsx --test \
 *   src/components/edit-chrome/layout-flatten-notice-wiring.static.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const read = (file: string) => readFileSync(resolve(THIS_DIR, file), "utf8");

const EDIT_CONTEXT = read("edit-context.tsx");
const EDIT_SHELL = read("edit-shell.tsx");
const WARNING = read("use-layout-flatten-warning.ts");
const TOAST = read("layout-flatten-toast.tsx");
const ES = read("editor-i18n-es.ts");

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

test("the editor runs the SHARED depth pass, not a local re-implementation", () => {
  assert.ok(
    /import\s*\{\s*collectBuilderTreeFlattenNotices\s*\}\s*from\s*"@\/lib\/site-admin\/builder-node\/normalize-tree-layout"/.test(
      WARNING,
    ),
    "the warning hook must import collectBuilderTreeFlattenNotices from the normalizer — a second copy of the depth rule in the client is how a warning drifts out of sync with the write and starts lying",
  );
  assert.ok(
    occurrences(WARNING, "collectBuilderTreeFlattenNotices(") >= 1,
    "…and must actually call it",
  );
  assert.ok(
    EDIT_CONTEXT.includes("useLayoutFlattenWarning()"),
    "…and edit-context must mount the hook",
  );
});

test("BOTH save lanes warn before the write", () => {
  // The debounced/optimistic builder save and the explicit Save draft press are
  // separate code paths to the same server normalizer. A warning on only one of
  // them is a silent restructure on the other.
  const calls = occurrences(EDIT_CONTEXT, "warnIfSaveWillFlatten(");
  assert.ok(
    calls >= 2,
    `expected the pre-save check to be CALLED from both save lanes; found ${calls} call site(s)`,
  );
  // The autosave lane warns on the tree it is about to send.
  assert.ok(
    EDIT_CONTEXT.includes("warnIfSaveWillFlatten(nextTree)"),
    "the optimistic/autosave lane must check the exact tree it sends",
  );
  // The explicit Save draft lane warns on its reconciled tree.
  assert.ok(
    /warnIfSaveWillFlatten\(\s*\n?\s*reconcileBuilderTreeFromSlots\(/.test(EDIT_CONTEXT),
    "the explicit Save draft lane must check the tree it sends too",
  );
});

test("the notice is raised through a STICKY toast that never auto-hides", () => {
  assert.ok(
    WARNING.includes("setLayoutFlattenToast({"),
    "the hook must actually raise the toast",
  );
  assert.ok(
    !/setTimeout|useTransientState/.test(WARNING),
    "the layout-flatten toast must be sticky — a structural change to the operator's own work must be acknowledged, not blinked past on a timer",
  );
  assert.ok(
    WARNING.includes("layoutFlattenSeenRef"),
    "a debounced autosave burst re-saves the same over-deep tree; the toast must coalesce on the block set rather than fire per keystroke",
  );
});

test("the toast is on the context value AND mounted in the chrome tree", () => {
  assert.ok(
    EDIT_CONTEXT.includes("layoutFlattenToast") &&
      EDIT_CONTEXT.includes("clearLayoutFlattenToast"),
    "edit-context must publish the toast state to consumers",
  );
  assert.ok(
    occurrences(EDIT_CONTEXT, "      layoutFlattenToast,") >= 2,
    "the toast must be on BOTH the context value object and its memo dep list, or it never re-renders",
  );
  assert.ok(
    TOAST.includes("export function LayoutFlattenToast()"),
    "the toast component must exist",
  );
  assert.ok(
    /const \{ layoutFlattenToast, clearLayoutFlattenToast \} = useEditContext\(\)/.test(
      TOAST,
    ),
    "…and it must read the live state",
  );
  assert.ok(
    EDIT_SHELL.includes("<LayoutFlattenToast />"),
    "…and it must be MOUNTED in the chrome tree. A defined-but-unmounted toast is the exact failure this file exists to catch",
  );
  assert.ok(
    /import \{ LayoutFlattenToast \} from "\.\/layout-flatten-toast"/.test(EDIT_SHELL),
    "…which needs the import to resolve to the real component",
  );
});

test("the notice names the blocks and says what happened, in both languages", () => {
  assert.ok(
    TOAST.includes("labels.join("),
    "the toast must print the affected block names, not just a count",
  );
  assert.ok(
    TOAST.includes("No content was lost"),
    "the toast must say content survived — that is the normalizer's invariant and the operator's first question",
  );
  assert.ok(
    TOAST.includes("No se perdió ningún contenido"),
    "…in Spanish too",
  );
  assert.ok(
    /"Layout changed on save":\s*"[^"]+"/.test(ES),
    "the toast's eyebrow label needs an ES entry",
  );
});
