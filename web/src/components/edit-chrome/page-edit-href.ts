/**
 * TUL-1408 — page-switch hrefs that keep the storefront prefix.
 *
 * The page pickers built `/${slug}?edit=1`, which only resolves on a branded
 * host. On a path-addressed storefront (`/w/<workspace>/…`, the free tier's
 * default) it dropped the prefix, so "Páginas > Book" opened `/agendar?edit=1`
 * and 404ed. `pageEditHref` reads the prefix off the CURRENT pathname
 * (`/w/<ws>`, optionally behind a locale like `/es`) and re-applies it.
 * Pure (no window access) so it is unit-testable.
 */

const PATH_PREFIX = /^((?:\/[a-z]{2}(?:-[A-Za-z]{2})?)?\/w\/[^/?#]+)(?:[/?#]|$)/;

/** `/es/w/acme/about` -> `/es/w/acme`; `/about` (branded host) -> `""`. */
export function storefrontPrefixFromPathname(pathname: string): string {
  const match = PATH_PREFIX.exec(pathname);
  return match ? match[1] : "";
}

/**
 * Edit-mode href for `pageSlug` ("" = home) from the page the operator is on.
 * `query` is appended after `edit=1` (e.g. `panel=pageSettings`, `ai=1`).
 */
export function pageEditHref(
  pathname: string,
  pageSlug: string | null | undefined,
  query = "",
): string {
  const prefix = storefrontPrefixFromPathname(pathname);
  const clean = (pageSlug ?? "").trim().replace(/^\/+/, "");
  const path = clean === "" ? (prefix === "" ? "/" : prefix) : `${prefix}/${clean}`;
  return `${path}?edit=1${query ? `&${query}` : ""}`;
}
