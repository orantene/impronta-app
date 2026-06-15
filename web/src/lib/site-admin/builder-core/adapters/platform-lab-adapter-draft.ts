/**
 * Draft-bound Platform Lab adapter (Phase 3) — persists the Lab editor's
 * freeform tree to a `builder_templates` DRAFT row instead of the ephemeral
 * no-op sink. A Playground draft IS a draft template: `load` reads its
 * `builder_tree`, `save` / `saveDraft` persist via `updateTemplateDraft`, and
 * `publish` promotes it to the gallery via `publishTemplate`.
 *
 * Unlike the singleton ephemeral adapter (`platform-lab-adapter.ts`), this is a
 * PER-DRAFT factory that closes over the draft id. And unlike the pure core
 * factory (`platform-lab-adapter-core.ts`, which imports nothing at runtime so
 * the ephemeral-sink spy test can load it bare), THIS module imports the WS2
 * registry server actions — so it lives in its own file and is only pulled in
 * when a Playground draft is actually opened.
 */

import type {
  CompositionData,
  CompositionLoadResult,
  CompositionSaveInput,
  CompositionSaveResult,
  SaveDraftResult,
  PublishResult,
} from "@/lib/site-admin/edit-mode/composition-actions";

import type {
  BuilderSurfaceAdapter,
  BuilderSurfaceContext,
  BuilderSurfacePublishInput,
  BuilderSurfaceSaveDraftInput,
} from "../surface-adapter";
import { updateTemplateDraft, publishTemplate } from "../templates/registry-actions";
import { getTemplateById } from "../templates/registry-admin-actions";
import type { BuilderTemplateRow } from "../templates/registry-rows";

/** Forward the editor's title / meta-description edits to the draft row. Page
 *  Settings is the natural place to NAME a Playground draft, so a non-empty
 *  title becomes the template title and the meta description its description.
 *  Empty/absent values are skipped so a metadata-light save never wipes them. */
function draftMetadataPatch(
  metadata: CompositionSaveInput["metadata"] | undefined,
): { title?: string; description?: string | null } {
  const patch: { title?: string; description?: string | null } = {};
  if (metadata?.title && metadata.title.trim()) patch.title = metadata.title;
  if (metadata?.metaDescription !== undefined) {
    patch.description = metadata.metaDescription;
  }
  return patch;
}

/** Build the editor's CompositionData lingua franca from a draft template row.
 *  Only `builderTree` carries real content for a freeform Lab draft; the rest is
 *  inert metadata so the editor mounts. */
function compositionFromRow(
  row: BuilderTemplateRow,
  locale: string,
  pageVersion: number,
): CompositionData {
  return {
    locale: locale as CompositionData["locale"],
    pageId: row.id,
    pageVersion,
    liveSitePublishedAt: row.published_at,
    metadata: {
      title: row.title,
      metaTitle: null,
      metaDescription: row.description,
      introTagline: null,
      ogTitle: null,
      ogDescription: null,
      ogImageUrl: null,
      canonicalUrl: null,
      noindex: true,
    },
    slots: {},
    builderTree: row.builder_tree ?? [],
    slotDefs: [],
    library: [],
    availableLocales: [locale as CompositionData["locale"]],
  };
}

/**
 * Create a draft-bound platform_lab adapter for one `builder_templates` draft.
 * Persistence is last-write-wins (a single super-admin authoring surface), so an
 * in-memory version advances per write to satisfy the editor's optimistic-save
 * loop while the tree is persisted to the row.
 */
export function createDraftBoundPlatformLabAdapter(
  draftId: string,
): BuilderSurfaceAdapter {
  let version = 1;
  const bump = () => (version += 1);

  return {
    kind: "platform_lab",

    async load(ctx: BuilderSurfaceContext): Promise<CompositionLoadResult> {
      const res = await getTemplateById(draftId);
      if (!res.ok) return { ok: false, error: res.error };
      if (res.data.version > 0) version = res.data.version;
      return { ok: true, data: compositionFromRow(res.data, ctx.locale, version) };
    },

    async save(
      _ctx: BuilderSurfaceContext,
      input: CompositionSaveInput,
    ): Promise<CompositionSaveResult> {
      const res = await updateTemplateDraft({
        id: draftId,
        ...draftMetadataPatch(input.metadata),
        ...(input.builderTree !== undefined
          ? { builder_tree: input.builderTree }
          : {}),
      });
      if (!res.ok) return { ok: false, error: res.error };
      return { ok: true, pageVersion: bump() };
    },

    async saveDraft(
      _ctx: BuilderSurfaceContext,
      input: BuilderSurfaceSaveDraftInput,
    ): Promise<SaveDraftResult> {
      const res = await updateTemplateDraft({
        id: draftId,
        ...draftMetadataPatch(input.metadata),
        ...(input.builderTree !== undefined
          ? { builder_tree: input.builderTree }
          : {}),
      });
      if (!res.ok) return { ok: false, error: res.error };
      return { ok: true, pageVersion: bump(), savedAt: new Date().toISOString() };
    },

    async publish(
      _ctx: BuilderSurfaceContext,
      _input: BuilderSurfacePublishInput,
    ): Promise<PublishResult> {
      const res = await publishTemplate(draftId);
      if (!res.ok) return { ok: false, error: res.error };
      return {
        ok: true,
        pageVersion: bump(),
        publishedAt: res.data.published_at ?? new Date().toISOString(),
      };
    },

    // No `restoreRevision`: publish writes revisions, but the editor's restore
    // affordance keys off a revision id space this surface doesn't expose yet.
    // Omitting it cleanly disables "Restore revision" on the Lab surface.
  };
}
