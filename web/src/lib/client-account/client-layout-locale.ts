/**
 * TUL-968: which language the client portal renders in.
 *
 * getRequestLocale() trusts the middleware locale header before the language
 * cookie, and that header is derived from the PATH, so an unprefixed client URL
 * (`/hub/client/today`) always resolves to the default (English) even for a
 * visitor who came from a Spanish page. An explicit choice in the URL still wins;
 * otherwise the client's language cookie, then their saved account language.
 */

export type ClientLocale = "en" | "es";

const SUPPORTED: readonly ClientLocale[] = ["en", "es"];

function supported(v: string | null | undefined): ClientLocale | null {
  const s = (v ?? "").trim().toLowerCase();
  return (SUPPORTED as readonly string[]).includes(s) ? (s as ClientLocale) : null;
}

/** True when the URL itself names a language: an `/es/…` or `/en/…` prefix, or `?lang=` / `?locale=`. */
export function urlNamesLocale(pathname: string | null | undefined, search: string | null | undefined): boolean {
  if (pathname && /^\/(en|es)(\/|$)/i.test(pathname)) return true;
  const raw = (search ?? "").replace(/^\?/, "");
  if (!raw) return false;
  const q = new URLSearchParams(raw);
  return Boolean(supported(q.get("lang") ?? q.get("locale")));
}

/**
 * First supported language in an Accept-Language header, in the browser's own
 * priority order ("es-MX,es;q=0.9,en;q=0.8" -> "es"). Unsupported tags are
 * skipped; null when none match. Cross-host carry-over (TUL-968): the language
 * cookie is per host, so a client who chose Spanish on one host arrives on
 * another with no cookie. Their browser still says Spanish.
 */
export function localeFromAcceptLanguage(header: string | null | undefined): ClientLocale | null {
  if (!header) return null;
  const tags = header
    .split(",")
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const weight = q ? Number.parseFloat(q.slice(2)) : 1;
      return { tag: (tag ?? "").trim().toLowerCase(), weight: Number.isFinite(weight) ? weight : 0, i };
    })
    .filter((t) => t.tag && t.tag !== "*" && t.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.i - b.i);
  for (const { tag } of tags) {
    const hit = supported(tag.split("-")[0]);
    if (hit) return hit;
  }
  return null;
}

export function pickClientLayoutLocale(input: {
  requestLocale: string;
  urlNamesLocale: boolean;
  cookieLocale: string | null | undefined;
  savedLocale: string | null | undefined;
  /** Raw Accept-Language header; the last resort before the path-derived default. */
  acceptLanguage?: string | null;
}): ClientLocale {
  const fromRequest = supported(input.requestLocale) ?? "en";
  if (input.urlNamesLocale) return fromRequest;
  return (
    supported(input.cookieLocale) ??
    supported(input.savedLocale) ??
    localeFromAcceptLanguage(input.acceptLanguage) ??
    fromRequest
  );
}
