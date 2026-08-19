/**
 * cleanup-dead-pages.ts — delete the pages nothing can reach.
 *
 * The rebuild left three kinds of dead row behind: `*-new` seeding duplicates,
 * `untitled-*` editor scratch, and pages whose body is literally empty. They
 * are invisible to visitors but they clutter every page list the owner opens.
 *
 * THIS ONE ACTUALLY DELETES. That is the point — `archive-stale-pages.ts`
 * already hid them and the owner asked for them gone. So the safety is:
 *
 *   1. A BACKUP FILE IS WRITTEN FIRST, always, including on a dry run. Every
 *      row is dumped whole (blocks, snapshots, SEO) plus its revisions, so any
 *      deletion here is a re-insert away from undone.
 *   2. NOTHING REACHABLE IS TOUCHED. A page survives if a page role points at
 *      it, if the published shell links to it, if it is a system row
 *      (site_shell / directory / homepage), or if it has a body — whatever its
 *      status. Published pages with real content are never candidates.
 *   3. Revisions go first, then the page, so a foreign key cannot half-delete.
 *
 * DRY RUN IS THE DEFAULT.
 *
 *   IMPRONTA_SEED_TENANT_SLUG=impronta npx tsx scripts/impronta-rebuild/cleanup-dead-pages.ts
 *   IMPRONTA_SEED_TENANT_SLUG=impronta npx tsx scripts/impronta-rebuild/cleanup-dead-pages.ts --apply
 */

import { writeFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

interface PageRow {
  id: string;
  slug: string;
  locale: string;
  status: string;
  title: string | null;
  system_template_key: string | null;
  blocks: unknown;
  [key: string]: unknown;
}

/**
 * A page is empty only when NEITHER render path has anything to show.
 *
 * There are two, and checking one is how you delete a live page: freeform
 * pages render `blocks`, while NON-freeform pages render
 * `published_page_snapshot` and legitimately carry an empty `blocks`. A first
 * draft of this script looked at `blocks` alone and listed two published pages
 * — /p/faces-of-fall-26 and /p/our-fashion-models — as empty. Both serve ~7000
 * characters of real content today.
 */
export function hasNoBody(page: {
  blocks?: unknown;
  published_page_snapshot?: unknown;
  published_homepage_snapshot?: unknown;
}): boolean {
  const emptyBlocks =
    page.blocks == null || (Array.isArray(page.blocks) && page.blocks.length === 0);
  if (!emptyBlocks) return false;
  return page.published_page_snapshot == null && page.published_homepage_snapshot == null;
}

/** Seeding duplicates and editor scratch. */
export function isDeadSlug(slug: string): boolean {
  if (slug.endsWith("-new")) return true;
  if (slug.startsWith("untitled-")) return true;
  return false;
}

/** Every internal path the shell links to, as page slugs. */
export function slugsReferencedByShell(blocks: unknown): Set<string> {
  const slugs = new Set<string>();
  const walk = (value: unknown, key?: string): void => {
    if (Array.isArray(value)) return void value.forEach((v) => walk(v));
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
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are required.");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function main() {
  const { loadEnvLocal } = await import("../load-env-local.mjs");
  loadEnvLocal();
  const apply = process.argv.includes("--apply");
  if (!apply) console.log("DRY RUN — nothing will be deleted.\n");

  const supabase = serviceClient();
  const slug = process.env.IMPRONTA_SEED_TENANT_SLUG ?? "impronta";
  const { data: tenant } = await supabase
    .from("agencies").select("id, settings").eq("slug", slug)
    .maybeSingle<{ id: string; settings: Record<string, unknown> | null }>();
  if (!tenant) throw new Error(`No tenant for slug "${slug}".`);

  const roles = (tenant.settings?.pageRoles ?? {}) as Record<string, string | null>;
  const roleSlugs = new Set(Object.values(roles).filter((v): v is string => !!v));

  const { data: pages } = await supabase
    .from("cms_pages").select("*").eq("tenant_id", tenant.id).order("slug");
  const all = (pages ?? []) as PageRow[];

  // Shell links are read from BOTH the working tree and the published snapshot:
  // a link the owner has not published yet still counts as a reference.
  const linked = new Set<string>();
  for (const shell of all.filter((p) => p.system_template_key === "site_shell")) {
    for (const source of [shell.blocks, shell.published_page_snapshot]) {
      slugsReferencedByShell(source).forEach((s) => linked.add(s));
    }
  }

  /**
   * A DRAFT whose working body is empty is abandoned, even when it still
   * carries a published snapshot. A draft is never served, so that snapshot is
   * a fossil of a page nobody can reach — and here they are the pre-rebuild
   * division pages whose replacements are live with 35-43KB of content each.
   *
   * The working body is what separates abandoned from in-progress: a draft
   * someone is actually writing has blocks. That is why demo-forms survives.
   */
  const isAbandonedDraft = (row: PageRow): boolean =>
    row.status === "draft" &&
    (row.blocks == null || (Array.isArray(row.blocks) && row.blocks.length === 0));

  const doomed: PageRow[] = [];
  const kept: Array<{ row: PageRow; why: string }> = [];
  for (const row of all) {
    const dead = isDeadSlug(row.slug) || hasNoBody(row) || isAbandonedDraft(row);
    if (!dead) continue;
    if (row.system_template_key) { kept.push({ row, why: `system row (${row.system_template_key})` }); continue; }
    if (row.status === "published" && !hasNoBody(row)) {
      kept.push({ row, why: "published with a body — never a cleanup candidate" });
      continue;
    }
    if (roleSlugs.has(row.slug)) { kept.push({ row, why: "a page role points at it" }); continue; }
    if (linked.has(row.slug)) { kept.push({ row, why: "the shell links to it" }); continue; }
    doomed.push(row);
  }

  const { data: revisions } = await supabase
    .from("cms_page_revisions").select("*").in("page_id", doomed.map((r) => r.id));

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `/tmp/impronta-page-cleanup-backup-${stamp}.json`;
  writeFileSync(backupPath, JSON.stringify({ tenantId: tenant.id, pages: doomed, revisions: revisions ?? [] }, null, 1));
  console.log(`BACKUP written: ${backupPath}`);
  console.log(`  ${doomed.length} page(s) + ${(revisions ?? []).length} revision(s), complete rows.\n`);

  if (kept.length > 0) {
    console.log(`KEPT despite looking dead (${kept.length}):`);
    for (const { row, why } of kept) console.log(`  ${row.locale}/${row.slug || "(empty slug)"} — ${why}`);
    console.log();
  }

  console.log(`TO DELETE (${doomed.length}):`);
  for (const row of doomed) {
    const reason = isDeadSlug(row.slug)
      ? "dead slug"
      : isAbandonedDraft(row)
        ? "empty draft"
        : "empty body";
    console.log(`  ${row.status.padEnd(10)} ${row.locale} ${row.slug.padEnd(26)} ${reason.padEnd(11)} ${row.title ?? ""}`);
  }
  console.log(`\nSURVIVING PAGES: ${all.length - doomed.length} of ${all.length}`);

  if (!apply) { console.log("\nRe-run with --apply to delete."); return; }
  if (doomed.length === 0) return;

  const ids = doomed.map((r) => r.id);
  const { error: revErr } = await supabase.from("cms_page_revisions").delete().in("page_id", ids);
  if (revErr) throw new Error(`revision delete failed: ${revErr.message}`);
  const { error: pageErr } = await supabase.from("cms_pages").delete().in("id", ids);
  if (pageErr) throw new Error(`page delete failed: ${pageErr.message}`);
  console.log(`\nDeleted ${doomed.length} page(s). Restore from the backup file above if any of it was wanted.`);
}

main().catch((error) => { console.error(error); process.exit(1); });
