/**
 * F104 - "the site was just published" signal. The publish drawer can remount
 * when the composition refreshes, so the chip and the toast learn about a
 * publish through a window event rather than through drawer state.
 */
export const SITE_PUBLISHED_EVENT = "tulala:site-published";

export function announceSitePublished(publishedAt: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SITE_PUBLISHED_EVENT, { detail: { publishedAt } }));
}

let inFlight = false;

/**
 * Run a publish at most once at a time. A module-level flag (not component
 * state) so it survives a drawer remount: a second click while the first is
 * pending is dropped instead of publishing twice.
 */
export async function runPublishOnce(run: () => Promise<void>): Promise<boolean> {
  if (inFlight) return false;
  inFlight = true;
  try {
    await run();
    return true;
  } finally {
    inFlight = false;
  }
}
