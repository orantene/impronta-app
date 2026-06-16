#!/usr/bin/env -S tsx
/**
 * seed-default-storefront.ts — idempotent publisher for the PLATFORM DEFAULT
 * STOREFRONT template.
 *
 * Upserts the hand-authored {@link PLATFORM_DEFAULT_STOREFRONT_TREE} into a
 * reserved `builder_templates` row (slug `__platform_default_storefront__`),
 * PUBLISHED, kind `page_template`, target_context `both`. Once published, every
 * AGENCY tenant WITHOUT its own published homepage composition renders this
 * premium freeform storefront (scoped to that tenant's roster) instead of the
 * bland DefaultStorefrontBody. Until this script runs, nothing changes live.
 *
 * Idempotent: re-running UPDATES the existing reserved row in place (matched by
 * slug). Safe to run repeatedly; the lead runs it against prod after QA.
 *
 * ── HOW THE LEAD RUNS IT ─────────────────────────────────────────────────────
 *   cd web
 *   npm run seed:default-storefront          # uses .env.local
 *   # or directly:
 *   tsx --env-file=.env.local scripts/seed-default-storefront.ts
 *
 *   Dry-run (print what WOULD be written, touch nothing):
 *   tsx --env-file=.env.local scripts/seed-default-storefront.ts --dry-run
 *
 * ── ENV REQUIRED ─────────────────────────────────────────────────────────────
 *   NEXT_PUBLIC_SUPABASE_URL       — the target Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY      — service-role key (bypasses RLS; this script
 *                                    is the trusted boundary). Point .env.local
 *                                    at PROD to publish to production.
 *
 * ── VERIFY AFTER RUNNING ─────────────────────────────────────────────────────
 *   The script prints the row id + status on success. To confirm independently:
 *     select id, slug, status, kind, target_context, version
 *       from builder_templates
 *      where slug = '__platform_default_storefront__';
 *   Expect status='published', kind='page_template', target_context='both'.
 *   Then load a brand-new agency tenant's homepage (one with NO published
 *   composition) — it should now render the premium default storefront.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { computeDataBindingRequirements } from "@/lib/site-admin/builder-core/templates/registry-rows";
import {
  PLATFORM_DEFAULT_STOREFRONT_SLUG,
  PLATFORM_DEFAULT_STOREFRONT_TREE,
} from "@/lib/site-admin/server/default-storefront-tree";

const TEMPLATE_FIELDS = {
  kind: "page_template" as const,
  status: "published" as const,
  target_context: "both" as const,
  title: "Default storefront",
  slug: PLATFORM_DEFAULT_STOREFRONT_SLUG,
  description:
    "Platform default agency storefront — rendered for new/unconfigured tenants until they publish their own homepage.",
  category: "Platform",
  gallery_tab: "page_templates" as const,
  required_plan: "free" as const,
};

function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with --env-file=.env.local (or `npm run seed:default-storefront`).",
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const tree = PLATFORM_DEFAULT_STOREFRONT_TREE;
  const dataBindingRequirements = computeDataBindingRequirements(tree);
  const nowIso = new Date().toISOString();

  console.log(
    `[seed-default-storefront] slug=${PLATFORM_DEFAULT_STOREFRONT_SLUG} ` +
      `nodes=${tree.length} data_sources=[${dataBindingRequirements.join(", ")}]` +
      (dryRun ? " (DRY RUN)" : ""),
  );

  if (dryRun) {
    console.log("[seed-default-storefront] dry-run — no write performed.");
    return;
  }

  const sb = getServiceClient();

  // Idempotent upsert BY SLUG: update in place if the reserved row exists,
  // otherwise insert. Avoids relying on an ON CONFLICT target (the slug-unique
  // constraint is not guaranteed in local migrations).
  const { data: existing, error: selErr } = await sb
    .from("builder_templates")
    .select("id, version")
    .eq("slug", PLATFORM_DEFAULT_STOREFRONT_SLUG)
    .maybeSingle<{ id: string; version: number }>();
  if (selErr) {
    throw new Error(`Lookup failed: ${selErr.message}`);
  }

  if (existing) {
    const nextVersion = (existing.version ?? 1) + 1;
    const { data, error } = await sb
      .from("builder_templates")
      .update({
        ...TEMPLATE_FIELDS,
        builder_tree: tree,
        data_binding_requirements: dataBindingRequirements,
        version: nextVersion,
        published_at: nowIso,
      })
      .eq("id", existing.id)
      .select("id, status, version")
      .single<{ id: string; status: string; version: number }>();
    if (error) throw new Error(`Update failed: ${error.message}`);
    console.log(
      `[seed-default-storefront] UPDATED row ${data.id} → status=${data.status} version=${data.version}`,
    );
    return;
  }

  const { data, error } = await sb
    .from("builder_templates")
    .insert({
      ...TEMPLATE_FIELDS,
      tags: [],
      builder_tree: tree,
      theme_tokens: null,
      data_binding_requirements: dataBindingRequirements,
      source_tenant_id: null,
      created_by: null,
      version: 1,
      schema_version: 1,
      published_at: nowIso,
    })
    .select("id, status, version")
    .single<{ id: string; status: string; version: number }>();
  if (error) throw new Error(`Insert failed: ${error.message}`);
  console.log(
    `[seed-default-storefront] CREATED row ${data.id} → status=${data.status} version=${data.version}`,
  );
}

main().catch((err: unknown) => {
  console.error(
    "[seed-default-storefront] FAILED:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
