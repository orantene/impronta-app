import "server-only";

/**
 * Server binding for {@link publishPageBodies}: the database calls Publish makes
 * for talent pages. Used by the single-page publish (builder) and the
 * whole-site publish (site manager), so both copy the draft body into the live
 * body the same way.
 *
 * The caller passes its own Supabase client, so RLS applies exactly as it did
 * before (owner or workspace staff).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import {
  publishPageBodies,
  type PublishablePageRow,
  type PublishPageBodiesResult,
} from "@/lib/talent-site/talent-page-publish-core";

/** A database without the `blocks_published` migration rejects the column. */
function isMissingBlocksPublishedColumn(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  return /blocks_published/.test(error.message ?? "") || error.code === "42703";
}

type PageDb = { id: string; blocks: unknown; updated_at: string };
const toRow = (p: PageDb): PublishablePageRow => ({ id: p.id, blocks: p.blocks, updatedAt: p.updated_at });

/**
 * Publish one page (`pageId`) or every page of the talent (no `pageId`):
 * status → published, `blocks_published` ← `blocks`.
 */
export async function publishTalentPageBodies(
  sb: SupabaseClient,
  input: { talentProfileId: string; pageId?: string; now?: string },
): Promise<PublishPageBodiesResult> {
  const { talentProfileId, pageId } = input;
  const now = input.now ?? new Date().toISOString();

  return publishPageBodies(
    {
      async readPages() {
        let q = sb
          .from("talent_pages")
          .select("id, blocks, updated_at")
          .eq("talent_profile_id", talentProfileId);
        if (pageId) q = q.eq("id", pageId);
        const { data, error } = await q;
        if (error) {
          logServerError("talentPagePublish.read", error);
          return { ok: false as const, error: error.message };
        }
        const rows = ((data ?? []) as PageDb[]).map(toRow);
        if (pageId && rows.length === 0) {
          return { ok: false as const, error: "Talent page not found." };
        }
        return { ok: true as const, rows };
      },

      async readPage(id) {
        const { data, error } = await sb
          .from("talent_pages")
          .select("id, blocks, updated_at")
          .eq("id", id)
          .eq("talent_profile_id", talentProfileId)
          .maybeSingle();
        if (error) {
          logServerError("talentPagePublish.reread", error);
          return null;
        }
        return data ? toRow(data as PageDb) : null;
      },

      async writePublished({ id, blocks, expectedUpdatedAt, now: at }) {
        const run = (payload: Record<string, unknown>) =>
          sb
            .from("talent_pages")
            .update(payload)
            .eq("id", id)
            .eq("talent_profile_id", talentProfileId)
            .eq("updated_at", expectedUpdatedAt)
            .select("published_at, updated_at");

        const base = { status: "published", published_at: at, updated_at: at };
        let { data, error } = await run({ ...base, blocks_published: blocks });
        if (error && isMissingBlocksPublishedColumn(error)) {
          // Code deployed ahead of its migration: publish the old way (status
          // only) rather than failing, and say so in dev logs.
          if (process.env.NODE_ENV !== "production") {
            // eslint-disable-next-line no-console -- dev-only signal for a missing migration
            console.warn(
              `[talent-page-publish] talent_pages.blocks_published missing; page ${id} published without a live snapshot. Apply 20261231289000_talent_pages_blocks_published.sql.`,
            );
          }
          ({ data, error } = await run(base));
        }
        if (error) {
          logServerError("talentPagePublish.write", error);
          return { ok: false as const, error: error.message };
        }
        const row = ((data ?? []) as Array<{ published_at: string; updated_at: string }>)[0];
        if (!row) return { ok: true as const, matched: false as const };
        return {
          ok: true as const,
          matched: true as const,
          publishedAt: row.published_at,
          updatedAt: row.updated_at,
        };
      },
    },
    { now },
  );
}
