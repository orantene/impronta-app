/** `name` of the onboarding arrival thumbnail iframe. The site hides its floating chat launcher in it (QA DS-44: the pill overlapped the edit button). */
export const ARRIVAL_THUMB_FRAME_NAME = "tulala-arrival-thumb";

/** True inside the non-interactive onboarding arrival thumbnail only; other embeds keep their chat launcher. */
export function isArrivalThumbFrame(win: { name?: string } | null | undefined): boolean {
  return win?.name === ARRIVAL_THUMB_FRAME_NAME;
}

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
