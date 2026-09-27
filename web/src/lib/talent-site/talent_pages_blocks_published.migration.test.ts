import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const MIGRATION = readFileSync(
  join(
    fileURLToPath(new URL(".", import.meta.url)),
    "../../../../supabase/migrations/20261231289000_talent_pages_blocks_published.sql",
  ),
  "utf8",
);

test("adds the live page body column, nullable and additive", () => {
  assert.match(MIGRATION, /alter table public\.talent_pages\s+add column if not exists blocks_published jsonb;/i);
  assert.doesNotMatch(MIGRATION, /drop column|not null default/i);
});

test("backfills only already-published pages, so every live page keeps its current body", () => {
  assert.match(
    MIGRATION,
    /update public\.talent_pages\s+set blocks_published = blocks\s+where status = 'published'\s+and blocks_published is null/i,
  );
});

test("pauses the autosave-revision trigger only around the backfill, and turns it back on", () => {
  const off = MIGRATION.search(/disable trigger talent_pages_autosave/i);
  const upd = MIGRATION.search(/update public\.talent_pages/i);
  const on = MIGRATION.search(/enable trigger talent_pages_autosave/i);
  assert.ok(off >= 0 && upd > off && on > upd);
});

test("does not snapshot theme: the design slice has its own draft/live split", () => {
  assert.doesNotMatch(MIGRATION, /add column if not exists theme_published/i);
});
