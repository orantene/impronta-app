/**
 * archive-stale-pages.ts — retire the leftovers from the rebuild.
 *
 * The rebuild left three kinds of clutter in `cms_pages`:
 *   - `*-new` duplicates from the seeding passes
 *   - `untitled-*` rows from editor sessions
 *   - an empty-slug Spanish homepage draft, superseded by the real `home` row
 *
 * ARCHIVE, NEVER DELETE. `status='archived'` keeps the row and its revisions,
 * so a mistake here is a one-column undo rather than a lost page.
 *
 * AND IT REFUSES TO ARCHIVE ANYTHING REACHABLE. Before touching a row it checks
 * the tenant's page roles and every internal href in the published shell. A
 * page that is still linked from the header or footer is skipped and reported,
 * because "tidying" a page that is one click from every page on the site is
 * exactly the kind of cleanup that reads as a site outage.
 *
 * DRY RUN IS THE DEFAULT.
 *
 *   IMPRONTA_SEED_TENANT_SLUG=impronta npx tsx scripts/impronta-rebuild/archive-stale-pages.ts
 *   IMPRONTA_SEED_TENANT_SLUG=impronta npx tsx scripts/impronta-rebuild/archive-stale-pages.ts --apply
 */

import { pathToFileURL } from "node:url";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

interface PageRow {
  id: string;
  slug: string;
  locale: string;
  status: string;
  title: string | null;
  updated_at: string;
}

/** Slug patterns the rebuild is known to have left behind. */
export function isStaleSlug(slug: string): boolean {
  if (slug.endsWith("-new")) return true;
  if (slug.startsWith("untitled-")) return true;
  return false;
}

/** Every internal path referenced by a shell tree, as page slugs. */
export function slugsReferencedByShell(blocks: unknown): Set<string> {
  const slugs = new Set<string>();
  const walk = (value: unknown, key?: string): void => {
    if (Array.isArray(value)) return value.forEach((v) => walk(v));
    if (!value || typeof value !== "object") {
      if (key === "href" && typeof value === "string" && value.startsWith("/")) {
        const path = value.replace(/^\/(es|en)(?=\/|$)/, "");
        const trimmed = path.replace(/^\//, "").replace(/\/$/, "");
        slugs.add(trimmed.startsWith("p/") ? trimmed.slice(2) : trimmed);
      }
      return;
    }
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) walk(v, k);
  };
  walk(blocks);
  return slugs;
}

function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function main() {
  const { loadEnvLocal } = await import("../load-env-local.mjs");
  loadEnvLocal();

  const apply = process.argv.includes("--apply");
  if (!apply) console.log("DRY RUN — no writes will be made.\n");

  const supabase = serviceClient();
  const slug = process.env.IMPRONTA_SEED_TENANT_SLUG ?? "impronta";
  const { data: tenant } = await supabase
    .from("agencies")
    .select("id, settings")
    .eq("slug", slug)
    .maybeSingle<{ id: string; settings: Record<string, unknown> | null }>();
  if (!tenant) throw new Error(`No tenant for slug "${slug}".`);

  // 1. Everything a page role points at is off limits, whatever its slug.
  const roles = (tenant.settings?.pageRoles ?? {}) as Record<string, string | null>;
  const roleSlugs = new Set(Object.values(roles).filter((v): v is string => !!v));

  // 2. So is anything the published shell links to.
  const { data: shells } = await supabase
    .from("cms_pages")
    .select("blocks, published_page_snapshot")
    .eq("tenant_id", tenant.id)
    .eq("system_template_key", "site_shell");
  const linked = new Set<string>();
  for (const shell of shells ?? []) {
    for (const source of [shell.blocks, shell.published_page_snapshot]) {
      slugsReferencedByShell(source).forEach((s) => linked.add(s));
    }
  }

  const { data: pages } = await supabase
    .from("cms_pages")
    .select("id, slug, locale, status, title, updated_at")
    .eq("tenant_id", tenant.id)
    .neq("status", "archived")
    .order("slug");

  const candidates: PageRow[] = [];
  const protectedRows: Array<{ row: PageRow; why: string }> = [];
  for (const row of (pages ?? []) as PageRow[]) {
    const emptySpanishHome =
      row.locale === "es" && row.slug.trim() === "" && row.status === "draft";
    if (!isStaleSlug(row.slug) && !emptySpanishHome) continue;
    if (roleSlugs.has(row.slug)) {
      protectedRows.push({ row, why: "a page role points at it" });
      continue;
    }
    if (linked.has(row.slug)) {
      protectedRows.push({ row, why: "the shell links to it" });
      continue;
    }
    candidates.push(row);
  }

  console.log(`SKIPPED (still reachable): ${protectedRows.length}`);
  for (const { row, why } of protectedRows) {
    console.log(`  ${row.locale}/${row.slug || "(empty)"} — ${why}`);
  }
  console.log(`\nTO ARCHIVE: ${candidates.length}`);
  for (const row of candidates) {
    console.log(
      `  ${row.locale}/${(row.slug || "(empty slug)").padEnd(28)} ${row.status.padEnd(10)} ${String(row.updated_at).slice(0, 10)}  ${row.title ?? ""}`,
    );
  }

  if (!apply) {
    console.log("\nRe-run with --apply to archive these.");
    return;
  }
  if (candidates.length === 0) return;

  const { error } = await supabase
    .from("cms_pages")
    .update({ status: "archived" })
    .in(
      "id",
      candidates.map((row) => row.id),
    );
  if (error) throw new Error(`archive failed: ${error.message}`);
  console.log(`\nArchived ${candidates.length} page(s). Reversible: set status back to 'draft'.`);
}

/**
 * Run ONLY when executed directly.
 *
 * archive-stale-pages.test.ts imports this module for its pure helpers, and a
 * bare `main()` call means importing the module RUNS the script: it reached for
 * service-role credentials and queried the live database from a unit test. It
 * is dry-run by default, so nothing was archived - but a test that talks to
 * production is a test that can stop being harmless, and in CI (no credentials)
 * it simply threw and failed the lane.
 */
const executedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (executedDirectly) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
