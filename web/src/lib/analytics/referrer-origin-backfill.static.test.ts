import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const sql = readFileSync(
  join(process.cwd(), "..", "supabase/migrations/20261231381300_analytics_referrer_origin_backfill.sql"),
  "utf8",
);
const code = sql.replace(/--.*$/gm, "");

test("referrer backfill only touches the referrer key of the two page-view events", () => {
  assert.equal((code.match(/\bUPDATE\b/gi) ?? []).length, 1);
  assert.match(code, /UPDATE public\.analytics_events/);
  assert.doesNotMatch(code, /\b(DELETE|DROP|ALTER|INSERT|TRUNCATE)\b/i);
  assert.match(code, /name IN \('view_site_page', 'view_talent_profile'\)/);
  // only SET target is payload
  assert.equal((code.match(/\bSET\b/gi) ?? []).length, 1);
  assert.match(code, /SET payload = /);
  // every payload mutation names the referrer key
  const jsonbSets = code.match(/jsonb_set\([^,]+,\s*'\{[^}]*\}'/g) ?? [];
  assert.ok(jsonbSets.length >= 1);
  for (const s of jsonbSets) assert.match(s, /'\{referrer\}'/);
  const minus = code.match(/payload\s+-\s+'[^']*'/g) ?? [];
  assert.ok(minus.length >= 1);
  for (const m of minus) assert.match(m, /'referrer'/);
});

test("referrer backfill is idempotent (skips rows already at origin form)", () => {
  assert.match(code, /IS DISTINCT FROM substring/);
  assert.match(code, /payload \? 'referrer'/);
});
