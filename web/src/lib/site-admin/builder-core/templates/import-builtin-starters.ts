"use server";

/**
 * import-builtin-starters.ts — one-click "Sync built-in starters" for the
 * Builder Lab → Site Starter Kit manager.
 *
 * The hand-authored full-page designs (PAGE_DESIGNS — the same trees the
 * fidelity harness scores) used to be a read-only TS registry. This action
 * IMPORTS each one into `builder_templates` so the Site Starter Kit becomes a
 * DB-backed, manageable table (add / edit / tag / publish) like the other
 * catalog tabs. It is idempotent: re-running refreshes the existing rows rather
 * than duplicating them.
 *
 * Per design (keyed by the deterministic slug `builtin-<design.id>`):
 *   - exists  → updateTemplateDraft (refresh title/description/category/tags/
 *               target/tree from the code source — code stays the source of
 *               truth for the built-ins' content)
 *   - missing → createTemplateDraft
 *   - then publishTemplate so the row lands as status=published.
 *
 * No migration is needed — builder_templates already has every column. We do
 * NOT set thumbnail_asset_id: the built-in `thumbnailUrl`s are static public
 * paths, not media_assets UUIDs, so they don't fit that FK (the table layout
 * shows no image, matching the other catalog tabs).
 *
 * Gating: delegated to the underlying registry actions, every one of which is
 * requireSuperAdmin-gated. A non-admin caller gets the same
 * "Super admin access required." error those actions return, and nothing is
 * written. We also gate up-front via listAllTemplates so the slug lookup itself
 * never leaks rows to a non-admin.
 */

import {
  PAGE_DESIGNS,
  bakePageDesignTree,
} from "@/lib/site-admin/builder-node/page-designs";
import { PAGE_DESIGN_SUMMARIES } from "@/lib/site-admin/builder-node/page-designs/summaries";
import {
  createTemplateDraft,
  updateTemplateDraft,
  publishTemplate,
} from "./registry-actions";
import { listAllTemplates } from "./registry-admin-actions";
import type {
  BuilderTemplateRow,
  BuilderTemplateTarget,
} from "./registry-rows";

/**
 * The intended builder surface ("talent" | "workspace" | "both") lives on the
 * client-safe PAGE_DESIGN_SUMMARIES, NOT on the full PageDesign (which only
 * carries id/title/label/description/archetype/tree). Map it by id so the import
 * can stamp target_context; default to "both" if a design has no summary entry.
 */
const TARGET_BY_DESIGN_ID = new Map<string, BuilderTemplateTarget>(
  PAGE_DESIGN_SUMMARIES.map((s) => [s.id, s.target] as const),
);

/** The gallery tab that carries full-page starters (built-ins + playground
 *  page drafts). The Site Starter Kit manager lists exactly this tab. */
const STARTER_GALLERY_TAB = "page_templates";

export type ListStarterTemplatesResult =
  | { ok: true; data: BuilderTemplateRow[] }
  | { ok: false; error: string };

/**
 * The Site Starter Kit manager's row source: every `builder_templates` row on
 * the `page_templates` gallery tab, ALL statuses (draft + published + archived
 * etc.), newest first. A thin super_admin-gated wrapper over `listAllTemplates`
 * (the gate + service-role read live there) with the tab filter applied here so
 * the manager doesn't pull the whole template universe across the wire.
 */
export async function listStarterTemplatesAction(): Promise<ListStarterTemplatesResult> {
  const res = await listAllTemplates();
  if (!res.ok) return { ok: false, error: res.error };
  return {
    ok: true,
    data: res.data.filter((t) => t.gallery_tab === STARTER_GALLERY_TAB),
  };
}

/** Deterministic slug for a built-in design's imported row. The whole import is
 *  idempotent on this — re-running matches the existing row and refreshes it.
 *  Module-private: a "use server" file may only EXPORT async functions, so this
 *  pure helper stays internal. */
function builtinStarterSlug(designId: string): string {
  return `builtin-${designId}`;
}

export interface SyncBuiltinStartersSummary {
  /** Newly created (had no existing row). */
  imported: number;
  /** Matched an existing row and refreshed it. */
  updated: number;
  /** One human-readable line per design that failed (create/update/publish). */
  errors: string[];
}

export type SyncBuiltinStartersResult =
  | { ok: true; data: SyncBuiltinStartersSummary }
  | { ok: false; error: string };

export async function syncBuiltinStartersAction(): Promise<SyncBuiltinStartersResult> {
  // Read existing rows first. This is the super_admin gate (listAllTemplates is
  // requireSuperAdmin-gated) AND gives us the slug → id map for idempotency.
  const existing = await listAllTemplates();
  if (!existing.ok) return { ok: false, error: existing.error };

  const idBySlug = new Map<string, string>();
  for (const row of existing.data) idBySlug.set(row.slug, row.id);

  const summary: SyncBuiltinStartersSummary = {
    imported: 0,
    updated: 0,
    errors: [],
  };

  for (const design of PAGE_DESIGNS) {
    const slug = builtinStarterSlug(design.id);
    // Bake repeaters into static children so the imported tree is self-contained
    // and insert-ready (same bake the "Use this starter" path uses).
    const builderTree = bakePageDesignTree(design.tree, design.dataSources);
    const shared = {
      title: design.label,
      description: design.description,
      category: design.archetype,
      tags: [design.archetype],
      // target lives on the summary (not the full design); "both" is a valid
      // fallback if a design has no summary row.
      target_context: TARGET_BY_DESIGN_ID.get(design.id) ?? "both",
      builder_tree: builderTree,
    } satisfies Partial<BuilderTemplateRow> & {
      title: string;
      tags: string[];
      target_context: BuilderTemplateTarget;
    };

    const existingId = idBySlug.get(slug);
    let templateId: string;

    if (existingId) {
      const res = await updateTemplateDraft({ id: existingId, ...shared });
      if (!res.ok) {
        summary.errors.push(`${design.label}: update failed — ${res.error}`);
        continue;
      }
      templateId = res.data.id;
      summary.updated += 1;
    } else {
      const res = await createTemplateDraft({
        kind: "page_template",
        slug,
        gallery_tab: "page_templates",
        ...shared,
      });
      if (!res.ok) {
        summary.errors.push(`${design.label}: import failed — ${res.error}`);
        continue;
      }
      templateId = res.data.id;
      summary.imported += 1;
    }

    // Publish so the built-in lands as status=published. A per-design publish
    // failure is collected (not fatal) so one bad design never blocks the rest.
    const pub = await publishTemplate(templateId);
    if (!pub.ok) {
      summary.errors.push(`${design.label}: publish failed — ${pub.error}`);
    }
  }

  return { ok: true, data: summary };
}
