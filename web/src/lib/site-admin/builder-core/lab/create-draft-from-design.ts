"use server";

/**
 * Create a Playground draft seeded with a full-page starter design (Builder Lab
 * → Site Starter Kit → "Use this starter"). Bakes the chosen page design into a
 * self-contained, insert-ready freeform tree (same `bakePageDesignTree` the
 * first-run picker uses) and writes it as a new `builder_templates` draft, so
 * the editor opens pre-filled with the design. Gating is delegated to
 * `createTemplateDraft` (super_admin only).
 */

import {
  getPageDesign,
  bakePageDesignTree,
} from "@/lib/site-admin/builder-node/page-designs";
import { createTemplateDraft } from "../templates/registry-actions";
import type { BuilderTemplateTarget } from "../templates/registry-rows";

export async function createPlaygroundDraftFromDesign(input: {
  designId: string;
  target: BuilderTemplateTarget;
}): Promise<{ ok: true; draftId: string } | { ok: false; error: string }> {
  const design = getPageDesign(input.designId);
  if (!design) {
    return { ok: false, error: `Unknown design "${input.designId}".` };
  }

  const builderTree = bakePageDesignTree(design.tree, design.dataSources);
  const stamp = Date.now().toString(36);

  const res = await createTemplateDraft({
    kind: "page_template",
    title: `${design.label} (starter)`,
    slug: `playground-${input.designId}-${stamp}`,
    category: "playground",
    gallery_tab: "page_templates",
    target_context: input.target,
    builder_tree: builderTree,
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, draftId: res.data.id };
}
