/**
 * Fold secondary-language PAGES into per-element overlays on the primary page.
 *
 * WHAT THIS FIXES
 * ───────────────
 * Freeform pages were stored one `cms_pages` row per locale, so `/es` was a
 * separate page with its own block order, styling and talent picks. Editing the
 * English page changed nothing on the Spanish one. The product model is one
 * design per page: the PRIMARY-language row is the design, and every other
 * language is text only, carried per element in `node.i18n[locale][prop]`.
 *
 * This script moves the existing translations into that shape: for every slug
 * that has both a primary and a secondary row, each translated string is
 * matched to its counterpart element on the primary tree and written into the
 * overlay. The matching (exact id → `<locale>-` prefixed id → tree position +
 * kind) and every skip rule live in `locale-page-merge.ts`, which is unit
 * tested; this file is only IO plus reporting.
 *
 * THE SECONDARY ROWS ARE NOT DELETED. Nothing here drops data: after the fold
 * the secondary rows simply stop being what renders (the public route reads the
 * design row). They stay as a rollback path until the result is confirmed live.
 *
 * USAGE
 *   npx tsx scripts/fold-locale-pages-into-overlays.ts              # dry run
 *   npx tsx scripts/fold-locale-pages-into-overlays.ts --apply      # write
 *   … --tenant=<uuid>   restrict to one tenant
 *   … --slug=<slug>     restrict to one page
 *
 * ENV (web/.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Service role bypasses RLS — every query below is explicitly tenant-scoped.
 *
 * NOTE: no top-level side effects. `main()` runs only under the
 * import-guard at the bottom, so importing this module can never write.
 */

import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { mergeLocalePageIntoOverlays } from "../src/lib/site-admin/builder-node/locale-page-merge";
import type { BuilderNode } from "../src/lib/site-admin/builder-node/types";

interface PageRow {
  id: string;
  tenant_id: string;
  locale: string;
  slug: string;
  status: string;
  blocks: BuilderNode[] | null;
}

interface CliOptions {
  apply: boolean;
  tenantId: string | null;
  slug: string | null;
}

function parseArgs(argv: readonly string[]): CliOptions {
  const valueOf = (flag: string): string | null => {
    const hit = argv.find((a) => a.startsWith(`${flag}=`));
    return hit ? hit.slice(flag.length + 1) : null;
  };
  return {
    apply: argv.includes("--apply"),
    tenantId: valueOf("--tenant"),
    slug: valueOf("--slug"),
  };
}

async function main(options: CliOptions): Promise<number> {
  loadEnv({ path: path.resolve(process.cwd(), ".env.local") });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (web/.env.local)",
    );
    return 1;
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  // 1. Every tenant's primary language. A tenant with no identity row falls
  //    back to "en" — the same default the locale resolver uses.
  const { data: identities, error: identityErr } = await db
    .from("agency_business_identity")
    .select("tenant_id, default_locale");
  if (identityErr) {
    console.error(`Could not read tenant locales: ${identityErr.message}`);
    return 1;
  }
  const primaryByTenant = new Map<string, string>();
  for (const row of identities ?? []) {
    const r = row as { tenant_id: string; default_locale: string | null };
    primaryByTenant.set(r.tenant_id, r.default_locale?.trim() || "en");
  }

  // 2. Every freeform page, grouped by (tenant, slug).
  let query = db
    .from("cms_pages")
    .select("id, tenant_id, locale, slug, status, blocks")
    .eq("is_freeform", true);
  if (options.tenantId) query = query.eq("tenant_id", options.tenantId);
  if (options.slug) query = query.eq("slug", options.slug);
  const { data: pages, error: pagesErr } = await query;
  if (pagesErr) {
    console.error(`Could not read cms_pages: ${pagesErr.message}`);
    return 1;
  }

  const groups = new Map<string, PageRow[]>();
  for (const row of (pages ?? []) as PageRow[]) {
    const key = `${row.tenant_id}::${row.slug}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  let pagesTouched = 0;
  let stringsMerged = 0;
  let stringsUnmatched = 0;
  let writeFailures = 0;

  for (const [key, rows] of [...groups.entries()].sort()) {
    const tenantId = rows[0]!.tenant_id;
    const primaryLocale = primaryByTenant.get(tenantId) ?? "en";
    const primary = rows.find((r) => r.locale === primaryLocale);
    const secondaries = rows.filter((r) => r.locale !== primaryLocale);
    if (!primary || secondaries.length === 0) continue;

    let tree = (primary.blocks ?? []) as BuilderNode[];
    const perLocale: string[] = [];
    let mergedHere = 0;

    for (const secondary of secondaries) {
      const result = mergeLocalePageIntoOverlays({
        primaryTree: tree,
        secondaryTree: (secondary.blocks ?? []) as BuilderNode[],
        locale: secondary.locale,
      });
      tree = result.tree;
      mergedHere += result.merged.length;
      stringsMerged += result.merged.length;

      const unmatched = result.skipped.filter((s) => s.reason === "unmatched");
      stringsUnmatched += unmatched.length;
      perLocale.push(
        `${secondary.locale}: ${result.merged.length} merged, ` +
          `${result.skipped.filter((s) => s.reason === "identical").length} identical, ` +
          `${unmatched.length} unmatched`,
      );
      // Unmatched strings are the ones a human has to look at: they exist in the
      // secondary language but their element is gone from the design.
      for (const skip of unmatched.slice(0, 5)) {
        perLocale.push(
          `      ! no element on the design for ${skip.kind}.${skip.prop}: ` +
            `"${skip.secondaryText.slice(0, 60)}"`,
        );
      }
      if (unmatched.length > 5) {
        perLocale.push(`      … and ${unmatched.length - 5} more unmatched`);
      }
    }

    if (mergedHere === 0) continue;
    pagesTouched += 1;
    console.log(`\n${key.replace("::", "  /")}  [design: ${primaryLocale}]`);
    for (const line of perLocale) console.log(`   ${line}`);

    if (!options.apply) continue;
    const { error: writeErr } = await db
      .from("cms_pages")
      .update({ blocks: tree, updated_at: new Date().toISOString() })
      .eq("id", primary.id)
      .eq("tenant_id", tenantId);
    if (writeErr) {
      writeFailures += 1;
      console.error(`   WRITE FAILED: ${writeErr.message}`);
    } else {
      console.log(`   written to ${primary.id}`);
    }
  }

  console.log(
    `\n${options.apply ? "APPLIED" : "DRY RUN"} — ` +
      `${pagesTouched} page(s), ${stringsMerged} translated string(s) folded, ` +
      `${stringsUnmatched} unmatched, ${writeFailures} write failure(s).`,
  );
  if (!options.apply && pagesTouched > 0) {
    console.log("Re-run with --apply to write.");
  }
  return writeFailures > 0 ? 1 : 0;
}

// Import guard — a module with a top-level main() has silently written to
// production before (it read process.argv itself, so an importer's --apply
// triggered it). Only a DIRECT invocation runs anything.
const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main(parseArgs(process.argv.slice(2)))
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}

export { main as foldLocalePagesIntoOverlays, parseArgs };
