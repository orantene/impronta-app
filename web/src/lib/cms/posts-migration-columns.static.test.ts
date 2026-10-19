/**
 * TUL-1004: the Posts v1 migration (20261231400700) adds the writer columns on cms_posts, creates
 * cms_post_categories, and adds the AI-crawler flag. posts-migration-scope.static.test.ts guards
 * only the tenant/talent scope; this guards the rest of the card's claim, in the SQL text.
 * NOT covered here (needs a database): whether the migration is applied on staging
 * (information_schema check). The card is HOLD: not applied to any DB.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const SQL = readFileSync(
  join(process.cwd(), "..", "supabase", "migrations", "20261231400700_posts_v1_blocks_categories_takedown.sql"),
  "utf8",
);

/** The text of `ALTER TABLE public.<table> ... ;` statements (first match per call). */
function alterBlocks(table: string): string[] {
  return [...SQL.matchAll(new RegExp(`ALTER TABLE public\\.${table}\\b[^;]*;`, "g"))].map((m) => m[0]);
}

describe("Posts v1 migration: cms_posts writer columns (TUL-1004)", () => {
  const cmsPosts = alterBlocks("cms_posts").join("\n");

  for (const [col, type] of [
    ["body_blocks", "jsonb"],
    ["category_id", "uuid"],
    ["is_unlisted", "boolean NOT NULL DEFAULT false"],
    ["expires_at", "timestamptz"],
    ["taken_down_at", "timestamptz"],
    ["taken_down_by", "uuid"],
    ["taken_down_reason", "text"],
  ] as const) {
    it(`adds cms_posts.${col} (${type}), re-runnable`, () => {
      assert.match(cmsPosts, new RegExp(`ADD COLUMN IF NOT EXISTS ${col} ${type.replace(/ /g, "\\s+")}`));
    });
  }

  it("category_id references cms_post_categories and falls back to NULL when a category is deleted", () => {
    assert.match(cmsPosts, /category_id uuid REFERENCES public\.cms_post_categories \(id\) ON DELETE SET NULL/);
  });
});

describe("Posts v1 migration: cms_post_categories (TUL-1004)", () => {
  it("creates the table, tenant and locale scoped, unique per (tenant, locale, slug)", () => {
    const create = SQL.match(/CREATE TABLE IF NOT EXISTS public\.cms_post_categories \([\s\S]*?\n\);/)?.[0] ?? "";
    assert.ok(create, "CREATE TABLE cms_post_categories exists");
    assert.match(create, /locale text NOT NULL CHECK \(locale IN \('en', 'es'\)\)/);
    assert.match(create, /slug text NOT NULL CHECK \(char_length\(trim\(slug\)\) > 0\)/);
    assert.match(create, /name text NOT NULL CHECK \(char_length\(trim\(name\)\) > 0\)/);
    assert.match(create, /UNIQUE \(tenant_id, locale, slug\)/);
  });

  it("has row level security enabled", () => {
    assert.match(SQL, /ALTER TABLE public\.cms_post_categories ENABLE ROW LEVEL SECURITY;/);
  });
});

describe("Posts v1 migration: AI crawler flag (TUL-1004)", () => {
  it("adds ai_crawlers_allowed boolean NOT NULL DEFAULT true to agency_branding and talent_sites", () => {
    for (const table of ["agency_branding", "talent_sites"]) {
      assert.match(
        alterBlocks(table).join("\n"),
        /ADD COLUMN IF NOT EXISTS ai_crawlers_allowed boolean NOT NULL DEFAULT true/,
        table,
      );
    }
  });
});
