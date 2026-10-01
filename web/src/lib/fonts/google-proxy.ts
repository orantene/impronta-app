/**
 * Same-origin Google Fonts proxy helpers (privacy: visitors' browsers never
 * contact fonts.googleapis.com / fonts.gstatic.com, so their IPs are not sent
 * to Google). The server fetches the CSS + files and serves them from our
 * origin with long cache headers.
 *
 * Everything user-influenced is validated against the font catalogue / strict
 * patterns so the routes cannot be used as an open proxy (SSRF).
 */
import { getGoogleFontMeta } from "@/lib/site-admin/builder-node/fonts-catalog";

export const FONT_CSS_PROXY_PATH = "/api/fonts/css";
export const FONT_FILE_PROXY_PATH = "/api/fonts/file";
const GOOGLE_CSS_ORIGIN = "https://fonts.googleapis.com/css2";
const GSTATIC_ORIGIN = "https://fonts.gstatic.com";
const MAX_FAMILIES = 8;
const AXIS_RE = /^[0-9A-Za-z.,;@]{1,200}$/;
const GSTATIC_PATH_RE = /^\/s\/[a-z0-9]+\/[A-Za-z0-9_.\-/]{1,200}\.(woff2|woff|ttf)$/;

/** Turn a fonts.googleapis.com css2 href into the same-origin proxy href. */
export function toFontProxyHref(googleHref: string): string {
  const q = googleHref.indexOf("?");
  if (q < 0 || !googleHref.startsWith(GOOGLE_CSS_ORIGIN)) return googleHref;
  const query = googleHref.slice(q + 1);
  // Fail safe: a family or parameter the proxy would reject keeps the Google
  // URL, so a theme font outside the catalogue still renders.
  if (buildUpstreamCssUrl(query) === null) return googleHref;
  return `${FONT_CSS_PROXY_PATH}?${query}`;
}

/**
 * Validate the proxy query string and return the upstream Google URL, or null
 * when anything is not allow-listed. Only catalogue families, a strict axis
 * charset, and display=swap are accepted.
 */
export function buildUpstreamCssUrl(search: string): string | null {
  // Next's request layer (proxy rewrite, edge/CDN) may hand the route a
  // percent-encoded query (`:`->%3A, `@`->%40, `;`->%3B). Normalise those
  // three delimiters back before validating, or every family with an axis
  // tuple (all theme fonts) is rejected with 400 and the page falls to Georgia.
  const params = search
    .replace(/^\?/, "")
    .replace(/%3A/gi, ":")
    .replace(/%40/g, "@")
    .replace(/%3B/gi, ";")
    .replace(/%2C/gi, ",")
    .split("&")
    .filter(Boolean);
  const out: string[] = [];
  let families = 0;
  let display = false;
  for (const p of params) {
    if (p === "display=swap") {
      display = true;
      continue;
    }
    if (!p.startsWith("family=")) return null;
    const raw = p.slice("family=".length);
    const colon = raw.indexOf(":");
    const namePart = colon < 0 ? raw : raw.slice(0, colon);
    const axis = colon < 0 ? "" : raw.slice(colon + 1);
    let name: string;
    try {
      name = decodeURIComponent(namePart.replace(/\+/g, " "));
    } catch {
      return null;
    }
    const meta = getGoogleFontMeta(name);
    if (!meta || meta.family !== name) return null;
    if (axis && !AXIS_RE.test(axis)) return null;
    families += 1;
    if (families > MAX_FAMILIES) return null;
    out.push(`family=${encodeURIComponent(meta.family).replace(/%20/g, "+")}${axis ? `:${axis}` : ""}`);
  }
  if (families === 0 || !display) return null;
  return `${GOOGLE_CSS_ORIGIN}?${out.join("&")}&display=swap`;
}

/** Validate a gstatic path (from the proxy file route) and return the upstream URL. */
export function buildUpstreamFileUrl(path: string): string | null {
  if (!GSTATIC_PATH_RE.test(path) || path.includes("..")) return null;
  return `${GSTATIC_ORIGIN}${path}`;
}

/** Rewrite every gstatic URL inside a Google CSS sheet to the file proxy. */
export function rewriteFontCss(css: string): string {
  return css.replace(
    /https:\/\/fonts\.gstatic\.com(\/[A-Za-z0-9_.\-/]+)/g,
    (_m, path: string) => `${FONT_FILE_PROXY_PATH}?p=${encodeURIComponent(path)}`,
  );
}
