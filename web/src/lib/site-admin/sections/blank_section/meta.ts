import type { SectionMeta } from "../types";

export const blankSectionMeta: SectionMeta = {
  key: "blank_section",
  label: "Blank section",
  description:
    "Blank canvas for Advanced Mode. Compose headings, copy, media, and layout blocks from the element library; each one is saved with the page. Nothing renders until you add blocks. Turn on Show advanced sections, or search for blank canvas or custom composition.",
  businessPurpose: "feature",
  visibleToAgency: true,
  category: "story",
  /** Advanced composition surface — same picker tier budget as other gated types. */
  inDefault: false,
  tag: "new",
};
