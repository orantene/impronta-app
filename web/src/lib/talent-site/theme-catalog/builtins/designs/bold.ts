import type { BuiltinDesignEntry } from "../types";
import { buildBuiltinDesignPayload } from "./_shared";

/**
 * BOLD — dramatic + cover-led (`max-site-templates` key "bold"): a
 * full-bleed cover hero with the headshot as a scrimmed background, a dark
 * header, then about, services and a 3-up gallery. See
 * `max-site-templates/registry.ts`.
 */
export const boldDesign: BuiltinDesignEntry = {
  kind: "design",
  slug: "bold",
  title: "Bold",
  summary:
    "Dramatic: a full-bleed cover hero with your photo behind the title, a dark header, then about, services and gallery.",
  category: "bold",
  tags: ["cover-hero", "dark-chrome", "dramatic"],
  required_talent_tier: "talent_basic",
  sort_order: 50,
  is_new_until: null,
  preview: {
    thumbnailUrl: "/marketing/photos/mk-hero-perform.jpg",
  },
  buildPayload: () => buildBuiltinDesignPayload("bold"),
};
