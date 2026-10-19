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

/** One start tag: `<name` then attribute text (quoted values may hold `>`), up to `>`. */
const START_TAG_RE = /<\s*([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;

type ParsedAttr = { name: string; value: string | null };

/** Tokenise attribute text. `ok: false` when anything is left that is not whitespace or `/`. */
function parseAttributes(text: string): { ok: true; attrs: ParsedAttr[] } | { ok: false } {
  const attrs: ParsedAttr[] = [];
  const re = /[\s/]*([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/y;
  let i = 0;
  while (i < text.length) {
    if (/^[\s/]*$/.test(text.slice(i))) break;
    re.lastIndex = i;
    const m = re.exec(text);
    if (!m) return { ok: false };
    if (m[4] !== undefined) return { ok: false }; // unquoted value
    attrs.push({ name: m[1], value: m[2] ?? m[3] ?? null });
    i = re.lastIndex;
  }
  return { ok: true, attrs };
}

function checkAttribute(rawAttr: string, value: string | null, errors: string[]): void {
  const attr = rawAttr.toLowerCase();
  if (attr.startsWith("on")) {
    errors.push(`Disallowed event-handler attribute ${rawAttr}.`);
    return;
  }
  if (attr.startsWith("data-")) {
    errors.push(`Disallowed attribute ${rawAttr} (data-* attributes not allowed).`);
    return;
  }
  if (attr === "xlink:href" || attr === "href") {
    if (value === null || !value.startsWith("#")) {
      errors.push(`Disallowed href ${JSON.stringify(value)}; only same-document fragments (#id) are allowed.`);
    }
    return;
  }
  if (attr.startsWith("xlink:")) {
    errors.push(`Disallowed attribute ${rawAttr}.`);
    return;
  }
  if (attr === "xmlns" || attr.startsWith("xmlns:")) return;
  if (!ALLOWED_ATTRS.has(attr)) {
    errors.push(`Disallowed attribute ${rawAttr}.`);
    return;
  }
  if (value === null) return;
  if (value.includes("&")) {
    errors.push(`Attribute ${rawAttr} contains an entity or "&"; write the character directly.`);
  }
  if (/^\s*(?:javascript|data|vbscript)\s*:/i.test(value)) {
    errors.push(`Attribute ${rawAttr} holds a script or data URL.`);
  }
  // paint / mask / clip references may point only inside the document: url(#id).
  for (const u of value.matchAll(/url\(\s*(["']?)\s*([^)"']*)/gi)) {
    if (!u[2].startsWith("#")) errors.push(`Attribute ${rawAttr} references an external url(); use url(#id).`);
  }
}

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

  // Attribute allowlist, on a real tokenisation of every start tag. The HTML parser accepts `/` and
  // a missing space as attribute separators (`<svg/onload=x>`, `<path d="x"onclick="y">`), so a
  // regex that needs `\s` before the name misses them (TUL-1269). Every attribute must parse,
  // be quoted, carry no entity, and use only same-document references.
  for (const m of trimmed.matchAll(START_TAG_RE)) {
    const attrText = m[2] ?? "";
    const parsed = parseAttributes(attrText);
    if (!parsed.ok) {
      errors.push(`Malformed attributes in <${m[1]}>.`);
      continue;
    }
    for (const { name: rawAttr, value } of parsed.attrs) {
      checkAttribute(rawAttr, value, errors);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, svg: trimmed, errors: [] };
}
