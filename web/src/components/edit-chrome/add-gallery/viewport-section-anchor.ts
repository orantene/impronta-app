/**
 * W1-L4 — canvas viewport-section lookup for gallery insert positioning.
 *
 * Impure DOM read split out of AddGalleryPanel (keeps the panel under its
 * max-lines budget and keeps the pure anchor math in gallery-insert-hint.ts).
 */

/**
 * The builder-node id of the root section currently occupying the top of the
 * canvas viewport, or `null` when none can be determined. Feeds
 * `resolveInsertAnchor` as the "insert after what I'm looking at" fallback when
 * nothing is selected, so a click-to-insert lands in view instead of at the far
 * bottom of the page.
 *
 * Canvas sections carry both `data-cms-section` and `data-builder-node-id`;
 * chrome (topbar / drawers / overlays) is excluded so a panel's own markup is
 * never mistaken for a canvas section.
 */
export function getViewportSectionNodeId(): string | null {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return null;
  }
  const sections = Array.from(
    document.querySelectorAll<HTMLElement>(
      "[data-cms-section][data-builder-node-id]",
    ),
  ).filter(
    (el) =>
      !el.closest("[data-edit-topbar], [data-edit-drawer], [data-edit-overlay]"),
  );
  if (sections.length === 0) return null;

  // An anchor line a little below the fixed edit topbar — the section straddling
  // it is the one the user is reading.
  const anchorY = Math.min(window.innerHeight * 0.33, 240);
  let firstBelow: { id: string; top: number } | null = null;
  let lastId: string | null = null;

  for (const el of sections) {
    const id = el.getAttribute("data-builder-node-id");
    if (!id) continue;
    lastId = id;
    const r = el.getBoundingClientRect();
    if (r.top <= anchorY && r.bottom > anchorY) return id;
    if (r.top > anchorY && (firstBelow === null || r.top < firstBelow.top)) {
      firstBelow = { id, top: r.top };
    }
  }
  // No straddling section (anchor sits in a gap or above the first): prefer the
  // nearest section below the anchor, else the last section on the page.
  return firstBelow?.id ?? lastId;
}
