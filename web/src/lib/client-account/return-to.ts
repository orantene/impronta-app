/**
 * Safe post-sign-in return for clients who signed in from a path-addressed
 * workspace site (`tulala.digital/w/<slug>`) via the app host's client sign-in
 * (TUL-709). Pure: no I/O.
 *
 * Only two shapes are ever honoured, so there is no open redirect:
 *   - a relative path (single leading `/`, no `//`, no backslash, no control
 *     characters), resolved against the configured site origin;
 *   - an absolute URL whose origin is EXACTLY the configured site or app origin
 *     (same scheme, host and port; no credentials).
 * Everything else returns null and the caller falls back to `/account`.
 */

function originOf(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

function isSafeRelativePath(raw: string): boolean {
  if (!raw.startsWith("/") || raw.startsWith("//")) return false;
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return false;
  // Encoded slashes or backslashes right after the root can be decoded into a
  // protocol-relative URL by a downstream hop; refuse them outright.
  if (/^\/(%2f|%5c)/i.test(raw)) return false;
  return true;
}

export function safeClientReturnTo(
  raw: string | null | undefined,
  input: { siteUrl: string; appUrl: string },
): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value || value !== raw) return null;
  const siteOrigin = originOf(input.siteUrl);
  const allowed = new Set([siteOrigin, originOf(input.appUrl)].filter((o): o is string => Boolean(o)));

  if (value.startsWith("/")) {
    if (!siteOrigin || !isSafeRelativePath(value)) return null;
    const resolved = new URL(value, siteOrigin);
    return resolved.origin === siteOrigin ? resolved.toString() : null;
  }

  if (/[\\\u0000-\u001f\u007f]/.test(value)) return null;
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return null;
  }
  if (u.username || u.password) return null;
  if (!allowed.has(u.origin)) return null;
  return u.toString();
}

/**
 * App-host-relative `next` for the client sign-in that returns the visitor to
 * `sitePath` on the site host once signed in. An unsafe path falls back to the
 * plain account page.
 */
export function accountReturnPath(sitePath: string): string {
  if (!isSafeRelativePath(sitePath)) return "/account";
  return `/account/return?to=${encodeURIComponent(sitePath)}`;
}
