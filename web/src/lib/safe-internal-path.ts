/**
 * Open-redirect guards for same-site paths (TUL-1269).
 *
 * A browser resolves `//host` AND `/\host` as a protocol-relative URL, and the
 * WHATWG URL parser also strips tab / CR / LF inside the string first, so
 * `/<TAB>/host` becomes `//host` too. A path that is only checked with
 * `startsWith("/") && !startsWith("//")` therefore still redirects off-site.
 * The same holds AFTER locale stripping: `/en//evil.example` loses `/en` and
 * becomes `//evil.example`.
 */

function hasControlOrBackslash(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    if (c <= 0x1f || c === 0x7f || c === 0x5c) return true;
  }
  return false;
}

/** True only for a path that stays on this origin: one leading `/`, then not `/` or `\`. */
export function isSafeInternalPath(path: string | null | undefined): path is string {
  if (typeof path !== "string" || !path.startsWith("/")) return false;
  // Backslashes and control characters are rejected before the query: browsers normalise them.
  const beforeQuery = path.split(/[?#]/, 1)[0] ?? path;
  if (hasControlOrBackslash(beforeQuery)) return false;
  return !path.startsWith("//");
}

/**
 * Collapse a run of leading `/` and `\` to a single `/`, so a path produced by stripping a
 * locale prefix can never begin a protocol-relative URL.
 */
export function collapseLeadingSeparators(path: string): string {
  if (!/^[/\\]{2,}/.test(path) && !path.startsWith("/\\")) return path;
  return `/${path.replace(/^[/\\]+/, "")}`;
}
