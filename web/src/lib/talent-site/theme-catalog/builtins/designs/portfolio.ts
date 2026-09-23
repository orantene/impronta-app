import type { BuiltinDesignEntry } from "../types";
import { buildBuiltinDesignPayload } from "./_shared";

/**
 * PORTFOLIO — work-grid forward (`max-site-templates` key "portfolio"): a
 * 60-40 split hero then a prominent 3-up gallery placed BEFORE services, so
 * the work leads. See `max-site-templates/registry.ts`.
 */
export const portfolioDesign: BuiltinDesignEntry = {
  kind: "design",
  slug: "portfolio",
  title: "Portfolio",
  summary:
    "Work leads: a copy-weighted hero, then a prominent 3-column gallery up top, with services and contact below.",
  category: "creator",
  tags: ["gallery-first", "work-grid", "creator"],
  required_talent_tier: "talent_basic",
  sort_order: 40,
  is_new_until: null,
  preview: {
    thumbnailUrl: "/marketing/photos/mk-models-runway.jpg",
  },
  buildPayload: () => buildBuiltinDesignPayload("portfolio"),
};
