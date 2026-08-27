/**
 * Per-element translation coverage for every freeform page, per language.
 *
 * ONE DESIGN PER PAGE: the primary-language row is the design and every other
 * language is per-element text in `node.i18n`. This reports, per page and
 * language, how many text elements are translated and which are still missing —
 * the same numbers the builder's Translations panel shows, for the whole site
 * at once.
 *
 * Read-only. Never writes.
 *
 * USAGE
 *   npx tsx scripts/audit-locale-overlay-coverage.ts
 *   … --tenant=<uuid>   restrict to one tenant
 *   … --missing         list every untranslated element, not just counts
 */

import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildOverlayTranslationReport } from "../src/lib/site-admin/builder-node/translation-status";
import type { BuilderNode } from "../src/lib/site-admin/builder-node/types";

interface CliOptions {
  tenantId: string | null;
  showMissing: boolean;
}

function parseArgs(argv: readonly string[]): CliOptions {
  const hit = argv.find((a) => a.startsWith("--tenant="));
  return {
    tenantId: hit ? hit.slice("--tenant=".length) : null,
    showMissing: argv.includes("--missing"),
  };
}

async function main(options: CliOptions): Promise<number> {
  loadEnv({ path: path.resolve(process.cwd(), ".env.local") });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    return 1;
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: identities } = await db
    .from("agency_business_identity")
    .select("tenant_id, default_locale, supported_locales");
  const settingsByTenant = new Map<string, { primary: string; supported: string[] }>();
  for (const row of identities ?? []) {
    const r = row as {
      tenant_id: string;
      default_locale: string | null;
      supported_locales: string[] | null;
    };
    settingsByTenant.set(r.tenant_id, {
      primary: r.default_locale?.trim() || "en",
      supported: (r.supported_locales ?? []).filter(Boolean),
    });
  }

  let query = db
    .from("cms_pages")
    .select("tenant_id, locale, slug, status, blocks")
    .eq("is_freeform", true);
  if (options.tenantId) query = query.eq("tenant_id", options.tenantId);
  const { data: pages, error } = await query;
  if (error) {
    console.error(`Could not read cms_pages: ${error.message}`);
    return 1;
  }

  let totalMissing = 0;
  const rows: string[] = [];

  for (const page of (pages ?? []) as Array<{
    tenant_id: string;
    locale: string;
    slug: string;
    status: string;
    blocks: BuilderNode[] | null;
  }>) {
    const settings = settingsByTenant.get(page.tenant_id) ?? { primary: "en", supported: [] };
    // Only the DESIGN row carries overlays; secondary rows no longer render.
    if (page.locale !== settings.primary) continue;
    const others = settings.supported.filter((code) => code !== settings.primary);
    if (others.length === 0) continue;

    for (const locale of others) {
      const report = buildOverlayTranslationReport(page.blocks ?? [], locale);
      const missing = report.counts.no_counterpart;
      totalMissing += missing;
      const translatable = report.total - report.counts.not_translatable;
      const pct = translatable === 0 ? 100 : Math.round((report.counts.translated / translatable) * 100);
      rows.push(
        `${pct === 100 ? "OK " : "   "} /${page.slug.padEnd(18)} ${locale}  ` +
          `${String(pct).padStart(3)}%  ${report.counts.translated}/${translatable} translated` +
          (missing > 0 ? `  — ${missing} MISSING` : "") +
          (page.status !== "published" ? `  [${page.status}]` : ""),
      );
      if (options.showMissing && missing > 0) {
        for (const row of report.rows.filter((r) => r.status === "no_counterpart")) {
          rows.push(`        · ${row.kind}.${row.prop}: "${row.currentText.slice(0, 60)}"`);
        }
      }
    }
  }

  rows.sort();
  for (const line of rows) console.log(line);
  console.log(`\n${rows.length} page/language pair(s); ${totalMissing} element(s) still untranslated.`);
  if (totalMissing > 0 && !options.showMissing) {
    console.log("Re-run with --missing to list them.");
  }
  return 0;
}

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

export { main as auditLocaleOverlayCoverage };
