import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const MIGRATIONS = join(process.cwd(), "..", "supabase", "migrations");
const read = (name: string) => readFileSync(join(MIGRATIONS, name), "utf8");

const POSTS_V1 = read("20261231400700_posts_v1_blocks_categories_takedown.sql");
const ENFORCE = read("20260601200700_saas_p1_tenant_id_enforce_not_null.sql");

describe("Posts v1 migration: talent-owned rows have a NULL tenant_id", () => {
  it("premise: an earlier migration made tenant_id NOT NULL on cms_posts and cms_redirects", () => {
    assert.match(ENFORCE, /'cms_posts'/);
    assert.match(ENFORCE, /'cms_redirects'/);
    assert.match(ENFORCE, /ALTER COLUMN tenant_id SET NOT NULL/);
  });

  it("drops NOT NULL on all three tables a talent can own rows in", () => {
    for (const table of ["cms_posts", "cms_redirects", "cms_post_categories"]) {
      assert.match(
        POSTS_V1,
        new RegExp(`ALTER TABLE public\\.${table} ALTER COLUMN tenant_id DROP NOT NULL;`),
        `${table}.tenant_id must be nullable or every talent INSERT fails`,
      );
    }
  });

  it("drops NOT NULL BEFORE the scope CHECK on each table", () => {
    for (const [table, check] of [
      ["cms_posts", "cms_posts_scope_present"],
      ["cms_redirects", "cms_redirects_scope_present"],
      ["cms_post_categories", "cms_post_categories_scope_present"],
    ] as const) {
      const drop = POSTS_V1.indexOf(`ALTER TABLE public.${table} ALTER COLUMN tenant_id DROP NOT NULL;`);
      const add = POSTS_V1.indexOf(`ADD CONSTRAINT ${check}`);
      assert.ok(drop >= 0 && add >= 0, `${table}: both statements exist`);
      assert.ok(drop < add, `${table}: DROP NOT NULL comes before ${check}`);
    }
  });

  it("every scoped table keeps a tenant-or-talent CHECK and a talent-side unique index", () => {
    for (const check of ["cms_posts_scope_present", "cms_redirects_scope_present", "cms_post_categories_scope_present"]) {
      assert.match(POSTS_V1, new RegExp(`${check}\\s+CHECK \\(tenant_id IS NOT NULL OR talent_profile_id IS NOT NULL\\)`));
    }
    assert.match(POSTS_V1, /cms_posts_talent_locale_slug_key/);
    assert.match(POSTS_V1, /cms_post_categories_talent_locale_slug_key/);
    assert.match(POSTS_V1, /cms_redirects_talent_old_path_active_key[\s\S]*?WHERE active = true AND talent_profile_id IS NOT NULL/);
  });

  it("is idempotent where it can be (re-runnable on a partly applied database)", () => {
    assert.match(POSTS_V1, /DROP CONSTRAINT IF EXISTS cms_redirects_scope_present/);
    assert.match(POSTS_V1, /CREATE UNIQUE INDEX IF NOT EXISTS cms_redirects_talent_old_path_active_key/);
  });
});
