/**
 * True when the page is rendered inside another page's frame (a preview
 * thumbnail such as the onboarding arrival screen). Owner chrome (the admin
 * quick bar) must not draw over a framed preview: it covers the site's logo
 * and adds a second scrollbar (QA DS-44).
 *
 * A cross-origin `window.top` read can throw; a throw means we ARE framed.
 */
export function isEmbeddedInFrame(win: { self: unknown; top: unknown } | null | undefined): boolean {
  if (!win) return false;
  try {
    return win.self !== win.top;
  } catch {
    return true;
  }
}
