/**
 * The ratchet: no NEW Supabase read may throw its error away.
 *
 * `const { data } = await supabase.from(...)` discards the error, and PostgREST
 * does not throw — a missing table, a denied policy and a bad column all arrive
 * as `{ data: null, error }`. Drop the error and every one becomes an empty
 * result that is indistinguishable from success.
 *
 * Four instances of this exact shape have been found in this repo, and not one
 * of them could have been caught by a test, because all four succeeded:
 *
 *   1. `site-shell-backfill-action.ts` read a table that did not exist, so every
 *      seeded workspace shipped an empty nav — silently, since launch.
 *   2. `DirectoryInquiryUrlSync`, the documented "cross-surface fallback", was
 *      mounted only on `/directory`; the cue resolved to nothing everywhere else.
 *   3. 37 seeded section defaults pointed at routes that do not exist.
 *   4. In-page anchors resolved to nothing in every page design.
 *
 * The guard is a per-file ratchet, not a rule, because `src/` already contains
 * over a thousand of these. See supabase-unchecked-read.ts for why it turns both
 * ways and why there is no cleanup sweep.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  type Baseline,
  OK_MARKER,
  blankComments,
  WEB_ROOT,
  countByFile,
  diffAgainstBaseline,
  explainDrift,
  findUncheckedReads,
  scanSource,
} from "./supabase-unchecked-read";

const BASELINE_PATH = join(WEB_ROOT, "src/lib/quality/supabase-unchecked-read.baseline.json");
const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;

test("no file has gained or lost an unchecked Supabase read without the baseline moving", () => {
  const drift = diffAgainstBaseline(scanSource(), baseline);
  assert.deepEqual(
    drift,
    [],
    drift.length === 0
      ? ""
      : `\n\nUnchecked Supabase reads drifted from the baseline:\n\n${explainDrift(drift)}\n\n` +
        `After fixing or annotating, re-record with:\n` +
        `  node scripts/regen-supabase-read-baseline.mjs\n`,
  );
});

test("the baseline describes files that still exist and still have reads", () => {
  const actual = countByFile(scanSource());
  const stale = Object.keys(baseline).filter((f) => !(f in actual));
  assert.deepEqual(
    stale,
    [],
    `\nBaseline names ${stale.length} file(s) with no unchecked reads left. ` +
      `Delete their entries:\n  ${stale.join("\n  ")}\n`,
  );
});

// ── detector self-tests: a ratchet nobody trusts gets suppressed ────────────

test("catches the plain form", () => {
  const src = `const { data } = await supabase.from("t").select("*");`;
  assert.equal(findUncheckedReads(src, "f.ts").length, 1);
});

test("catches the RENAMED form, which is 5x more common than the plain one", () => {
  // Counting the literal string `const { data } = await` finds 187 sites in this
  // repo; counting bindings finds 1,188. A literal-string baseline would have
  // been 84% too low and the guard would have permitted a thousand new ones.
  const src = `const { data: rows } = await supabase.from("t").select("*");`;
  assert.equal(findUncheckedReads(src, "f.ts").length, 1);
});

test("catches a destructure that takes data and something other than error", () => {
  const src = `const { data, count } = await supabase.from("t").select("*", { count: "exact" });`;
  assert.equal(findUncheckedReads(src, "f.ts").length, 1);
});

test("catches a multi-line destructure", () => {
  const src = `const {\n  data: rows,\n} = await supabase.from("t").select("*");`;
  assert.equal(findUncheckedReads(src, "f.ts").length, 1);
});

test("ignores a read that checks its error, however it is named", () => {
  for (const src of [
    `const { data, error } = await supabase.from("t").select("*");`,
    `const { data: rows, error: err } = await supabase.from("t").select("*");`,
    `const { error, data } = await supabase.rpc("f");`,
  ]) {
    assert.equal(findUncheckedReads(src, "f.ts").length, 0, src);
  }
});

test("ignores awaits that are not Supabase reads", () => {
  const src = `const { data } = await axios.get("/x");\nconst { data } = await loadThing();`;
  assert.equal(findUncheckedReads(src, "f.ts").length, 0);
});

test("an annotated read with a reason stops counting", () => {
  const src =
    `// ${OK_MARKER}: a missing row and a failed read both mean "no override",\n` +
    `// and the caller renders the default either way.\n` +
    `const { data } = await supabase.from("overrides").select("*").maybeSingle();`;
  assert.equal(findUncheckedReads(src, "f.ts").length, 0);
});

test("a BARE marker with no reason does NOT silence the guard", () => {
  // The escape hatch exists to make the empty case a decision someone wrote
  // down. A marker with nothing after it is a silencer, not a decision.
  const src = `// ${OK_MARKER}\nconst { data } = await supabase.from("t").select("*");`;
  assert.equal(findUncheckedReads(src, "f.ts").length, 1);
});

test("the marker must be adjacent, so it cannot cover a later read", () => {
  const src =
    `// ${OK_MARKER}: covers the read directly below only.\n` +
    `const { data: a, error } = await supabase.from("t").select("*");\n` +
    `const spacer = 1;\n` +
    `const { data: b } = await supabase.from("u").select("*");`;
  assert.equal(findUncheckedReads(src, "f.ts").length, 1);
});

test("a documented example in a comment is not a read", () => {
  // The guard counted its own doc block before this was fixed. Any explanatory
  // snippet anywhere in src/ would have inflated the baseline, and worse, could
  // have been "fixed" by editing a comment.
  const src =
    `/**\n * const { data } = await supabase.from("t").select("*");\n */\n` +
    `const { data, error } = await supabase.from("t").select("*");`;
  assert.equal(findUncheckedReads(src, "f.ts").length, 0);
});

test("a // inside a string is not a comment", () => {
  const src = `const url = "https://x.test//y";\nconst { data } = await supabase.from("t").select("*");`;
  assert.equal(findUncheckedReads(src, "f.ts").length, 1);
});

test("blanking preserves offsets so reported line numbers stay true", () => {
  const src = `// lead\n/* two\n   lines */\nconst { data } = await supabase.from("t").select("*");`;
  assert.equal(blankComments(src).length, src.length);
  assert.equal(blankComments(src).split("\n").length, src.split("\n").length);
  assert.deepEqual(findUncheckedReads(src, "f.ts"), [{ file: "f.ts", line: 4 }]);
});

test("THE RATCHET BITES: a new read in a baselined file is reported", () => {
  const reads = [
    { file: "src/a.ts", line: 10 },
    { file: "src/a.ts", line: 20 },
  ];
  const drift = diffAgainstBaseline(reads, { "src/a.ts": 1 });
  assert.equal(drift.length, 1);
  assert.equal(drift[0].actual, 2);
  assert.equal(drift[0].expected, 1);
  assert.match(explainDrift(drift), /NEW unchecked Supabase read at line 20/);
});

test("THE RATCHET BITES: a new read in a file with NO baseline entry is reported", () => {
  const drift = diffAgainstBaseline([{ file: "src/brand-new.ts", line: 3 }], {});
  assert.equal(drift.length, 1);
  assert.equal(drift[0].expected, 0);
  assert.match(explainDrift(drift), /NEW unchecked Supabase read/);
});

test("a fix is reported too, so the number cannot drift downward unrecorded", () => {
  const drift = diffAgainstBaseline([], { "src/a.ts": 2 });
  assert.equal(drift.length, 1);
  assert.match(explainDrift(drift), /fixed 2, thank you/);
});
