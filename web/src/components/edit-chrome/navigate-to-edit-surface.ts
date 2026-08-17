/**
 * navigateToEditSurface — full-document navigation for edit-chrome page
 * switches (Add page, AI create, Duplicate, and the page picker/All-pages
 * panel row click).
 *
 * `EditChromeMount` (web/src/components/edit-chrome/edit-chrome-mount.tsx) is
 * a SERVER component mounted once from the root layout. It derives which
 * editor surface to render (homepage adapter vs. cms_page adapter vs.
 * site_shell adapter, which page's composition to prefetch, etc.) from
 * request headers on the server. A client-side `router.push` changes the URL
 * and re-renders client components, but it does NOT re-invoke
 * `EditChromeMount` on the server — so the edit chrome keeps showing the
 * PREVIOUS page's surface until a hard reload. From the operator's chair:
 * click another page in All-pages / the topbar picker, the URL bar updates,
 * but the canvas and navigator still show the page they just left.
 *
 * The fix is the same one already used elsewhere in this surface for the
 * identical reason — see the comment at web/src/components/edit-chrome/
 * topbar.tsx ("shell has to tear down, so router.push would be wrong too")
 * next to its own `window.location.assign`, and canvas-link-interceptor,
 * which preventDefaults anchor clicks in edit mode specifically so that
 * leaving the editor is always a full document navigation. A page switch
 * inside the editor is no different: the edit chrome (canvas, navigator,
 * topbar, provider state) has to tear down and remount against the new
 * page's server-derived surface, so only a real navigation — not
 * `router.push` — produces a correct result.
 *
 * This wraps the shared `flushThenNavigate` (page-switch-flush.ts) so the
 * pending autosave still gets awaited before we leave, then dispatches
 * `window.location.assign(href)` as its `navigate` callback.
 */

import { flushThenNavigate } from "./page-switch-flush";

export async function navigateToEditSurface({
  dirty,
  flush,
  href,
}: {
  dirty: boolean;
  /** The EditProvider's `flushBuilderTreeSave`; may be absent — see flushThenNavigate. */
  flush: (() => Promise<unknown>) | null | undefined;
  /** Destination path (with query string, e.g. `/about?edit=1`). */
  href: string;
}): Promise<boolean> {
  return flushThenNavigate({
    dirty,
    flush,
    navigate: () => {
      window.location.assign(href);
    },
  });
}
