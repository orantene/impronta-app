/**
 * guard-reads-source.ts — the guard that stops a guard being satisfied by a comment.
 *
 * WHY
 * ───
 * A static guard that reads a file with `readFileSync` and asserts a token is
 * PRESENT can be satisfied by a COMMENT mentioning that token. It then reports
 * green while measuring nothing — forever, and nobody looks, because it is green.
 *
 * That is not the loud failure. A guard asserting a token is ABSENT breaks on a
 * comment too, but loudly: main goes red, someone fixes it within the hour. The
 * Orders & Checkout Manager hit that four times in one night. The quiet one is
 * worse and had no attention on it at all:
 *
 *   assert.ok(src.includes("assertTalentVisibleOnAgencySurface"), …)
 *
 * A doc comment naming that function satisfies it. The call can be deleted and
 * the guard stays green, which is the six-guards incident this repo already has
 * a file about.
 *
 * WORSE THAN A FALSE RED: a false red can be "fixed" by editing a comment, which
 * leaves the guard green and teaches whoever did it that the way to satisfy a
 * guard is to stop describing the bug. A guard that punishes documentation gets
 * the codebase it deserves.
 *
 * WHAT THIS COUNTS
 * ────────────────
 * Only the fully-exposed shape, because a count that includes the safe cases is
 * a number rather than a finding:
 *
 *   bucket 1  assert.ok(src.includes("BareIdentifier"))   ← COUNTED
 *             a prose mention satisfies it outright
 *   bucket 2  …includes("foo(") / ("x = y")               ← not counted
 *             needs a comment carrying a code fragment; possible, not accidental
 *   bucket 3  positional: indexOf(...) then slice(±400)   ← not counted
 *             needs the token inside a named function with a nearby condition
 *
 * Triage by assertion SHAPE was the Director's, and it collapsed 56 raw
 * assertions to 29 genuinely exposed ones across 11 files.
 *
 * THE FIX, wherever this fires: wrap the read.
 *
 *   import { blankComments } from "@/lib/quality/supabase-unchecked-read";
 *   const src = blankComments(readFileSync(path, "utf8"));
 *
 * `blankComments` preserves offsets so reported line numbers stay true, and
 * tracks string literals so a `//` inside a URL is not treated as a comment.
 * Do not hand-roll a second one — two implementations of the same text rule is
 * the shape this repo spent a night removing from its zone resolver.
 *
 * A RATCHET, NOT A RULE. Eleven files carry this today. Twenty-one PRs touching
 * unrelated files at once is unreviewable, and a change nobody can review is not
 * a safe change. So the existing ones are baselined and only NEW ones fail; each
 * gets fixed when its file is next opened for another reason.
 *
 * Deliberately does NOT import `node:test`, so `tsc` and `next build` treat it
 * as an ordinary module — matching `file-size-ratchet.ts`.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { WEB_ROOT, blankComments } from "./supabase-unchecked-read";

export { WEB_ROOT };

/** Variable names that plainly hold the text of a file this test just read. */
const SOURCE_VARS = new Set([
  "src",
  "source",
  "body",
  "text",
  "contents",
  "file",
  "sql",
  "raw",
  "code",
  "migration",
]);

/**
 * A bare identifier or import path: no parens, no operators, no spaces. This is
 * the shape a comment can satisfy by simply naming the thing.
 */
const BARE_TOKEN = /^[\w./@-]+$/;

export type ExposedAssertion = {
  /** Path relative to `web/`, forward-slashed. */
  file: string;
  line: number;
  /** The literal the assertion looks for. */
  token: string;
};

function walk(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Positive assertions on a bare token, in a file that reads source and does not
 * blank comments first.
 *
 * A file that imports `blankComments` is exempt outright: it has already made
 * the decision this guard exists to prompt.
 */
export function findExposedAssertions(source: string, file: string): ExposedAssertion[] {
  if (!source.includes("readFileSync")) return [];
  if (source.includes("blankComments")) return [];

  // Scan the comment-free view, so this guard cannot be tripped — or satisfied —
  // by its own explanatory prose. That is the exact defect it is guarding.
  const code = blankComments(source);
  const found: ExposedAssertion[] = [];
  const re = /assert\.ok\(\s*(\w+)\s*\.includes\(\s*(['"`])(.*?)\2/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    const [, variable, , token] = m;
    if (!SOURCE_VARS.has(variable.toLowerCase())) continue;
    if (!BARE_TOKEN.test(token)) continue; // bucket 2: carries a code fragment
    // Bucket 3: a positional read just above turns this into a windowed check.
    const preceding = code.slice(Math.max(0, m.index - 600), m.index);
    if (/\.(indexOf|slice|substring)\s*\(/.test(preceding)) continue;
    found.push({ file, line: code.slice(0, m.index).split("\n").length, token });
  }
  return found;
}

export function scanTests(root = join(WEB_ROOT, "src")): ExposedAssertion[] {
  const out: ExposedAssertion[] = [];
  for (const abs of walk(root, [])) {
    const rel = relative(WEB_ROOT, abs).split(sep).join("/");
    out.push(...findExposedAssertions(readFileSync(abs, "utf8"), rel));
  }
  return out;
}

export type Baseline = Record<string, number>;

export function countByFile(found: readonly ExposedAssertion[]): Baseline {
  const counts: Baseline = {};
  for (const f of found) counts[f.file] = (counts[f.file] ?? 0) + 1;
  return counts;
}

export type Drift = { file: string; expected: number; actual: number; tokens: string[] };

export function diffAgainstBaseline(
  found: readonly ExposedAssertion[],
  baseline: Baseline,
): Drift[] {
  const actual = countByFile(found);
  const drift: Drift[] = [];
  for (const file of new Set([...Object.keys(actual), ...Object.keys(baseline)])) {
    const expected = baseline[file] ?? 0;
    const got = actual[file] ?? 0;
    if (expected !== got) {
      drift.push({
        file,
        expected,
        actual: got,
        tokens: found.filter((f) => f.file === file).map((f) => f.token),
      });
    }
  }
  return drift.sort((a, b) => a.file.localeCompare(b.file));
}

export function explainDrift(drift: readonly Drift[]): string {
  return drift
    .map((d) =>
      d.actual > d.expected
        ? `  ${d.file}: ${d.expected} → ${d.actual}\n` +
          `      A NEW assertion here can be satisfied by a comment naming the token,\n` +
          `      so the guard would report green with the code it guards deleted.\n` +
          `      Looking for: ${d.tokens.map((t) => `"${t}"`).join(", ")}\n` +
          `      Fix: const src = blankComments(readFileSync(path, "utf8"));\n` +
          `           import { blankComments } from "@/lib/quality/supabase-unchecked-read";`
        : `  ${d.file}: ${d.expected} → ${d.actual} (fixed ${d.expected - d.actual}, thank you)\n` +
          `      Lower the number in the baseline in this SAME commit, or the slack\n` +
          `      becomes headroom for the next one.`,
    )
    .join("\n\n");
}
