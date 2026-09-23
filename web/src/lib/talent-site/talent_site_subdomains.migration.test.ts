/**
 * Static assertions over `20261231280000_talent_site_subdomains.sql`.
 *
 * The migration is the integrity floor for the shared subdomain namespace, and
 * the two things that would hurt most if they silently changed are GRANTS (one
 * function must never reach anon, the other must always reach it) and the
 * TRIGGERS (which are what make the namespace a guarantee rather than a
 * convention). Both are asserted here, in the style of
 * `talent_max_site.migration.test.ts`, so a later edit to the SQL cannot quietly
 * drop them.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATION_PATH = join(
  fileURLToPath(new URL(".", import.meta.url)),
  // four levels up: src/lib/talent-site -> src/lib -> src -> web -> repo root
  "../../../../supabase/migrations/20261231280000_talent_site_subdomains.sql",
);
const MIGRATION = readFileSync(MIGRATION_PATH, "utf8");

test("platform_subdomain_label_taken is a stable SECURITY DEFINER predicate with the documented signature", () => {
  assert.match(
    MIGRATION,
    /create or replace function public\.platform_subdomain_label_taken\(\s*p_label text,\s*p_exclude_talent_profile_id uuid default null,\s*p_exclude_tenant_id uuid default null\s*\)/i,
  );
  assert.match(MIGRATION, /returns boolean[\s\S]{0,200}?security definer/i);
  assert.match(MIGRATION, /set search_path to 'public'/i);
});

test("platform_subdomain_label_taken checks every source of a taken label", () => {
  // agencies.slug
  assert.match(MIGRATION, /from public\.agencies a\s+where lower\(a\.slug\) = v_label/i);
  // the first label of a kind='subdomain' agency host
  assert.match(
    MIGRATION,
    /from public\.agency_domains d\s+where d\.kind = 'subdomain'[\s\S]*split_part\(lower\(d\.hostname\), '\.', 1\) = v_label/i,
  );
  // an unexpired signup reservation
  assert.match(
    MIGRATION,
    /from public\.saas_subdomain_reservations r[\s\S]*r\.expires_at > now\(\)/i,
  );
  // another talent's site slug
  assert.match(
    MIGRATION,
    /from public\.talent_sites ts\s+where lower\(ts\.site_slug\) = v_label/i,
  );
  // reserved platform labels
  assert.match(MIGRATION, /'www', 'api', 'app', 'admin'/i);
});

test("platform_subdomain_label_taken is never executable by anon", () => {
  assert.match(
    MIGRATION,
    /revoke all on function public\.platform_subdomain_label_taken\(text, uuid, uuid\) from public/i,
  );
  assert.match(
    MIGRATION,
    /grant execute on function public\.platform_subdomain_label_taken\(text, uuid, uuid\)\s*to authenticated, service_role/i,
  );
  const grantLines = MIGRATION.split("\n").filter((l) =>
    /grant execute on function public\.platform_subdomain_label_taken/i.test(l),
  );
  for (const line of grantLines) {
    assert.doesNotMatch(line, /\banon\b/i, "the label predicate must not reach anon");
  }
});

test("talent_site_subdomain_lookup mirrors the custom-domain RPC and stays public", () => {
  assert.match(
    MIGRATION,
    /create or replace function public\.talent_site_subdomain_lookup\(p_slug text\)/i,
  );
  assert.match(
    MIGRATION,
    /returns table \(\s*talent_profile_id uuid,\s*site_slug text\s*\)/i,
  );
  assert.match(MIGRATION, /talent_site_subdomain_lookup[\s\S]*?\bstable\b[\s\S]*?security definer/i);
  assert.match(
    MIGRATION,
    /grant execute on function public\.talent_site_subdomain_lookup\(text\) to anon, authenticated/i,
  );
  // The comment is the contract a future grant-lock sweep reads.
  assert.match(
    MIGRATION,
    /comment on function public\.talent_site_subdomain_lookup\(text\) is[\s\S]*INTENTIONAL PUBLIC SURFACE/i,
  );
});

test("talent_site_subdomain_lookup only returns visible, published, non-deleted sites", () => {
  const body = MIGRATION.slice(
    MIGRATION.indexOf("function public.talent_site_subdomain_lookup"),
  );
  assert.match(body, /ts\.site_published_at is not null/i);
  assert.match(body, /tp\.is_publicly_hidden = false/i);
  assert.match(body, /tp\.deleted_at is null/i);
  assert.match(body, /lower\(ts\.site_slug\) = lower\(trim\(coalesce\(p_slug, ''\)\)\)/i);
});

test("site_slug gains the DNS-label CHECK, added NOT VALID", () => {
  assert.match(
    MIGRATION,
    /add constraint talent_sites_site_slug_dns_label[\s\S]*?not valid/i,
  );
  assert.match(
    MIGRATION,
    /site_slug ~ '\^\[a-z0-9\]\(\?:\[a-z0-9-\]\{0,61\}\[a-z0-9\]\)\?\$'/,
  );
  // Never validated in this migration — existing rows are unaudited. (The prose
  // mentions a future VALIDATE CONSTRAINT; what must not exist is the statement.)
  const statements = MIGRATION.split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
  assert.doesNotMatch(statements, /validate constraint/i);
});

test("the namespace is enforced by BEFORE INSERT OR UPDATE triggers on all three write paths", () => {
  for (const [fn, table] of [
    ["talent_sites_subdomain_guard", "public.talent_sites"],
    ["agency_domains_subdomain_guard", "public.agency_domains"],
    ["agencies_slug_subdomain_guard", "public.agencies"],
  ] as const) {
    assert.match(
      MIGRATION,
      new RegExp(`create or replace function public\\.${fn}\\(\\)`, "i"),
      `guard function ${fn} missing`,
    );
    assert.match(
      MIGRATION,
      new RegExp(`drop trigger if exists ${fn} on ${table.replace(".", "\\.")}`, "i"),
      `trigger ${fn} is not idempotent`,
    );
    assert.match(
      MIGRATION,
      new RegExp(
        `create trigger ${fn}\\s+before insert or update on ${table.replace(".", "\\.")}\\s+for each row`,
        "i",
      ),
      `trigger ${fn} is not a BEFORE INSERT OR UPDATE row trigger`,
    );
  }
  // Rejections reuse unique_violation so the app's "23505 -> slug_taken" mapping
  // keeps working without a new error code.
  assert.equal(
    (MIGRATION.match(/using errcode = '23505'/gi) ?? []).length,
    3,
    "each guard must raise SQLSTATE 23505",
  );
});

test("every guard consults the one shared predicate", () => {
  assert.equal(
    (MIGRATION.match(/if public\.platform_subdomain_label_taken\(/g) ?? []).length,
    3,
    "each of the three guards must call the shared predicate",
  );
});
