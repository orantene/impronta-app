"use client";

/**
 * Anywhere-in-the-app → "open the support drawer on this Guide article".
 * The (i) next to a page title and a future Helper mode on real pages both
 * call this; SupportLauncher listens and owns the drawer state. A plain
 * window event keeps page modules free of any support-panel import.
 */
export const GUIDE_OPEN_EVENT = "tulala:guide-open";

export type GuideOpenDetail = { nodeId: string };

export function openGuideArticle(nodeId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<GuideOpenDetail>(GUIDE_OPEN_EVENT, { detail: { nodeId } }));
}

/** Sentinel node id meaning "open the drawer on the Guide home, no article". */
export const GUIDE_HOME_NODE_ID = "__guide-home__";

export function openGuideHome(): void {
  openGuideArticle(GUIDE_HOME_NODE_ID);
}
