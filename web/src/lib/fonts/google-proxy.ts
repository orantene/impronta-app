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
/** Classic per-file gstatic paths (`/s/fraunces/v38/….woff2`). */
const GSTATIC_FILE_RE = /^\/s\/[a-z0-9]+\/[A-Za-z0-9_.\-/]{1,200}\.(woff2|woff|ttf)$/;
/** Kit id / skey / version on Google's `/l/font?kit=…` CSS faces. */
const KIT_RE = /^[A-Za-z0-9_-]{8,200}$/;
const SKEY_RE = /^[A-Za-z0-9_-]{1,64}$/;
const KIT_V_RE = /^v\d{1,4}$/;

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
  for (const rawParam of params) {
    // The server may hand the query over percent-encoded (":" as %3A, "@" as
    // %40), which hid the axis separator and 400'd every family with weights.
    // Decode first; "+" stays literal and still means a space in the name.
    let p: string;
    try {
      p = decodeURIComponent(rawParam);
    } catch {
      return null;
    }
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

/**
 * Validate a gstatic path (from the proxy file route) and return the upstream
 * URL. Accepts:
 *   • `/s/<family>/vN/<file>.woff2` — normal css2 faces
 *   • `/l/font?kit=…&skey=…&v=…` — kit faces Google still emits for some
 *     families (DM Sans); the old rewrite dropped the query and 400'd.
 */
export function buildUpstreamFileUrl(path: string): string | null {
  let p = path.trim();
  if (!p || p.includes("..")) return null;
  // Mirror the CSS proxy: tolerate one layer of percent-encoding (CDN /
  // double-encode) so `%2Fs%2F…` still resolves.
  if (/%[0-9A-Fa-f]{2}/.test(p)) {
    try {
      p = decodeURIComponent(p);
    } catch {
      return null;
    }
  }
  if (p.startsWith(GSTATIC_ORIGIN)) p = p.slice(GSTATIC_ORIGIN.length);
  if (GSTATIC_FILE_RE.test(p)) return `${GSTATIC_ORIGIN}${p}`;
  return buildUpstreamKitUrl(p);
}

/** Allow-listed `/l/font?kit=&skey=&v=` only — no other query keys. */
function buildUpstreamKitUrl(path: string): string | null {
  if (!path.startsWith("/l/font?")) return null;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(path.slice("/l/font?".length));
  } catch {
    return null;
  }
  const kit = params.get("kit");
  if (!kit || !KIT_RE.test(kit)) return null;
  const skey = params.get("skey");
  if (skey !== null && !SKEY_RE.test(skey)) return null;
  const v = params.get("v");
  if (v !== null && !KIT_V_RE.test(v)) return null;
  for (const key of params.keys()) {
    if (key !== "kit" && key !== "skey" && key !== "v") return null;
  }
  const out = new URLSearchParams();
  out.set("kit", kit);
  if (skey) out.set("skey", skey);
  if (v) out.set("v", v);
  return `${GSTATIC_ORIGIN}/l/font?${out.toString()}`;
}

/**
 * When an older rewritten sheet left `?kit=&skey=&v=` as *sibling* query
 * params next to `p=/l/font`, fold them back into `p` so cached CSS keeps
 * working until it expires.
 */
export function coalesceFontFilePath(
  p: string,
  siblings: { kit?: string | null; skey?: string | null; v?: string | null },
): string {
  const base = p.trim();
  if (!siblings.kit) return base;
  if (base !== "/l/font" && !base.startsWith("/l/font?")) return base;
  const out = new URLSearchParams();
  out.set("kit", siblings.kit);
  if (siblings.skey) out.set("skey", siblings.skey);
  if (siblings.v) out.set("v", siblings.v);
  return `/l/font?${out.toString()}`;
}

/**
 * Rewrite every gstatic URL inside a Google CSS sheet to the file proxy.
 * Captures query strings (`/l/font?kit=…`) so they are not left dangling
 * after `p=` (which previously produced `/api/fonts/file?p=%2Fl%2Ffont?kit=`
 * and 400'd).
 */
export function rewriteFontCss(css: string): string {
  return css.replace(
    /https:\/\/fonts\.gstatic\.com(\/[^)\s'"]+)/g,
    (_m, path: string) => `${FONT_FILE_PROXY_PATH}?p=${encodeURIComponent(path)}`,
  );
}
