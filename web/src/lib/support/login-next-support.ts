import { ORIGINAL_SEARCH_HEADER } from "@/i18n/request-locale";

/**
 * Signed-out `/talent|/client|/admin?support=<id>` ("Reply in app" email link)
 * must survive the login redirect, or the reader lands on the dashboard with
 * no ticket open. Layouts do not see the query, so read the original search
 * the proxy forwards. With no valid `support` param the URL is byte-identical
 * to the legacy `/login?next=<path>`.
 */
export function loginUrlKeepingSupport(
  nextPath: string,
  headers: { get(name: string): string | null },
): string {
  const raw = headers.get(ORIGINAL_SEARCH_HEADER) ?? "";
  const id = new URLSearchParams(raw).get("support");
  if (!id || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return `/login?next=${nextPath}`;
  return `/login?next=${encodeURIComponent(`${nextPath}?support=${id}`)}`;
}

/**
 * The auth middleware's own signed-out redirect (`/login?next=<pathname>`)
 * runs before any layout and used to drop the query (TUL-677). Given the
 * incoming `search`, return `nextPath` with a valid `?support=<id>` kept.
 * Only dashboard paths (/talent, /client, /admin, optionally slug-prefixed)
 * qualify; anything else is returned unchanged.
 */
export function nextPathKeepingSupport(nextPath: string, search: string): string {
  if (!/^\/(?:[A-Za-z0-9_-]+\/)?(?:talent|client|admin)(?:\/|$)/.test(nextPath)) return nextPath;
  if (nextPath.includes("?")) return nextPath;
  const id = new URLSearchParams(search).get("support");
  if (!id || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return nextPath;
  return `${nextPath}?support=${id}`;
}
