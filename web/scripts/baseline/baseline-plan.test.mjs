import test from "node:test";
import assert from "node:assert/strict";
import {
  BaselinePlanError,
  parseBaselineVersion,
  parseMigrations,
  planBaseline,
} from "./baseline-plan.mjs";

const files = [
  "20260101000000_a.sql",
  "20260201000000_b.sql",
  "20260301000000_c.sql",
  "_pending_stripe",
  "notes.md",
];
const ok = { migrationFiles: files, baselineVersionText: "20260201000000\n", baselineSqlBytes: 10 };

test("parseMigrations keeps only versioned sql files, sorted", () => {
  const out = parseMigrations(["20260301000000_c.sql", "x.sql", "20260101000000_a.sql"]);
  assert.deepEqual(out.map((m) => m.version), ["20260101000000", "20260301000000"]);
});

test("splits covered (<= V) and replay (> V)", () => {
  const p = planBaseline(ok);
  assert.deepEqual(p.covered.map((m) => m.version), ["20260101000000", "20260201000000"]);
  assert.deepEqual(p.replay.map((m) => m.name), ["20260301000000_c.sql"]);
  assert.match(p.notCheckableOffline, /already folded/);
});

test("V equal to the newest migration leaves an empty replay list", () => {
  const p = planBaseline({ ...ok, baselineVersionText: "20260301000000" });
  assert.equal(p.replay.length, 0);
});

test("refuses when baseline files are missing", () => {
  assert.throws(
    () => planBaseline({ ...ok, baselineSqlBytes: null, baselineVersionText: null }),
    (e) =>
      e instanceof BaselinePlanError &&
      /baseline\.schema\.sql/.test(e.message) &&
      /BASELINE_VERSION/.test(e.message),
  );
});

test("refuses an empty dump", () => {
  assert.throws(() => planBaseline({ ...ok, baselineSqlBytes: 0 }), /empty/);
});

test("refuses a V that is not in supabase/migrations", () => {
  assert.throws(() => planBaseline({ ...ok, baselineVersionText: "20260215000000" }), /not a version/);
});

test("BASELINE_VERSION must be one 14-digit line", () => {
  assert.throws(() => parseBaselineVersion("abc"), /14-digit/);
  assert.throws(() => parseBaselineVersion("20260101000000\n20260201000000"), /exactly one/);
  assert.throws(() => parseBaselineVersion(""), /exactly one/);
  assert.equal(parseBaselineVersion(" 20260101000000 \n"), "20260101000000");
});

test("reports duplicate versions", () => {
  const p = planBaseline({ ...ok, migrationFiles: [...files, "20260301000000_d.sql"] });
  assert.deepEqual(p.duplicateVersions, ["20260301000000"]);
});
