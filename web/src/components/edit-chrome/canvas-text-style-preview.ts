/**
 * Instant canvas text-style preview — apply toolbar tweaks directly on the live
 * DOM without waiting for a builder-tree commit + client-canvas re-render.
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

function expandMarginShorthand(el: HTMLElement): void {
  if (!el.style.getPropertyValue("margin")) return;
  el.style.removeProperty("margin");
  if (!el.style.getPropertyValue("margin-top")) el.style.marginTop = "0";
  if (!el.style.getPropertyValue("margin-right")) el.style.marginRight = "0";
  if (!el.style.getPropertyValue("margin-bottom")) el.style.marginBottom = "0";
  if (!el.style.getPropertyValue("margin-left")) el.style.marginLeft = "0";
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
  if (touchesMarginSide) expandMarginShorthand(el);
  for (const [key, value] of Object.entries(patch)) {
    const cssKey = STYLE_PREVIEW_KEYS[key];
    if (!cssKey) continue;
    if (value === undefined || value === null || value === "") {
      el.style.removeProperty(cssPropertyName(cssKey));
      continue;
    }
    el.style.setProperty(cssPropertyName(cssKey), String(value));
  }
}
