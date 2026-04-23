/**
 * Inline SVG sanitizer for tenant-owned brand marks.
 *
 * Why bespoke (no DOMPurify): the input is trusted-ish (agency staff via
 * `branding.edit` capability) but needs a strict allowlist because the
 * output is rendered directly into the PublicHeader DOM with
 * `dangerouslySetInnerHTML`. DOMPurify works but needs a jsdom shim in
 * Node/Next; a small regex-based pre-filter is sufficient for the specific
 * shape we want (single <svg> root, drawing primitives only, no scripts,
 * no event handlers, no external URLs, no inline styles).
 *
 * The allowlist below covers the primitives we need for a brand mark:
 *   svg, g, path, circle, ellipse, line, polyline, polygon, rect,
 *   defs, linearGradient, radialGradient, stop, mask, clipPath, use,
 *   title, desc.
 *
 * Attributes are likewise allow-listed. Colors should use `currentColor`
 * so tokens drive the palette; explicit hex/rgb is allowed for accent
 * detail but the operator is warned.
 */

const ALLOWED_TAGS = new Set([
  "svg",
  "g",
  "path",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "rect",
  "defs",
  "lineargradient",
  "radialgradient",
  "stop",
  "mask",
  "clippath",
  "use",
  "title",
  "desc",
]);

const ALLOWED_ATTRS = new Set([
  "xmlns",
  "viewbox",
  "preserveaspectratio",
  "width",
  "height",
  "x",
  "y",
  "x1",
  "x2",
  "y1",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "d",
  "points",
  "fill",
  "fill-rule",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-opacity",
  "opacity",
  "transform",
  "id",
  "class",
  "role",
  "aria-hidden",
  "aria-label",
  "gradienttransform",
  "gradientunits",
  "offset",
  "stop-color",
  "stop-opacity",
  "spreadmethod",
  "mask",
  "clip-path",
  "clippathunits",
  "maskunits",
  "maskcontentunits",
]);

export interface SanitizeResult {
  ok: boolean;
  svg?: string;
  errors: string[];
}

export interface SanitizeOptions {
  /** Max allowed character length. Default 20 KiB. */
  maxLength?: number;
}

/**
 * Sanitize an inline SVG for safe rendering into the DOM. Returns
 * `{ ok: true, svg }` on success, `{ ok: false, errors }` otherwise.
 *
 * Rejects (rather than silently strips) when disallowed content is found,
 * so operators learn what's unsafe and can fix their asset. Silent stripping
 * would also be acceptable here but feels sneaky for an admin surface.
 */
export function sanitizeBrandMarkSvg(
  input: string,
  options: SanitizeOptions = {},
): SanitizeResult {
  const errors: string[] = [];
  const maxLength = options.maxLength ?? 20_480;

  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: true, svg: undefined, errors: [] };
  }
  if (trimmed.length > maxLength) {
    errors.push(`SVG is too large (${trimmed.length} chars; max ${maxLength}).`);
    return { ok: false, errors };
  }

  // Hard rejects — quick-scan filters before structural parsing.
  if (/<\s*script\b/i.test(trimmed)) errors.push("Contains <script>.");
  if (/\s(on[a-z]+)\s*=/i.test(trimmed)) {
    errors.push("Contains on* event handler attribute.");
  }
  if (/javascript\s*:/i.test(trimmed)) {
    errors.push('Contains "javascript:" URL.');
  }
  if (/<!ENTITY\b/i.test(trimmed) || /<!DOCTYPE/i.test(trimmed)) {
    errors.push("Contains DOCTYPE / external entity declaration.");
  }
  if (/<!--[\s\S]*?<!\[/i.test(trimmed) || /<!\[CDATA\[/i.test(trimmed)) {
    errors.push("Contains CDATA section.");
  }
  if (/<\s*foreignobject\b/i.test(trimmed)) {
    errors.push("Contains <foreignObject> (embeds arbitrary HTML).");
  }
  if (/<\s*(iframe|object|embed|link|meta|style)\b/i.test(trimmed)) {
    errors.push("Contains a disallowed element (iframe/object/embed/link/meta/style).");
  }
  if (/style\s*=/i.test(trimmed)) {
    errors.push('Inline "style=" attributes are not allowed — use presentation attributes (fill, stroke) instead.');
  }

  // External resource references: href/xlink:href must be same-document
  // fragments only (#id). Anything else (data:, http:, file:, etc) is
  // rejected.
  const hrefRe = /\b(xlink:href|href)\s*=\s*(["'])([^"']*)\2/gi;
  for (const m of trimmed.matchAll(hrefRe)) {
    const val = m[3];
    if (!val.startsWith("#")) {
      errors.push(`Disallowed href ${JSON.stringify(val)} — only same-document fragments (#id) are allowed.`);
    }
  }

  // Must start with <svg>, end with </svg>, no content before/after.
  if (!/^<svg\b/i.test(trimmed)) {
    errors.push("SVG must start with a single <svg> root element.");
  }
  if (!/<\/svg\s*>\s*$/i.test(trimmed)) {
    errors.push("SVG must end with </svg>.");
  }

  // Tag allowlist — collect every opening tag name and verify.
  const tagRe = /<\s*([a-zA-Z][a-zA-Z0-9-]*)\b/g;
  for (const m of trimmed.matchAll(tagRe)) {
    const tag = m[1].toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      errors.push(`Disallowed element <${m[1]}>.`);
    }
  }

  // Attribute allowlist — scan every `attr=` within a tag. We accept the
  // usual attribute name characters; anything outside the allowlist is
  // rejected. Case-insensitive by lower-casing the key.
  const attrRe = /\s([a-zA-Z_:][a-zA-Z0-9_:.-]*)\s*=/g;
  for (const m of trimmed.matchAll(attrRe)) {
    const rawAttr = m[1];
    const attr = rawAttr.toLowerCase();
    // xlink: attributes other than xlink:href are not currently used.
    if (attr.startsWith("xlink:") && attr !== "xlink:href") {
      errors.push(`Disallowed attribute ${rawAttr}.`);
      continue;
    }
    if (attr.startsWith("xmlns:") || attr === "xmlns") continue;
    if (attr.startsWith("data-")) {
      errors.push(`Disallowed attribute ${rawAttr} (data-* attributes not allowed).`);
      continue;
    }
    if (attr.startsWith("aria-") && !ALLOWED_ATTRS.has(attr)) {
      errors.push(`Disallowed attribute ${rawAttr}.`);
      continue;
    }
    if (attr.startsWith("on")) {
      errors.push(`Disallowed event-handler attribute ${rawAttr}.`);
      continue;
    }
    if (!ALLOWED_ATTRS.has(attr)) {
      errors.push(`Disallowed attribute ${rawAttr}.`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, svg: trimmed, errors: [] };
}
