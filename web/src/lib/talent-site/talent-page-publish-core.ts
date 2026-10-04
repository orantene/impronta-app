/**
 * Talent page publish — PURE CORE (no runtime imports).
 *
 * A talent page has two bodies:
 *   - `blocks`            the DRAFT. The builder reads and writes it on every save.
 *   - `blocks_published`  what VISITORS see. Only Publish writes it.
 *
 * Before `blocks_published` existed, Publish only flipped `status`, so every
 * save on an already-published page was public at once. This module owns the
 * two rules that keep the draft private:
 *
 *   1. {@link publicPageBody} — which body a given viewer is shown.
 *   2. {@link publishPageBodies} — Publish copies the draft body into the live
 *      body, guarded against a save landing between the read and the write.
 *
 * The server binding (`server/publish-talent-page-bodies.ts`) supplies the
 * database calls; tests drive the same code with an in-memory table.
 */

/** The two page-body columns, as a loader row carries them. */
export interface TalentPageBodies {
  /** Draft body (`talent_pages.blocks`). */
  blocks: unknown;
  /**
   * Live body (`talent_pages.blocks_published`). `undefined` when the column was
   * not read (a database without the migration); `null` when the page has never
   * been published since the column was added.
   */
  blocksPublished?: unknown;
}

/**
 * The page body a viewer sees.
 *
 * - The owner's draft preview always sees the draft.
 * - Everyone else sees the published snapshot. Where no snapshot exists (column
 *   not migrated yet, or a page published by code that predates it) the draft
 *   is the only body there is, which is exactly what was served before.
 */
export function publicPageBody(
  page: TalentPageBodies,
  opts: { draftPreview: boolean },
): unknown {
  if (opts.draftPreview) return page.blocks;
  if (page.blocksPublished === undefined || page.blocksPublished === null) return page.blocks;
  return page.blocksPublished;
}

/** A page row as Publish reads it. */
export interface PublishablePageRow {
  id: string;
  blocks: unknown;
  /** `talent_pages.updated_at`, used as the compare-and-swap token. */
  updatedAt: string;
}

export interface PublishPageBodiesActions {
  /** Read the pages to publish (one page, or every page of the talent). */
  readPages(): Promise<{ ok: true; rows: PublishablePageRow[] } | { ok: false; error: string }>;
  /** Re-read one page after a concurrent save. `null` = the page is gone. */
  readPage(id: string): Promise<PublishablePageRow | null>;
  /**
   * Mark the page published and set its live body — ONLY if the row still has
   * `expectedUpdatedAt` (otherwise a save landed in between). `matched: false`
   * means nothing was written and the caller should re-read and retry.
   */
  writePublished(input: {
    id: string;
    blocks: unknown;
    expectedUpdatedAt: string;
    now: string;
  }): Promise<
    | { ok: true; matched: true; publishedAt: string; updatedAt: string }
    | { ok: true; matched: false }
    | { ok: false; error: string }
  >;
}

export interface PublishedPage {
  id: string;
  publishedAt: string;
  updatedAt: string;
}

export type PublishPageBodiesResult =
  | { ok: true; pages: PublishedPage[] }
  | { ok: false; error: string };

/** A save racing the publish is retried this many times before giving up. */
export const PUBLISH_MAX_ATTEMPTS = 3;

/**
 * Publish: for each page, copy the draft body into the live body and mark the
 * page published. The write is conditional on `updated_at`, so the body that
 * goes live is always the body that was read; if a save lands in between, the
 * page is re-read and the newer draft is published instead.
 */
export async function publishPageBodies(
  actions: PublishPageBodiesActions,
  opts: { now: string; maxAttempts?: number },
): Promise<PublishPageBodiesResult> {
  const maxAttempts = opts.maxAttempts ?? PUBLISH_MAX_ATTEMPTS;
  const read = await actions.readPages();
  if (!read.ok) return { ok: false, error: read.error };

  const published: PublishedPage[] = [];
  for (const first of read.rows) {
    let row: PublishablePageRow | null = first;
    let done = false;
    for (let attempt = 0; attempt < maxAttempts && row; attempt += 1) {
      const res = await actions.writePublished({
        id: row.id,
        blocks: row.blocks,
        expectedUpdatedAt: row.updatedAt,
        now: opts.now,
      });
      if (!res.ok) return { ok: false, error: res.error };
      if (res.matched) {
        published.push({ id: row.id, publishedAt: res.publishedAt, updatedAt: res.updatedAt });
        done = true;
        break;
      }
      row = await actions.readPage(row.id);
    }
    // A page deleted mid-publish has nothing to publish; skip it.
    if (!done && row) {
      return {
        ok: false,
        error: "Your page kept changing while it was being published. Try again.",
      };
    }
  }
  return { ok: true, pages: published };
}
