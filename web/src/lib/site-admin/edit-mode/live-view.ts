/**
 * live-view — "show me this page exactly as a visitor sees it", from inside
 * the editor, in a new tab.
 *
 * Edit mode and draft reads are COOKIE-driven (tenant edit + preview
 * cookies), so a second tab on the same origin lands in the editor again;
 * there is no way to open a plain published page while the cookies are set.
 * `?live=1` is that way: a per-REQUEST override both gates consult. It only
 * ever removes privilege (published instead of draft, no chrome), so it
 * needs no auth and a visitor adding it by hand sees what they already see.
 *
 * Read from the proxy's original-search header rather than the page's
 * `searchParams`, so the gates (which run inside layouts, shells and chat
 * mounts that receive no searchParams) all answer the same way.
 */

import { headers } from "next/headers";

import { ORIGINAL_SEARCH_HEADER } from "@/i18n/request-locale";

import { searchRequestsLiveView } from "./live-view-href";

export { LIVE_VIEW_QUERY_PARAM, liveViewHrefFor, searchRequestsLiveView } from "./live-view-href";

/** Request half: true when the current request carries `?live=1`. */
export async function isLiveViewRequested(): Promise<boolean> {
  try {
    const h = await headers();
    return searchRequestsLiveView(h.get(ORIGINAL_SEARCH_HEADER));
  } catch {
    return false;
  }
}
