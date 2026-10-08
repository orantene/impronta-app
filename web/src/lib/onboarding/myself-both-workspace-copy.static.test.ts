import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(process.cwd(), "src");

test("open_studio provision copies offerings/hours after self roster (TUL-453)", () => {
  const src = readFileSync(
    join(root, "lib/server-actions/talent-workspace-provision.ts"),
    "utf8",
  );
  assert.match(src, /copyMyselfOfferingsAndHoursToWorkspace/);
  const rosterAt = src.indexOf("ensureSelfRosterSiteVisible");
  const copyAt = src.indexOf("copyMyselfOfferingsAndHoursToWorkspace(admin");
  assert.ok(rosterAt >= 0 && copyAt > rosterAt, "copy must run after self roster");
});

test("backfill migration exists and only updates, never deletes", () => {
  const mig = readFileSync(
    join(process.cwd(), "../supabase/migrations/20261231350000_tul453_myself_both_offerings_hours.sql"),
    "utf8",
  );
  const sql = mig
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  assert.match(mig, /TUL-453/);
  assert.match(sql, /talent_offerings/);
  assert.match(sql, /opening_hours/);
  assert.match(sql, /\bupdate\b/i);
  assert.doesNotMatch(sql, /\bDELETE\b/i);
  assert.doesNotMatch(sql, /\bDROP\b/i);
});
