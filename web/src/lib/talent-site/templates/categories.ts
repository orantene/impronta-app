import type { TemplateCategory } from "./types";

/** Display order of template groups in the picker gallery. */
export const CATEGORY_ORDER: TemplateCategory[] = [
  "base",
  "stage",
  "studio",
  "hospitality",
  "home",
  "classic",
];

export const CATEGORY_LABEL: Record<TemplateCategory, string> = {
  base: "Start here",
  stage: "Stage & performers",
  studio: "Studio & creators",
  hospitality: "Food & hospitality",
  home: "Home & wellness",
  classic: "Classic layouts",
};

export const CATEGORY_BLURB: Record<TemplateCategory, string> = {
  base: "Free with every account — clean, flexible starting points.",
  stage: "Performance-forward pages built to get booked.",
  studio: "Portfolio-led pages for visual & creative work.",
  hospitality: "Menu- and experience-led pages.",
  home: "Trust-first pages for in-home & wellness services.",
  classic: "The original Tulala layouts.",
};
