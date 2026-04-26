/**
 * Phase 3 — Zod schema introspection for the inspector auto-binder.
 *
 * Walks a Zod 4 schema tree and produces a flat description that
 * `<ZodSchemaForm>` (the auto-rendering form primitive) can consume to
 * decide which input to render for each field. Pure runtime
 * introspection — no codegen, no schema duplication.
 *
 * Supported field shapes (covers ~95% of section schemas):
 *   - string                   → text input (textarea if max > 240, or
 *                                explicit `multiline` hint)
 *   - string with format=url   → url input
 *   - string with format=email → email input
 *   - number                   → number input (range when both min+max set)
 *   - boolean                  → checkbox
 *   - enum                     → select
 *   - array(object)            → repeater of nested object subforms
 *   - array(string)            → newline-separated textarea
 *   - object                   → nested fieldset
 *
 * Skipped on purpose (sections doing these still write a manual Editor):
 *   - union / discriminated union (would need a tabbed sub-form)
 *   - record / map (would need a key-value editor)
 *   - tuple (always feels custom)
 *   - presentation (the shared block has its own dedicated PresentationPanel
 *     and is filtered out by name).
 *
 * Validation: runtime, never trusts the field. Each input writes back
 * the raw value; `safeParse` at save time still gates the actual mutation.
 */

import type { z } from "zod";

export type IntrospectedKind =
  | "text"
  | "textarea"
  | "url"
  | "email"
  | "number"
  | "boolean"
  | "enum"
  | "object"
  | "array_of_objects"
  | "array_of_strings"
  /** `i18nString` — a string OR a {default,en,es,...} locale map. */
  | "i18n_text"
  | "unknown";

export interface IntrospectedField {
  name: string;
  kind: IntrospectedKind;
  optional: boolean;
  defaultValue?: unknown;
  description?: string;
  /** Length / size limits as picked up from `.max()`, `.min()`, etc. */
  min?: number;
  max?: number;
  /** Enum choices, when kind === "enum". */
  options?: ReadonlyArray<string>;
  /** Sub-fields for object / array-of-object kinds. */
  children?: ReadonlyArray<IntrospectedField>;
  /** Best-effort UI label derived from the field name. */
  label: string;
  /**
   * Hints the field name implies (paired with `presentation.ts` markers,
   * etc.). The form renderer uses these to swap in dedicated primitives
   * for known shapes (e.g. fields named `imageUrl` get a MediaPicker).
   */
  hint?:
    | "presentation"
    | "image_url"
    | "alt_text"
    | "href"
    | "color"
    | "rich_text"
    | "icon_key";
}

// Field-name → hint mapping used to swap in dedicated primitives.
//
// Phase C — `headline`, `subheadline` added so the auto-bound inspector
// renders the live RichEditor for the universal heading-ish fields.
// Outlier rich-eligible fields (e.g. blog_detail.title) opt in via a
// `.describe("@rich …")` Zod marker — see `descriptionImpliesRichText`
// below.
const NAME_HINTS: Record<string, IntrospectedField["hint"]> = {
  imageUrl: "image_url",
  imageAlt: "alt_text",
  backgroundImageUrl: "image_url",
  backgroundImageAlt: "alt_text",
  beforeUrl: "image_url",
  afterUrl: "image_url",
  beforeAlt: "alt_text",
  afterAlt: "alt_text",
  href: "href",
  ctaHref: "href",
  url: "href",
  iconKey: "icon_key",
  color: "color",
  bg: "color",
  presentation: "presentation",
  // Phase C — rich-eligible heading + body field names.
  headline: "rich_text",
  subheadline: "rich_text",
  body: "rich_text",
  intro: "rich_text",
  detail: "rich_text",
  copy: "rich_text",
  message: "rich_text",
};

/**
 * Phase C — per-schema escape hatch for fields whose name is shared with
 * non-rich uses elsewhere (e.g. `title` is rich on `blog_detail` but a
 * button label on `code_embed`). Schemas opt in by writing
 * `.describe("@rich …")`. The leading `@rich` marker is stripped before
 * the description is shown; the rest of the string remains the human-
 * readable hint.
 */
const RICH_DESCRIBE_PREFIX = "@rich";
function descriptionImpliesRichText(description: string | undefined): boolean {
  if (!description) return false;
  return description.startsWith(RICH_DESCRIBE_PREFIX);
}
function stripRichMarker(description: string | undefined): string | undefined {
  if (!description) return description;
  if (!description.startsWith(RICH_DESCRIBE_PREFIX)) return description;
  return description.slice(RICH_DESCRIBE_PREFIX.length).trimStart() || undefined;
}

function humanize(name: string): string {
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

interface UnwrapResult {
  inner: z.ZodTypeAny;
  optional: boolean;
  defaultValue: unknown;
  description?: string;
}

function unwrap(node: z.ZodTypeAny): UnwrapResult {
  let cur: z.ZodTypeAny = node;
  let optional = false;
  let defaultValue: unknown = undefined;
  let description: string | undefined;
  // Walk up to 6 wrappers (optional/default/nullable/etc.) defensively.
  for (let i = 0; i < 6; i += 1) {
    const def = (cur as unknown as { _def?: Record<string, unknown> })._def;
    if (!def) break;
    const t = def.type as string | undefined;
    if (def.description && !description) description = def.description as string;
    if (t === "optional" || t === "nullable" || t === "nullish") {
      optional = true;
      cur = def.innerType as z.ZodTypeAny;
      continue;
    }
    if (t === "default" || t === "prefault") {
      defaultValue = def.defaultValue;
      cur = def.innerType as z.ZodTypeAny;
      continue;
    }
    break;
  }
  return { inner: cur, optional, defaultValue, description };
}

interface CheckDescriptor {
  check?: string;
  format?: string;
  value?: number;
  maximum?: number;
  minimum?: number;
  inclusive?: boolean;
}

function readChecks(inner: z.ZodTypeAny): {
  min?: number;
  max?: number;
  format?: string;
} {
  const def = (inner as unknown as { _def?: Record<string, unknown> })._def ?? {};
  const checks = (def.checks as Array<unknown> | undefined) ?? [];
  const out: { min?: number; max?: number; format?: string } = {};
  for (const ch of checks) {
    const c = ch as { _zod?: { def?: CheckDescriptor }; def?: CheckDescriptor; _def?: CheckDescriptor };
    const cdef = c._zod?.def ?? c.def ?? c._def ?? (c as CheckDescriptor);
    if (!cdef) continue;
    if (cdef.check === "max_length" && typeof cdef.maximum === "number") out.max = cdef.maximum;
    if (cdef.check === "min_length" && typeof cdef.minimum === "number") out.min = cdef.minimum;
    if (cdef.check === "max_size" && typeof cdef.maximum === "number") out.max = cdef.maximum;
    if (cdef.check === "min_size" && typeof cdef.minimum === "number") out.min = cdef.minimum;
    if (cdef.check === "less_than" && typeof cdef.value === "number") out.max = cdef.value;
    if (cdef.check === "greater_than" && typeof cdef.value === "number") out.min = cdef.value;
    if (cdef.check === "string_format" && typeof cdef.format === "string") out.format = cdef.format;
  }
  return out;
}

function classify(node: z.ZodTypeAny): IntrospectedField["kind"] {
  const { inner } = unwrap(node);
  const def = (inner as unknown as { _def?: { type?: string; element?: z.ZodTypeAny; entries?: Record<string, string>; shape?: () => Record<string, z.ZodTypeAny>; options?: ReadonlyArray<z.ZodTypeAny> } })._def ?? {};
  const t = def.type;
  // i18nString is encoded as union(string, locale-map-object); detect it
  // here so the form renderer can render a tabbed LocalizedTextInput.
  if (t === "union" && Array.isArray(def.options)) {
    const opts = def.options;
    const hasString = opts.some((o) => {
      const inner = (o as unknown as { _def?: { type?: string } })._def?.type;
      return inner === "string";
    });
    const hasObject = opts.some((o) => {
      const inner = (o as unknown as { _def?: { type?: string } })._def?.type;
      return inner === "object";
    });
    if (hasString && hasObject) return "i18n_text";
  }
  switch (t) {
    case "string": {
      const { format, max } = readChecks(inner);
      if (format === "url") return "url";
      if (format === "email") return "email";
      if (typeof max === "number" && max > 240) return "textarea";
      return "text";
    }
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "enum":
      return "enum";
    case "object":
      return "object";
    case "array": {
      const el = def.element;
      if (!el) return "unknown";
      const elDef = (el as unknown as { _def?: { type?: string } })._def;
      if (elDef?.type === "object") return "array_of_objects";
      if (elDef?.type === "string") return "array_of_strings";
      return "unknown";
    }
    default:
      return "unknown";
  }
}

function getEnumOptions(inner: z.ZodTypeAny): ReadonlyArray<string> {
  const def = (inner as unknown as { _def?: { entries?: Record<string, string>; values?: ReadonlyArray<string> } })._def ?? {};
  if (def.entries) return Object.values(def.entries);
  if (def.values) return def.values;
  return [];
}

function getShape(inner: z.ZodTypeAny): Record<string, z.ZodTypeAny> | null {
  const obj = inner as unknown as {
    shape?: Record<string, z.ZodTypeAny>;
    _def?: { shape?: () => Record<string, z.ZodTypeAny> };
  };
  if (obj.shape) return obj.shape;
  const fn = obj._def?.shape;
  if (typeof fn === "function") return fn();
  return null;
}

function getElement(inner: z.ZodTypeAny): z.ZodTypeAny | null {
  const def = (inner as unknown as { _def?: { element?: z.ZodTypeAny } })._def;
  return def?.element ?? null;
}

export function introspectField(
  name: string,
  node: z.ZodTypeAny,
): IntrospectedField {
  const { inner, optional, defaultValue, description } = unwrap(node);
  const kind = classify(node);
  const limits = readChecks(inner);
  const richViaDescribe = descriptionImpliesRichText(description);
  const hint = richViaDescribe ? "rich_text" : NAME_HINTS[name];
  const base: IntrospectedField = {
    name,
    kind,
    optional,
    defaultValue,
    description: richViaDescribe ? stripRichMarker(description) : description,
    label: humanize(name),
    min: limits.min,
    max: limits.max,
    hint,
  };
  if (kind === "enum") {
    base.options = getEnumOptions(inner);
  } else if (kind === "object") {
    const shape = getShape(inner);
    if (shape) {
      base.children = Object.entries(shape).map(([k, v]) => introspectField(k, v));
    }
  } else if (kind === "array_of_objects") {
    const el = getElement(inner);
    if (el) {
      const shape = getShape(el);
      if (shape) {
        base.children = Object.entries(shape).map(([k, v]) => introspectField(k, v));
      }
    }
  }
  return base;
}

/**
 * Top-level: introspect every field of a section schema, skipping
 * `presentation` (rendered by the dedicated PresentationPanel).
 */
export function introspectSectionSchema(
  schema: z.ZodTypeAny,
): ReadonlyArray<IntrospectedField> {
  const { inner } = unwrap(schema);
  const shape = getShape(inner);
  if (!shape) return [];
  return Object.entries(shape)
    .filter(([k]) => k !== "presentation")
    .map(([k, v]) => introspectField(k, v));
}
