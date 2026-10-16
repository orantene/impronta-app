import type { SectionMeta } from "../types";

export const blogIndexMeta: SectionMeta = {
  key: "blog_index",
  label: "Blog index",
  description:
    "Últimos posts: a card grid of the site's real, published posts (newest first, optional category). A manual list still works.",
  businessPurpose: "feature",
  visibleToAgency: true,
  category: "story",
  inDefault: false,
  // Posts v1: renders against server-resolved live posts (async Component).
  hasLiveData: true,
};
