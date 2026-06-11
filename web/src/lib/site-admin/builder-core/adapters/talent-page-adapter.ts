"use server";

/**
 * Talent-page surface adapter (WS6) — the production binding.
 *
 * Persists the freeform `builderTree` to `talent_pages.blocks`.
 *
 * NEVER writes `cms_page_sections` / `composition[]` — enforced by:
 *   1. `assertNoLegacyBuilderWrite("talent_page", "talent_pages")` called
 *      in every mutation path (§F.1 runtime guard).
 *   2. The CI static grep (`legacy-write-guard.test.ts`) that fails if the
 *      literal "cms_page_sections" appears in a non-homepage adapter source.
 *
 * The pure DI factory lives in `talent-page-adapter-core.ts` (no runtime
 * imports), so the spy test can import and drive it without pulling in the
 * Supabase / Next.js server-action graph.
 *
 * Plan/tier gating (§E) — server-enforced:
 *   The `talent_pages` table has a `required_talent_tier` column. The calling
 *   surface (TalentMaxBuilderMount) gates the editor behind tier checks BEFORE
 *   reaching the adapter. The RLS policies allow only the talent owner + their
 *   workspace staff to write, so even if the front-end gate is bypassed the DB
 *   rejects unauthorized writes.
 */

import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";

import {
  createTalentPageAdapter,
  type TalentPageAdapterActions,
  type TalentPageRow,
} from "./talent-page-adapter-core";

export {
  createTalentPageAdapter,
  buildEmptyTalentPageComposition,
  type TalentPageAdapterActions,
  type TalentPageRow,
} from "./talent-page-adapter-core";

// ── Supabase action implementations ─────────────────────────────────────────

const productionActions: TalentPageAdapterActions = {
  async loadPage({ talentProfileId, slug }) {
    try {
      const sb = await getCachedServerSupabase();
      if (!sb) return null;
      const { data, error } = await sb
        .from("talent_pages")
        .select(
          "id, talent_profile_id, slug, title, status, blocks, theme, required_talent_tier, published_at, updated_at",
        )
        .eq("talent_profile_id", talentProfileId)
        .eq("slug", slug)
        .single();
      if (error || !data) return null;
      return data as TalentPageRow;
    } catch (err) {
      logServerError("talentPageAdapter/loadPage", err);
      return null;
    }
  },

  async savePage({ talentProfileId, pageId, patch }) {
    try {
      const sb = await getCachedServerSupabase();
      if (!sb)
        return { ok: false as const, error: "Supabase client unavailable." };

      const updatePayload: Record<string, unknown> = {
        blocks: patch.blocks,
        theme: patch.theme,
        updated_at: patch.updated_at,
      };
      if (patch.title !== undefined) updatePayload.title = patch.title;

      // Restrict to the talent's own pages (RLS enforces this too)
      const { data, error } = await sb
        .from("talent_pages")
        .update(updatePayload)
        .eq("id", pageId)
        .eq("talent_profile_id", talentProfileId)
        .select("updated_at")
        .single();

      if (error || !data)
        return { ok: false as const, error: error?.message ?? "Talent page save failed." };
      return { ok: true as const, updatedAt: data.updated_at as string };
    } catch (err) {
      logServerError("talentPageAdapter/savePage", err);
      return { ok: false as const, error: "Unexpected error saving talent page." };
    }
  },

  async publishPage({ talentProfileId, pageId }) {
    try {
      const sb = await getCachedServerSupabase();
      if (!sb)
        return { ok: false as const, error: "Supabase client unavailable." };

      const now = new Date().toISOString();
      const { data, error } = await sb
        .from("talent_pages")
        .update({ status: "published", published_at: now, updated_at: now })
        .eq("id", pageId)
        .eq("talent_profile_id", talentProfileId)
        .select("published_at, updated_at")
        .single();

      if (error || !data)
        return { ok: false as const, error: error?.message ?? "Talent page publish failed." };
      return {
        ok: true as const,
        publishedAt: data.published_at as string,
        updatedAt: data.updated_at as string,
      };
    } catch (err) {
      logServerError("talentPageAdapter/publishPage", err);
      return { ok: false as const, error: "Unexpected error publishing talent page." };
    }
  },

  async restoreRevision({ talentProfileId, pageId, revisionId }) {
    try {
      const sb = await getCachedServerSupabase();
      if (!sb)
        return { ok: false as const, error: "Supabase client unavailable." };

      // Load the revision
      const { data: rev, error: revErr } = await sb
        .from("talent_page_revisions")
        .select("blocks, theme")
        .eq("id", revisionId)
        .single();

      if (revErr || !rev)
        return {
          ok: false as const,
          error: revErr?.message ?? "Talent page revision not found.",
        };

      const now = new Date().toISOString();
      const { data, error } = await sb
        .from("talent_pages")
        .update({
          blocks: rev.blocks,
          theme: rev.theme,
          updated_at: now,
          status: "draft",
        })
        .eq("id", pageId)
        .eq("talent_profile_id", talentProfileId)
        .select("updated_at")
        .single();

      if (error || !data)
        return { ok: false as const, error: error?.message ?? "Talent page restore failed." };
      return { ok: true as const, updatedAt: data.updated_at as string };
    } catch (err) {
      logServerError("talentPageAdapter/restoreRevision", err);
      return { ok: false as const, error: "Unexpected error restoring talent page revision." };
    }
  },
};

/**
 * Create a talent_page adapter bound to a specific talent profile id. Persists
 * the freeform builderTree to `talent_pages.blocks`; NEVER writes
 * `cms_page_sections`.
 *
 * Call once per mount (talentProfileId captured in closure for DB scoping).
 */
export function createBoundTalentPageAdapter(talentProfileId: string) {
  return createTalentPageAdapter(productionActions, { talentProfileId });
}
