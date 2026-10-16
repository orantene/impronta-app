/**
 * Spanish words a visitor types for a marketing page whose real slug is English
 * (`tulala.digital/es/directorio` returned the 404). Marketing host only: a
 * tenant site can publish its own builder page at `/directorio`, so agency,
 * hub and talent hosts never take this hop. The Spanish word implies Spanish,
 * so the bare form lands on the `/es` page too. The query string is kept.
 */

const SPANISH_ALIASES: Readonly<Record<string, string>> = {
  "/directorio": "/directory",
};

export type SpanishPathAliasInput = {
  pathname: string;
  search: string;
  method: string;
  /** `hostContext.kind` from the proxy. */
  hostKind: string;
};

export function marketingSpanishAliasRedirect(input: SpanishPathAliasInput): string | null {
  if (input.hostKind !== "marketing") return null;
  if (input.method !== "GET" && input.method !== "HEAD") return null;
  const trimmed = input.pathname.length > 1 ? input.pathname.replace(/\/+$/, "") : input.pathname;
  const inner = trimmed === "/es" ? "/" : trimmed.startsWith("/es/") ? trimmed.slice(3) : trimmed;
  const target = SPANISH_ALIASES[inner.toLowerCase()];
  if (!target) return null;
  const search = input.search && input.search !== "?" ? input.search : "";
  return `/es${target}${search}`;
}
