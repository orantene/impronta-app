import type {
  TalentPortfolioStarterMedia,
  TalentPortfolioStarterProfile,
} from "../starter";
import type { TalentSiteSnapshotSection } from "../types";
import type { TalentPlanTier } from "@/lib/access/talent-membership";

export type TalentSiteTemplateKey =
  // Free bases
  | "tulala-digital"
  | "base-minimal"
  | "base-bold"
  // Pro professions
  | "singer"
  | "chef"
  | "model"
  | "tattoo"
  // Legacy archetypes (kept registered for existing sites)
  | "roster"
  | "editorial"
  | "studio"
  | "stage"
  | "creator"
  | "epk";

/** Gallery grouping for the template picker. */
export type TemplateCategory =
  | "base"
  | "stage"
  | "studio"
  | "hospitality"
  | "home"
  | "classic";

export type TemplateBuildContext = {
  profile: TalentPortfolioStarterProfile;
  media: TalentPortfolioStarterMedia[];
  /**
   * "demo" lets a template include preview-only flourishes (sample booking
   * calendar, richer placeholder copy). "live" (default) is what a real talent
   * gets when they apply the template to their own profile.
   */
  mode?: "live" | "demo";
};

export type TalentSiteTemplateDef = {
  key: TalentSiteTemplateKey;
  label: string;
  blurb: string;
  /** Minimum tier to select this template. */
  availableAt: TalentPlanTier;
  /** Gallery grouping. */
  category: TemplateCategory;
  thumbnailUrl: string;
  buildSlots: (ctx: TemplateBuildContext) => TalentSiteSnapshotSection[];
};
