import type { SectionMeta } from "../types";

/**
 * Header LANGUAGE widget embed — the EN | ES locale toggle.
 *
 * This completes the header-widget family. Search / account / inquiry /
 * favorites all had freeform embeds; the language toggle did not, so a
 * freeform header could not offer locale switching at all — the single
 * hardest parity gap against the curated `site_header`, whose
 * `authArea.showLanguageToggle` covers it.
 *
 * `visibleToAgency:false` keeps it out of the page section picker; it is
 * surfaced ONLY as a curated header-widget embed in the shell builder gallery.
 */
export const headerLanguageMeta: SectionMeta = {
  key: "header_language",
  label: "Header language",
  description:
    "The header's EN | ES locale toggle. Live on the published shell; a placeholder chip in the editor. Hides itself when the tenant publishes only one language.",
  businessPurpose: "feature",
  visibleToAgency: false,
  category: "navigation",
  inDefault: false,
  // Async Component (reads the tenant's locale settings + request pathname).
  hasLiveData: true,
};
