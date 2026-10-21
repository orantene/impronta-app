/**
 * H2 (TUL-1269 #12): public reads tightened. Static guards, because the routes
 * need a live database to run.
 *
 * Run: node_modules/.bin/tsx --test src/lib/directory/public-reads-tightened.static.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const SRC = resolve(process.cwd(), "src");
const read = (p: string) => readFileSync(resolve(SRC, p), "utf8");

test("talents-by-ids returns approved profiles only and is rate limited", () => {
  const src = read("app/api/directory/talents-by-ids/route.ts");
  assert.match(src, /\.eq\("workflow_status", "approved"\)/, "unapproved profiles must not be returned");
  assert.match(src, /tryConsumeRateLimit\(`directory-by-ids:/, "batch lookup must be rate limited");
});

test("the public ticket page limits lookups per caller before it reads", () => {
  const src = read("app/(public)/ticket/[code]/page.tsx");
  const limit = src.indexOf("tryConsumeRateLimit(`ticket-page:");
  const load = src.indexOf("loadTicketByCode(admin");
  assert.ok(limit > -1, "ticket page needs a rate limit");
  assert.ok(limit < load, "the limit must run before the lookup");
});

test("a held migration tightens sessions_select_public to sellable offerings and published events", () => {
  // applied on fxlank and prod, so it lives in supabase/migrations (not _pending_pm)
  const dir = resolve(process.cwd(), "../supabase/migrations");
  const file = readdirSync(dir).find((f) => /sessions_select_public_tighten/.test(f));
  assert.ok(file, "held migration missing");
  const sql = readFileSync(resolve(dir, file!), "utf8");
  assert.match(sql, /DROP POLICY IF EXISTS sessions_select_public/);
  assert.match(sql, /status = 'scheduled'/);
  assert.match(sql, /moderation_state = 'approved'/);
  assert.match(sql, /e\.status = 'published'/);
  assert.match(sql, /ROLLBACK/i);
});
