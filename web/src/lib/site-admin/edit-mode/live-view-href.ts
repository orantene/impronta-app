/**
 * live-view-href — the PURE half of the live view (see live-view.ts for the
 * request half). Kept apart so the client-side editor topbar can build the
 * URL without pulling `next/headers` into a client bundle.
 */

export const LIVE_VIEW_QUERY_PARAM = "live";

/** Does this search string ask for the live view? */
export function searchRequestsLiveView(search: string | null | undefined): boolean {
  if (!search) return false;
  try {
    return new URLSearchParams(search).get(LIVE_VIEW_QUERY_PARAM) === "1";
  } catch {
    return false;
  }
}

/**
 * The URL the editor's "Open live page" control opens: the current page,
 * `edit` dropped, `live=1` added.
 */
export function liveViewHrefFor(href: string): string {
  const url = new URL(href);
  url.searchParams.delete("edit");
  url.searchParams.set(LIVE_VIEW_QUERY_PARAM, "1");
  return url.toString();
}
