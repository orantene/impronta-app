/**
 * font-css.ts — tiny client-side loaders the font picker uses so a face the
 * operator just chose (or uploaded) renders in the CANVAS immediately,
 * without waiting for the next server render. The storefront/preview parity
 * path is server-side (GoogleFontsLink / BuilderNodeFontLinks /
 * TenantFontFaces); these helpers only close the editor's live-preview gap.
 *
 * Both are idempotent per `key`: the in-memory set resets on a full reload,
 * so the DOM is re-checked before injecting (bfcache restores keep nodes
 * alive across module re-init).
 */

const injected = new Set<string>();

export function ensureFontStylesheet(href: string, key: string): void {
  if (typeof document === "undefined" || injected.has(key)) return;
  const existing = document.querySelector(`link[data-font-css="${CSS.escape(key)}"]`);
  if (existing) {
    injected.add(key);
    return;
  }
  injected.add(key);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.setAttribute("data-font-css", key);
  document.head.appendChild(link);
}

export function ensureInlineFontCss(cssText: string, key: string): void {
  if (typeof document === "undefined" || injected.has(key)) return;
  const existing = document.querySelector(`style[data-font-css="${CSS.escape(key)}"]`);
  if (existing) {
    injected.add(key);
    return;
  }
  injected.add(key);
  const style = document.createElement("style");
  style.setAttribute("data-font-css", key);
  style.textContent = cssText;
  document.head.appendChild(style);
}
