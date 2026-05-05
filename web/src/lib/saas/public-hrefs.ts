const INTERNAL_ROOT_PATH = /^\/(?!\/)/;
const EXTERNAL_OR_SPECIAL_HREF = /^(?:[a-z][a-z0-9+.-]*:|#|\?)/i;

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
  if (!publicPathPrefix || !href || EXTERNAL_OR_SPECIAL_HREF.test(href)) {
    return href;
  }
  if (!INTERNAL_ROOT_PATH.test(href)) {
    return href;
  }

  const { pathname, suffix } = splitHref(href);
  if (pathname === publicPathPrefix || pathname.startsWith(`${publicPathPrefix}/`)) {
    return href;
  }
  return `${publicPathPrefix}${pathname === "/" ? "" : pathname}${suffix}`;
}

export function prefixPublicHrefsDeep<T>(value: T, publicPathPrefix: string): T {
  if (!publicPathPrefix || value == null) return value;
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
