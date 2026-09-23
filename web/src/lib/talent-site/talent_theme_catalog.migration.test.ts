import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATION_PATH = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../../supabase/migrations/20261231278000_talent_theme_catalog.sql",
);
const MIGRATION = readFileSync(MIGRATION_PATH, "utf8");

test("talent_theme_catalog table carries the plan's columns + checks", () => {
  assert.match(MIGRATION, /create table if not exists public\.talent_theme_catalog/i);
  assert.match(MIGRATION, /kind text not null\s+check \(kind in \('design', 'look'\)\)/i);
  assert.match(
    MIGRATION,
    /required_talent_tier text not null default 'talent_portfolio'\s+check \(required_talent_tier in \('talent_basic', 'talent_pro', 'talent_portfolio'\)\)/i,
  );
  assert.match(MIGRATION, /check \(status in \('draft', 'published', 'archived'\)\)/i);
  assert.match(MIGRATION, /check \(source in \('builtin', 'authored'\)\)/i);
  for (const col of [
    "slug text not null",
    "title text not null",
    "summary text",
    "category text",
    "tags text\\[\\]",
    "payload jsonb not null",
    "preview jsonb not null",
    "version integer not null",
    "schema_version integer not null",
    "sort_order integer not null",
    "is_new_until timestamptz",
    "created_by uuid",
    "updated_by uuid",
    "created_at timestamptz not null",
    "updated_at timestamptz not null",
  ]) {
    assert.match(MIGRATION, new RegExp(col, "i"), `column ${col} missing`);
  }
  assert.match(
    MIGRATION,
    /create unique index if not exists talent_theme_catalog_kind_slug_key\s+on public\.talent_theme_catalog \(kind, slug\)/i,
  );
});

test("talent_theme_catalog RLS: published-only read for anon + authenticated, no write policy", () => {
  assert.match(MIGRATION, /alter table public\.talent_theme_catalog enable row level security/i);
  assert.match(
    MIGRATION,
    /create policy talent_theme_catalog_published_read[\s\S]*for select\s+to anon, authenticated\s+using \(status = 'published'\)/i,
  );
  // Service role is the only writer: no insert / update / delete / all policy.
  const policies = MIGRATION.match(/create policy[\s\S]*?;/gi) ?? [];
  assert.equal(policies.length, 1, "exactly one (read) policy");
  assert.doesNotMatch(MIGRATION, /for (insert|update|delete|all)\b/i);
});

test("talent_sites gains the site-level theme columns (idempotent, safe defaults)", () => {
  for (const col of [
    "theme_design_slug text",
    "theme_design_version integer",
    "theme_look_slug text",
    "design_tokens jsonb not null default '\\{\\}'::jsonb",
    "design_tokens_draft jsonb not null default '\\{\\}'::jsonb",
    "theme_version integer not null default 0",
    "site_created_via text",
    "site_created_at timestamptz",
  ]) {
    assert.match(
      MIGRATION,
      new RegExp(`alter table public\\.talent_sites\\s+add column if not exists ${col}`, "i"),
      `talent_sites.${col} missing`,
    );
  }
  assert.match(MIGRATION, /site_created_via in \('wizard', 'manager', 'legacy'\)/i);
});

test("migration is additive: no drops of tables/columns, no destructive DML", () => {
  assert.doesNotMatch(MIGRATION, /drop table/i);
  assert.doesNotMatch(MIGRATION, /drop column/i);
  assert.doesNotMatch(MIGRATION, /\bdelete from\b/i);
  assert.doesNotMatch(MIGRATION, /\bupdate public\.talent_sites\b/i);
});
