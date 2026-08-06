/**
 * WAVE1-1.7 — the FREEFORM homepage draft load must clear the same emptiness
 * bar the publish path does.
 *
 * ── The bug ───────────────────────────────────────────────────────────────
 * `loadCompositionData`'s freeform branch preferred the RAW newest-revision
 * tree, parsed by `parseBuilderTreeFromSnapshot`, which filters only on
 * `Array.isArray(tree) && tree.length > 0`. `recoverBuilderTreeIfEmpty`
 * (`recover-builder-tree.ts`) counts nodes RECURSIVELY and correctly treats a
 * ONE-node tree — a lone empty root container, the canonical "emptied" shape —
 * as empty. So a drifted revision holding exactly that shape sailed through the
 * loader, rendered an EMPTY canvas, and the editor then autosaved the emptiness
 * forward over the good draft. Publish was already guarded; the editor was not.
 *
 * ── Why this is a static test ─────────────────────────────────────────────
 * `composition-actions.ts` is a `"use server"` module: importing it pulls the
 * whole Server Action + request-scope graph, which `tsx --test` cannot host.
 * The RECOVERY SEMANTICS themselves are already proven behaviorally in
 * `server/recover-builder-tree.test.ts` (including the lone-empty-container
 * case). What was missing, and what this file locks, is the WIRING: that the
 * freeform branch actually routes its tree through that guard instead of
 * trusting the raw parse.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const SOURCE = readFileSync(
  join(process.cwd(), "src/lib/site-admin/edit-mode/composition-actions.ts"),
  "utf8",
);

test("the freeform homepage draft load imports the shared emptiness guard", () => {
  assert.match(
    SOURCE,
    /import\s*\{\s*recoverBuilderTreeIfEmpty\s*\}\s*from\s*"@\/lib\/site-admin\/server\/recover-builder-tree"/,
    "composition-actions must import recoverBuilderTreeIfEmpty",
  );
});

test("the isFreeformPage branch routes the revision tree through recoverBuilderTreeIfEmpty", () => {
  // Narrow to the freeform branch so a match elsewhere in the file cannot make
  // this pass by accident.
  const branchStart = SOURCE.indexOf("if (isFreeformPage) {");
  assert.ok(branchStart > -1, "the isFreeformPage branch still exists");
  const branch = SOURCE.slice(branchStart, branchStart + 1600);

  assert.match(
    branch,
    /recoverBuilderTreeIfEmpty\(/,
    "the freeform branch must not assign the raw revision tree straight through",
  );
  assert.match(
    branch,
    /hasSlots:\s*false/,
    "a freeform page has no curated slots, so recovery must be allowed to fire",
  );
  assert.match(
    branch,
    /revisionExtras\.builderTree/,
    "the raw newest-revision tree is what gets passed in as the candidate",
  );
});

test("the raw parser is NOT what feeds draftRevisionBuilderTree any more", () => {
  const branchStart = SOURCE.indexOf("if (isFreeformPage) {");
  const branch = SOURCE.slice(branchStart, branchStart + 1600);
  assert.doesNotMatch(
    branch,
    /draftRevisionBuilderTree\s*=\s*revisionExtras\.builderTree\s*;/,
    "the unguarded assignment is the exact 1.7 defect and must stay gone",
  );
});
