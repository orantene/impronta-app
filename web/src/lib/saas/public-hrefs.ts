import { isPlatformAuthPath } from "@/lib/site-admin/links/link-ref";

const INTERNAL_ROOT_PATH = /^\/(?!\/)/;
const EXTERNAL_OR_SPECIAL_HREF = /^(?:[a-z][a-z0-9+.-]*:|#|\?)/i;

// SECURITY — render-time scheme allowlist (defense in depth).
//
// Published pages render on the shared apex domain (cookies are parent-scoped
// to `.tulala.digital`) under a `script-src 'unsafe-inline'` CSP, so a single
// `javascript:`/`data:`/`vbscript:` href is clickable cross-tenant XSS. React
// does NOT neutralize script-capable schemes in `href` at runtime. Structured
// href fields (button `href`, pricing `ctaHref`, section `ctaHref`/`rsvpUrl`/
// `brandHref`) are guarded at PUBLISH time by the preflight link rules — but
// that is the only guard, and several paths bypass it (admin Duplicate, JSON
// import, legacy data predating the rule, any direct DB write). This is the
// structured-href sibling of the rich-text fix; it mirrors the allowlist
// philosophy of `isSafeRichTextHref` (sections/shared/rich-text.tsx, PR #143)
// but additionally permits `mailto:`/`tel:`/`sms:` because those are real CTAs.
//
// Allowlist (not denylist): only known-navigational schemes pass. Any unknown
// or script-capable scheme — `javascript:`, `data:`, `vbscript:`, `blob:`,
// `file:`, … — is neutralized to "#". Scheme-less hrefs (relative `/`, `./`,
// `../`, anchor `#`, query `?`, protocol-relative `//`) are navigational and
// pass through untouched.
const SAFE_LINK_SCHEMES = new Set(["http", "https", "mailto", "tel", "sms"]);

/**
 * Extract the URL scheme the browser would actually parse, defeating the
 * obfuscation tricks browsers themselves normalize away: tab/newline/CR are
 * stripped from anywhere in a URL, and leading C0 control chars + space are
 * trimmed before the scheme. So `java\tscript:alert(1)` and `\x01javascript:…`
 * both execute — we normalize the same way before testing. Returns the
 * lowercased scheme (no colon) or null when the href carries no scheme.
 */
function hrefScheme(href: string): string | null {
  const cleaned = href
    .replace(/[\t\n\r]/g, "")
    .replace(/^[\x00-\x20]+/, "");
  const match = cleaned.match(/^([a-z][a-z0-9+.-]*):/i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Render-time href guard. Returns the href unchanged when it is navigational
 * (allowlisted scheme, or scheme-less relative/anchor/query/protocol-relative);
 * returns `"#"` when it carries any other scheme (script-capable or unknown),
 * so the published DOM can never emit a dangerous href regardless of how the
 * data reached the persisted tree. Exported for direct unit coverage.
 */
export function neutralizeDangerousHref(href: string): string {
  const scheme = hrefScheme(href);
  if (scheme !== null && !SAFE_LINK_SCHEMES.has(scheme)) {
    return "#";
  }
  return href;
}

function splitHref(href: string): { pathname: string; suffix: string } {
  const hashIndex = href.indexOf("#");
  const queryIndex = href.indexOf("?");
  const suffixIndex =
    hashIndex === -1
      ? queryIndex
      : queryIndex === -1
        ? hashIndex
        : Math.min(hashIndex, queryIndex);
  if (suffixIndex === -1) {
    return { pathname: href, suffix: "" };
  }
  return {
    pathname: href.slice(0, suffixIndex) || "/",
    suffix: href.slice(suffixIndex),
  };
}

export function prefixPublicHref(href: string, publicPathPrefix: string): string {
  if (!href) return href;
  // Render-time scheme guard (defense in depth) runs BEFORE every other branch
  // — including the empty-prefix apex fast path below — so a dangerous-scheme
  // href is neutralized no matter how it reached the persisted tree and no
  // matter which surface (apex or tenant-prefixed) renders it.
  const guarded = neutralizeDangerousHref(href);
  if (guarded !== href) return guarded;

  if (!publicPathPrefix || EXTERNAL_OR_SPECIAL_HREF.test(href)) {
    return href;
  }
  if (!INTERNAL_ROOT_PATH.test(href)) {
    return href;
  }
  // Phase 6C / Finding-B fix: ROOT `(auth)` routes (/login, /register,
  // /join, /talent/register, …) are NEVER tenant-scoped — a tenant page
  // cannot live at /login. Without this, the deep tenant-prefixer turns
  // a CTA href `/login` into `/impronta/login` → 404 on path-based
  // tenants. Single source of truth: isPlatformAuthPath (links/link-ref).
  if (isPlatformAuthPath(href)) {
    return href;
  }

  const { pathname, suffix } = splitHref(href);
  if (pathname === publicPathPrefix || pathname.startsWith(`${publicPathPrefix}/`)) {
    return href;
  }
  return `${publicPathPrefix}${pathname === "/" ? "" : pathname}${suffix}`;
}

export function prefixPublicHrefsDeep<T>(value: T, publicPathPrefix: string): T {
  // NOTE: no `!publicPathPrefix` early return. On the apex domain the prefix is
  // empty, but href fields STILL need the render-time scheme guard (above) — so
  // we always walk and route href fields through prefixPublicHref, which with
  // an empty prefix is a no-op for safe hrefs and a neutralizer for dangerous
  // ones. Section components (pricing_grid, site_header, event_listing, …)
  // consume these pre-prefixed props directly, so this is their only guard.
  if (value == null) return value;
  if (Array.isArray(value)) {
    return value.map((item) => prefixPublicHrefsDeep(item, publicPathPrefix)) as T;
  }
  if (typeof value !== "object") return value;

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    const shouldPrefix =
      normalizedKey === "href" ||
      normalizedKey === "ctahref" ||
      normalizedKey === "rsvpurl" ||
      normalizedKey === "brandhref";
    out[key] =
      shouldPrefix && typeof child === "string"
        ? prefixPublicHref(child, publicPathPrefix)
        : prefixPublicHrefsDeep(child, publicPathPrefix);
  }
  return out as T;
}
