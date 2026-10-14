/**
 * Replaces the secret segment of capability-URL routes so tokens never reach
 * analytics rows, GA4 or Sentry. Pure; works on a pathname or a full URL.
 */
const SECRET_ROUTES: ReadonlyArray<readonly [prefix: string, placeholder: string]> = [
  ["/api/calendar/feed/", ":token"],
  ["/invite/", ":token"],
  ["/visit/", ":token"],
  ["/ticket/", ":code"],
  ["/r/", ":code"],
];

const LOCALE_PREFIX = /^\/[a-z]{2}(?=\/)/i;

function redactPathname(pathname: string): string {
  const locale = LOCALE_PREFIX.exec(pathname)?.[0] ?? "";
  const rest = pathname.slice(locale.length);
  for (const [prefix, placeholder] of SECRET_ROUTES) {
    if (rest.startsWith(prefix) && rest.length > prefix.length) {
      const tail = rest.slice(prefix.length);
      const slash = tail.indexOf("/");
      return locale + prefix + placeholder + (slash === -1 ? "" : tail.slice(slash));
    }
  }
  return pathname;
}

/** Redacts a secret path segment in a pathname, absolute URL or path+query. */
export function redactSecretPath(input: string): string {
  if (!input) return input;
  const m = /^(https?:\/\/[^/?#]*)?([^?#]*)(.*)$/i.exec(input);
  if (!m) return input;
  return (m[1] ?? "") + redactPathname(m[2]) + m[3];
}
