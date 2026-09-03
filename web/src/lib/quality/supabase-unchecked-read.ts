/**
 * supabase-unchecked-read.ts — the ratchet behind "never destructure `data`
 * without `error`".
 *
 * WHY THIS EXISTS
 * ───────────────
 * `const { data } = await supabase.from("x")...` discards the error. PostgREST
 * does not throw: a missing table, a denied policy, a bad column all come back
 * as `{ data: null, error: {...} }`. Drop the error and every one of those
 * becomes an empty list, which reads as "there is nothing here" and is
 * indistinguishable from success.
 *
 * That is not hypothetical. `site-shell-backfill-action.ts` read a table that
 * did not exist, PostgREST said so, the destructure threw the message away, and
 * every seeded workspace shipped with an empty nav — silently, since launch.
 * The same shape has now been found four times in this repo: dead anchors, a
 * cue reader mounted on one surface, 37 section defaults pointing nowhere, and
 * that nav. None of them could have been caught by a test, because every one of
 * them succeeded.
 *
 * WHY A RATCHET AND NOT A RULE
 * ────────────────────────────
 * There are over a thousand of these in `src/`. A guard that fails on any
 * occurrence is unshippable, and a guard people suppress wholesale is worse than
 * no guard — that is the lesson from the types-drift check that could never
 * reach zero, so nobody read it. This one records a per-file baseline and fails
 * only when a file's count CHANGES.
 *
 * The ratchet is EXACT, not one-directional. Going up fails, because that is a
 * new one. Going down ALSO fails, with an instruction to lower the number in the
 * same commit — otherwise a fix silently donates headroom to the next
 * regression, and the count stops meaning anything. `file-size-ratchet.ts` turns
 * both ways for the same reason.
 *
 * NO SWEEP. A count is not a finding. The unit is one read plus what happens to
 * its empty case, and most of the baselined reads are ones where empty and
 * failed lead to the same correct behaviour. The dangerous subset — where an
 * empty result is written somewhere durable or shown to a visitor — is not
 * mechanically detectable, and gets fixed on sight rather than by audit.
 *
 * WHEN THE READ IS GENUINELY FINE
 * ───────────────────────────────
 * Mark it, on the statement or the line above:
 *
 *   // supabase-read-unchecked-ok: a missing row and a failed read both mean
 *   // "no override", and the caller renders the default either way.
 *   const { data } = await admin.from("overrides").select("*").maybeSingle();
 *
 * An annotated read stops counting. The comment must carry a reason — the point
 * is to make the empty case a decision someone wrote down, not to silence a
 * number. Restructuring code to dodge the detector is the failure mode this
 * escape hatch exists to prevent.
 *
 * This module deliberately does NOT import `node:test`: it takes the registrar
 * as an argument so `tsc` and `next build` treat it as an ordinary source file,
 * matching `file-size-ratchet.ts`.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path to `web/`, derived from this file's own location. */
export const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** Opt-out marker. Must be followed by a reason. */
export const OK_MARKER = "supabase-read-unchecked-ok";

/**
 * Calls that make a destructure a SUPABASE read rather than any other promise.
 * Deliberately narrow: `.select()` alone matches too many unrelated builders,
 * and a false positive here costs someone a red build for no reason.
 */
const SUPABASE_CALL = /\.(from|rpc|storage|functions)\s*\(|\.auth\./;

export type UncheckedRead = {
  /** Path relative to `web/`, forward-slashed. */
  file: string;
  line: number;
};

function isSourceFile(name: string): boolean {
  return /\.tsx?$/.test(name) && !/\.d\.ts$/.test(name);
}

function walk(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (isSourceFile(entry)) out.push(full);
  }
  return out;
}

/**
 * The destructure body binds `name`, whether plain (`data`) or renamed
 * (`data: rows`). Matching on the BINDING and not on a literal string is the
 * whole point: `const { data: rows } = await` is five times more common in this
 * repo than `const { data } = await`, so a literal-string count misses most of
 * the population and baselines a number that is 84% too low.
 */
function bindsName(destructureBody: string, name: string): boolean {
  return new RegExp(`(^|[,{\\s])${name}\\s*(?::|,|=|\\}|$)`).test(destructureBody);
}

/** Statement text from `start` to the terminating `;` at bracket depth zero. */
function statementFrom(source: string, start: number): string {
  let depth = 0;
  const limit = Math.min(source.length, start + 4000);
  for (let i = start; i < limit; i++) {
    const ch = source[i];
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    else if (ch === ";" && depth <= 0) return source.slice(start, i);
  }
  return source.slice(start, limit);
}

/** Index of the `}` matching the `{` at `openIndex`, or -1. */
function matchingBrace(source: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

const COMMENT_LINE = /^\s*(\/\/|\*|\/\*)/;

/**
 * True when the read carries an annotated opt-out on its own line or anywhere in
 * the contiguous comment block directly above it.
 *
 * The block, not just one line: a reason worth writing usually wraps, and a
 * guard that only reads the last line of an explanation teaches people to write
 * one-line explanations.
 */
function hasOptOut(source: string, matchIndex: number): boolean {
  const lines = source.slice(0, matchIndex).split("\n");
  const own = source.slice(source.lastIndexOf("\n", matchIndex) + 1, source.indexOf("\n", matchIndex) + 1 || undefined);
  const block: string[] = [own];
  for (let i = lines.length - 2; i >= 0; i--) {
    if (!COMMENT_LINE.test(lines[i])) break;
    block.push(lines[i]);
  }
  const window = block.join("\n");
  if (!window.includes(OK_MARKER)) return false;
  // A bare marker is not an opt-out; it has to say why.
  return new RegExp(`${OK_MARKER}\\s*:\\s*\\S`).test(window);
}

/**
 * Replace every comment with spaces, preserving length and newlines.
 *
 * Without this the detector counts its OWN documentation: an example read in a
 * doc block is not a read. It matters beyond this file — any explanatory snippet
 * anywhere in `src/` would otherwise inflate the baseline and, worse, could be
 * "fixed" by someone editing a comment.
 *
 * String literals are tracked so a `//` inside a URL is not mistaken for a
 * comment. Offsets are preserved so reported line numbers stay true.
 */
export function blankComments(source: string): string {
  const out = source.split("");
  let i = 0;
  const n = source.length;
  while (i < n) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i++;
      while (i < n) {
        if (source[i] === "\\") { i += 2; continue; }
        if (source[i] === quote) { i++; break; }
        i++;
      }
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < n && source[i] !== "\n") { out[i] = " "; i++; }
      continue;
    }
    if (ch === "/" && next === "*") {
      out[i] = " "; out[i + 1] = " "; i += 2;
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) {
        if (source[i] !== "\n") out[i] = " ";
        i++;
      }
      if (i < n) { out[i] = " "; out[i + 1] = " "; i += 2; }
      continue;
    }
    i++;
  }
  return out.join("");
}

/** Every Supabase read in `source` that throws its error away. */
export function findUncheckedReads(source: string, file: string): UncheckedRead[] {
  const found: UncheckedRead[] = [];
  // Reads are located in the comment-free view; opt-out markers are read from
  // the ORIGINAL, because a marker lives in a comment by definition.
  const code = blankComments(source);
  const re = /const\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    const openBrace = m.index + m[0].length - 1;
    const closeBrace = matchingBrace(code, openBrace);
    if (closeBrace < 0) continue;
    const body = code.slice(openBrace + 1, closeBrace);
    if (!/^\s*=\s*await\b/.test(code.slice(closeBrace + 1, closeBrace + 40))) continue;
    if (!bindsName(body, "data")) continue;
    if (bindsName(body, "error")) continue;
    if (!SUPABASE_CALL.test(statementFrom(code, closeBrace + 1))) continue;
    if (hasOptOut(source, m.index)) continue;
    found.push({ file, line: source.slice(0, m.index).split("\n").length });
  }
  return found;
}

/** Scan `web/src`, skipping test files: a swallowed error in a test never ships. */
export function scanSource(root = join(WEB_ROOT, "src")): UncheckedRead[] {
  const out: UncheckedRead[] = [];
  for (const abs of walk(root, [])) {
    if (/\.test\.tsx?$/.test(abs)) continue;
    const rel = relative(WEB_ROOT, abs).split(sep).join("/");
    out.push(...findUncheckedReads(readFileSync(abs, "utf8"), rel));
  }
  return out;
}

/** `{ "src/lib/x.ts": 3, … }` — one entry per file that still has any. */
export type Baseline = Record<string, number>;

export function countByFile(reads: readonly UncheckedRead[]): Baseline {
  const counts: Baseline = {};
  for (const r of reads) counts[r.file] = (counts[r.file] ?? 0) + 1;
  return counts;
}

export type Drift = {
  file: string;
  expected: number;
  actual: number;
  lines: number[];
};

/** Files whose count differs from the baseline, in either direction. */
export function diffAgainstBaseline(reads: readonly UncheckedRead[], baseline: Baseline): Drift[] {
  const actual = countByFile(reads);
  const drift: Drift[] = [];
  for (const file of new Set([...Object.keys(actual), ...Object.keys(baseline)])) {
    const expected = baseline[file] ?? 0;
    const got = actual[file] ?? 0;
    if (expected !== got) {
      drift.push({
        file,
        expected,
        actual: got,
        lines: reads.filter((r) => r.file === file).map((r) => r.line),
      });
    }
  }
  return drift.sort((a, b) => a.file.localeCompare(b.file));
}

export function explainDrift(drift: readonly Drift[]): string {
  return drift
    .map((d) => {
      if (d.actual > d.expected) {
        return (
          `  ${d.file}: ${d.expected} → ${d.actual} (NEW unchecked Supabase read at line ` +
          `${d.lines.slice(-(d.actual - d.expected)).join(", ")})\n` +
          `      Destructure \`error\` and act on it. PostgREST does not throw — a missing table,\n` +
          `      a denied policy and a bad column all arrive as data:null, so dropping the error\n` +
          `      turns every one of them into an empty result that reads as success.\n` +
          `      If empty and failed genuinely mean the same thing here, annotate it:\n` +
          `        // ${OK_MARKER}: <why the caller cannot act on the error>`
        );
      }
      return (
        `  ${d.file}: ${d.expected} → ${d.actual} (fixed ${d.expected - d.actual}, thank you)\n` +
        `      Lower the number in the baseline in this SAME commit, or the slack becomes\n` +
        `      headroom for the next regression and the ratchet stops ratcheting.`
      );
    })
    .join("\n\n");
}
