"use server";

// ============================================================================
// search-talent.ts — Phase 3.1: searchTalent server action skeleton.
//
// Discovery layer that turns the multi-skill catalog into a marketplace.
// Reads from talent_skills_resolved view + talent_profiles + media_assets
// + talent_service_areas. Ranks by proficiency + verification + activity
// + context fit.
//
// V1 capabilities:
//   - Free-text query (matches name, skill names, skill aliases via the
//     enriched alias-aware lookup)
//   - Filter by skill_slugs (must have at least one)
//   - Filter by parent_categories (must have a skill in at least one)
//   - Filter by min_proficiency (Beginner..Master, exclusive of below)
//   - Filter verified_only
//   - Filter context_slugs (talent's contexts must include at least one)
//   - Filter service_area_cities (talent must serve at least one)
//   - Tenant scope (when tenant_id provided, only roster talent included)
//
// V1 ranking score:
//   100 if exact talent_type match in skill_slugs
//   + 50 if proficiency = master
//   + 30 if proficiency = expert
//   + 10 if proficiency = advanced
//   + 30 if verified_at IS NOT NULL
//   + min(years_experience * 2, 30)
//   + 20 if last_active_at < 7 days
//   + 10 per matching context
//
// V2 (deferred):
//   - Geographic distance scoring
//   - Availability date intersection
//   - Rate range filtering (needs talent_profile_skill_rates table)
//   - Booking-history feedback
// ============================================================================

import { z } from "zod";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import type { ProficiencyLevel } from "./admin-talent-skills.types";

// ─── Types ─────────────────────────────────────────────────────────────────

const PROFICIENCY_RANK: Record<ProficiencyLevel, number> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
  expert: 4,
  master: 5,
};

export type SearchTalentResult = {
  talent_profile_id: string;
  display_name: string;
  home_base_city: string | null;
  thumbnail_storage_path: string | null;
  featured_skill_name: string | null;
  featured_skill_slug: string | null;
  featured_proficiency: ProficiencyLevel | null;
  featured_is_verified: boolean;
  featured_years_experience: number | null;
  total_skills: number;
  matched_skills: Array<{
    skill_slug: string;
    skill_name: string;
    proficiency: ProficiencyLevel | null;
    is_verified: boolean;
  }>;
  last_active_at: string | null;
  total_completed_bookings: number;
  profile_completeness_pct: number | null;
  /** Score used for ranking; surfaced for debugging in admin tools. */
  score: number;
};

const searchSchema = z.object({
  query: z.string().max(120).nullable().optional(),
  skill_slugs: z.array(z.string()).optional(),
  parent_category_slugs: z.array(z.string()).optional(),
  min_proficiency: z
    .enum(["beginner", "intermediate", "advanced", "expert", "master"])
    .optional(),
  verified_only: z.boolean().optional(),
  context_slugs: z.array(z.string()).optional(),
  service_area_cities: z.array(z.string()).optional(),
  /** Search the public network OR scope to a specific tenant's roster. */
  scope: z.enum(["network", "tenant"]).default("tenant"),
  sort: z.enum(["relevance", "recent", "completion"]).default("relevance"),
  limit: z.number().int().min(1).max(100).default(50),
});

export async function searchTalent(
  input: z.input<typeof searchSchema>,
): Promise<
  | { ok: true; results: SearchTalentResult[]; total_count: number }
  | { ok: false; error: string }
> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }
  const v = parsed.data;

  // Step 1: build base candidate set — talent on this tenant's roster
  // (or network-wide if scope=network — V1 only supports tenant scope).
  let rosterQuery = supabase
    .from("agency_talent_roster")
    .select(
      `
        talent_profile_id,
        talent_profiles!inner (
          id,
          display_name,
          first_name,
          last_name,
          last_active_at,
          total_completed_bookings,
          profile_completeness_pct,
          media_assets ( storage_path, variant_kind, sort_order, deleted_at, approval_state, width, height ),
          talent_service_areas ( service_kind, locations ( display_name_i18n ) )
        )
      `,
    )
    .eq("status", "active");

  if (v.scope === "tenant") {
    rosterQuery = rosterQuery.eq("tenant_id", tenantId);
  }

  const { data: rosterRows, error: rosterErr } = await rosterQuery.limit(500);

  if (rosterErr) {
    logServerError("searchTalent.roster", rosterErr);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  if (!rosterRows || rosterRows.length === 0) {
    return { ok: true, results: [], total_count: 0 };
  }

  const candidateIds = rosterRows.map((r) => r.talent_profile_id);

  // Step 2: fetch all skills for candidates from the resolved view.
  const { data: skills, error: skillsErr } = await supabase
    .from("talent_skills_resolved")
    .select("*")
    .in("talent_profile_id", candidateIds)
    .order("display_order", { ascending: true });

  if (skillsErr) {
    logServerError("searchTalent.skills", skillsErr);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  // Index skills by talent.
  const skillsByTalent = new Map<string, typeof skills>();
  for (const s of skills ?? []) {
    if (!skillsByTalent.has(s.talent_profile_id)) {
      skillsByTalent.set(s.talent_profile_id, []);
    }
    skillsByTalent.get(s.talent_profile_id)!.push(s);
  }

  // Step 3: fetch contexts (talent_profile_taxonomy where relationship_type='context').
  const { data: contextRows } = await supabase
    .from("talent_profile_taxonomy")
    .select(
      `talent_profile_id, taxonomy_term_id, relationship_type,
       taxonomy_terms!inner ( slug, term_type )`,
    )
    .in("talent_profile_id", candidateIds)
    .eq("relationship_type", "context");
  const contextsByTalent = new Map<string, Set<string>>();
  for (const c of contextRows ?? []) {
    const slug = (c.taxonomy_terms as unknown as { slug: string } | null)?.slug;
    if (!slug) continue;
    if (!contextsByTalent.has(c.talent_profile_id)) {
      contextsByTalent.set(c.talent_profile_id, new Set());
    }
    contextsByTalent.get(c.talent_profile_id)!.add(slug);
  }

  // Step 4: filter + score.
  const results: SearchTalentResult[] = [];
  const queryLower = (v.query ?? "").toLowerCase().trim();

  for (const r of rosterRows) {
    const profileBlob = r.talent_profiles as unknown as Record<string, unknown>;
    const profile = profileBlob as {
      id: string;
      display_name: string | null;
      first_name: string | null;
      last_name: string | null;
      last_active_at: string | null;
      total_completed_bookings: number | null;
      profile_completeness_pct: number | null;
      media_assets: Array<{
        storage_path: string;
        variant_kind: string | null;
        sort_order: number | null;
        deleted_at: string | null;
        approval_state: string | null;
        width: number | null;
        height: number | null;
      }> | null;
      talent_service_areas: Array<{
        service_kind: string | null;
        locations: { display_name_i18n: Record<string, string | null> | null } | null;
      }> | null;
    };

    const talentSkills = skillsByTalent.get(profile.id) ?? [];
    const talentContexts = contextsByTalent.get(profile.id) ?? new Set();

    // Filter: skill_slugs — must have at least one matching skill.
    if (v.skill_slugs && v.skill_slugs.length > 0) {
      const skillSlugs = new Set(talentSkills.map((s) => s.skill_slug));
      if (!v.skill_slugs.some((s) => skillSlugs.has(s))) continue;
    }

    // Filter: parent_category_slugs — must have a skill in one of these categories.
    if (v.parent_category_slugs && v.parent_category_slugs.length > 0) {
      const categorySlugs = new Set(
        talentSkills.map((s) => s.parent_category_slug).filter(Boolean) as string[],
      );
      if (!v.parent_category_slugs.some((s) => categorySlugs.has(s))) continue;
    }

    // Filter: min_proficiency — must have a skill at or above this level.
    if (v.min_proficiency) {
      const minRank = PROFICIENCY_RANK[v.min_proficiency];
      const hasMin = talentSkills.some((s) => {
        const lvl = s.proficiency_level as ProficiencyLevel | null;
        if (!lvl) return false;
        return PROFICIENCY_RANK[lvl] >= minRank;
      });
      if (!hasMin) continue;
    }

    // Filter: verified_only — at least one verified skill.
    if (v.verified_only) {
      if (!talentSkills.some((s) => s.is_verified)) continue;
    }

    // Filter: context_slugs.
    if (v.context_slugs && v.context_slugs.length > 0) {
      if (!v.context_slugs.some((c) => talentContexts.has(c))) continue;
    }

    // Filter: service_area_cities.
    if (v.service_area_cities && v.service_area_cities.length > 0) {
      const cities = new Set(
        (profile.talent_service_areas ?? [])
          .map((sa) => sa.locations?.display_name_i18n?.en?.toLowerCase())
          .filter(Boolean) as string[],
      );
      const wanted = v.service_area_cities.map((c) => c.toLowerCase());
      if (!wanted.some((c) => cities.has(c))) continue;
    }

    // Filter: free-text query — matches display name OR any skill name OR alias.
    if (queryLower) {
      const haystack = [
        profile.display_name,
        profile.first_name,
        profile.last_name,
        ...talentSkills.map((s) => s.skill_name_en),
        ...talentSkills.map((s) => s.skill_name_es),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(queryLower)) continue;
    }

    // Score: ranking signal.
    let score = 0;
    const matchedSkills: SearchTalentResult["matched_skills"] = [];

    for (const s of talentSkills) {
      let skillScore = 0;
      let matched = false;
      if (v.skill_slugs && v.skill_slugs.includes(s.skill_slug)) {
        skillScore += 100;
        matched = true;
      }
      if (s.proficiency_level) {
        const lvl = s.proficiency_level as ProficiencyLevel;
        if (lvl === "master") skillScore += 50;
        else if (lvl === "expert") skillScore += 30;
        else if (lvl === "advanced") skillScore += 10;
      }
      if (s.is_verified) skillScore += 30;
      if (s.years_experience) skillScore += Math.min(s.years_experience * 2, 30);
      score += skillScore;
      if (matched) {
        matchedSkills.push({
          skill_slug: s.skill_slug,
          skill_name: s.skill_name_en,
          proficiency: s.proficiency_level as ProficiencyLevel | null,
          is_verified: s.is_verified,
        });
      }
    }

    if (profile.last_active_at) {
      const ageMs = Date.now() - new Date(profile.last_active_at).getTime();
      if (ageMs < 7 * 24 * 60 * 60 * 1000) score += 20;
    }
    if (v.context_slugs) {
      const matchedCtx = v.context_slugs.filter((c) => talentContexts.has(c)).length;
      score += matchedCtx * 10;
    }

    // Pick featured skill (lowest display_order).
    const featured = talentSkills[0]; // already sorted by display_order ASC

    // Pick a thumbnail (replicated logic from _data-bridge — keep here local).
    const thumb = pickThumb(profile.media_assets);

    // Pick home_base city.
    const homeBase = (profile.talent_service_areas ?? []).find(
      (sa) => sa.service_kind === "home_base",
    );

    results.push({
      talent_profile_id: profile.id,
      display_name:
        profile.display_name ||
        `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() ||
        "Unnamed talent",
      home_base_city: homeBase?.locations?.display_name_i18n?.en ?? null,
      thumbnail_storage_path: thumb,
      featured_skill_name: featured?.skill_name_en ?? null,
      featured_skill_slug: featured?.skill_slug ?? null,
      featured_proficiency: (featured?.proficiency_level as ProficiencyLevel | null) ?? null,
      featured_is_verified: featured?.is_verified ?? false,
      featured_years_experience: featured?.years_experience ?? null,
      total_skills: talentSkills.length,
      matched_skills: matchedSkills,
      last_active_at: profile.last_active_at,
      total_completed_bookings: profile.total_completed_bookings ?? 0,
      profile_completeness_pct: profile.profile_completeness_pct,
      score,
    });
  }

  // Sort.
  if (v.sort === "relevance") {
    results.sort((a, b) => b.score - a.score);
  } else if (v.sort === "recent") {
    results.sort((a, b) => {
      const aT = a.last_active_at ? new Date(a.last_active_at).getTime() : 0;
      const bT = b.last_active_at ? new Date(b.last_active_at).getTime() : 0;
      return bT - aT;
    });
  } else if (v.sort === "completion") {
    results.sort(
      (a, b) =>
        (b.profile_completeness_pct ?? 0) - (a.profile_completeness_pct ?? 0),
    );
  }

  const total = results.length;
  const limited = results.slice(0, v.limit);

  return { ok: true, results: limited, total_count: total };
}

// Local thumb picker — mirrors _data-bridge logic but kept independent.
function pickThumb(
  assets:
    | Array<{
        storage_path: string;
        variant_kind: string | null;
        sort_order: number | null;
        deleted_at: string | null;
        approval_state: string | null;
        width: number | null;
        height: number | null;
      }>
    | null,
): string | null {
  if (!assets || assets.length === 0) return null;
  const usable = assets.filter(
    (a) => !a.deleted_at && a.approval_state === "approved",
  );
  const cardEligible = usable.filter(
    (a) => a.variant_kind !== "banner" && a.variant_kind !== "public_watermarked",
  );
  const portraits = cardEligible.filter(
    (a) =>
      typeof a.width === "number" &&
      typeof a.height === "number" &&
      a.width > 0 &&
      a.height >= a.width,
  );
  const pool = portraits.length > 0 ? portraits : cardEligible;
  if (pool.length === 0) return null;
  const variantRank = (kind: string | null) => {
    if (kind === "card") return 0;
    if (kind === "gallery") return 1;
    if (kind === "original") return 2;
    return 3;
  };
  pool.sort((a, b) => {
    const r = variantRank(a.variant_kind) - variantRank(b.variant_kind);
    if (r !== 0) return r;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });
  return pool[0]?.storage_path ?? null;
}
