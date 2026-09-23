import type { BuiltinDesignEntry } from "../types";
import { buildBuiltinDesignPayload } from "./_shared";

/**
 * EDITORIAL — magazine emphasis (`max-site-templates` key "editorial"): an
 * image-led 40-60 split hero, a centered serif-leaning shell, a centered
 * About, and a masonry gallery. See `max-site-templates/registry.ts`.
 */
export const editorialDesign: BuiltinDesignEntry = {
  kind: "design",
  slug: "editorial",
  title: "Editorial",
  summary:
    "Magazine-style: an image-led split hero, a centered intro, and a staggered gallery. Warm and refined.",
  category: "editorial",
  tags: ["magazine", "image-led", "centered-chrome"],
  required_talent_tier: "talent_basic",
  sort_order: 20,
  is_new_until: null,
  preview: {
    thumbnailUrl: "/marketing/photos/independent-singer-booking.jpg",
  },
  buildPayload: () => buildBuiltinDesignPayload("editorial"),
};
