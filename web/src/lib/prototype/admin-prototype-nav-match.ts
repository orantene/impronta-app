import type { ReadonlyURLSearchParams } from "next/navigation";

/** Path segment of a nav href (ignores query/hash). */
export function prototypeNavPath(href: string): string {
  const path = href.split("?")[0]?.split("#")[0] ?? "";
  const trimmed = path.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

/**
 * Active state for admin sidebar links.
 * Pass `searchParams` from `useSearchParams()` when the item uses query rules (e.g. media tabs).
 */
export function isPrototypeNavActive(
  pathname: string,
  href: string,
  searchParams?: ReadonlyURLSearchParams | URLSearchParams | null,
): boolean {
  const itemPath = prototypeNavPath(href);
  const p = pathname.replace(/\/+$/, "") || "/";
  if (p !== itemPath) return false;

  const qIdx = href.indexOf("?");
  const queryStr = qIdx >= 0 ? href.slice(qIdx + 1) : "";

  if (!queryStr) {
    if (p === "/admin/media") {
      const tab = searchParams?.get("tab") ?? null;
      return tab !== "library";
    }
    return true;
  }

  const itemQuery = new URLSearchParams(queryStr);
  if (!searchParams) {
    return true;
  }
  for (const [k, expected] of itemQuery.entries()) {
    if (searchParams.get(k) !== expected) return false;
  }
  return true;
}
