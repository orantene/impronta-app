/**
 * Creator Circuit — niches / categories.
 *
 * Drives the homepage niche strip + directory filter facet. Counts are
 * hardcoded for the prototype; in production they'd be derived from the
 * live roster.
 */

export type Niche = {
  slug: string;
  name: string;
  count: number;
  tint: "default" | "violet" | "lime" | "coral" | "sky" | "dark";
  iconKey:
    | "sparkle"
    | "fashion"
    | "plane"
    | "utensils"
    | "leaf"
    | "chip"
    | "home"
    | "stroller"
    | "weight"
    | "star";
};

export const NICHES: Niche[] = [
  { slug: "beauty", name: "Beauty", count: 184, tint: "coral", iconKey: "sparkle" },
  { slug: "fashion", name: "Fashion", count: 212, tint: "default", iconKey: "fashion" },
  { slug: "travel", name: "Travel", count: 96, tint: "sky", iconKey: "plane" },
  { slug: "food", name: "Food", count: 128, tint: "lime", iconKey: "utensils" },
  { slug: "wellness", name: "Wellness", count: 142, tint: "default", iconKey: "leaf" },
  { slug: "tech", name: "Tech", count: 68, tint: "dark", iconKey: "chip" },
  { slug: "lifestyle", name: "Lifestyle", count: 306, tint: "violet", iconKey: "star" },
  { slug: "parenting", name: "Parenting", count: 74, tint: "default", iconKey: "stroller" },
  { slug: "fitness", name: "Fitness", count: 108, tint: "default", iconKey: "weight" },
  { slug: "home", name: "Home", count: 156, tint: "default", iconKey: "home" },
];
