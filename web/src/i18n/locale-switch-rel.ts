/**
 * TUL-793: a `?locale=` link is a switch action that redirects to the clean
 * URL, never a page to index. Any anchor whose href carries it gets
 * `rel="nofollow"`; path-grammar hrefs (real alternates) stay followable.
 */
export function localeSwitchRel(href: string): { rel: "nofollow" } | Record<string, never> {
  return href.includes("?locale=") || href.includes("&locale=") ? { rel: "nofollow" } : {};
}
