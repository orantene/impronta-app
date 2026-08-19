/**
 * seed-home-es.ts — write the SPANISH homepage.
 *
 * `/es` had no published Spanish homepage: the row existed as a draft with zero
 * blocks, so the platform fell back to a bare default template. A visitor who
 * clicked ES in a fully translated header landed on a flat banner reading
 * "Impronta / Models & image agency / Get in touch" over empty grey cards.
 *
 * Why its own script rather than `seed-pages.ts`: that seeder writes
 * `locale: "en"` as a literal in its payload type and its guard queries, and it
 * is the vetted path for thirteen live English pages. Threading a locale
 * through it to publish ONE page would put those thirteen at risk for no gain.
 * When Spanish grows past the homepage, that refactor is the right move; today
 * it is not.
 *
 * DRY RUN IS THE DEFAULT. Pass `--apply` to write, `--publish` to publish.
 *
 *   IMPRONTA_SEED_TENANT_SLUG=impronta npx tsx scripts/impronta-rebuild/seed-home-es.ts
 *   IMPRONTA_SEED_TENANT_SLUG=impronta npx tsx scripts/impronta-rebuild/seed-home-es.ts --apply --publish
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";

import {
  applyImageSlotResolution,
  collectImageSlots,
  loadImageSlotPins,
  resolveImageSlots,
} from "./media-curation";
import { homePageEs } from "./pages/home-es";

const LOCALE = "es";
const SLUG = "home";

function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function resolveTenantId(supabase: SupabaseClient): Promise<string> {
  const slug = process.env.IMPRONTA_SEED_TENANT_SLUG;
  const explicit = process.env.IMPRONTA_SEED_TENANT_ID;
  if (explicit) return explicit;
  if (!slug) throw new Error("Set IMPRONTA_SEED_TENANT_SLUG or IMPRONTA_SEED_TENANT_ID.");
  const { data } = await supabase
    .from("agencies")
    .select("id")
    .eq("slug", slug)
    .maybeSingle<{ id: string }>();
  if (!data) throw new Error(`No tenant for slug "${slug}".`);
  return data.id;
}

async function main() {
  const { loadEnvLocal } = await import("../load-env-local.mjs");
  loadEnvLocal();

  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const publish = argv.includes("--publish");
  if (!apply) console.log("DRY RUN — no writes will be made.\n");

  const supabase = serviceClient();
  const tenantId = await resolveTenantId(supabase);

  // 1. Validate BEFORE touching the database. An invalid tree written to a
  //    published row renders as nothing, which looks exactly like the bug this
  //    script exists to fix.
  const validation = validateBuilderNodeTree(homePageEs.tree);
  if (!validation.ok) {
    throw new Error(
      `Spanish home tree is invalid: ${validation.issues.map((i) => i.message).join("; ")}`,
    );
  }

  // 2. Resolve image-slot tokens. Writing them raw puts a literal
  //    "slot://impronta-rebuild/..." string into an <img src>.
  const slotNames = collectImageSlots(homePageEs.tree);
  let blocks: unknown = homePageEs.tree;
  if (slotNames.length > 0) {
    const resolution = await resolveImageSlots(
      supabase,
      tenantId,
      slotNames,
      loadImageSlotPins(),
    );
    if (resolution.unresolvedSlots.length > 0) {
      throw new Error(`Unresolved image slots: ${resolution.unresolvedSlots.join(", ")}`);
    }
    const applied = applyImageSlotResolution(homePageEs.tree, resolution.resolved);
    if (applied.unresolvedTokens.length > 0) {
      throw new Error(`Tokens survived resolution: ${applied.unresolvedTokens.join(", ")}`);
    }
    blocks = applied.tree;
  }

  const { data: existing } = await supabase
    .from("cms_pages")
    .select("id,status,version")
    .eq("tenant_id", tenantId)
    .eq("locale", LOCALE)
    .eq("slug", SLUG)
    .maybeSingle<{ id: string; status: string; version: number }>();

  const seo = homePageEs.seo as unknown as Record<string, unknown>;
  const payload = {
    tenant_id: tenantId,
    locale: LOCALE,
    slug: SLUG,
    title: homePageEs.title,
    status: publish ? "published" : "draft",
    is_freeform: true,
    blocks,
    meta_title: (seo.meta_title as string) ?? null,
    meta_description: (seo.meta_description as string) ?? null,
    og_title: (seo.og_title as string) ?? null,
    og_description: (seo.og_description as string) ?? null,
    canonical_url: (seo.canonical_url as string) ?? null,
    noindex: seo.noindex === true,
    include_in_sitemap: seo.include_in_sitemap !== false,
    json_ld: seo.json_ld ?? null,
  };

  console.log(
    [
      `tenant     ${tenantId}`,
      `locale     ${LOCALE}`,
      `slug       ${SLUG}`,
      `existing   ${existing ? `${existing.status} v${existing.version}` : "(none)"}`,
      `action     ${existing ? "update" : "insert"} → ${payload.status}`,
      `nodes      ${JSON.stringify(blocks).length} bytes`,
      `images     ${slotNames.length} slot(s) resolved`,
    ].join("\n"),
  );

  if (!apply) {
    console.log("\nRe-run with --apply (and --publish to make it live).");
    return;
  }

  if (existing) {
    const { error } = await supabase
      .from("cms_pages")
      .update(payload)
      .eq("id", existing.id);
    if (error) throw new Error(`update failed: ${error.message}`);
  } else {
    const { error } = await supabase.from("cms_pages").insert(payload);
    if (error) throw new Error(`insert failed: ${error.message}`);
  }
  console.log(`\nWritten. status=${payload.status}`);
  if (!publish) console.log("Still a DRAFT — re-run with --publish when the copy is approved.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
