import type { SectionMeta } from "../types";

export const blogIndexMeta: SectionMeta = {
  key: "blog_index",
  label: "Blog index",
  description:
    "Card grid of recent posts. Each item is editor-managed (manual list), and can be pointed at a real CMS query later.",
  businessPurpose: "feature",
  visibleToAgency: true,
  category: "story",
  inDefault: false,
};
