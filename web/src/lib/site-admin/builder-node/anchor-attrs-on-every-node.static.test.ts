import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * C11 — every node the renderer emits must carry `anchorIdAttrs`.
 *
 * THE FAILURE THIS EXISTS TO CATCH, WHICH ALREADY HAPPENED ONCE
 * ─────────────────────────────────────────────────────────────
 * The anchor spread was added to all 47 render sites that existed when C11 was
 * written. `reserve_table` landed on main separately, while this branch was 24
 * commits behind. On rebase, git merged the two cleanly and correctly — and the
 * new case arrived with `data-builder-node-id` and NO anchor spread, because it
 * did not exist when the 47 additions were made.
 *
 * Nothing caught it. It typechecks, it renders, it passes every lane. The only
 * symptom is that one node kind cannot be the target of an in-page anchor —
 * a link that quietly does nothing, which is the exact defect C11 was written
 * to eliminate. And the kind it happened to was `reserve_table`, so "Book a
 * table" would have been unable to jump to the booking block.
 *
 * A rebase is the worst place to catch this by review: the diff shows no
 * conflict and no deletion. Only a rule over the finished file sees it.
 *
 * WHY A SOURCE-TEXT ASSERTION, GIVEN THIS REPO'S SCAR
 * ──────────────────────────────────────────────────
 * A static guard that pins source TEXT once reddened main on a clean refactor,
 * so the rule here is deliberately structural rather than literal: it pairs two
 * things that must co-occur on the same element, and says nothing about
 * formatting, ordering elsewhere, or the surrounding markup. Renaming the
 * helper breaks it loudly and correctly; reformatting the file does not.
 */

const RENDER_PATH = join(
  process.cwd(),
  "src/lib/site-admin/builder-node/render.tsx",
);

/** `data-builder-node-id={node.id}` — one per rendered node element. */
const NODE_ID_EMISSION = /data-builder-node-id=\{node\.id\}/g;

test("every rendered node element also spreads anchorIdAttrs", () => {
  const source = readFileSync(RENDER_PATH, "utf8");
  const lines = source.split("\n");

  const missing: string[] = [];
  lines.forEach((line, index) => {
    if (!/data-builder-node-id=\{node\.id\}/.test(line)) return;
    // The spread sits on the same JSX element. Look back a few lines rather
    // than requiring an exact adjacency, so reordering attributes is free.
    const window = lines.slice(Math.max(0, index - 6), index + 1).join("\n");
    if (!window.includes("anchorIdAttrs(node)")) {
      // Name the enclosing case so the failure points at the kind, not a line.
      let kind = "(unknown case)";
      for (let i = index; i >= 0 && i > index - 400; i -= 1) {
        const m = /^\s*case "([a-z0-9_]+)":/.exec(lines[i]!);
        if (m) {
          kind = m[1]!;
          break;
        }
      }
      missing.push(`${kind} (render.tsx:${index + 1})`);
    }
  });

  assert.deepEqual(
    missing,
    [],
    "These node kinds emit data-builder-node-id without anchorIdAttrs, so they " +
      "cannot be the target of an in-page anchor — a link to them does nothing, " +
      "silently. This is what happens when a new render case lands on main while " +
      "the anchor work is on a branch: the rebase is clean and the case arrives " +
      "without the spread. Add `{...anchorIdAttrs(node)}` to the element.\n  " +
      missing.join("\n  "),
  );
});

test("the guard actually sees the emissions it claims to check", () => {
  // A regex that matches nothing would make the test above pass forever. This
  // is the anti-vacuity check: the same class as a filter guarding a list that
  // never contained the item.
  const source = readFileSync(RENDER_PATH, "utf8");
  const emissions = source.match(NODE_ID_EMISSION)?.length ?? 0;
  assert.ok(
    emissions > 40,
    `expected the renderer to emit data-builder-node-id many times, saw ${emissions} — the matcher has probably drifted from the source`,
  );
});
