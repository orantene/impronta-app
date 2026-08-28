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
  /** Absolute origin serving this page — feeds the default canonical URL. */
  canonicalOrigin?: string;
  /** Origin-relative path of this page — feeds the default canonical URL. */
  canonicalPath?: string;
}): Promise<PublishedTalentPageRenderData | null> {
  const pub = createPublicSupabaseClient();
  if (!pub) return null;

  const actions: PublishedTalentPageActions = {
    async loadTalentByProfileCode(profileCode) {
      const { data, error } = await pub
        .from("talent_profiles")
        .select("id, display_name, created_by_agency_id, talent_plan_key, profile_kind")
        .eq("profile_code", profileCode)
        .neq("profile_kind", "resource")
        .is("deleted_at", null)
        .maybeSingle();
      if (error || !data) return null;
      const row = data as {
        id: string;
        display_name: string | null;
        created_by_agency_id: string | null;
        talent_plan_key: string | null;
        profile_kind: string | null;
      };
      if (row.profile_kind === "resource") return null;
      return {
        id: row.id,
        managingTenantId: row.created_by_agency_id ?? null,
        displayName: row.display_name,
        talentPlanKey: row.talent_plan_key ?? null,
      };
    },

    async loadTalentPage({ talentProfileId, slug }) {
      const { data, error } = await pub
        .from("talent_pages")
        .select(
          // SEO-1/SEO-3 columns are selected here so the Portfolio-gated
          // `<head>` envelope can actually be built — before this they were
          // written by the builder and read by nothing.
          "id, talent_profile_id, slug, title, status, blocks, theme, published_at, meta_title, meta_description, og_title, og_description, og_image_url, canonical_url, noindex, json_ld",
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
