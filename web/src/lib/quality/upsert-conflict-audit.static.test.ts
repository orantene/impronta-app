/**
 * CI guard: no NEW upsert may name an `onConflict` target Postgres cannot infer.
 *
 * A partial unique index cannot be matched by the bare `ON CONFLICT (cols)` that
 * PostgREST emits, and a target matching nothing unique cannot be matched either.
 * Both raise `42P10` while PLANNING, so they fail for every row regardless of
 * data — and no test in this repo reaches a database, so the only symptom is an
 * empty table that looks exactly like a feature nobody has used yet.
 *
 * Ratcheted, not swept: the known ones are baselined and only NEW ones fail.
 *
 * THIS GUARD MEASURES THE MIGRATIONS, NOT THE DATABASE — deliberately, because
 * CI has no database. That means it is measuring what a REBUILT environment
 * would get, which is the conservative direction: `admissions_line_seq_uniq` is
 * total in production today but every migration in this repo creates it partial,
 * so production works and a fresh environment would not.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  type Baseline,
  WEB_ROOT,
  audit,
  classify,
  collectSchema,
  diffAgainstBaseline,
  explainDrift,
  extractUpserts,
  toBaseline,
} from "./upsert-conflict-audit";

const BASELINE_PATH = join(WEB_ROOT, "src/lib/quality/upsert-conflict-audit.baseline.json");
const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;

test("no upsert has gained an uninferable onConflict target", () => {
  const drift = diffAgainstBaseline(audit(), baseline);
  assert.deepEqual(
    drift,
    [],
    drift.length === 0
      ? ""
      : `\n\nonConflict targets drifted:\n\n${explainDrift(drift)}\n\n` +
        `Re-record with:  npx tsx scripts/upsert-conflict-audit.mjs --baseline\n`,
  );
});

test("the scan is looking at something — the repo has upserts and unique indexes", () => {
  const { indexes, tables } = collectSchema();
  assert.ok(indexes.length > 300, `only ${indexes.length} unique indexes parsed — the parser broke`);
  assert.ok(tables.size > 100, `only ${tables.size} tables seen — the CREATE TABLE parser broke`);
  assert.ok(audit().length > 80, "found almost no upserts — the extractor broke");
});

// ── the detector must BITE, or it is a green light measuring nothing ─────────

const IDX = (over: Partial<Parameters<typeof classify>[1][number]> = {}) => [
  { name: "t_a_b_uniq", table: "t", columns: ["a", "b"], partial: false, source: "x.sql", opaque: false, ...over },
];
const CALL = (columns: string[] | null, table: string | null = "t") => ({
  file: "f.ts",
  line: 1,
  table,
  columns,
  raw: "",
});
const TABLES = new Set(["t"]);

test("BITES: a PARTIAL index matching the columns is a finding", () => {
  const f = classify(CALL(["a", "b"]), IDX({ partial: true }), TABLES);
  assert.equal(f?.verdict, "partial");
  assert.match(f!.detail, /42P10/);
});

test("BITES: columns matching nothing unique is a finding", () => {
  const f = classify(CALL(["a", "zzz"]), IDX(), TABLES);
  assert.equal(f?.verdict, "missing");
});

test("a TOTAL index matching the columns is ok, in any column order", () => {
  assert.equal(classify(CALL(["a", "b"]), IDX(), TABLES)?.verdict, "ok");
  assert.equal(classify(CALL(["b", "a"]), IDX(), TABLES)?.verdict, "ok");
});

test("an upsert with NO onConflict is not a finding — it conflicts on the primary key", () => {
  assert.equal(classify(CALL(null), IDX(), TABLES), null);
});

test("a table no migration creates is UNKNOWN, never `missing`", () => {
  // `agency_taxonomy_settings` is in the database with a good unique constraint
  // and is created by no migration in the repo. Calling that "missing" is a
  // confident false accusation, and a guard that makes those gets switched off.
  const f = classify(CALL(["a", "b"], "never_created"), IDX(), TABLES);
  assert.equal(f?.verdict, "unknown");
  assert.match(f!.detail, /predates the migration history/);
});

test("a drop AFTER a create in the SAME file wins, and a create after a drop wins", () => {
  // `20261229000712` drops the partial index and recreates it total in one file.
  // Applying all creates then all drops deleted the index it had just added and
  // reported a fixed writer as still broken.
  const s = collectSchema();
  const idx = s.indexes.find((i) => i.name === "sessions_series_occurrence_uniq");
  assert.ok(idx, "the recreated index vanished — events are not applied in positional order");
  assert.equal(idx!.partial, false, "the TOTAL recreation must win over the earlier partial one");
});

test("the extractor ignores its own prose", () => {
  // This module's header documents the defect with a literal example. A scanner
  // that counts its own documentation is the bug it hunts, one level up.
  const src = `// .from("ghost").upsert(row, { onConflict: "a,b" })\nconst x = 1;`;
  assert.deepEqual(extractUpserts(src, "f.ts"), []);
});

test("the extractor does not borrow a table from an unrelated earlier query", () => {
  const src =
    `await db.from("other").select("*");\n` +
    `const r = await db.from("t").upsert(row, { onConflict: "a,b" });\n`;
  const calls = extractUpserts(src, "f.ts");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, "t");
});

test("a table separated by a statement boundary is not borrowed at all", () => {
  const src = `await db.from("other").select("*");\nawait somethingElse();\nawait x.upsert(row, { onConflict: "a,b" });`;
  assert.equal(extractUpserts(src, "f.ts")[0].table, null);
});

test("every baselined key still corresponds to a real finding", () => {
  const live = new Set(audit().filter((f) => f.verdict !== "ok").map((f) => `${f.file}:${f.line}`));
  const stale = Object.keys(baseline).filter((k) => !live.has(k));
  assert.deepEqual(stale, [], `\nBaseline names ${stale.length} finding(s) that are gone:\n  ${stale.join("\n  ")}\n`);
});

test("BITES: an onConflict that is not a string literal is UNKNOWN, never skipped", () => {
  // `recipient-safety.ts` picks between two indexes at runtime and BOTH are
  // partial. The first version of this scanner matched only literals, so that
  // call fell through to "no onConflict" and was reported as safe. A target we
  // cannot read must be reported as unread.
  const src = `await db.from("t").upsert(row, { onConflict: conflictTarget });`;
  const call = extractUpserts(src, "f.ts")[0];
  assert.equal(call.dynamic, true);
  const f = classify(call, IDX(), TABLES);
  assert.equal(f?.verdict, "unknown");
  assert.match(f!.detail, /computed at runtime/);
});

test("an UNREADABLE site is ratcheted like a broken one", () => {
  // `recipient-safety.ts:364` is a PROVEN 42P10 and lands as `unknown` because its
  // target is computed at runtime. If unknowns stayed out of the baseline, a new
  // unreadable target could be added and the guard would stay green — and the one
  // unreadable target anybody has actually checked turned out to be broken.
  const b = toBaseline([
    { file: "a.ts", line: 1, table: "t", columns: [], verdict: "unknown", detail: "" },
    { file: "b.ts", line: 2, table: "t", columns: ["a"], verdict: "ok", detail: "" },
  ]);
  assert.deepEqual(b, { "a.ts:1": "unknown" });
  assert.equal(diffAgainstBaseline([{ file: "c.ts", line: 3, table: "t", columns: [], verdict: "unknown", detail: "" }], b).length, 2);
});

test("BITES: NULLS NOT DISTINCT between the columns and WHERE does not hide a partial index", () => {
  // Postgres allows NULLS [NOT] DISTINCT / INCLUDE / WITH / TABLESPACE there.
  // Testing for `where` immediately after the paren reads a PARTIAL index as
  // TOTAL — the guard reporting green on the exact defect it exists to catch.
  const dir = mkdtempSync(join(tmpdir(), "idx-"));
  writeFileSync(
    join(dir, "0001_x.sql"),
    `CREATE TABLE public.t (a uuid, b uuid);\n` +
      `CREATE UNIQUE INDEX t_a_b_uniq ON public.t (a, b) NULLS NOT DISTINCT WHERE a IS NOT NULL;\n`,
  );
  const idx = collectSchema(dir).indexes.find((i) => i.name === "t_a_b_uniq");
  assert.equal(idx?.partial, true, "a WHERE after NULLS NOT DISTINCT must still read as PARTIAL");
});

test("BITES: a table named through a wrapper helper resolves, it is not `unknown`", () => {
  // Ten of the twelve "could not resolve the table" sites named the table as a
  // helper argument rather than via `.from()`. Reporting those as unreadable
  // would have sent eight owners to hand-check calls a scanner can resolve,
  // which spends the one thing an `unknown` is for.
  for (const src of [
    `await supportFrom(admin, "support_message_reads").upsert(r, { onConflict: "a,b" });`,
    `await tenantScopedQuery(supabase, "agency_branding", tenantId).upsert(r, { onConflict: "a,b" });`,
  ]) {
    const call = extractUpserts(src, "f.ts")[0];
    assert.ok(call.table, `wrapper table not resolved in: ${src}`);
  }
});

test("an UNRECOGNISED wrapper still falls back to unknown, never to silence", () => {
  const src = `await someNewHelper(admin, "t").upsert(r, { onConflict: "a,b" });`;
  const call = extractUpserts(src, "f.ts")[0];
  assert.equal(call.table, null);
  assert.equal(classify(call, IDX(), TABLES)?.verdict, "unknown");
});
