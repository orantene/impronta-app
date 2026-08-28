/**
 * selection-layer-discriminator-ratchet.static.test.ts
 *
 * Counts remaining inline capability discriminators in `selection-layer.tsx`:
 *   1. kind === "section"
 *   2. resolveBuilderNodeRole
 *   3. node.locked / .locked
 *
 * WHY
 * ───
 * The two-products feel hangs on those three checks, scattered through the
 * chrome with no central capability object. `resolveNodeCapabilities` now
 * exists as a pin; the NEXT PR adopts it and this allow-list must shrink.
 * This PR only records today's counts so a drive-by cannot add more inline
 * checks (and so adoption cannot claim progress without moving the numbers).
 *
 * Direction: exact match, same spirit as invariant-guard.static.test.ts.
 *   • MORE than the allow-list → fail (new inline branch).
 *   • FEWER than the allow-list → fail until the count is re-baselined in
 *     the same commit (that is the adoption PR, not this one).
 *
 * Do NOT lower these numbers in the capabilities-pin commit. Adoption is
 * the commit that is allowed to.
 *
 * Run: node_modules/.bin/tsx --test \
 *   src/components/edit-chrome/selection-layer-discriminator-ratchet.static.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const SELECTION_LAYER = resolve(THIS_DIR, "selection-layer.tsx");

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
}

function countMatches(source: string, re: RegExp): { total: number; lines: number[] } {
  const lines = source.split("\n");
  const hitLines: number[] = [];
  let total = 0;
  const global = new RegExp(re.source, "g");
  lines.forEach((line, idx) => {
    const matches = line.match(new RegExp(global.source, "g"));
    if (matches) {
      total += matches.length;
      hitLines.push(idx + 1);
    }
  });
  return { total, lines: hitLines };
}

/**
 * Recorded on origin/main at the capabilities-pin (selection-layer.tsx,
 * comment-stripped). Adoption must lower these in the same commit that
 * deletes the inline checks.
 */
const ALLOW_LIST = {
  /** `kind === "section"` (not `!==` — those are a separate row). */
  sectionEq: 21,
  /** Inverse discriminator. Recorded so it cannot grow either. */
  sectionNeq: 7,
  /** Identifier including the import. */
  resolveBuilderNodeRole: 6,
  /** Property reads of `.locked` (the node flag, not `nodeLocked` props). */
  lockedProp: 8,
} as const;

const SECTION_EQ_RE = /\bkind\s*===\s*["']section["']/;
const SECTION_NEQ_RE = /\bkind\s*!==\s*["']section["']/;
const ROLE_RE = /\bresolveBuilderNodeRole\b/;
const LOCKED_RE = /\.locked\b/;

test("self-check: matchers catch planted discriminator lines", () => {
  const planted = stripComments(`
    // kind === "section" in a comment must not count
    if (node.kind === "section") {}
    if (node.kind !== "section") {}
    const role = resolveBuilderNodeRole(node.id);
    if (node.locked === true) {}
  `);
  assert.equal(countMatches(planted, SECTION_EQ_RE).total, 1);
  assert.equal(countMatches(planted, SECTION_NEQ_RE).total, 1);
  assert.equal(countMatches(planted, ROLE_RE).total, 1);
  assert.equal(countMatches(planted, LOCKED_RE).total, 1);
});

test("self-check: comment-only mentions are stripped", () => {
  const commentOnly = stripComments(`
    /** kind === "section" historically gated chrome */
    // resolveBuilderNodeRole(node.id)
    // node.locked === true
    const x = 1;
  `);
  assert.equal(countMatches(commentOnly, SECTION_EQ_RE).total, 0);
  assert.equal(countMatches(commentOnly, ROLE_RE).total, 0);
  assert.equal(countMatches(commentOnly, LOCKED_RE).total, 0);
});

test("selection-layer discriminator allow-list has not drifted", () => {
  const source = stripComments(readFileSync(SELECTION_LAYER, "utf8"));
  const found = {
    sectionEq: countMatches(source, SECTION_EQ_RE),
    sectionNeq: countMatches(source, SECTION_NEQ_RE),
    resolveBuilderNodeRole: countMatches(source, ROLE_RE),
    lockedProp: countMatches(source, LOCKED_RE),
  };

  const violations: string[] = [];
  const rows: Array<keyof typeof ALLOW_LIST> = [
    "sectionEq",
    "sectionNeq",
    "resolveBuilderNodeRole",
    "lockedProp",
  ];
  for (const key of rows) {
    const allowed = ALLOW_LIST[key];
    const actual = found[key].total;
    if (actual === allowed) continue;
    const direction = actual > allowed ? "GREW" : "SHRANK";
    violations.push(
      `[${direction}] ${key}: allow-list ${allowed}, found ${actual} ` +
        `on line(s) ${found[key].lines.join(", ") || "(none)"}. ` +
        (actual > allowed
          ? "A new inline discriminator landed in selection-layer.tsx. " +
            "Route it through resolveNodeCapabilities, or raise the allow-list " +
            "in this file in the same commit with a reason."
          : "A discriminator was removed. Lower the allow-list in this file " +
            "in the same commit so the reduction is locked in. Do not lower " +
            "it in the capabilities-pin PR; that is the adoption PR's job."),
    );
  }

  assert.equal(
    violations.length,
    0,
    "selection-layer discriminator allow-list drifted:\n\n" +
      violations.join("\n\n"),
  );
});

test("size ratchet neighbor still exists (this PR must not grow selection-layer)", () => {
  const source = readFileSync(SELECTION_LAYER, "utf8");
  const lines = source.split("\n");
  const count = lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
  // Mirror of selection-layer-size-ratchet.static.test.ts budget at pin time.
  // This assertion is a belt: the size ratchet is the real gate. We only
  // refuse to GROW past that recorded budget from this PR's vantage.
  assert.ok(
    count <= 7759,
    `selection-layer.tsx is ${count} lines; the capabilities pin must not grow it.`,
  );
});
