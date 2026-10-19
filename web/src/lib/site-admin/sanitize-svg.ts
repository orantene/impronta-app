/**
 * Inline SVG sanitizer for tenant-owned brand marks (TUL-1269).
 *
 * The output is rendered with `dangerouslySetInnerHTML` in the public header, so the sanitizer
 * must be a real DOM sanitizer: DOMPurify with the SVG profile. The regex/tokenizer version this
 * replaces was bypassable by parser quirks (`<svg/onload=x>`, a missing space between
 * attributes, unquoted `href`, `url(https://...)`).
 *
 * Contract is unchanged: rejection rather than silent stripping. If DOMPurify had to remove
 * anything (an element, an attribute, a reference), the upload is refused with a list of what
 * it was, so operators learn what is unsafe and can fix the asset.
 *
 * Policy on top of the SVG profile: no script / foreignObject / style / links / images /
 * animation elements, no style attribute, no data-* attributes, and every reference
 * (`href`, `xlink:href`, `url()`) must be a same-document `#id`.
 */
import DOMPurify from "isomorphic-dompurify";

const FORBID_TAGS = [
  "script", "foreignobject", "style", "a", "image", "iframe", "object", "embed", "link", "meta",
  "animate", "animatetransform", "animatemotion", "set", "handler", "listener", "feimage",
];

// Elements DOMPurify itself adds around a fragment while parsing; not part of the upload.
const WRAPPERS = new Set(["html", "head", "body"]);

let hooked = false;
function ensureHooks(): void {
  if (hooked) return;
  hooked = true;
  DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
    const name = data.attrName.toLowerCase();
    const value = data.attrValue ?? "";
    if (name === "href" || name === "xlink:href") {
      if (!value.startsWith("#")) data.keepAttr = false;
      return;
    }
    if (/^\s*(?:javascript|data|vbscript)\s*:/i.test(value)) {
      data.keepAttr = false;
      return;
    }
    for (const u of value.matchAll(/url\(\s*(["']?)\s*([^)"']*)/gi)) {
      if (!u[2].startsWith("#")) data.keepAttr = false;
    }
  });
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

type Removed = { element?: { nodeName?: string; nodeType?: number }; attribute?: { name?: string } | null };

/**
 * Sanitize an inline SVG for safe rendering into the DOM. Returns `{ ok: true, svg }` on
 * success, `{ ok: false, errors }` otherwise.
 */
export function sanitizeBrandMarkSvg(
  input: string,
  options: SanitizeOptions = {},
): SanitizeResult {
  const maxLength = options.maxLength ?? 20_480;
  const trimmed = input.trim();
  if (trimmed.length === 0) return { ok: true, svg: undefined, errors: [] };
  if (trimmed.length > maxLength) {
    return { ok: false, errors: [`SVG is too large (${trimmed.length} chars; max ${maxLength}).`] };
  }
  if (!/^<svg\b/i.test(trimmed) || !/<\/svg\s*>\s*$/i.test(trimmed)) {
    return { ok: false, errors: ["SVG must be a single <svg>...</svg> element with nothing before or after it."] };
  }
  if (/<!DOCTYPE|<!ENTITY|<!\[CDATA\[/i.test(trimmed)) {
    return { ok: false, errors: ["Contains DOCTYPE / entity / CDATA declarations."] };
  }

  ensureHooks();
  const clean = DOMPurify.sanitize(trimmed, {
    USE_PROFILES: { svg: true, svgFilters: true },
    // `use` is outside the SVG profile; brand marks reuse gradients/shapes with it. Safe here only
    // because the hook above limits href / xlink:href to same-document `#id`.
    ADD_TAGS: ["use"],
    FORBID_TAGS,
    FORBID_ATTR: ["style"],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: true,
    KEEP_CONTENT: false,
    RETURN_DOM: false,
  });

  const errors: string[] = [];
  for (const r of DOMPurify.removed as Removed[]) {
    if (r.attribute?.name) errors.push(`Disallowed attribute ${r.attribute.name}.`);
    else if (r.element && r.element.nodeType === 1 && !WRAPPERS.has(String(r.element.nodeName).toLowerCase())) errors.push(`Disallowed element <${String(r.element.nodeName).toLowerCase()}>.`);
  }
  if (errors.length === 0 && !/^<svg\b/i.test(clean)) errors.push("SVG must start with a single <svg> root element.");
  if (errors.length > 0) return { ok: false, errors: [...new Set(errors)] };
  return { ok: true, svg: clean, errors: [] };
}
