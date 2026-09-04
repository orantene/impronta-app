/**
 * The guard-of-guards: no NEW static guard may be satisfiable by a comment.
 *
 * A guard that reads a file and asserts a token is PRESENT can be satisfied by a
 * comment mentioning that token. The code it guards can then be deleted and the
 * guard stays green — forever, and unwatched, because green is not looked at.
 * This repo has an incident file about six guards that were green while
 * measuring nothing; this is that shape with a number attached.
 *
 * Baselined, not swept. Eleven files carry it today and they are fixed when next
 * opened for another reason. See guard-reads-source.ts for the triage that
 * separates the exposed shape from the two safe ones.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  type Baseline,
  WEB_ROOT,
  countByFile,
  diffAgainstBaseline,
  explainDrift,
  findExposedAssertions,
  scanTests,
} from "./guard-reads-source";

const BASELINE_PATH = join(WEB_ROOT, "src/lib/quality/guard-reads-source.baseline.json");
const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;

test("no test file has gained a comment-satisfiable assertion", () => {
  const drift = diffAgainstBaseline(scanTests(), baseline);
  assert.deepEqual(
    drift,
    [],
    drift.length === 0
      ? ""
      : `\n\nComment-satisfiable guard assertions drifted:\n\n${explainDrift(drift)}\n\n` +
        `After fixing, re-record with:\n` +
        `  node scripts/regen-guard-reads-source-baseline.mjs\n`,
  );
});

test("the baseline names files that still have exposed assertions", () => {
  const actual = countByFile(scanTests());
  const stale = Object.keys(baseline).filter((f) => !(f in actual));
  assert.deepEqual(stale, [], `\nBaseline names ${stale.length} file(s) with none left:\n  ${stale.join("\n  ")}\n`);
});

// ── detector self-tests: a guard nobody trusts gets suppressed ──────────────

const READS = 'const src = readFileSync(p, "utf8");\n';

test("BITES: a positive assertion on a bare identifier is caught", () => {
  const src = `${READS}assert.ok(src.includes("assertTalentVisibleOnAgencySurface"), "wired");`;
  const found = findExposedAssertions(src, "f.test.ts");
  assert.equal(found.length, 1);
  assert.equal(found[0].token, "assertTalentVisibleOnAgencySurface");
});

test("BITES: an import path counts too — a comment can name a path", () => {
  const src = `${READS}assert.ok(src.includes("./inspectors/animation-panel"));`;
  assert.equal(findExposedAssertions(src, "f.test.ts").length, 1);
});

test("EXEMPT: a file that blanks comments has already made the decision", () => {
  const src =
    `import { blankComments } from "@/lib/quality/supabase-unchecked-read";\n` +
    `const src = blankComments(readFileSync(p, "utf8"));\n` +
    `assert.ok(src.includes("assertTalentVisibleOnAgencySurface"));`;
  assert.deepEqual(findExposedAssertions(src, "f.test.ts"), []);
});

test("SAFE bucket 2: a token carrying a code fragment is not counted", () => {
  // A comment could contain `foo(` but not by accident.
  for (const token of ['assertThing(', 'surface === "agency"', "a = b", "x; y"]) {
    const src = `${READS}assert.ok(src.includes(${JSON.stringify(token)}));`;
    assert.deepEqual(findExposedAssertions(src, "f.test.ts"), [], token);
  }
});

test("SAFE bucket 3: a positional read makes it a windowed check", () => {
  const src =
    `${READS}const start = src.indexOf("export async function View");\n` +
    `const before = src.slice(start - 400, start);\n` +
    `assert.ok(src.includes("assertTalentVisibleOnAgencySurface"));`;
  assert.deepEqual(findExposedAssertions(src, "f.test.ts"), []);
});

test("a NEGATIVE assertion is not counted — it fails loud, not silent", () => {
  // `!src.includes(...)` breaks on a comment too, but main goes red and someone
  // fixes it within the hour. The silent direction is the one this guards.
  const src = `${READS}assert.ok(!src.includes("kind"), "must not gate on kind");`;
  assert.deepEqual(findExposedAssertions(src, "f.test.ts"), []);
});

test("a file that never reads source is ignored", () => {
  const src = `const src = buildFixture();\nassert.ok(src.includes("Thing"));`;
  assert.deepEqual(findExposedAssertions(src, "f.test.ts"), []);
});

test("a variable that is not file text is ignored", () => {
  const src = `${READS}assert.ok(labels.includes("Thing"));`;
  assert.deepEqual(findExposedAssertions(src, "f.test.ts"), []);
});

test("THIS GUARD CANNOT BE TRIPPED BY ITS OWN PROSE", () => {
  // The defect it hunts, written as a comment. If the detector scanned raw text
  // it would count its own documentation — which is the bug, one level up, and
  // is exactly what happened to the unchecked-read detector before it blanked
  // comments.
  const src =
    `${READS}// assert.ok(src.includes("SomeExportedName")) would be exposed here\n` +
    `/* another: assert.ok(src.includes("AnotherName")); */\n` +
    `assert.ok(src.includes("Real("), "carries a paren, bucket 2");`;
  assert.deepEqual(findExposedAssertions(src, "f.test.ts"), []);
});

test("RATCHET BITES: a new assertion in a baselined file is reported", () => {
  const drift = diffAgainstBaseline(
    [
      { file: "src/a.test.ts", line: 3, token: "Foo" },
      { file: "src/a.test.ts", line: 9, token: "Bar" },
    ],
    { "src/a.test.ts": 1 },
  );
  assert.equal(drift.length, 1);
  assert.equal(drift[0].actual, 2);
  assert.match(explainDrift(drift), /can be satisfied by a comment/);
  assert.match(explainDrift(drift), /blankComments/);
});

test("RATCHET BITES: a new file with no baseline entry is reported", () => {
  const drift = diffAgainstBaseline([{ file: "src/new.test.ts", line: 1, token: "Foo" }], {});
  assert.equal(drift.length, 1);
  assert.equal(drift[0].expected, 0);
});

test("a fix is reported too, so the count cannot drift down unrecorded", () => {
  const drift = diffAgainstBaseline([], { "src/a.test.ts": 2 });
  assert.equal(drift.length, 1);
  assert.match(explainDrift(drift), /fixed 2, thank you/);
});
