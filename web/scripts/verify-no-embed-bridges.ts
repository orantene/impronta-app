#!/usr/bin/env -S tsx
/**
 * Phase 8B — hard verification gate: no `section_embed` bridges remain.
 *
 * `section_embed` re-embeds a LEGACY section from inside a freeform builder
 * tree. It is the last tie between the freeform builder and the legacy section
 * registry, so WS7 cannot delete the registry while any bridge is live. This
 * gate is the tripwire that keeps them from coming back.
 *
 * Three independent assertions — a bridge can hide from any one of them:
 *
 *   1. LIVE   Every published slug for the tenant, plus `/directory`,
 *             `/faces-of-fall-26` and `/our-fashion-models`, renders zero
 *             `data-builder-node-kind="section_embed"`. This is the only check
 *             that sees what a visitor sees; the other two can pass while the
 *             live site still serves a stale published snapshot.
 *   2. SOURCE The `scripts/impronta-rebuild/` seed sources contain zero
 *             `sectionTypeKey:`. Without this the next re-seed reintroduces
 *             every bridge the live check just cleared. `*.test.ts` is excluded
 *             on purpose: tests legitimately construct legacy fixtures to prove
 *             the migration handled them.
 *   3. DB     The tenant has zero `cms_page_sections` rows and zero
 *             `is_freeform = false` pages, i.e. nothing is left for a bridge to
 *             point AT and no page still renders through the slot composer.
 *
 * Requires network + service-role DB access, so like the rest of
 * `qa:builder-2027-ship` it cannot run inside GitHub Actions.
 *
 * Usage (from `web/`):
 *   npm run verify:no-embed-bridges
 *   npm run verify:no-embed-bridges -- --tenant-slug some-throwaway --base-url https://host
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const EMBED_MARKER = 'data-builder-node-kind="section_embed"';

/** Routes that are not `cms_pages` rows but must still be bridge-free. */
const EXTRA_ROUTES = ["/directory", "/faces-of-fall-26", "/our-fashion-models"];

interface CliArgs {
  tenantSlug: string;
  baseUrl: string;
}

function parseArgs(argv: string[]): CliArgs {
  const read = (flag: string): string | null => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
  };
  const tenantSlug =
    read("--tenant-slug") ?? process.env.IMPRONTA_SEED_TENANT_SLUG ?? "impronta";
  const baseUrl = (
    read("--base-url") ??
    process.env.NO_EMBED_BRIDGES_BASE_URL ??
    "https://impronta.tulala.digital"
  ).replace(/\/+$/, "");
  return { tenantSlug, baseUrl };
}

function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are required (use --env-file=.env.local).",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

// ---------------------------------------------------------------------------
// 2. SOURCE — the seed sources must not be able to re-create a bridge
// ---------------------------------------------------------------------------

export function isScannedSeedSource(relPath: string): boolean {
  return relPath.endsWith(".ts") && !relPath.endsWith(".test.ts");
}

/** Every `sectionTypeKey:` occurrence in the seed sources, as `path:line`. */
export function findSectionTypeKeyHits(
  files: ReadonlyArray<{ path: string; content: string }>,
): string[] {
  const hits: string[] = [];
  for (const file of files) {
    if (!isScannedSeedSource(file.path)) continue;
    file.content.split("\n").forEach((line, i) => {
      if (line.includes("sectionTypeKey:")) hits.push(`${file.path}:${i + 1}`);
    });
  }
  return hits;
}

async function scanSeedSources(): Promise<string[]> {
  const { readdir, readFile } = await import("node:fs/promises");
  const { join, relative } = await import("node:path");
  const root = new URL("./impronta-rebuild/", import.meta.url).pathname;

  const files: { path: string; content: string }[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else {
        files.push({
          path: `scripts/impronta-rebuild/${relative(root, full)}`,
          content: await readFile(full, "utf8"),
        });
      }
    }
  };
  await walk(root);
  return findSectionTypeKeyHits(files);
}

// ---------------------------------------------------------------------------
// 3. DB — nothing left for a bridge to point at
// ---------------------------------------------------------------------------

async function resolveTenantId(
  supabase: SupabaseClient,
  slug: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("agencies")
    .select("id")
    .eq("slug", slug)
    .maybeSingle<{ id: string }>();
  if (error || !data) throw new Error(`Tenant "${slug}" not found.`);
  return data.id;
}

interface DbFindings {
  sectionRows: number;
  slotPages: { slug: string | null; locale: string }[];
}

async function checkDb(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<DbFindings> {
  const { count, error: countError } = await supabase
    .from("cms_page_sections")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  if (countError) throw new Error(`cms_page_sections count failed: ${countError.message}`);

  const { data, error } = await supabase
    .from("cms_pages")
    .select("slug, locale")
    .eq("tenant_id", tenantId)
    .eq("is_freeform", false)
    .neq("status", "archived")
    .returns<{ slug: string | null; locale: string }[]>();
  if (error) throw new Error(`cms_pages scan failed: ${error.message}`);

  return { sectionRows: count ?? 0, slotPages: data ?? [] };
}

// ---------------------------------------------------------------------------
// 1. LIVE — what a visitor actually receives
// ---------------------------------------------------------------------------

async function publishedRoutes(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("cms_pages")
    .select("slug, system_template_key")
    .eq("tenant_id", tenantId)
    .eq("status", "published")
    .returns<{ slug: string | null; system_template_key: string | null }[]>();
  if (error) throw new Error(`published page scan failed: ${error.message}`);

  const routes = new Set<string>(EXTRA_ROUTES);
  for (const row of data ?? []) {
    // `__site_shell__` / `__directory__` are not addressable slugs; the shell
    // is proven by every other route (it renders on all of them) and the
    // directory is covered by the EXTRA_ROUTES entry.
    if ((row.slug ?? "").startsWith("__")) continue;
    routes.add(`/${row.slug ?? ""}`.replace(/\/+$/, "") || "/");
  }
  return [...routes].sort();
}

interface LiveHit {
  route: string;
  status: number;
  embeds: number;
  nodes: number;
}

/**
 * The tenant's own not-found page is a published `cms_pages` row that is
 * SUPPOSED to serve HTTP 404. It still renders the shell, so it must stay in
 * the embed crawl; only its status is exempt.
 */
export function expectsNotFoundStatus(route: string): boolean {
  return route === "/404" || route === "/not-found";
}

async function crawl(baseUrl: string, routes: string[]): Promise<LiveHit[]> {
  const results: LiveHit[] = [];
  for (const route of routes) {
    const res = await fetch(`${baseUrl}${route}`, { redirect: "follow" });
    const html = await res.text();
    results.push({
      route,
      status: res.status,
      embeds: html.split(EMBED_MARKER).length - 1,
      nodes: html.split("data-builder-node-kind=").length - 1,
    });
  }
  return results;
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const failures: string[] = [];

  // 2. SOURCE
  const sourceHits = await scanSeedSources();
  if (sourceHits.length) {
    failures.push(
      `[source] ${sourceHits.length} \`sectionTypeKey:\` occurrence(s) still in the seed sources — a re-seed would restore these bridges:\n` +
        sourceHits.map((h) => `    ${h}`).join("\n"),
    );
  }
  console.log(
    `[source] ${sourceHits.length === 0 ? "OK" : "FAIL"} — ${sourceHits.length} \`sectionTypeKey:\` hit(s) in scripts/impronta-rebuild/`,
  );

  // 3. DB
  const supabase = serviceClient();
  const tenantId = await resolveTenantId(supabase, args.tenantSlug);
  const db = await checkDb(supabase, tenantId);
  if (db.sectionRows > 0) {
    failures.push(
      `[db] tenant "${args.tenantSlug}" still has ${db.sectionRows} cms_page_sections row(s).`,
    );
  }
  if (db.slotPages.length > 0) {
    failures.push(
      `[db] tenant "${args.tenantSlug}" still has ${db.slotPages.length} non-archived page(s) with is_freeform=false:\n` +
        db.slotPages
          .map((p) => `    ${p.slug === "" ? "(homepage)" : p.slug} [${p.locale}]`)
          .join("\n"),
    );
  }
  console.log(
    `[db]     ${db.sectionRows === 0 && db.slotPages.length === 0 ? "OK" : "FAIL"} — ${db.sectionRows} section row(s), ${db.slotPages.length} slot-composed page(s)`,
  );

  // 1. LIVE
  const routes = await publishedRoutes(supabase, tenantId);
  const hits = await crawl(args.baseUrl, routes);
  let liveEmbeds = 0;
  for (const hit of hits) {
    liveEmbeds += hit.embeds;
    const statusOk =
      hit.status < 400 || (expectsNotFoundStatus(hit.route) && hit.status === 404);
    const flag = hit.embeds > 0 || !statusOk ? "FAIL" : "ok";
    console.log(
      `[live]   ${flag.padEnd(4)} ${String(hit.status)}  embeds=${String(hit.embeds).padStart(2)}  nodes=${String(hit.nodes).padStart(4)}  ${args.baseUrl}${hit.route}`,
    );
    if (!statusOk) {
      failures.push(`[live] ${hit.route} returned HTTP ${hit.status}.`);
    }
  }
  if (liveEmbeds > 0) {
    failures.push(
      `[live] ${liveEmbeds} \`section_embed\` node(s) still rendering across ${hits.length} route(s) on ${args.baseUrl}.`,
    );
  }

  console.log("");
  if (failures.length) {
    console.error("[verify:no-embed-bridges] FAILED\n");
    for (const f of failures) console.error(`  - ${f}`);
    console.error(
      "\nA `section_embed` re-embeds a legacy section, so WS7 cannot delete the\n" +
        "legacy registry while any of these remain. See docs/ws7-legacy-section-removal-plan.md.",
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `[verify:no-embed-bridges] OK — 0 bridges across ${hits.length} live route(s), 0 seed-source hits, 0 section rows, 0 slot-composed pages.`,
  );
}

const isSelftest = process.argv.includes("--selftest");
if (isSelftest) {
  // Kept deliberately tiny: the pure helper is the only part with branching
  // logic that a unit test can reach without network + service-role DB.
  const assert = (cond: boolean, msg: string): void => {
    if (!cond) {
      console.error(`selftest FAILED: ${msg}`);
      process.exitCode = 1;
    } else {
      console.log(`selftest ok: ${msg}`);
    }
  };
  assert(
    findSectionTypeKeyHits([{ path: "a.ts", content: "  sectionTypeKey: 'x',\n" }])
      .length === 1,
    "a source hit is reported",
  );
  assert(
    findSectionTypeKeyHits([
      { path: "a.test.ts", content: "  sectionTypeKey: 'x',\n" },
    ]).length === 0,
    "a test-file hit is ignored",
  );
  assert(
    findSectionTypeKeyHits([{ path: "a.ts", content: "const kind = 'x';\n" }])
      .length === 0,
    "a clean source reports nothing",
  );
} else {
  // Not top-level `await`: tsx transforms this file to CJS, where top-level
  // await is a hard transform error.
  void main().catch((err: unknown) => {
    console.error(
      `[verify:no-embed-bridges] ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exitCode = 1;
  });
}
