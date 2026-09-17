/**
 * seed-marketing-2026-09.ts — the 2026-09 Impronta marketing pass, in one
 * idempotent, dry-run-by-default script.
 *
 * WHAT IT WRITES (per the owner's 2026-09-17 product + segment list):
 *   pages     /p/experiences (NEW)  /p/show (rewrite)  /p/for-clients (rewrite)
 *             — full trees, EN row + ES row, ES text folded into the EN row as
 *               `i18n.es` overlays (one design per page).
 *   patches   home and studio — id-keyed patches on the LIVE tree (both pages
 *             carry builder edits the modules do not know about).
 *   shell     header nav links in both locale shell rows, then the shell
 *             snapshot is republished through the editor's own publish function.
 *
 * HOW IT WRITES. Exactly like the editor's Publish: a `cms_page_revisions`
 * row at version N+1 with the tree, then a compare-and-swap bump of
 * `cms_pages.version` (`commitPageRevisionThenVersion`). A CAS conflict
 * means someone saved in the builder between read and write — the script
 * reports it and touches nothing else on that page. NOBODY should be editing
 * these pages in the builder while this runs.
 *
 * Image slots resolve against `image-slots.json` (pinned media ids), the
 * form section token against the tenant's contact_form section, and every
 * tree is validated before anything is written. Public pages are
 * `force-dynamic`, so a successful write is live on the next request.
 *
 * USAGE (from web/):
 *   npx tsx scripts/impronta-rebuild/seed-marketing-2026-09.ts               # dry run
 *   npx tsx scripts/impronta-rebuild/seed-marketing-2026-09.ts --apply       # write
 *   ... --only=experiences,show,for-clients,home,studio,shell               # subset
 *   ... --publish   publish NEW pages immediately (existing published pages
 *                   stay published either way; a new page defaults to draft)
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { mergeLocalePageIntoOverlays } from "@/lib/site-admin/builder-node/locale-page-merge";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";
import { commitPageRevisionThenVersion } from "@/lib/site-admin/server/page-revision-commit";
import { republishSiteShellSnapshot } from "@/lib/site-admin/edit-mode/site-shell-publish";

import {
  applyFormSectionResolution,
  countFormSectionSlots,
  resolveFormSectionId,
} from "./form-section";
import {
  applyImageSlotResolution,
  collectImageSlots,
  loadImageSlotPins,
  resolveImageSlots,
} from "./media-curation";
import type { ImprontaRebuildPage } from "./shared";
import { experiencesPage } from "./pages/experiences";
import { experiencesPageEs } from "./pages/experiences-es";
import { showPage } from "./pages/show";
import { showPageEs } from "./pages/show-es";
import { forClientsPage } from "./pages/for-clients";
import { corePagesEs } from "./pages/core-es";
import { applyHomeMarketingPatch } from "./pages/home-marketing-patch";
import { applyStudioMarketingPatch } from "./pages/studio-marketing-patch";
import { patchShellNavLinks } from "./shell/nav-marketing-patch";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type PageRow = {
  id: string;
  version: number;
  status: string;
  blocks: BuilderNode[] | null;
  template_schema_version: number | null;
  title: string;
  meta_description: string | null;
};

const FULL_PAGES: ReadonlyArray<{ key: string; en: ImprontaRebuildPage; es: ImprontaRebuildPage }> = [
  { key: "experiences", en: experiencesPage, es: experiencesPageEs },
  { key: "show", en: showPage, es: showPageEs },
  {
    key: "for-clients",
    en: forClientsPage,
    es: corePagesEs.find((p) => p.slug === "for-clients")!,
  },
];

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

async function readRow(sb: SupabaseClient, tenantId: string, locale: string, slug: string): Promise<PageRow | null> {
  const { data, error } = await sb
    .from("cms_pages")
    .select("id, version, status, blocks, template_schema_version, title, meta_description")
    .eq("tenant_id", tenantId)
    .eq("locale", locale)
    .eq("slug", slug)
    .maybeSingle<PageRow>();
  if (error) throw new Error(`read ${locale}/${slug}: ${error.message}`);
  return data ?? null;
}

async function commitTree(
  sb: SupabaseClient,
  args: {
    tenantId: string;
    row: PageRow;
    locale: string;
    tree: BuilderNode[];
    extra?: Record<string, unknown>;
    actor: string | null;
  },
): Promise<void> {
  const nextVersion = args.row.version + 1;
  const publishedAt = new Date().toISOString();
  const status = (args.extra?.status as string | undefined) ?? args.row.status;
  const r = await commitPageRevisionThenVersion(sb, {
    tenantId: args.tenantId,
    pageId: args.row.id,
    beforeVersion: args.row.version,
    update: {
      blocks: args.tree,
      is_freeform: true,
      version: nextVersion,
      updated_by: args.actor,
      edit_session_id: null,
      draft_seq: null,
      ...(status === "published" ? { published_at: publishedAt } : {}),
      ...(args.extra ?? {}),
    },
    revision: {
      kind: status === "published" ? "published" : "draft",
      version: nextVersion,
      templateSchemaVersion: args.row.template_schema_version ?? 1,
      snapshot: {
        kind: status === "published" ? "published" : "draft",
        title: (args.extra?.title as string | undefined) ?? args.row.title,
        status,
        locale: args.locale,
        meta_description: (args.extra?.meta_description as string | null | undefined) ?? args.row.meta_description,
        version: nextVersion,
        published_at: publishedAt,
        composition: [],
        builderTree: args.tree,
      },
    },
    actorProfileId: args.actor,
    logScope: "impronta-rebuild/seed-marketing-2026-09",
  });
  if (!r.ok) throw new Error(`commit ${args.locale}/${args.row.id}: ${r.reason} ${r.message ?? ""}`);
}

function seoColumns(page: ImprontaRebuildPage): Record<string, unknown> {
  const seo = page.seo as unknown as Record<string, unknown>;
  return {
    title: page.title,
    meta_title: seo.meta_title ?? null,
    meta_description: seo.meta_description ?? null,
    og_title: seo.og_title ?? null,
    og_description: seo.og_description ?? null,
    canonical_url: seo.canonical_url ?? `/p/${page.slug}`,
    noindex: seo.noindex ?? false,
    include_in_sitemap: seo.include_in_sitemap ?? true,
  };
}

async function main() {
  const { loadEnvLocal } = await import("../load-env-local.mjs");
  loadEnvLocal();
  const apply = process.argv.includes("--apply");
  const publishNew = process.argv.includes("--publish");
  const only = arg("only")?.split(",").map((s) => s.trim()) ?? null;
  const want = (k: string) => !only || only.includes(k);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const slug = process.env.IMPRONTA_SEED_TENANT_SLUG ?? "impronta";
  const { data: tenant } = await sb.from("agencies").select("id").eq("slug", slug).maybeSingle();
  if (!tenant) throw new Error(`no tenant "${slug}"`);
  const tenantId = tenant.id as string;
  const { data: identity } = await sb
    .from("agency_business_identity")
    .select("updated_by")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const actor = (identity?.updated_by as string | null) ?? null;

  console.log(`${apply ? "APPLY" : "DRY RUN"} · tenant ${slug} (${tenantId})`);

  // ── resolve image slots + form section once ──────────────────────────────
  const pins = loadImageSlotPins(path.join(__dirname, "image-slots.json"));
  const slots = new Set<string>();
  const patchedTrees: Record<string, BuilderNode[]> = {};
  for (const p of FULL_PAGES) if (want(p.key)) for (const s of collectImageSlots(p.en.tree)) slots.add(s);
  // patches carry slots too (offer cards on the home band)
  const homeRow = want("home") ? await readRow(sb, tenantId, "en", "home") : null;
  const studioRow = want("studio") ? await readRow(sb, tenantId, "en", "studio") : null;
  if (homeRow) {
    const r = applyHomeMarketingPatch(homeRow.blocks ?? []);
    if (r.problems.length) throw new Error(`home patch: ${r.problems.join("; ")}`);
    patchedTrees.home = r.tree;
    console.log(`home: ${JSON.stringify(r.report)}`);
    for (const s of collectImageSlots(r.tree)) slots.add(s);
  }
  if (studioRow) {
    const r = applyStudioMarketingPatch(studioRow.blocks ?? []);
    if (r.problems.length) throw new Error(`studio patch: ${r.problems.join("; ")}`);
    patchedTrees.studio = r.tree;
    console.log(`studio: ${JSON.stringify(r.report)}`);
    for (const s of collectImageSlots(r.tree)) slots.add(s);
  }
  const resolution = await resolveImageSlots(sb, tenantId, [...slots], pins);
  if (resolution.unresolvedSlots.length) {
    throw new Error(`unresolved image slots: ${resolution.unresolvedSlots.join(", ")}`);
  }
  const formSectionId = await resolveFormSectionId(sb, tenantId);
  if (!formSectionId) throw new Error("no contact_form cms_sections row for the tenant");

  const finish = (tree: BuilderNode[], label: string): BuilderNode[] => {
    const img = applyImageSlotResolution(tree, resolution.resolved);
    if (img.unresolvedTokens.length) throw new Error(`${label}: unresolved slots ${img.unresolvedTokens.join(",")}`);
    const forms = applyFormSectionResolution(img.tree, formSectionId);
    if (forms.unresolved > 0) throw new Error(`${label}: ${forms.unresolved} form token(s) unresolved`);
    if (countFormSectionSlots(forms.tree) > 0) throw new Error(`${label}: form slot survived`);
    const v = validateBuilderNodeTree(forms.tree as BuilderNode[]);
    if (!v.ok) throw new Error(`${label}: invalid tree\n${v.issues.map((i) => `  - [${i.path}] ${i.message}`).join("\n")}`);
    return v.tree as BuilderNode[];
  };

  // ── full pages ───────────────────────────────────────────────────────────
  for (const p of FULL_PAGES) {
    if (!want(p.key)) continue;
    const esTree = finish(p.es.tree, `${p.key}/es`);
    const enBase = finish(p.en.tree, `${p.key}/en`);
    const merged = mergeLocalePageIntoOverlays({ primaryTree: enBase, secondaryTree: esTree, locale: "es" });
    const enTree = finish(merged.tree, `${p.key}/en+overlay`);
    const unmatched = merged.skipped.filter((s) => s.reason === "unmatched");
    console.log(
      `${p.key}: ${enTree.length} roots · ${merged.merged.length} es overlays · ${unmatched.length} unmatched es strings`,
    );
    if (unmatched.length) {
      for (const u of unmatched.slice(0, 5)) console.log(`   ! ${u.secondaryNodeId} ${u.prop}: ${u.secondaryText.slice(0, 60)}`);
    }

    for (const [locale, page, tree] of [
      ["en", p.en, enTree],
      ["es", p.es, esTree],
    ] as const) {
      const row = await readRow(sb, tenantId, locale, page.slug);
      const cols = seoColumns(page);
      if (row) {
        const status = row.status === "published" ? "published" : publishNew ? "published" : row.status;
        console.log(`  ${locale}/${page.slug}: update v${row.version} → v${row.version + 1} (${status})`);
        if (apply) await commitTree(sb, { tenantId, row, locale, tree, extra: { ...cols, status }, actor });
      } else {
        const status = publishNew ? "published" : "draft";
        console.log(`  ${locale}/${page.slug}: INSERT (${status})`);
        if (apply) {
          const { data: inserted, error } = await sb
            .from("cms_pages")
            .insert({
              tenant_id: tenantId,
              locale,
              slug: page.slug,
              template_key: "standard_page",
              status,
              is_freeform: true,
              blocks: tree,
              version: 1,
              updated_by: actor,
              ...(status === "published" ? { published_at: new Date().toISOString() } : {}),
              ...cols,
            })
            .select("id, version, status, blocks, template_schema_version, title, meta_description")
            .single<PageRow>();
          if (error || !inserted) throw new Error(`insert ${locale}/${page.slug}: ${error?.message}`);
          // A version-matched revision so the editor rehydrates the same tree.
          const { error: revErr } = await sb.from("cms_page_revisions").insert({
            tenant_id: tenantId,
            page_id: inserted.id,
            kind: status === "published" ? "published" : "draft",
            version: 1,
            template_schema_version: inserted.template_schema_version ?? 1,
            snapshot: {
              kind: status === "published" ? "published" : "draft",
              title: page.title,
              status,
              locale,
              meta_description: cols.meta_description,
              version: 1,
              published_at: new Date().toISOString(),
              composition: [],
              builderTree: tree,
            },
            created_by: actor,
          });
          if (revErr) throw new Error(`revision ${locale}/${page.slug}: ${revErr.message}`);
        }
      }
    }
  }

  // ── live patches ─────────────────────────────────────────────────────────
  for (const [key, row] of [
    ["home", homeRow],
    ["studio", studioRow],
  ] as const) {
    if (!row) continue;
    const tree = finish(patchedTrees[key]!, key);
    console.log(`  en/${key}: update v${row.version} → v${row.version + 1} (${row.status})`);
    if (apply) await commitTree(sb, { tenantId, row, locale: "en", tree, actor });
  }

  // ── shell nav ────────────────────────────────────────────────────────────
  if (want("shell")) {
    const showHero = resolution.resolved.get("show-hero")?.src ?? null;
    for (const locale of ["en", "es"] as const) {
      const row = await readRow(sb, tenantId, locale, "__site_shell__");
      if (!row) throw new Error(`no ${locale} shell row`);
      const r = patchShellNavLinks(row.blocks ?? [], locale, { showHeroUrl: showHero });
      if (r.problems.length) throw new Error(`shell/${locale}: ${r.problems.join("; ")}`);
      const v = validateBuilderNodeTree(r.tree);
      if (!v.ok) throw new Error(`shell/${locale}: ${v.issues.map((i) => i.message).join("; ")}`);
      console.log(`  shell/${locale}: ${r.changed ? "nav links replaced" : "no change"} · v${row.version} → v${row.version + 1}`);
      if (apply && r.changed) await commitTree(sb, { tenantId, row, locale, tree: v.tree as BuilderNode[], actor });
    }
    if (apply) {
      for (const locale of ["en", "es"] as const) {
        const pub = await republishSiteShellSnapshot(sb, { tenantId, locale, actorProfileId: actor });
        console.log(`  shell/${locale} republish: ok=${pub.ok} ${"applied" in pub ? `applied=${pub.applied}` : ""} ${"reason" in pub ? pub.reason ?? "" : ""}`);
      }
    }
  }

  console.log(apply ? "DONE" : "DRY RUN complete — nothing written. Re-run with --apply.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

