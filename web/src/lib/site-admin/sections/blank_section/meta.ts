import type { SectionMeta } from "../types";

export const blankSectionMeta: SectionMeta = {
  key: "blank_section",
  label: "Blank section",
  description:
    "Empty composition surface for Advanced Mode — add headings, copy, media, and layout blocks from the element library. Nothing renders until you add blocks.",
  businessPurpose: "feature",
  visibleToAgency: true,
  category: "story",
  /** Advanced composition surface — same picker tier budget as other gated types. */
  inDefault: false,
  tag: "new",
};
