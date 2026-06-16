import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATION_PATH = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../supabase/migrations/20261030000000_talent_max_site.sql",
);
const MIGRATION = readFileSync(MIGRATION_PATH, "utf8");

test("talent_max_site migration adds the talent_sites SITE columns + unique slug index", () => {
  assert.match(MIGRATION, /alter table public\.talent_sites\s+add column if not exists site_slug text/i);
  assert.match(MIGRATION, /add column if not exists shell_tree jsonb/i);
  assert.match(MIGRATION, /add column if not exists shell_published jsonb/i);
  assert.match(MIGRATION, /add column if not exists logo_url text/i);
  assert.match(MIGRATION, /add column if not exists site_published_at timestamptz/i);
  assert.match(
    MIGRATION,
    /create unique index if not exists talent_sites_site_slug_key[\s\S]*where site_slug is not null/i,
  );
});

test("talent_max_site migration extends talent_pages with home/sort/nav + one-home index", () => {
  assert.match(MIGRATION, /add column if not exists is_home boolean not null default false/i);
  assert.match(MIGRATION, /add column if not exists sort_order integer not null default 0/i);
  assert.match(MIGRATION, /add column if not exists nav_label text/i);
  assert.match(
    MIGRATION,
    /create unique index if not exists talent_pages_one_home_per_profile[\s\S]*where is_home = true/i,
  );
});

test("talent_max_site migration creates talent_site_domains with the agency status vocabulary", () => {
  assert.match(MIGRATION, /create table if not exists public\.talent_site_domains/i);
  for (const status of [
    "pending",
    "dns_verification_sent",
    "verified",
    "ssl_provisioned",
    "active",
    "error",
  ]) {
    assert.match(MIGRATION, new RegExp(`'${status}'`), `status ${status} missing`);
  }
  assert.match(MIGRATION, /create unique index if not exists talent_site_domains_domain_key/i);
  assert.match(
    MIGRATION,
    /create unique index if not exists talent_site_domains_one_primary_per_profile[\s\S]*where is_primary = true/i,
  );
});

test("talent_site_domains is RLS-gated owner-only read + owner+Max writes", () => {
  assert.match(MIGRATION, /alter table public\.talent_site_domains enable row level security/i);
  assert.match(MIGRATION, /talent_site_domains_owner_select[\s\S]*is_talent_profile_owner\(talent_profile_id\)/i);
  // Each write policy requires BOTH owner AND Max.
  for (const pol of [
    "talent_site_domains_owner_max_insert",
    "talent_site_domains_owner_max_update",
    "talent_site_domains_owner_max_delete",
  ]) {
    assert.match(MIGRATION, new RegExp(pol, "i"), `policy ${pol} missing`);
  }
  assert.match(MIGRATION, /talent_profile_has_max\(talent_profile_id\)/i);
});

test("talent_max_site migration exposes the host-lookup RPC to anon", () => {
  assert.match(MIGRATION, /create or replace function public\.talent_site_domain_lookup\(p_host text\)/i);
  assert.match(MIGRATION, /security definer/i);
  assert.match(
    MIGRATION,
    /grant execute on function public\.talent_site_domain_lookup\(text\) to anon, authenticated/i,
  );
});
