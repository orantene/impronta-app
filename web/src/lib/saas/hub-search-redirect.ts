/**
 * TUL-978: `/search?q=...` on a hub host answered the branded 404 (QA typed it
 * after the hub landing grew a search box). A hub host does NOT serve `/directory`
 * (its surface is path-slug workspaces only, see surface-allow-list), so the first
 * version of this hop landed on another 404. The working directory lives on the
 * marketing host, so `/search` hops THERE, absolute, keeping the query and any
 * `/es` prefix. Pure so the proxy stays thin and a test pins it.
 */
export type HubSearchRedirectInput = {
  hostKind: string;
  method: string;
  pathname: string;
  search: string;
  /** resolveMarketingOrigin(): the host that really serves /directory. */
  marketingOrigin: string;
  /**
   * TUL-1883: the visitor's `locale` cookie on this host. The cookie is per host, so an unprefixed
   * `/search` hopping to the marketing host lands there with NO cookie and it stamps the default
   * (English). When the visitor chose a non-default language, carry it as the `/es` prefix.
   */
  cookieLocale?: string | null;
  /**
   * TUL-1883: the Referer header. A visitor reading `/es/...` who has no cookie yet (first visit, or
   * cookies blocked) still searches in Spanish; the referring page's `/es` prefix is the signal.
   */
  referer?: string | null;
};

/** `es` when the visitor is demonstrably reading Spanish (cookie or referring path), else null. */
export function hubSearchCarriedLocale(input: Pick<HubSearchRedirectInput, "cookieLocale" | "referer">): "es" | null {
  if (input.cookieLocale === "es") return "es";
  if (input.referer) {
    try {
      if (/^\/es(\/|$)/.test(new URL(input.referer).pathname)) return "es";
    } catch {
      /* a malformed Referer carries nothing */
    }
  }
  return null;
}

export function hubSearchRedirect(input: HubSearchRedirectInput): string | null {
  if (input.hostKind !== "hub") return null;
  if (input.method !== "GET" && input.method !== "HEAD") return null;
  const m = /^(?:\/(es|en))?\/search\/?$/.exec(input.pathname);
  if (!m) return null;
  const prefix = m[1] ? `/${m[1]}` : hubSearchCarriedLocale(input) === "es" ? "/es" : "";
  const params = new URLSearchParams(input.search.startsWith("?") ? input.search.slice(1) : input.search);
  const q = params.get("q")?.trim() ?? "";
  return `${input.marketingOrigin.replace(/\/+$/, "")}${prefix}/directory${q ? `?q=${encodeURIComponent(q)}` : ""}`;
}
