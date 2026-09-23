import type { BuiltinDesignEntry } from "../types";
import { buildBuiltinDesignPayload } from "./_shared";

/**
 * DEFAULT — the platform's premium all-rounder (`max-site-templates` key
 * "default"): split hero + chips, about, services, masonry gallery, contact
 * around the standard rich shell. See `max-site-templates/registry.ts` for
 * the exact section composition.
 */
export const defaultDesign: BuiltinDesignEntry = {
  kind: "design",
  slug: "default",
  title: "Tulala Default",
  summary:
    "Our premium all-rounder: a split hero with your photo, discipline chips, about, services and a gallery.",
  category: "classic",
  tags: ["all-rounder", "split-hero", "masonry-gallery"],
  required_talent_tier: "talent_basic",
  sort_order: 10,
  is_new_until: null,
  preview: {
    thumbnailUrl: "/marketing/photos/talent-services-hero.jpg",
  },
  buildPayload: () => buildBuiltinDesignPayload("default"),
};
