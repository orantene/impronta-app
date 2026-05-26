import type {
  TalentPortfolioStarterMedia,
  TalentPortfolioStarterProfile,
} from "../starter";
import type { TalentSiteSnapshotSection } from "../types";
import type { TalentPlanTier } from "@/lib/access/talent-membership";

export type TalentSiteTemplateKey =
  | "tulala-digital"
  | "roster"
  | "editorial"
  | "studio"
  | "stage"
  | "creator"
  | "epk";

export type TemplateBuildContext = {
  profile: TalentPortfolioStarterProfile;
  media: TalentPortfolioStarterMedia[];
};

export type TalentSiteTemplateDef = {
  key: TalentSiteTemplateKey;
  label: string;
  blurb: string;
  /** Minimum tier to select this template */
  availableAt: TalentPlanTier;
  thumbnailUrl: string;
  buildSlots: (ctx: TemplateBuildContext) => TalentSiteSnapshotSection[];
};
