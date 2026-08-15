/**
 * Instant canvas text-style preview — apply toolbar tweaks directly on the live
 * DOM without waiting for a builder-tree commit + client-canvas re-render.
 *
 * These writes bypass React, so React cannot clean them up: when the committed
 * tree carries no explicit value for a previewed property (the common case —
 * the original value came from the theme, not from inline style), a re-render
 * simply never touches that property and the stamped value outlives the tree
 * it was previewing. Undo then reverts the data while the canvas keeps showing
 * the undone value, which reads as "undo does nothing".
 *
 * Every stamped property is therefore tracked so an authoritative tree change
 * (undo, redo, revision restore, conflict reload) can restore what the overlay
 * hid and let the tree be the only source of truth again.

 * Tracking deliberately survives the tree commit: a commit does not guarantee a
 * repaint of the node. On a surface with no client canvas mounted for it the
 * canvas is server-rendered and undo/redo skip the RSC refresh, so React never
 * rewrites the property and the stamp is still the only thing on screen.
 */

const STYLE_PREVIEW_KEYS: Record<string, string> = {
  align: "textAlign",
  fontSize: "fontSize",
  fontFamily: "fontFamily",
  textColor: "color",
  fontWeight: "fontWeight",
  fontStyle: "fontStyle",
  marginLeftFree: "marginLeft",
  marginRightFree: "marginRight",
  // The rotate handle stamps its live angle straight onto the DOM for the same
  // reason the text toolbar does: instant paint, outside React. It must be
  // tracked HERE so undo/redo's `clearCanvasTextStylePreview()` takes it down
  // with every other preview. Registering it directly (rather than a private
  // stamp inside the handle) is the whole fix for the #996 class: a stamp that
  // no restore path knows about survives a reverted tree and makes undo look
  // like a no-op.
  rotate: "rotate",
};

function cssPropertyName(key: string): string {
  return key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

export function findBuilderNodeElement(nodeId: string): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(
    `[data-builder-node-id="${CSS.escape(nodeId)}"]`,
  );
}

/**
 * Properties this module has stamped, per builder node id, each mapped to the
 * inline value that was underneath before the first stamp ("" when the property
 * was not set inline at all).
 *
 * The preview is an OVERLAY, so undoing it means restoring what was beneath,
 * not deleting the property. Deleting would also take the value React rendered
 * from the tree, dropping the block to its theme default, which is a different
 * wrong answer from the one this module exists to prevent.
 */
const stampedPreviewProps = new Map<string, Map<string, string>>();

function trackStamped(el: HTMLElement, nodeId: string, cssProperty: string): void {
  let props = stampedPreviewProps.get(nodeId);
  if (!props) {
    props = new Map<string, string>();
    stampedPreviewProps.set(nodeId, props);
  }
  // Only the FIRST stamp sees the pre-preview value; later stamps in the same
  // burst would otherwise record an earlier preview as the "original".
  if (!props.has(cssProperty)) {
    props.set(cssProperty, el.style.getPropertyValue(cssProperty));
  }
}

function expandMarginShorthand(el: HTMLElement, nodeId: string): void {
  if (!el.style.getPropertyValue("margin")) return;
  el.style.removeProperty("margin");
  for (const side of ["top", "right", "bottom", "left"]) {
    const property = `margin-${side}`;
    if (el.style.getPropertyValue(property)) continue;
    trackStamped(el, nodeId, property);
    el.style.setProperty(property, "0");
  }
}

/**
 * Remove the preview layer so the rendered tree is authoritative again. Pass a
 * node id to clear one block, or omit it to clear every stamped preview (what
 * undo / redo / an authoritative reload want — the tree they restore is the
 * truth for every block, not just the selected one).
 */
export function clearCanvasTextStylePreview(nodeId?: string): void {
  const entries = nodeId
    ? ([[nodeId, stampedPreviewProps.get(nodeId)]] as const)
    : ([...stampedPreviewProps.entries()] as const);
  for (const [id, props] of entries) {
    if (!props) continue;
    const el = findBuilderNodeElement(id);
    if (el) {
      for (const [property, originalValue] of props) {
        if (originalValue) el.style.setProperty(property, originalValue);
        else el.style.removeProperty(property);
      }
    }
    stampedPreviewProps.delete(id);
  }
}

export function applyCanvasTextStylePreview(
  nodeId: string,
  patch: Record<string, unknown>,
): void {
  const el = findBuilderNodeElement(nodeId);
  if (!el) return;
  const touchesMarginSide = Object.keys(patch).some(
    (key) => key === "marginLeftFree" || key === "marginRightFree",
  );
  if (touchesMarginSide) expandMarginShorthand(el, nodeId);
  for (const [key, value] of Object.entries(patch)) {
    const cssKey = STYLE_PREVIEW_KEYS[key];
    if (!cssKey) continue;
    const property = cssPropertyName(cssKey);
    if (value === undefined || value === null || value === "") {
      trackStamped(el, nodeId, property);
      el.style.removeProperty(property);
      continue;
    }
    trackStamped(el, nodeId, property);
    el.style.setProperty(property, String(value));
  }
}
