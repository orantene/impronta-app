// ============================================================================
// admin-talent-skills.types.ts — Shared types + constants for the multi-skill
// system. Extracted from admin-talent-skills.ts because Next.js disallows
// non-async exports from "use server" files.
// ============================================================================

export type ProficiencyLevel =
  | "beginner"
  | "intermediate"
  | "advanced"
  | "expert"
  | "master";

export const PROFICIENCY_LEVELS: ProficiencyLevel[] = [
  "beginner",
  "intermediate",
  "advanced",
  "expert",
  "master",
];

export const PROFICIENCY_META: Record<
  ProficiencyLevel,
  { dots: number; label: string; description: string }
> = {
  beginner: {
    dots: 1,
    label: "Beginner",
    description: "Just starting · learning · open to gigs",
  },
  intermediate: {
    dots: 2,
    label: "Intermediate",
    description: "Done it a few times · comfortable",
  },
  advanced: {
    dots: 3,
    label: "Advanced",
    description: "Regular paid work",
  },
  expert: {
    dots: 4,
    label: "Expert",
    description: "Top of category · signature skill",
  },
  master: {
    dots: 5,
    label: "Master",
    description: "Industry-leading work",
  },
};

export type ResolvedSkill = {
  skill_term_id: string;
  skill_slug: string;
  skill_name_en: string;
  skill_name_es: string | null;
  is_generic_fallback: boolean;
  parent_category_id: string | null;
  parent_category_slug: string | null;
  parent_category_name_en: string | null;
  relationship_type: "primary_role" | "secondary_role";
  proficiency_level: ProficiencyLevel | null;
  years_experience: number | null;
  display_order: number;
  is_verified: boolean;
  verified_at: string | null;
  verified_by_tenant_id: string | null;
  verification_note: string | null;
  created_at: string;
};

export const MAX_TOTAL_SKILLS = 9;
