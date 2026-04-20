import type { TemplateMeta } from "../types";

export const standardPageMeta: TemplateMeta = {
  key: "standard_page",
  label: "Standard page",
  description:
    "Tenant-authored page with title + body + SEO. Not system-owned; agency can create, rename, delete.",
  systemOwned: false,
  slots: [],
};
