import { buildTalentPortfolioStarterSnapshot } from "../starter";
import type { TalentSiteTemplateDef } from "./types";

/** Legacy Max starter layout — available as a Pro+ template option. */
export const ROSTER_TEMPLATE: TalentSiteTemplateDef = {
  key: "roster",
  label: "Roster",
  blurb: "Classic comp-card layout with hero, gallery, and contact.",
  availableAt: "pro",
  category: "classic",
  thumbnailUrl: "/talent-templates/roster.webp",
  buildSlots: (ctx) => {
    const snapshot = buildTalentPortfolioStarterSnapshot(ctx.profile, ctx.media);
    return snapshot.slots;
  },
};
