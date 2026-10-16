/**
 * "Nueva promo" from the header drawer must open the template picker on the
 * Promos page. A URL param was fragile inside the talent shell (the page can
 * be remounted by the route change), so the drawer leaves a short-lived intent
 * instead: a sessionStorage flag (for a page that mounts afterwards) plus an
 * event (for a page that is already mounted). Every storage access is guarded:
 * storage can throw in private windows and previews.
 */
const KEY = "promos:open-picker";
const EVENT = "promos:open-picker";
const MAX_AGE_MS = 60_000;

export function requestNewPromoPicker(now: number = Date.now()): void {
  try {
    sessionStorage.setItem(KEY, String(now));
  } catch {
    /* the event below still covers an already-mounted page */
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* no window (tests/SSR) */
  }
}

/** True once per request, and only if it is recent (a stale flag must not pop the picker open later). */
export function consumeNewPromoPickerRequest(now: number = Date.now()): boolean {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw === null) return false;
    sessionStorage.removeItem(KEY);
    const at = Number(raw);
    return Number.isFinite(at) && now - at <= MAX_AGE_MS;
  } catch {
    return false;
  }
}

export const NEW_PROMO_PICKER_EVENT = EVENT;
