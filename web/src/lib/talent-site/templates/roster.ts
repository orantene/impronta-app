import { buildTalentPortfolioStarterSnapshot } from "../starter";
import type { TalentSiteTemplateDef } from "./types";

/** Legacy Max starter layout — available as a Pro+ template option. */
export const ROSTER_TEMPLATE: TalentSiteTemplateDef = {
  key: "roster",
  label: "Roster",
  blurb: "A classic comp-card layout with a split hero, a portfolio gallery and a contact section. A solid starting point for models and performers.",
  availableAt: "pro",
  thumbnailUrl: "/talent-templates/roster.webp",
  buildSlots: (ctx) => {
    const snapshot = buildTalentPortfolioStarterSnapshot(ctx.profile, ctx.media);
    return snapshot.slots;
  },
};
