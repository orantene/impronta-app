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

export function pickClientLayoutLocale(input: {
  requestLocale: string;
  urlNamesLocale: boolean;
  cookieLocale: string | null | undefined;
  savedLocale: string | null | undefined;
}): ClientLocale {
  const fromRequest = supported(input.requestLocale) ?? "en";
  if (input.urlNamesLocale) return fromRequest;
  return supported(input.cookieLocale) ?? supported(input.savedLocale) ?? fromRequest;
}
