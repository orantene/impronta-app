/**
 * AI-2 — freeform builder GENERATOR.
 *
 * Turns a one-line brief into a NOVEL, validated `BuilderNode` tree the user can
 * edit like any hand-placed block. This is the capability the shipped
 * `text-to-page.ts` does NOT have: that module only re-ranks a fixed list of
 * preset designs and bakes one; this one lets the model compose real sections /
 * blocks with real copy, constrained to a curated kind + style vocabulary.
 *
 * The single load-bearing invariant: the model's raw output is treated as
 * HOSTILE until proven valid. It flows through
 *   parse → coerce (fill/clamp/sanitize) → re-mint ids → validateBuilderNodeTree
 * before it can reach a surface. `validateBuilderNodeTree` (the same gate the
 * gallery insert + preset composer use) drops any node that still fails and
 * returns a best-effort repaired tree, so a few bad nodes degrade to a valid
 * subset rather than corrupting the page. On empty output we retry once, and the
 * ACTION layer falls back to the preset composer so the user is never dead-ended.
 *
 * SERVER-ONLY (imports the registry). It has NO provider import — the model call
 * is injected (`ModelGenerateFn`), mirroring `rankWithModel` in `text-to-page.ts`
 * so this module stays pure + unit-testable with a stubbed model response.
 */

import { BUILDER_NODE_REGISTRY } from "@/lib/site-admin/builder-node/registry";
import { builderNodeKindAllowedAtRoot } from "@/lib/site-admin/builder-node/drop-policy";
import { BUILDER_MAX_TREE_DEPTH } from "@/lib/site-admin/builder-node/tree-depth";
import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";
import { cloneBuilderTreeWithFreshIds } from "@/lib/site-admin/builder-node/page-designs/expand-repeaters";
import { makeId } from "@/lib/site-admin/builder-node/make-id";
import type {
  BuilderNode,
  BuilderNodeKind,
  BuilderNodeTree,
} from "@/lib/site-admin/builder-node/types";
import type { JsonSchemaForChat } from "@/lib/ai/provider";
import { getLocaleMetadata } from "@/i18n/config";
import {
  buildGenerationSystemPrompt,
  buildGenerationUserMessage,
  type BuildPromptOpts,
  type GenerationBusinessContext,
} from "./generation-prompt";
export { buildGenerationSystemPrompt, buildGenerationUserMessage };
export type { BuildPromptOpts, GenerationBusinessContext };

export type GenerateNodesResult =
  | { ok: true; tree: BuilderNodeTree; nodeCount: number; repaired: boolean }
  | { ok: false; code: "BRIEF_TOO_SHORT" | "NO_MODEL" | "EMPTY"; error: string };

const MIN_BRIEF_LEN = 3;
const MAX_BRIEF_LEN = 400;
const MAX_TOTAL_NODES = 180; // hard DoS/cost cap (depth is BUILDER_MAX_TREE_DEPTH; this is the count cap)
const MAX_COERCE_DEPTH = BUILDER_MAX_TREE_DEPTH;
const HEADING_MAX = 240;
const PARAGRAPH_MAX = 5000;
const BUTTON_LABEL_MAX = 80;
const HREF_MAX = 500;
const ALT_MAX = 240;
const LABEL_MAX = 120;
// Headroom for adaptive thinking: thinking tokens + the JSON output both count
// toward this cap. A full page is ~2-3k output tokens; the extra budget lets the
// model think without truncating the JSON. Still safe non-streaming (< the ~16k
// where SDK HTTP timeouts start to matter).
const GEN_MAX_TOKENS = 16000;
// AIQ-15: truncation headroom on the corrective pass. Stays inside the SDK's
// non-streaming HTTP-timeout safety; streaming via .finalMessage() is the
// documented follow-up if 24k proves insufficient in the eval.
const GEN_MAX_TOKENS_RETRY = 24000;

// ── Prompt ────────────────────────────────────────────────────────────────

/**
 * The output envelope handed to the adapter. Anthropic gets this schema appended
 * to the system prompt (prompt-enforced JSON — BuilderNode is recursive, which
 * native structured outputs forbid); the real per-kind grammar lives in the
 * system prompt below and the real gate is `validateBuilderNodeTree`.
 */
export const GENERATION_OUTPUT_SCHEMA: JsonSchemaForChat = {
  name: "builder_sections",
  // Non-strict: the tree is recursive/open (items are free-form node objects),
  // which OpenAI's STRICT json_schema mode forbids. Anthropic ignores this flag
  // (it just stringifies the schema into the prompt); validation is the real gate.
  strict: false,
  schema: {
    type: "object",
    required: ["sections"],
    properties: {
      sections: {
        type: "array",
        description: "One or more page sections, each a builder node tree (see the grammar).",
        items: { type: "object" },
      },
    },
  },
};

import {
  clampString,
  coerceHeroSearchProps,
  coerceTalentTypeGridProps,
} from "./coerce-native-data-blocks";
import {
  CURATED_STYLE_COLOR_KEYS,
  CURATED_STYLE_ENUM_VALUES,
  CURATED_STYLE_FONT_WEIGHT_KEY,
  CURATED_STYLE_MIN_HEIGHT_KEY,
  isSafeMinHeight,
  FREEFORM_SECTION_TYPE_KEY,
  GENERATION_ALLOWED_KINDS,
  GENERATION_ICON_NAMES,
  IMAGE_ROLES,
  isGenerationKind,
  isSafeStyleColor,
  photoForImageRole,
  safeIconName,
  type CuratedStyleEnumKey,
  type GenerationKind,
} from "./generation-allowed-kinds";

export type GenerateScope = "page" | "section";

/** Why a model call ended — a provider stop reason mapped to a small tag (AIQ-15). */
export type ModelGenerateReason = "ok" | "truncated" | "refusal" | "empty" | "error";

/** Injected model call result — text plus WHY it ended, so the orchestrator can act (AIQ-15). */
export type ModelGenerateResult = { text: string | null; reason: ModelGenerateReason };

/** Orchestrator-internal failure tags (produced by runOnce), a superset of the model reasons. */
export type GenFailReason = ModelGenerateReason | "parse_failed" | "no_valid_nodes";

export type ModelGenerateFn = (input: {
  systemPrompt: string;
  userMessage: string;
  jsonSchema: JsonSchemaForChat;
  maxTokens: number;
  /** Appended to the user message on the corrective retry (AIQ-21). */
  repairNote?: string;
}) => Promise<ModelGenerateResult>;

export type ThemePolarity = "light" | "dark";

/** A few resolved theme swatches to anchor any deliberate colored band (AIQ-12). */
export interface GenerationPalette {
  background?: string;
  ink?: string;
  surfaceRaised?: string;
  primary?: string;
}

export interface GenerateNodesInput {
  brief: string;
  scope: GenerateScope;
  generateWithModel: ModelGenerateFn;
  /**
   * Templates & Imagery: the tenant's business FAMILY (`business-types.ts`)
   * and its real name. The family sets the voice (the agency family keeps the
   * roster rules; everyone else gets a plain local-business register) and the
   * name is the ONLY name the model may use. Absent → the neutral register.
   */
  business?: GenerationBusinessContext;
  /**
   * Image by role for THIS tenant: owner media first, lifestyle stock second
   * (`site-templates/image-resolver`). Absent → the marketing photo set.
   */
  imageForRole?: (role: string) => string | null;
  /** BCP-47 locale of the surface being edited; copy is written in this language (AIQ-3). */
  locale?: string;
  /** The tenant's active theme polarity, if resolvable server-side (AIQ-12). */
  themePolarity?: ThemePolarity;
  /** Resolved theme swatches to anchor a deliberate colored band (AIQ-12). */
  palette?: GenerationPalette;
}

// ── Parse ───────────────────────────────────────────────────────────────────

/** Robustly extract the JSON object from the model text (strip fences, slice to the outermost braces). */
export function parseModelJson(text: string | null | undefined): unknown {
  if (!text) return null;
  let raw = text.trim();
  if (raw.startsWith("```")) {
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
  try {
    return JSON.parse(raw);
  } catch {
    // Fall back to the outermost {...} span in case the model added stray prose.
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ── Coerce ────────────────────────────────────────────────────────────────

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function childKindAllowed(parentKind: BuilderNodeKind, childKind: BuilderNodeKind): boolean {
  const policy = BUILDER_NODE_REGISTRY[parentKind].children;
  if (policy.type === "any") return true;
  if (policy.type === "none") return false;
  return policy.kinds.includes(childKind);
}

/**
 * Keep only curated style keys, and only values guaranteed to pass
 * `builderNodeStyleSchema` — so a kept `style` can never drop the node.
 */
function sanitizeStyle(raw: unknown): Record<string, unknown> | undefined {
  const style = asObject(raw);
  if (!style) return undefined;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(CURATED_STYLE_ENUM_VALUES) as CuratedStyleEnumKey[]) {
    const allowed = CURATED_STYLE_ENUM_VALUES[key] as ReadonlyArray<string>;
    const value = style[key];
    if (typeof value === "string" && allowed.includes(value)) out[key] = value;
  }
  for (const key of CURATED_STYLE_COLOR_KEYS) {
    if (isSafeStyleColor(style[key])) out[key] = style[key];
  }
  // Colors survive only as a self-consistent PAIR (a background with its own
  // readable foreground). A LONE text color sits on the theme's own surface —
  // whose polarity the model can't see — and a lone background leaves the text
  // at the theme default; either can invert to unreadable on a given tenant
  // theme (verified live: cream text with no background rendered invisible on a
  // light theme). Drop the orphan so the theme paints a guaranteed-readable
  // default; keep the pair, which is readable on any theme.
  if (
    (typeof out.textColor === "string") !==
    (typeof out.backgroundColor === "string")
  ) {
    delete out.textColor;
    delete out.backgroundColor;
  }
  const weight = style[CURATED_STYLE_FONT_WEIGHT_KEY];
  if (typeof weight === "number" && Number.isInteger(weight) && weight >= 100 && weight <= 900) {
    out[CURATED_STYLE_FONT_WEIGHT_KEY] = weight;
  }
  // minHeight — a bounded CSS length so a hero/band gets real vertical presence
  // (AIQ-7). Only a single safe length token survives; anything else is dropped.
  const minH = style[CURATED_STYLE_MIN_HEIGHT_KEY];
  if (isSafeMinHeight(minH)) out[CURATED_STYLE_MIN_HEIGHT_KEY] = minH;
  // Center any bounded-width content column. The `maxWidth` TOKEN only sets
  // `max-width`; it never adds `margin-inline: auto`, so a token-width block
  // floats to the LEFT of its full-bleed parent (a cramped column instead of a
  // centered one — verified live on generated heroes). The shipped page-designs
  // avoid this by pairing `maxWidthFree` with explicit `marginLeftFree/RightFree:
  // "auto"`; we do the same here so generated columns center like the presets.
  // `full` is excluded (it already spans the row). These keys are validated
  // free-style escapes (registry `builderNodeStyleValueSchema`), so they never
  // drop the node.
  if (out.maxWidth === "narrow" || out.maxWidth === "reading" || out.maxWidth === "wide") {
    out.width = "100%";
    out.marginLeftFree = "auto";
    out.marginRightFree = "auto";
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Default aspect ratio per image role so a generated image never renders unbounded (AIQ-9). */
function defaultAspectForImageRole(role: unknown): string {
  switch (role) {
    case "hero":
    case "wide":
      return "21:9";
    case "portrait":
    case "team":
      return "3:4";
    default:
      return "4:3";
  }
}

interface CoerceCtx {
  count: { n: number };
  imageForRole?: (role: string) => string | null;
}

/** Coerce one raw model node into a guaranteed-valid BuilderNode, or null to drop it. */
function coerceNode(
  raw: unknown,
  parentKind: BuilderNodeKind | null,
  depth: number,
  ctx: CoerceCtx,
): BuilderNode | null {
  if (depth > MAX_COERCE_DEPTH || ctx.count.n >= MAX_TOTAL_NODES) return null;
  const node = asObject(raw);
  if (!node) return null;
  const kind = node.kind;
  if (!isGenerationKind(kind)) return null;
  // Root nodes (parentKind === null) must be root-allowed (a section for us);
  // nested nodes must satisfy the parent's child policy.
  if (parentKind === null) {
    if (!builderNodeKindAllowedAtRoot(kind)) return null;
  } else if (!childKindAllowed(parentKind, kind)) {
    return null;
  }

  const rawProps = asObject(node.props) ?? {};
  const style = sanitizeStyle(rawProps.style ?? node.style);

  const withStyle = (props: Record<string, unknown>): Record<string, unknown> =>
    style ? { ...props, style } : props;

  const emit = (props: Record<string, unknown>, children?: BuilderNode[]): BuilderNode => {
    ctx.count.n += 1;
    const base = { id: makeId(kind as BuilderNodeKind), kind, props } as Record<string, unknown>;
    if (children) base.children = children;
    return base as unknown as BuilderNode;
  };

  const coerceChildren = (): BuilderNode[] => {
    const rawChildren = Array.isArray(node.children) ? node.children : [];
    const out: BuilderNode[] = [];
    for (const child of rawChildren) {
      const coerced = coerceNode(child, kind as BuilderNodeKind, depth + 1, ctx);
      if (coerced) out.push(coerced);
      if (ctx.count.n >= MAX_TOTAL_NODES) break;
    }
    return out;
  };

  switch (kind as GenerationKind) {
    case "section": {
      const props: Record<string, unknown> = { sectionTypeKey: FREEFORM_SECTION_TYPE_KEY };
      const label = clampString(node.label ?? rawProps.label, LABEL_MAX);
      if (label) props.label = label;
      return emit(props, coerceChildren());
    }
    case "container": {
      const layoutRaw = rawProps.layout;
      const layout =
        layoutRaw === "row" || layoutRaw === "grid" || layoutRaw === "stack" ? layoutRaw : "stack";
      const props: Record<string, unknown> = withStyle({ layout });
      const gap = rawProps.gap;
      if (gap === "s" || gap === "m" || gap === "l") props.gap = gap;
      const align = rawProps.align;
      if (align === "start" || align === "center" || align === "end" || align === "stretch") {
        props.align = align;
      }
      // columns > 1 is ONLY valid under layout:"grid" (container superRefine).
      const columns = rawProps.columns;
      if (layout === "grid" && typeof columns === "number" && columns >= 1 && columns <= 4) {
        props.columns = Math.trunc(columns);
      }
      return emit(props, coerceChildren());
    }
    case "split": {
      const ratio = rawProps.ratio;
      const props: Record<string, unknown> = withStyle({});
      if (["50-50", "40-60", "60-40", "30-70", "70-30"].includes(ratio as string)) {
        props.ratio = ratio;
      }
      const gap = rawProps.gap;
      if (gap === "s" || gap === "m" || gap === "l") props.gap = gap;
      return emit(props, coerceChildren());
    }
    case "card": {
      const variant = rawProps.variant;
      const props: Record<string, unknown> = withStyle({});
      if (variant === "elevated" || variant === "outline" || variant === "ghost") {
        props.variant = variant;
      }
      return emit(props, coerceChildren());
    }
    case "cta_group": {
      const align = rawProps.align;
      const props: Record<string, unknown> = withStyle({});
      if (align === "start" || align === "center" || align === "end" || align === "stretch") {
        props.align = align;
      }
      return emit(props, coerceChildren());
    }
    case "heading": {
      const text = clampString(rawProps.text ?? node.text, HEADING_MAX);
      if (!text) return null;
      const lvl = rawProps.level;
      const level = lvl === 1 || lvl === 2 || lvl === 3 || lvl === 4 ? lvl : 2;
      return emit(withStyle({ text, level }));
    }
    case "paragraph": {
      const text = clampString(rawProps.text ?? node.text, PARAGRAPH_MAX);
      if (!text) return null;
      return emit(withStyle({ text }));
    }
    case "button": {
      // Brand-safe default: never the generic "Learn more" tell (AIQ-26).
      const label = clampString(rawProps.label ?? node.label, BUTTON_LABEL_MAX) ?? "Start an inquiry";
      let href = clampString(rawProps.href ?? node.href, HREF_MAX) ?? "/inquire";
      // Defense-in-depth: never carry a dangerous href scheme into the tree (it is
      // also neutralized at render, but keep the source clean).
      if (/^\s*(?:javascript|data|vbscript):/i.test(href)) href = "/inquire";
      const props: Record<string, unknown> = withStyle({ label, href });
      const tone = rawProps.tone;
      if (tone === "primary" || tone === "secondary") props.tone = tone;
      return emit(props);
    }
    case "image": {
      const role = rawProps.role ?? node.role;
      // The tenant's own imagery (owner media, then lifestyle stock) when the
      // action resolved one; the marketing photo set is the last resort.
      const src = (typeof role === "string" ? ctx.imageForRole?.(role) : null) ?? photoForImageRole(role);
      const alt = clampString(rawProps.alt ?? node.alt, ALT_MAX);
      // Bound the rendered height (AIQ-9): if the model didn't pick an aspectRatio,
      // apply a sensible default per role + object-fit:cover, so a full-width hero
      // or a portrait never renders unbounded/huge. These are curated enum values.
      const imgStyle: Record<string, unknown> = style ? { ...style } : {};
      if (typeof imgStyle.aspectRatio !== "string") {
        imgStyle.aspectRatio = defaultAspectForImageRole(role);
      }
      if (typeof imgStyle.objectFit !== "string") imgStyle.objectFit = "cover";
      const props: Record<string, unknown> = { src, style: imgStyle };
      if (alt) props.alt = alt;
      return emit(props);
    }
    case "icon": {
      const icon = safeIconName(rawProps.icon ?? node.icon);
      const props: Record<string, unknown> = withStyle({ icon });
      const size = rawProps.size;
      if (size === "sm" || size === "md" || size === "lg" || size === "xl") props.size = size;
      const label = clampString(rawProps.label, LABEL_MAX);
      if (label) props.label = label;
      return emit(props);
    }
    case "divider": {
      const tone = rawProps.tone;
      const props: Record<string, unknown> = withStyle({});
      if (tone === "default" || tone === "muted") props.tone = tone;
      return emit(props);
    }
    case "spacer": {
      const size = rawProps.size;
      const props: Record<string, unknown> = withStyle({
        size: size === "s" || size === "m" || size === "l" ? size : "m",
      });
      return emit(props);
    }
    case "accordion": {
      // Only accordion_item children are valid (drop-policy); coerceChildren
      // enforces it. We deliberately DO NOT emit defaultOpenItemIds: it is
      // id-referential and cloneBuilderTreeWithFreshIds re-mints ids downstream,
      // which would orphan the reference. An all-closed accordion is valid.
      const props: Record<string, unknown> = withStyle({});
      const allowMultiple = rawProps.allowMultiple;
      if (typeof allowMultiple === "boolean") props.allowMultiple = allowMultiple;
      const children = coerceChildren();
      if (children.length === 0) return null; // an accordion with no items is useless
      return emit(props, children);
    }
    case "accordion_item": {
      const title = clampString(rawProps.title ?? node.title, 180);
      if (!title) return null; // title is required by the schema
      return emit(withStyle({ title }), coerceChildren());
    }
    case "form": {
      const rawFields = Array.isArray(rawProps.fields) ? rawProps.fields : [];
      const fields: Array<Record<string, unknown>> = [];
      const seenFieldIds = new Set<string>();
      const seenNames = new Set<string>();
      for (const raw of rawFields.slice(0, 24)) {
        const field = asObject(raw);
        if (!field) continue;
        const type = field.type;
        if (type !== "text" && type !== "email" && type !== "tel" && type !== "textarea" && type !== "submit") {
          continue;
        }
        const label = clampString(field.label, 120) ?? (type === "submit" ? "Send" : "Field");
        // Derive a stable, unique id + name from whatever the model gave (or the label).
        let id = clampString(field.id ?? field.name ?? label, 120) ?? `field-${fields.length + 1}`;
        while (seenFieldIds.has(id)) id = `${id}-${fields.length + 1}`;
        let name = clampString(field.name ?? id, 80) ?? id;
        while (seenNames.has(name)) name = `${name}-${fields.length + 1}`;
        seenFieldIds.add(id);
        seenNames.add(name);
        const out: Record<string, unknown> = { id, name, type, label };
        const placeholder = clampString(field.placeholder, 160);
        if (placeholder) out.placeholder = placeholder;
        if (typeof field.required === "boolean") out.required = field.required;
        fields.push(out);
      }
      if (fields.length === 0) return null; // schema requires >= 1 field
      const props: Record<string, unknown> = withStyle({ fields });
      const method = rawProps.method;
      if (method === "get" || method === "post") props.method = method;
      const honeypotName = clampString(rawProps.honeypotName, 80);
      if (honeypotName) props.honeypotName = honeypotName;
      // action left unset → the form falls back to the tenant's default inquiry sink.
      return emit(props);
    }
    // WS7 Phase 0 — the two NATIVE data blocks. Both are structural leaves, so
    // no children are read. Coercion is allow-list shaped and COPY-ONLY: see
    // coerce-native-data-blocks.ts for exactly which props are dropped and why
    // no model-supplied value can reach a tenant data query.
    case "hero_search": {
      const props = coerceHeroSearchProps(rawProps, style);
      return props ? emit(props) : null;
    }
    case "talent_type_grid": {
      const props = coerceTalentTypeGridProps(rawProps, style);
      return props ? emit(props) : null;
    }
    case "pricing_table": {
      const rawTiers = Array.isArray(rawProps.tiers) ? rawProps.tiers : [];
      const tiers: Array<Record<string, unknown>> = [];
      const seenTierIds = new Set<string>();
      for (const raw of rawTiers.slice(0, 4)) {
        const tier = asObject(raw);
        if (!tier) continue;
        const name = clampString(tier.name, 120);
        const price = clampString(tier.price, 80);
        if (!name || !price) continue; // name + price are required
        let id = clampString(tier.id ?? name, 80) ?? `tier-${tiers.length + 1}`;
        while (seenTierIds.has(id)) id = `${id}-${tiers.length + 1}`;
        seenTierIds.add(id);
        const out: Record<string, unknown> = { id, name, price };
        const description = clampString(tier.description, 500);
        if (description) out.description = description;
        const period = clampString(tier.period, 80);
        if (period) out.period = period;
        const ctaLabel = clampString(tier.ctaLabel, 80);
        if (ctaLabel) out.ctaLabel = ctaLabel;
        let ctaHref = clampString(tier.ctaHref, 500);
        if (ctaHref && /^\s*(?:javascript|data|vbscript):/i.test(ctaHref)) ctaHref = "/inquire";
        if (ctaHref) out.ctaHref = ctaHref;
        if (typeof tier.highlighted === "boolean") out.highlighted = tier.highlighted;
        const rawFeatures = Array.isArray(tier.features) ? tier.features : [];
        const features: Array<Record<string, unknown>> = [];
        for (const rawFeature of rawFeatures.slice(0, 20)) {
          const f = asObject(rawFeature);
          const flabel = clampString(f?.label, 240);
          if (!flabel) continue;
          const feat: Record<string, unknown> = { label: flabel };
          if (typeof f?.included === "boolean") feat.included = f.included;
          features.push(feat);
        }
        if (features.length > 0) out.features = features;
        tiers.push(out);
      }
      if (tiers.length < 2) return null; // schema requires 2-4 tiers
      return emit(withStyle({ tiers }));
    }
    default:
      return null;
  }
}

/** Normalize the model output into an array of raw section-level nodes. */
function normalizeRawSections(parsed: unknown): unknown[] {
  const obj = asObject(parsed);
  if (obj && Array.isArray(obj.sections)) return obj.sections;
  if (Array.isArray(parsed)) return parsed;
  if (obj) return [obj];
  return [];
}

/**
 * Coerce raw model output into a valid ROOT tree of `section` nodes. A top-level
 * node that is not itself a section is wrapped in one (root only accepts sections
 * et al.), so no content is lost to a missing wrapper.
 */
export function coerceToSections(parsed: unknown, imageForRole?: (role: string) => string | null): BuilderNode[] {
  const ctx: CoerceCtx = { count: { n: 0 }, imageForRole };
  const rawSections = normalizeRawSections(parsed);
  const out: BuilderNode[] = [];
  for (const rawSection of rawSections) {
    if (ctx.count.n >= MAX_TOTAL_NODES) break;
    const obj = asObject(rawSection);
    if (obj && obj.kind === "section") {
      const section = coerceNode(rawSection, null, 1, ctx);
      const kids = (section as { children?: BuilderNode[] } | null)?.children;
      // Drop a section whose children all failed coercion — a blank section is
      // worse than nothing (expert review P2b).
      if (section && Array.isArray(kids) && kids.length > 0) {
        out.push(section);
      }
      continue;
    }
    // Not a section — wrap the coerced block in a synthetic section so it is
    // valid at the root.
    const child = coerceNode(rawSection, "section", 2, ctx);
    if (child) {
      ctx.count.n += 1;
      out.push({
        id: makeId("section"),
        kind: "section",
        props: { sectionTypeKey: FREEFORM_SECTION_TYPE_KEY },
        children: [child],
      } as unknown as BuilderNode);
    }
  }
  return out;
}

// ── Orchestrate ─────────────────────────────────────────────────────────────

/**
 * AIQ-21 — a targeted repair instruction appended to the user message on the
 * corrective retry, so the second attempt is NOT byte-identical to the first.
 * Keyed by the first pass's failure reason. Returns undefined when a plain
 * resend is the best available move.
 */
function repairNoteFor(reason: GenFailReason): string | undefined {
  switch (reason) {
    case "truncated":
      return "RETRY: your previous reply was cut off before the JSON closed. Return a COMPLETE, valid JSON object, and prefer fewer sections over an unfinished one.";
    case "parse_failed":
      return 'RETRY: your previous reply was not valid JSON. Return ONLY the {"sections":[...]} object, with no prose, no markdown fences, and no trailing commas.';
    case "no_valid_nodes":
      return 'RETRY: your previous reply had no usable sections. Every top-level item must be {"kind":"section","children":[...]} with at least one valid block child, per the grammar.';
    case "refusal":
      return "RETRY: rephrase as a neutral, professional business web page. Keep the copy brand-safe and on topic.";
    default:
      return undefined; // "empty" / "error" / "ok" — a plain resend is the best we can do
  }
}

async function runOnce(
  input: GenerateNodesInput,
  brief: string,
  maxTokens: number,
  repairNote?: string,
): Promise<{ tree: BuilderNodeTree; repaired: boolean } | { fail: GenFailReason }> {
  const res = await input.generateWithModel({
    systemPrompt: buildGenerationSystemPrompt({
      locale: input.locale,
      themePolarity: input.themePolarity,
      palette: input.palette,
      business: input.business,
    }),
    userMessage: buildGenerationUserMessage(input.scope, brief, input.locale),
    jsonSchema: GENERATION_OUTPUT_SCHEMA,
    maxTokens,
    repairNote,
  });
  const parsed = parseModelJson(res.text);
  // A non-"ok" reason (truncated/refusal/empty/error) is more actionable than a
  // generic parse failure — surface it so the retry can target the real cause.
  if (parsed == null) return { fail: res.reason === "ok" ? "parse_failed" : res.reason };

  const coerced = coerceToSections(parsed, input.imageForRole);
  if (coerced.length === 0) return { fail: "no_valid_nodes" };

  // Re-mint every id (the model's ids may collide/repeat) BEFORE validate, which
  // rejects duplicate ids, then run the same gate the gallery-insert path uses.
  const fresh = cloneBuilderTreeWithFreshIds(coerced);
  const validation = validateBuilderNodeTree(fresh);
  if (validation.ok) return { tree: validation.tree, repaired: false };
  // Invalid nodes are dropped; the repaired tree still validates. Use it when
  // it kept at least one section.
  if (validation.tree.length > 0) return { tree: validation.tree, repaired: true };
  return { fail: "no_valid_nodes" };
}

function countNodes(tree: BuilderNodeTree): number {
  let n = 0;
  const walk = (node: BuilderNode) => {
    n += 1;
    const children = (node as { children?: BuilderNode[] }).children;
    if (Array.isArray(children)) children.forEach(walk);
  };
  tree.forEach(walk);
  return n;
}

/**
 * Compose a validated freeform tree from a brief. Returns `EMPTY` when the model
 * produced nothing usable after one retry — the caller (action) then falls back
 * to the deterministic preset composer so the user always gets a page.
 */
export async function generateBuilderNodes(
  input: GenerateNodesInput,
): Promise<GenerateNodesResult> {
  const brief = (input.brief ?? "").trim();
  if (brief.length < MIN_BRIEF_LEN) {
    return { ok: false, code: "BRIEF_TOO_SHORT", error: "Add a few words describing what you want." };
  }
  const clipped = brief.slice(0, MAX_BRIEF_LEN);

  // One generate + one corrective retry. On a TRUNCATED first pass, retry with a
  // higher token cap (thinking + JSON share the budget) so a good-but-cut page is
  // recovered instead of silently dropping to the preset composer (AIQ-15). The
  // retry also carries a failure-specific repair note (AIQ-21).
  let result = await runOnce(input, clipped, GEN_MAX_TOKENS);
  if ("fail" in result) {
    const firstFail = result.fail;
    const retryTokens = firstFail === "truncated" ? GEN_MAX_TOKENS_RETRY : GEN_MAX_TOKENS;
    result = await runOnce(input, clipped, retryTokens, repairNoteFor(firstFail));
  }
  if ("fail" in result) {
    return { ok: false, code: "EMPTY", error: "The AI could not build that — try rephrasing." };
  }
  return {
    ok: true,
    tree: result.tree,
    nodeCount: countNodes(result.tree),
    repaired: result.repaired,
  };
}

/** Re-exported for the drift test — the exact kinds named in the prompt grammar. */
export const GENERATION_PROMPT_KINDS: ReadonlyArray<string> = [
  ...GENERATION_ALLOWED_KINDS,
];

/** Re-exported for the drift test — the image roles named in the prompt. */
export const GENERATION_PROMPT_IMAGE_ROLES: ReadonlyArray<string> = [...IMAGE_ROLES];
