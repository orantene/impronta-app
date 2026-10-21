import test from "node:test";
import assert from "node:assert/strict";
import { parseFilename, deriveTitle, extractPr, ageDays, renderApplied, summaryLine, checkTargets } from "./held-migrations-report.mjs";

test("parseFilename splits version and slug, rejects others", () => {
  assert.deepEqual(parseFilename("20261231415400_profiles_no_self.sql"), { version: "20261231415400", slug: "profiles_no_self" });
  assert.equal(parseFilename("README.md"), null);
  assert.equal(parseFilename("2026_x.sql"), null);
});

test("deriveTitle prefers a header comment, skips HELD lines, falls back to slug", () => {
  assert.equal(deriveTitle("a_b", "-- TUL-1344 slice 0: dated places\n--\n-- HELD: x"), "TUL-1344 slice 0: dated places");
  assert.equal(deriveTitle("dated_places", "-- HELD: parked\nselect 1;"), "dated places");
  assert.equal(deriveTitle("plain_slug", "select 1;"), "plain slug");
  assert.equal(deriveTitle("x_y", "-- 20261231415500_x_y.sql\nselect 1;"), "x y");
});

test("extractPr takes the last (#N) in a subject", () => {
  assert.equal(extractPr("P0: profiles (#4023)"), "#4023");
  assert.equal(extractPr("fix (#12) follow-up (#34)"), "#34");
  assert.equal(extractPr("no pr here"), null);
  assert.equal(extractPr(null), null);
});

test("ageDays counts whole days, clamps, handles bad dates", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  assert.equal(ageDays("2026-10-19T01:06:19-05:00", now), 1);
  assert.equal(ageDays("2026-10-20T11:00:00Z", now), 0);
  assert.equal(ageDays("2026-10-25T00:00:00Z", now), 0);
  assert.equal(ageDays("nope", now), null);
  assert.equal(ageDays(null, now), null);
});

test("renderApplied shows applied, NOT applied, and not checked with reason", () => {
  const ok = { checked: true, applied: new Set(["1"]) };
  assert.equal(renderApplied(ok, "1"), "applied");
  assert.equal(renderApplied(ok, "2"), "NOT applied");
  assert.equal(renderApplied({ checked: false, reason: "SUPABASE_ACCESS_TOKEN not set" }, "1"), "not checked (SUPABASE_ACCESS_TOKEN not set)");
});

test("summaryLine reports count and oldest age", () => {
  assert.equal(summaryLine([]), "held migrations: 0");
  assert.equal(summaryLine([{ age: 2 }, { age: 9 }, { age: null }]), "held migrations: 3, oldest 9d");
  assert.equal(summaryLine([{ age: null }]), "held migrations: 1, oldest unknown");
});

test("checkTargets without a token returns not checked and makes no request", async () => {
  const t = await checkTargets(["20261231415400"], {});
  assert.equal(t.prod.checked, false);
  assert.match(renderApplied(t.staging, "x"), /not checked \(SUPABASE_ACCESS_TOKEN not set\)/);
  const off = await checkTargets(["1"], { SUPABASE_ACCESS_TOKEN: "x", HELD_MIGRATIONS_NO_DB: "1" });
  assert.equal(off.staging.checked, false);
});
