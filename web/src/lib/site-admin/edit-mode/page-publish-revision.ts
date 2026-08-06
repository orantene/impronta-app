/**
 * Pure helpers for the NON-HOMEPAGE (cms page) publish path.
 *
 * Kept OUT of `page-composer-action.ts` because that file is `"use server"` and
 * Next.js requires every export there to be an async Server Action (a non-async
 * export there is a runtime 500, see `feedback`/builder-lab lesson).
 *
 * Both helpers close 2026 draft-integrity gaps that had only ever been fixed on
 * the homepage lane:
 *
 *  - {@link isFreeformPagePublish} — a page built entirely from root freeform
 *    blocks has ZERO `cms_page_sections` draft rows. The composer used to
 *    hard-fail such a page with "No draft sections to publish", so it could
 *    never be published at all. The homepage carve-out (publishHomepage's
 *    `isFreeformHomepage`) is the template this mirrors.
 *
 *  - {@link buildPublishedPageRevisionSnapshot} — the publish bumps
 *    `cms_pages.version`, and every editor load reads the revision whose
 *    `version` MATCHES the page row. Publishing without writing a revision at
 *    the new version left that read empty: the canvas emptied immediately after
 *    "Published", and the next autosave persisted the degraded tree.
 */

import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

/**
 * FREEFORM page = zero curated draft slot rows AND a non-empty builder tree.
 * Anything else keeps the original zero-slot rejection.
 */
export function isFreeformPagePublish(input: {
  draftSlotRowCount: number;
  builderTree: unknown;
}): boolean {
  return (
    input.draftSlotRowCount === 0 &&
    Array.isArray(input.builderTree) &&
    input.builderTree.length > 0
  );
}

export interface PublishedPageRevisionInput {
  title: string;
  locale: string;
  metaDescription: string | null;
  /** The version the page row now carries (i.e. beforeVersion + 1). */
  version: number;
  publishedAt: string;
  /** Slot entries baked into the published snapshot. */
  composition: ReadonlyArray<Record<string, unknown>>;
  builderTree: BuilderNodeTree;
  /**
   * The revision that matched the PREVIOUS version. Style extras are carried
   * forward from it so a post-publish reload keeps linked classes / presets —
   * the editor reads them from the version-matched revision too.
   */
  previousSnapshot?: Record<string, unknown> | null;
}

export function buildPublishedPageRevisionSnapshot(
  input: PublishedPageRevisionInput,
): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {
    kind: "published",
    title: input.title,
    status: "published",
    locale: input.locale,
    meta_description: input.metaDescription,
    version: input.version,
    published_at: input.publishedAt,
    composition: input.composition,
  };
  if (input.builderTree.length > 0) {
    snapshot.builderTree = input.builderTree;
  }
  const prev = input.previousSnapshot;
  if (prev && typeof prev === "object") {
    if (prev.styleClasses) snapshot.styleClasses = prev.styleClasses;
    if (prev.stylePresets) snapshot.stylePresets = prev.stylePresets;
  }
  return snapshot;
}
