/**
 * Canonical insert-gallery tab ids (A3: 6 tabs → 4) plus the legacy-id map
 * so older allow-lists / structure rows / Lab views still resolve.
 *
 * UI tabs: Blocks / Designs / Data / Shell.
 * `page_templates` is not a UI tab (those cards live on Designs) but remains
 * an allow-list GATE so page-builder surfaces that listed it still receive
 * DB page templates, while shell surfaces that never listed it still don't.
 */

import type { AddGalleryTab } from "./types";

export const GALLERY_TAB_IDS: ReadonlyArray<AddGalleryTab> = [
  "blocks",
  "designs",
  "data",
  "shell",
];

export const CODE_TAB_LABELS: Record<AddGalleryTab, string> = {
  blocks: "Blocks",
  designs: "Designs",
  data: "Data",
  shell: "Shell",
};

/**
 * Legacy six-tab ids plus the four canonical ids. Unknown strings return null
 * (they are not gallery tabs).
 */
const LEGACY_GALLERY_TAB_TO_CANONICAL: Record<string, AddGalleryTab> = {
  layout: "blocks",
  elements: "blocks",
  sections: "designs",
  page_templates: "designs",
  connected: "data",
  shell: "shell",
  blocks: "blocks",
  designs: "designs",
  data: "data",
};

/** Structure-row fallbacks when `tab:<canonical>` is missing. Do NOT fall
 *  back `page_templates` onto Designs: hiding that empty tab must not hide
 *  section cards. */
export const LEGACY_TAB_STRUCTURE_FALLBACKS: Record<
  AddGalleryTab,
  ReadonlyArray<string>
> = {
  blocks: ["elements", "layout"],
  designs: ["sections"],
  data: ["connected"],
  shell: [],
};

export function canonicalGalleryTab(
  tab: string | null | undefined,
): AddGalleryTab | null {
  if (!tab) return null;
  return LEGACY_GALLERY_TAB_TO_CANONICAL[tab] ?? null;
}

export function isCanonicalGalleryTab(tab: string): tab is AddGalleryTab {
  return (GALLERY_TAB_IDS as readonly string[]).includes(tab);
}

/**
 * Map an allow-list (legacy ids and/or canonical ids) onto the four UI tabs,
 * de-duplicated, in CODE order. `page_templates` contributes Designs so
 * page-builder lists that only named that tab still see section+template
 * cards; the extra gate for DB page templates is `allowListHasPageTemplates`.
 */
export function normalizeAllowedTabs(
  tabs: ReadonlyArray<string>,
): AddGalleryTab[] {
  const present = new Set<AddGalleryTab>();
  for (const t of tabs) {
    const canon = canonicalGalleryTab(t);
    if (canon) present.add(canon);
  }
  return GALLERY_TAB_IDS.filter((id) => present.has(id));
}

/** True when the raw allow-list named the page-templates tab (legacy or as a
 *  non-UI gate token). Shell surfaces omit this, so full-page DB templates
 *  do not appear there even though Designs is allowed for section cards. */
export function allowListHasPageTemplates(
  tabs: ReadonlyArray<string>,
): boolean {
  return tabs.includes("page_templates");
}
