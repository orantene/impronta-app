import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const sql = readFileSync(
  path.resolve(process.cwd(), "../supabase/migrations/20261231381500_analytics_secret_path_backfill.sql"),
  "utf8",
);
const code = sql.replace(/^--.*$/gm, "");

test("backfill only updates analytics_events", () => {
  const targets = [...code.matchAll(/\bupdate\s+([\w.]+)/gi)].map((m) => m[1]);
  assert.ok(targets.length >= 2);
  for (const t of targets) assert.equal(t, "public.analytics_events");
  assert.doesNotMatch(code, /\b(delete|drop|truncate|alter|insert)\b/i);
});

test("only path and payload url/path/page are set", () => {
  const sets = [...code.matchAll(/\bset\s+(\w+)/gi)].map((m) => m[1]);
  assert.deepEqual([...new Set(sets)].sort(), ["path", "payload"]);
  const keys = [...code.matchAll(/jsonb_build_object\('(\w+)'/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(keys)].sort(), ["page", "path", "url"]);
});

test("only the five secret routes are matched, and already-redacted rows are skipped", () => {
  const routes = [...code.matchAll(/\(\?:([a-z/|]+)\)/g)].map((m) => m[1]).join("|");
  const set = new Set(routes.split("|"));
  assert.deepEqual([...set].sort(), ["api/calendar/feed", "invite", "r", "ticket", "visit"]);
  assert.match(code, /\[\^\/\?#:\]/);
  assert.match(code, /:token/);
  assert.match(code, /:code/);
});
