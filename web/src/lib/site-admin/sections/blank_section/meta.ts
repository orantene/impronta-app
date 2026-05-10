import type { SectionMeta } from "../types";

export const blankSectionMeta: SectionMeta = {
  key: "blank_section",
  label: "Blank section",
  description:
    "Blank canvas for Advanced Mode — compose headings, copy, media, and layout blocks from the element library (real persisted nodes). Nothing renders until you add blocks; turn on Show advanced sections or search blank canvas / custom composition.",
  businessPurpose: "feature",
  visibleToAgency: true,
  category: "story",
  /** Advanced composition surface — same picker tier budget as other gated types. */
  inDefault: false,
  tag: "new",
};
