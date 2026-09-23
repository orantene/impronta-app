import type { BuiltinDesignEntry } from "../types";
import { buildBuiltinDesignPayload } from "./_shared";

/**
 * MINIMAL — type-forward + clean (`max-site-templates` key "minimal"): a
 * centered hero with no headshot, a tight 2-up services grid, and a
 * 2-column gallery. See `max-site-templates/registry.ts`.
 */
export const minimalDesign: BuiltinDesignEntry = {
  kind: "design",
  slug: "minimal",
  title: "Minimal",
  summary:
    "Type-forward and clean: a centered name-first hero (no photo), a compact services grid, and a simple gallery.",
  category: "minimal",
  tags: ["type-forward", "no-headshot", "restrained"],
  required_talent_tier: "talent_basic",
  sort_order: 30,
  is_new_until: null,
  preview: {
    thumbnailUrl: "/marketing/photos/service-pros-lifestyle.jpg",
  },
  buildPayload: () => buildBuiltinDesignPayload("minimal"),
};
