/**
 * SVG logo upload sanitization (Wave 5.1, page-builder 8/10 program).
 *
 * SVG stored in the PUBLIC media bucket is served as image/svg+xml, so an
 * un-sanitized upload is stored XSS the moment its public URL is opened
 * directly. Both logo lanes (agency branding + talent Max Site) run the
 * upload through the same strict allowlist sanitizer the brand-mark field
 * uses, and store only what it accepted. Unsafe SVGs are rejected with the
 * reasons so the operator can fix the asset.
 *
 * Server-side use only (returns a Buffer). No `server-only` import on
 * purpose: that marker breaks the tsx test lanes that lack the polyfill.
 */

import { sanitizeBrandMarkSvg } from "./sanitize-svg";

/** Logos are text; anything bigger than this is not a logo. */
export const SVG_LOGO_MAX_CHARS = 256 * 1024;

export type SvgLogoSanitizeResult =
  | { ok: true; bytes: Buffer }
  | { ok: false; error: string };

export function sanitizeSvgLogoBuffer(svgText: string): SvgLogoSanitizeResult {
  const result = sanitizeBrandMarkSvg(svgText, { maxLength: SVG_LOGO_MAX_CHARS });
  if (!result.ok || !result.svg) {
    const detail = result.errors.slice(0, 3).join(" ");
    return {
      ok: false,
      error: detail ? `SVG rejected: ${detail}` : "SVG rejected: file is empty or unsafe.",
    };
  }
  return { ok: true, bytes: Buffer.from(result.svg, "utf8") };
}
