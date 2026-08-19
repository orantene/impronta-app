/**
 * fix-es-page-meta.ts — give the older Spanish pages Spanish metadata.
 *
 * Nine Spanish pages predate the rebuild. Their BODIES are the old design (one
 * block each, versus seven to twelve on the rebuilt pages) and rebuilding them
 * is a separate, larger job — 342 strings of copy.
 *
 * But their METADATA is wrong in a way a visitor sees today: five carry English
 * meta titles and three carry none at all, so a Spanish page shows
 * "About · Impronta" in the browser tab and in Google's result. That is the
 * cheap half of the fix and it does not wait for the expensive half.
 *
 * TITLES AND DESCRIPTIONS ONLY. This script never touches `blocks`, so it
 * cannot damage a page body while improving its head.
 *
 * DRY RUN IS THE DEFAULT.
 *
 *   IMPRONTA_SEED_TENANT_SLUG=impronta npx tsx scripts/impronta-rebuild/fix-es-page-meta.ts
 *   IMPRONTA_SEED_TENANT_SLUG=impronta npx tsx scripts/impronta-rebuild/fix-es-page-meta.ts --apply
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { ES_PAGE_META } from "./es-page-meta";

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
    .select("id")
    .eq("slug", slug)
    .maybeSingle<{ id: string }>();
  if (!tenant) throw new Error(`No tenant for slug "${slug}".`);

  for (const [pageSlug, meta] of Object.entries(ES_PAGE_META)) {
    const { data: row } = await supabase
      .from("cms_pages")
      .select("id, meta_title")
      .eq("tenant_id", tenant.id)
      .eq("locale", "es")
      .eq("slug", pageSlug)
      .neq("status", "archived")
      .maybeSingle<{ id: string; meta_title: string | null }>();

    if (!row) {
      console.log(`  ${pageSlug.padEnd(16)} SKIP — no Spanish page at this slug`);
      continue;
    }
    console.log(
      `  ${pageSlug.padEnd(16)} "${(row.meta_title ?? "(none)").slice(0, 28)}" → "${meta.metaTitle.slice(0, 40)}"`,
    );
    if (!apply) continue;

    const { error } = await supabase
      .from("cms_pages")
      .update({
        title: meta.title,
        meta_title: meta.metaTitle,
        meta_description: meta.metaDescription,
        og_title: meta.metaTitle,
        og_description: meta.metaDescription,
        // Self-canonical: without this a Spanish page can canonicalize to its
        // English twin and ask search engines not to rank it.
        canonical_url: pageSlug === "404" ? null : `/es/p/${pageSlug}`,
      })
      .eq("id", row.id);
    if (error) throw new Error(`${pageSlug}: ${error.message}`);
  }

  if (!apply) console.log("\nRe-run with --apply to write.");
  else console.log("\nDone. Page BODIES are untouched — those are the separate rebuild.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
