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
 * (undo, redo, revision restore, conflict reload) can drop the preview layer
 * and let the rendered tree be the only source of truth again.
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

/** CSS properties this module has stamped, per builder node id. */
const stampedPreviewProps = new Map<string, Set<string>>();

function trackStamped(nodeId: string, cssProperty: string): void {
  let props = stampedPreviewProps.get(nodeId);
  if (!props) {
    props = new Set<string>();
    stampedPreviewProps.set(nodeId, props);
  }
  props.add(cssProperty);
}

function expandMarginShorthand(el: HTMLElement, nodeId: string): void {
  if (!el.style.getPropertyValue("margin")) return;
  el.style.removeProperty("margin");
  for (const side of ["top", "right", "bottom", "left"]) {
    const property = `margin-${side}`;
    if (el.style.getPropertyValue(property)) continue;
    el.style.setProperty(property, "0");
    trackStamped(nodeId, property);
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
      for (const property of props) el.style.removeProperty(property);
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
      el.style.removeProperty(property);
      stampedPreviewProps.get(nodeId)?.delete(property);
      continue;
    }
    el.style.setProperty(property, String(value));
    trackStamped(nodeId, property);
  }
}
