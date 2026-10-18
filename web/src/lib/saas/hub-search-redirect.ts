/**
 * TUL-978: `/search?q=...` on a hub host answered the branded 404 (QA typed it
 * after the hub landing grew a search box). The hub's real search is its
 * directory, which already takes `q`, so `/search` hops there and keeps the
 * query and any `/es` prefix. Pure so the proxy stays thin and a test pins it.
 */
export type HubSearchRedirectInput = {
  hostKind: string;
  method: string;
  pathname: string;
  search: string;
};

export function hubSearchRedirect(input: HubSearchRedirectInput): string | null {
  if (input.hostKind !== "hub") return null;
  if (input.method !== "GET" && input.method !== "HEAD") return null;
  const m = /^(?:\/(es|en))?\/search\/?$/.exec(input.pathname);
  if (!m) return null;
  const prefix = m[1] ? `/${m[1]}` : "";
  const params = new URLSearchParams(input.search.startsWith("?") ? input.search.slice(1) : input.search);
  const q = params.get("q")?.trim() ?? "";
  return `${prefix}/directory${q ? `?q=${encodeURIComponent(q)}` : ""}`;
}
