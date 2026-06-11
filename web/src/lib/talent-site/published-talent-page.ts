/**
 * Published talent_page loader — production binding.
 *
 * Wires the pure resolver in `published-talent-page-core.ts` to the public anon
 * Supabase client. Used by the public renderer at `/t/[profileCode]/[pageSlug]`.
 *
 * Reads are anon-scoped:
 *   - `talent_profiles` anon RLS returns only non-deleted public rows.
 *   - `talent_pages` anon RLS returns only `status='published'` rows.
 * The core ALSO re-checks `status==='published'` as defense-in-depth.
 */

import { createPublicSupabaseClient } from "@/lib/supabase/public";

import {
  resolvePublishedTalentPage,
  type PublishedTalentPageActions,
  type PublishedTalentPageRenderData,
  type PublishedTalentPageRow,
  type ResolvedTalentProfileRef,
} from "./published-talent-page-core";

export type {
  PublishedTalentPageRenderData,
  PublishedTalentPageRow,
  ResolvedTalentProfileRef,
};

/**
 * Load + resolve a published talent page by (profileCode, slug). Returns null
 * when the profile or page is missing, the page is not published, or Supabase
 * is unconfigured — the public route maps null to `notFound()`.
 */
export async function loadPublishedTalentPage(input: {
  profileCode: string;
  slug: string;
}): Promise<PublishedTalentPageRenderData | null> {
  const pub = createPublicSupabaseClient();
  if (!pub) return null;

  const actions: PublishedTalentPageActions = {
    async loadTalentByProfileCode(profileCode) {
      const { data, error } = await pub
        .from("talent_profiles")
        .select("id, display_name, created_by_agency_id")
        .eq("profile_code", profileCode)
        .is("deleted_at", null)
        .maybeSingle();
      if (error || !data) return null;
      const row = data as {
        id: string;
        display_name: string | null;
        created_by_agency_id: string | null;
      };
      return {
        id: row.id,
        managingTenantId: row.created_by_agency_id ?? null,
        displayName: row.display_name,
      };
    },

    async loadTalentPage({ talentProfileId, slug }) {
      const { data, error } = await pub
        .from("talent_pages")
        .select(
          "id, talent_profile_id, slug, title, status, blocks, theme, published_at",
        )
        .eq("talent_profile_id", talentProfileId)
        .eq("slug", slug)
        .maybeSingle();
      if (error || !data) return null;
      return data as PublishedTalentPageRow;
    },
  };

  return resolvePublishedTalentPage(actions, input);
}
