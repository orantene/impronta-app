import type { TemplateMeta } from "../types";

export const homepageMeta: TemplateMeta = {
  key: "homepage",
  label: "Homepage",
  description:
    "Agency storefront homepage. System-owned (is_system_owned = true); slug is '' (empty) per locale; composed via cms_page_sections junction.",
  systemOwned: true,
  slots: [
    {
      key: "hero",
      label: "Hero",
      required: true,
      allowedSectionTypes: ["hero"],
    },
    {
      key: "primary",
      label: "Primary content",
      required: false,
    },
    {
      key: "secondary",
      label: "Secondary content",
      required: false,
    },
    {
      key: "footer-callout",
      label: "Footer callout",
      required: false,
    },
  ],
};
